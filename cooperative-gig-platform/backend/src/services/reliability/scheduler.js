/**
 * scheduler.js
 *
 * Background cron that enforces job expiry and no-show detection using ONLY
 * server time. It runs on a configurable interval (default 60s).
 *
 * Guarantees:
 *  - Idempotent: a global running-flag plus atomic findOneAndUpdate status
 *    guards mean overlapping ticks never double-process a booking.
 *  - Expiry  : jobs stuck in REQUESTED/MATCHING/ASSIGNED (never assigned to a
 *    worker that started) move to EXPIRED after scheduledStartTime + grace.
 *  - No-show : an ACCEPTED/ON_THE_WAY job with no worker check-in by
 *    scheduledEndTime + grace becomes WORKER_NO_SHOW, the worker is penalised
 *    and a replacement is sought. If replacement succeeds the booking moves to
 *    REASSIGNED; otherwise it expires.
 *  - Reassignment retry: REASSIGNED jobs with no acceptance within the
 *    reassignment grace are re-matched (up to maxRetries) then expire.
 *  - Reminders: workers get a gentle reminder before their accepted job.
 */

const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Worker = require('../../models/WorkerProfile');
const { resolveScheduleTimes } = require('../../utils/scheduleUtils');
const { getSettings } = require('./reliabilityConfig');
const {
  applyScoreChange,
  getOrCreateReliability,
  notifyNoShow,
  attemptReassignment,
} = require('./reliabilityService');
const { createNotification, notifyUsers } = require('../notification/notificationService');

let intervalHandle = null;
let running = false;

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;

const markExceeded = async (booking, status, note, customerType, customerTitle, customerMessage) => {
  const claim = { _id: booking._id };
  if (booking.status) claim.status = booking.status;
  const updated = await Booking.findOneAndUpdate(
    claim,
    {
      $set: { status, expiredAt: new Date() },
      $push: {
        statusHistory: {
          status,
          updatedAt: new Date(),
          updatedBy: null,
          note,
        },
      },
    },
    { new: true }
  );
  if (!updated) return null;
  const adminUsers = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  const items = [
    {
      user: booking.customer,
      type: customerType,
      title: customerTitle,
      message: customerMessage,
      data: { bookingId: booking._id, bookingNumber: booking.bookingNumber },
    },
  ];
  adminUsers.forEach((a) =>
    items.push({
      user: a._id,
      type: customerType,
      title: customerTitle,
      message: `${customerMessage} (booking ${booking.bookingNumber})`,
      data: { bookingId: booking._id, bookingNumber: booking.bookingNumber },
    })
  );
  await notifyUsers(items);
  return updated;
};

/**
 * Expire stale, never-started jobs.
 * Uses the effective schedule (legacy null-schedule bookings derive one from
 * requestedDate + timeSlot), so pre-scheduling-phase jobs are enforced too.
 */
const handleExpiredJobs = async (settings, now) => {
  const cutoff = new Date(now.getTime() - settings.jobExpiryGraceMinutes * minuteMs);
  const stale = await Booking.find({
    status: { $in: ['REQUESTED', 'MATCHING', 'ASSIGNED'] },
    $or: [
      { scheduledStartTime: { $lte: cutoff } },
      { scheduledStartTime: null },
    ],
  }).select('_id bookingNumber customer status requestedDate timeSlot isEmergency scheduledStartTime scheduledEndTime');
  const results = [];
  for (const b of stale) {
    const { scheduledStartTime: effectiveStart } = resolveScheduleTimes(b);
    if (!effectiveStart || effectiveStart.getTime() > cutoff.getTime()) continue;
    const updated = await markExceeded(
      b,
      'EXPIRED',
      'Job expired — no worker started it in time',
      'WORKER_EXPIRED',
      'Job request expired',
      `Your job request ${b.bookingNumber} expired because no worker was confirmed in time. Please create a new request or contact support.`
    );
    if (updated) results.push({ bookingId: b._id, outcome: 'EXPIRED' });
  }
  return results;
};

/**
 * Detect no-show: worker accepted/on-the-way but never checked in by the
 * deadline (scheduledEndTime + grace) and is not present. Legacy bookings
 * schedule their window from requestedDate + timeSlot.
 */
const handleNoShows = async (settings, now) => {
  const cutoff = new Date(now.getTime() - settings.noShowGraceMinutes * minuteMs);
  const due = await Booking.find({
    status: { $in: ['ACCEPTED', 'ON_THE_WAY'] },
    workerCheckInAt: null,
    $or: [
      { scheduledEndTime: { $lte: cutoff } },
      { scheduledEndTime: null },
    ],
  }).select('_id bookingNumber customer status worker serviceSnapshot requestedDate timeSlot isEmergency scheduledStartTime scheduledEndTime location city service candidateWorkers');

  const results = [];
  for (const booking of due) {
    const { scheduledEndTime: effectiveEnd } = resolveScheduleTimes(booking);
    if (!effectiveEnd || effectiveEnd.getTime() > cutoff.getTime()) continue;
    const claimed = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: { $in: ['ACCEPTED', 'ON_THE_WAY'] },
        workerCheckInAt: null,
      },
      {
        $set: {
          status: 'WORKER_NO_SHOW',
          noShowDetectedAt: now,
        },
        $push: {
          statusHistory: {
            status: 'WORKER_NO_SHOW',
            updatedAt: now,
            updatedBy: null,
            note: 'Worker did not arrive within the no-show grace period',
          },
        },
      },
      { new: true }
    );
    if (!claimed) continue;

    const worker = booking.worker ? await Worker.findById(booking.worker) : null;
    if (worker) {
      const rel = await getOrCreateReliability(worker._id);
      const base = await applyScoreChange({
        workerId: worker._id,
        eventType: 'NO_SHOW',
        points: settings.points.noShow,
        reason: `No-show for job ${booking.bookingNumber} (deadline ${effectiveEnd.toISOString()})`,
        bookingId: booking._id,
        counterField: 'noShowCount',
      });
      if (!base.skipped && (rel.noShowCount || 0) >= 1) {
        await applyScoreChange({
          workerId: worker._id,
          eventType: 'REPEATED_NO_SHOW',
          points: settings.points.repeatedNoShowExtra,
          reason: 'Repeated no-show offence',
          bookingId: booking._id,
        });
      }
      await createNotification({
        user: worker.user,
        type: 'WORKER_NO_SHOW',
        title: 'Marked as no-show',
        message: `You did not check in for job ${booking.bookingNumber}. A no-show penalty has been applied. Appeal if this is a mistake.`,
        data: { bookingId: booking._id, bookingNumber: booking.bookingNumber },
      });
      await notifyNoShow(booking, worker);
    }

    // Try to find a replacement (REASSIGNED) or expire.
    const res = await attemptReassignment(booking, { reason: 'NO_SHOW' });
    results.push({
      bookingId: booking._id,
      outcome: res.reassigned ? 'REASSIGNED' : 'EXPIRED',
      candidateCount: res.candidateCount || 0,
    });
  }
  return results;
};

/**
 * A REASSIGNED booking whose candidate list produced no acceptance within the
 * reassignment grace either gets one more matching round or expires.
 */
const handleReassignmentRetries = async (settings, now) => {
  const cutoff = new Date(now.getTime() - settings.reassignmentGraceMinutes * minuteMs);
  const due = await Booking.find({
    status: 'REASSIGNED',
    reassignedAt: { $lte: cutoff },
  }).select('_id bookingNumber customer status worker serviceSnapshot scheduledEndTime isEmergency location city service candidateWorkers reassignmentAttempts');

  const results = [];
  for (const booking of due) {
    if ((booking.reassignmentAttempts || 0) >= settings.maxReassignmentAttempts) {
      await markExceeded(
        booking,
        'EXPIRED',
        'Replacement could not be confirmed',
        'WORKER_EXPIRED',
        'No replacement worker found',
        `We could not confirm a replacement for ${booking.bookingNumber}. Please request a new booking or contact support.`
      );
      results.push({ bookingId: booking._id, outcome: 'EXPIRED' });
      continue;
    }
    const res = await attemptReassignment(booking, { reason: 'RETRY' });
    results.push({
      bookingId: booking._id,
      outcome: res.reassigned ? 'REASSIGNED' : 'EXPIRED',
      candidateCount: res.candidateCount || 0,
    });
  }
  return results;
};

/**
 * Gentle reminder before an accepted job starts (max ~2 per booking).
 * Legacy null-schedule bookings derive their start from requestedDate + slot.
 */
const handleReminders = async (settings, now) => {
  const leadCutoff = new Date(now.getTime() - settings.reminderLeadMinutes * minuteMs);
  const due = await Booking.find({
    status: 'ACCEPTED',
    workerCheckInAt: null,
    $or: [
      { scheduledStartTime: { $gte: leadCutoff } },
      { scheduledStartTime: null },
    ],
  }).select('_id bookingNumber customer worker serviceSnapshot requestedDate timeSlot isEmergency scheduledStartTime remindersSent');

  const results = [];
  for (const booking of due) {
    const { scheduledStartTime: effectiveStart } = resolveScheduleTimes(booking);
    if (!effectiveStart) continue;
    const startMs = effectiveStart.getTime();
    if (startMs < leadCutoff.getTime() || startMs > now.getTime()) continue;

    const last = booking.remindersSent?.length ? booking.remindersSent[booking.remindersSent.length - 1] : null;
    if (last && now.getTime() - new Date(last).getTime() < 55 * minuteMs) continue;
    if ((booking.remindersSent || []).length >= 2) continue;

    await Booking.updateOne(
      { _id: booking._id },
      { $push: { remindersSent: now } }
    );

    const worker = booking.worker ? await Worker.findById(booking.worker).select('user') : null;
    if (worker) {
      await createNotification({
        user: worker.user,
        type: 'REMINDER_UPCOMING_JOB',
        title: 'Upcoming job reminder',
        message: `${booking.isEmergency ? '⚠️ EMERGENCY: ' : ''}You have an upcoming ${booking.serviceSnapshot?.name || 'job'} (${booking.bookingNumber}) scheduled for ${effectiveStart.toLocaleString()}. Please be on time.`,
        data: { bookingId: booking._id, bookingNumber: booking.bookingNumber, scheduledStartTime: booking.scheduledStartTime },
      });
    }
    results.push({ bookingId: booking._id, reminded: true });
  }
  return results;
};

/**
 * Run one full pass of the scheduler. Returns a summary object (for tests).
 */
const runSchedulerOnce = async () => {
  if (running) return { skipped: true, reason: 'already running' };
  running = true;
  try {
    const settings = await getSettings();
    const now = new Date();
    const [expired, noShows, retries, reminders] = await Promise.all([
      handleExpiredJobs(settings, now),
      handleNoShows(settings, now),
      handleReassignmentRetries(settings, now),
      handleReminders(settings, now),
    ]);
    return { skipped: false, expired, noShows, retries, reminders };
  } finally {
    running = false;
  }
};

/**
 * Start the background loop (guarded so hot-restarts don't stack timers).
 */
const startScheduler = () => {
  if (intervalHandle) return intervalHandle;
  const start = async () => {
    try {
      await runSchedulerOnce();
    } catch (e) {
      console.error('[reliability-scheduler] tick error:', e.message);
    }
  };
  const loop = async () => {
    const settings = await getSettings();
    const interval = Math.max(20, settings.schedulerIntervalSeconds || 60) * 1000;
    intervalHandle = setInterval(start, interval);
    start();
  };
  loop();
  return intervalHandle;
};

const stopScheduler = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

module.exports = { startScheduler, stopScheduler, runSchedulerOnce };