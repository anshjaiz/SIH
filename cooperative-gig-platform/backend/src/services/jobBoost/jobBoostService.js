/**
 * jobBoostService.js
 *
 * "Job Boost" — the customer side of the service-request flow.
 *
 * NOT a bidding system. Workers never compete by lowering a price or sending a
 * counter-offer; they are shown exactly what they will earn and simply Accept
 * or Reject. When a request struggles to find an acceptor the platform lets
 * the CUSTOMER explicitly raise the price (Job Boost) to make the request more
 * attractive:
 *
 *   1. Low-acceptance detection — a request is flagged when, while it is still
 *      open for offers (MATCHING / REASSIGNED) and nothing has been accepted,
 *      at least `lowAcceptanceWaitMinutes` have passed since the request was
 *      (re)offered, OR at least `lowAcceptanceRejectionThreshold` workers have
 *      rejected the current offer round.
 *   2. Customer approval — the price is only ever raised after the customer
 *      explicitly approves a new amount. No automatic increases.
 *   3. Same booking, recomputed ledger — the increase updates the EXISTING
 *      booking's priceBreakdown (labour -> new price, fees carved out
 *      internally), records an audit entry in priceIncreaseHistory, and never
 *      creates a duplicate job.
 *   4. Re-offer — eligible nearby workers (including workers who previously
 *      rejected, as long as they are still eligible/available) receive the
 *      updated request again. A worker who already accepted can never receive
 *      it, and once accepted the price is locked.
 *   5. Enforced limits — `maxPriceIncreases` cap, per status/owner guards and
 *      a compare-and-swap update so a concurrent accept cannot race a raise.
 */

const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const Cooperative = require('../../models/Cooperative');
const { createNotification } = require('../notification/notificationService');
const { matchWorkersForBooking } = require('../matching/matchingService');
const { computePriceBreakdown } = require('../../utils/pricingUtils');
const { ApiError } = require('../../middleware/errorMiddleware');
const { getIO } = require('../../config/socket');
const { getSettings } = require('./jobBoostConfig');

const OPEN_STATUSES = ['REQUESTED', 'MATCHING', 'REASSIGNED'];

/**
 * Is the request still open for offers (i.e. a price raise is meaningful)?
 */
const isOpenForBoost = (booking) =>
  !!booking && OPEN_STATUSES.includes(booking.status) && !hasAcceptance(booking);

/**
 * Has a worker already been assigned / accepted? Once that happens the price
 * is locked for good.
 */
const hasAcceptance = (booking) => {
  if (!booking) return false;
  if (booking.acceptedAt) return true;
  if (booking.worker) return true;
  return ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(
    booking.status
  );
};

/**
 * Can this booking be REOPENED for offers after expiring? Only requests that
 * were never accepted (no worker, no acceptance recorded). Expiring must never
 * dead-end such a request — the customer can still raise the price (Job Boost)
 * to reopen it and re-offer, or cancel it. A booking that expired after a
 * worker was assigned/no-showed cannot be reused.
 */
const canReopenExpired = (booking) =>
  !!booking &&
  booking.status === 'EXPIRED' &&
  !booking.worker &&
  !booking.acceptedAt;

/**
 * The customer-facing service price (labour). priceBreakdown.labour is the
 * single source of truth — currentPrice/initialPrice mirror it for audit.
 */
const getCurrentLabour = (booking) =>
  booking.priceBreakdown?.labour ?? booking.currentPrice ?? booking.initialPrice ?? 0;

/**
 * Evaluate whether a booking has become "low acceptance".
 * @returns {{low:boolean, reason?:string, elapsedMs?:number, rejections?:number, waitMs?:number}}
 */
const evaluateLowAcceptance = async (booking, settings) => {
  if (!isOpenForBoost(booking)) return { low: false };

  const waitMs = (settings.lowAcceptanceWaitMinutes ?? 5) * 60000;
  const since = booking.lastPriceIncreaseAt || booking.createdAt;
  const elapsedMs = Date.now() - new Date(since).getTime();
  const waitExpired = elapsedMs >= waitMs;

  const rejections = booking.rejectionsCount || 0;
  const rejectionExceeded =
    settings.lowAcceptanceRejectionThreshold != null &&
    rejections >= Number(settings.lowAcceptanceRejectionThreshold);

  if (waitExpired) return { low: true, reason: 'WAIT_TIMEOUT', elapsedMs, rejections, waitMs };
  if (rejectionExceeded) return { low: true, reason: 'REJECTIONS', elapsedMs, rejections, waitMs };
  return { low: false, elapsedMs, rejections, waitMs };
};

/**
 * Mark a low-acceptance booking and (once per flagging event) notify the
 * customer + emit a live socket event so an open Booking Details screen shows
 * the "increase the price?" prompt immediately.
 */
const flagLowAcceptance = async (booking, { reason = 'WAIT_TIMEOUT' } = {}) => {
  if (!booking) return { flagged: false };
  if (booking.lowAcceptanceFlaggedAt) return { flagged: false, already: true };

  const now = new Date();
  const effects = { flagged: true, notified: false };
  booking.lowAcceptanceFlaggedAt = now;
  booking.lowAcceptanceNotifiedAt = now;
  await booking.save();

  await createNotification({
    user: booking.customer,
    type: 'LOW_ACCEPTANCE',
    title: 'No worker has accepted your request yet',
    message: 'You can increase the price to attract more workers to accept your job request.',
    data: { bookingId: booking._id, bookingNumber: booking.bookingNumber, reason },
  });
  effects.notified = true;

  const io = getIO();
  if (io) {
    io.to(`customer_${booking.customer}`).emit('booking_update', {
      bookingId: booking._id,
      status: booking.status,
      lowAcceptance: true,
    });
  }
  return effects;
};

/**
 * Evaluate + flag in one step (idempotent; safe to call from reject/read/sweep).
 */
const evaluateAndFlag = async (booking) => {
  if (!booking || !OPEN_STATUSES.includes(booking.status)) return { low: false };
  const settings = await getSettings();
  const { low, reason } = await evaluateLowAcceptance(booking, settings);
  if (!low) return { low: false };
  return flagLowAcceptance(booking, { reason });
};

/**
 * Background sweep: find every still-open booking without an acceptance and
 * flag any that meet the low-acceptance criteria. Called from the reliability
 * scheduler tick so detection also works when nobody rejects.
 */
const runLowAcceptanceSweep = async () => {
  const settings = await getSettings();
  const open = await Booking.find({
    status: { $in: OPEN_STATUSES },
    acceptedAt: { $exists: false },
    worker: { $exists: false },
  })
    .select(
      '_id customer status createdAt lastPriceIncreaseAt rejectionsCount acceptedAt worker bookingNumber lowAcceptanceFlaggedAt'
    )
    .limit(Math.max(1, settings.sweepLimit ?? 100))
    .lean();

  let scanned = open.length;
  let flagged = 0;
  for (const snap of open) {
    const { low, reason } = await evaluateLowAcceptance(snap, settings);
    if (!low) continue;
    const booking = await Booking.findById(snap._id);
    if (!booking || booking.lowAcceptanceFlaggedAt) continue;
    const res = await flagLowAcceptance(booking, { reason });
    if (res.flagged) flagged += 1;
  }
  return { scanned, flagged };
};

/**
 * Customer-approved price increase (Job Boost).
 *
 * Validations:
 *  - customer owns the booking, request is still open, nothing accepted,
 *    price is strictly higher, max-increase cap respected.
 *  - compare-and-swap update so a worker accepting mid-flight blocks the raise
 *    (returns 409) instead of quietly double-booking state.
 *
 * Then: recompute the all-inclusive priceBreakdown on the SAME booking,
 * append the audit entry, reset the low-acceptance detection round, re-match
 * eligible nearby workers (including previous rejecters still eligible), and
 * re-notify them + the customer over DB notifications and Socket.IO.
 *
 * @param {Object}  params
 * @param {Booking} params.booking   current booking document
 * @param {Object}  params.service   service document (for matching + names)
 * @param {Number}  params.newPrice  new customer-facing price (labour)
 * @param {ObjectId} params.requestedBy  customer user making the change
 */
const increasePrice = async ({ booking, service, newPrice, requestedBy }) => {
  const settings = await getSettings();
  const currentLabour = getCurrentLabour(booking);
  const price = Math.round(Number(newPrice) * 100) / 100;
  const reopenFromExpired = canReopenExpired(booking);

  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiError('Enter a valid price', 400);
  }
  if (price <= currentLabour) {
    throw new ApiError('New price must be higher than the current price', 400);
  }
  if (!isOpenForBoost(booking) && !reopenFromExpired) {
    throw new ApiError('Price can only be increased while workers are being matched', 400);
  }
  if ((booking.priceIncreaseCount || 0) >= settings.maxPriceIncreases) {
    throw new ApiError(`Price can be increased at most ${settings.maxPriceIncreases} times`, 400);
  }

  const coop = await Cooperative.findOne().sort({ createdAt: -1 });
  const materials = booking.priceBreakdown?.materials || 0;
  const newBreakdown = computePriceBreakdown(price, materials, coop);
  const now = new Date();
  const increaseAmount = Math.round((price - currentLabour) * 100) / 100;

  // Re-match BEFORE mutating so a failed CAS never leaves half-applied offers.
  const candidates = await matchWorkersForBooking(
    {
      service,
      location: booking.location ? booking.location.coordinates : undefined,
      requestedDate: booking.scheduledDate || booking.requestedDate,
      isEmergency: booking.isEmergency,
      city: booking.city,
    },
    booking.isEmergency ? 3 : 10
  );

  // Compare-and-swap: only run if the booking is still open (or reopenable
  // after an unaccepted expiry) and under the cap.
  const updated = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: { $in: [...OPEN_STATUSES, ...(reopenFromExpired ? ['EXPIRED'] : [])] },
      priceIncreaseCount: { $lt: settings.maxPriceIncreases },
      $and: [
        { $or: [{ acceptedAt: { $exists: false } }, { acceptedAt: null }] },
        { $or: [{ worker: { $exists: false } }, { worker: null }] },
      ],
    },
    {
      $set: {
        // Reopen an expired-but-never-accepted request as a fresh MATCHING round.
        ...(reopenFromExpired ? { status: 'MATCHING', expiredAt: null } : {}),
        currentPrice: price,
        priceIncreaseCount: (booking.priceIncreaseCount || 0) + 1,
        lastPriceIncreaseAt: now,
        'priceBreakdown.labour': newBreakdown.labour,
        'priceBreakdown.materials': newBreakdown.materials,
        'priceBreakdown.cooperativeContribution': newBreakdown.cooperativeContribution,
        'priceBreakdown.platformFee': newBreakdown.platformFee,
        'priceBreakdown.total': newBreakdown.total,
        // Fresh offer round — restart rejection counting and clear the flag so
        // the prompt re-appears only if the request stays unaccepted.
        rejectionsCount: 0,
        lastRejectionAt: null,
        lowAcceptanceFlaggedAt: null,
        lowAcceptanceNotifiedAt: null,
      },
      $push: {
        priceIncreaseHistory: {
          from: currentLabour,
          to: price,
          increaseAmount,
          byUser: requestedBy,
          createdAt: now,
        },
        statusHistory: {
          status: reopenFromExpired ? 'MATCHING' : booking.status,
          updatedAt: now,
          updatedBy: requestedBy,
          note: reopenFromExpired
            ? `Booking reopened after expiry — price increased to ₹${price} by the customer (Job Boost)`
            : `Price increased to ₹${price} by the customer (Job Boost)`,
        },
      },
    },
    { new: true }
  );
  if (!updated) {
    throw new ApiError('Price is locked or the increase limit was reached', 409);
  }
  if (booking.initialPrice === 0 || booking.initialPrice == null) {
    await Booking.updateOne(
      { _id: booking._id, $or: [{ initialPrice: { $exists: false } }, { initialPrice: 0 }] },
      { $set: { initialPrice: currentLabour } }
    );
  }

  const candidateWorkers = candidates.map((c) => ({
    worker: c.worker,
    score: c.score,
    reasons: c.reasons,
  }));
  await Booking.updateOne({ _id: booking._id }, { $set: { candidateWorkers } });

  // Re-notify each eligible worker (including prior rejecters still eligible).
  const workerIds = candidateWorkers.map((c) => c.worker);
  const workerDocs = workerIds.length
    ? await Worker.find({ _id: { $in: workerIds } }).select('user').lean()
    : [];
  const userByWorker = new Map(workerDocs.map((w) => [w._id.toString(), w.user]));

  const notifications = [];
  for (const c of candidateWorkers) {
    const userId = userByWorker.get(c.worker.toString());
    if (userId) {
      notifications.push({
        user: userId,
        type: 'PRICE_INCREASED',
        title: 'Price increased',
        message: `🔥 Price increased: ${service.name} is now ₹${price} (was ₹${currentLabour}) in your area. Accept to earn it.`,
        data: {
          bookingId: updated._id,
          bookingNumber: updated.bookingNumber,
          price,
          from: currentLabour,
          priceIncreased: true,
          score: c.score,
        },
      });
    }
  }

  const io = getIO();
  if (io) {
    for (const c of candidateWorkers) {
      io.to(`worker_${c.worker}`).emit('new_job', {
        bookingId: updated._id,
        bookingNumber: updated.bookingNumber,
        serviceName: service.name,
        isEmergency: updated.isEmergency,
        price,
        from: currentLabour,
        priceIncreased: true,
        priceIncreaseCount: updated.priceIncreaseCount,
        score: c.score,
      });
    }
    io.to(`customer_${updated.customer}`).emit('booking_update', {
      bookingId: updated._id,
      status: updated.status,
      priceIncreased: true,
      price,
    });
  }

  if (notifications.length) {
    const Notification = require('../../models/Notification');
    await Notification.create(notifications);
  }
  await createNotification({
    user: updated.customer,
    type: 'PRICE_INCREASED',
    title: 'Price increased',
    message: `Your price was increased to ₹${price} and the request was sent to nearby workers again.`,
    data: { bookingId: updated._id, bookingNumber: updated.bookingNumber, price, from: currentLabour },
  });

  return {
    booking: updated,
    from: currentLabour,
    to: price,
    increaseAmount,
    priceIncreaseCount: updated.priceIncreaseCount,
    remainingIncreases: Math.max(0, settings.maxPriceIncreases - updated.priceIncreaseCount),
    candidateCount: candidateWorkers.length,
    workersNotified: notifications.length,
  };
};

module.exports = {
  OPEN_STATUSES,
  isOpenForBoost,
  hasAcceptance,
  canReopenExpired,
  getCurrentLabour,
  evaluateLowAcceptance,
  flagLowAcceptance,
  evaluateAndFlag,
  runLowAcceptanceSweep,
  increasePrice,
};