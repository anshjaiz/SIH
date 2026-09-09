/**
 * appealService.js
 *
 * Worker appeals against penalties. A worker can open ONE open appeal per
 * penalty event. Admin approves (points restored via APPEAL_APPROVED) or
 * rejects. Every decision is recorded with the deciding admin.
 */

const PenaltyAppeal = require('../../models/PenaltyAppeal');
const ReliabilityEvent = require('../../models/ReliabilityEvent');
const Worker = require('../../models/WorkerProfile');
const User = require('../../models/User');
const { applyScoreChange } = require('./reliabilityService');
const { createNotification, notifyUsers } = require('../notification/notificationService');
const { ApiError } = require('../../middleware/errorMiddleware');

const createAppeal = async ({ worker, eventId, reason, explanation = '', evidenceUrls = [] }) => {
  if (!reason) throw new ApiError('Appeal reason is required', 400);

  const event = await ReliabilityEvent.findById(eventId);
  if (!event) throw new ApiError('Reliability event not found', 404);

  const eventWorkerId = event.worker.toString();
  const workerId = worker._id.toString();
  if (eventWorkerId !== workerId) {
    throw new ApiError('You can only appeal your own penalties', 403);
  }

  // Only penalty events (points < 0) are appealable.
  if (event.points >= 0) {
    throw new ApiError('Only penalty events can be appealed', 400);
  }

  const existing = await PenaltyAppeal.findOne({ event: eventId, status: 'PENDING' });
  if (existing) {
    throw new ApiError('An appeal for this penalty is already pending', 400);
  }

  const appeal = await PenaltyAppeal.create({
    worker: workerId,
    event: eventId,
    booking: event.booking || null,
    reason,
    explanation,
    evidenceUrls: evidenceUrls || [],
    status: 'PENDING',
  });

  // Notify admins of a new pending appeal.
  const adminUsers = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  await notifyUsers(
    adminUsers.map((a) => ({
      user: a._id,
      type: 'APPEAL_STATUS',
      title: 'New reliability appeal',
      message: `A worker appealed a ${event.eventType} penalty. Reason: ${reason}`,
      data: { appealId: appeal._id, eventId: event._id },
    }))
  );

  return appeal;
};

const getLatestAppeal = async (workerId) =>
  PenaltyAppeal.findOne({ worker: workerId }).sort({ createdAt: -1 }).lean();

const listAppeals = async (workerId, { status = null, page = 1, limit = 20 } = {}) => {
  const filter = { worker: workerId };
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [appeals, total] = await Promise.all([
    PenaltyAppeal.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PenaltyAppeal.countDocuments(filter),
  ]);
  return { appeals, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
};

const adminListAppeals = async ({ status = null, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [appeals, total] = await Promise.all([
    PenaltyAppeal.find(filter)
      .populate('worker', 'user reliability accountStatus')
      .populate('booking', 'bookingNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PenaltyAppeal.countDocuments(filter),
  ]);
  return { appeals, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
};

/**
 * Admin decision. APPROVE restores the exact points the worker lost.
 */
const decideAppeal = async ({ appealId, admin, action, decisionNote = '' }) => {
  const appeal = await PenaltyAppeal.findById(appealId);
  if (!appeal) throw new ApiError('Appeal not found', 404);
  if (appeal.status !== 'PENDING') {
    throw new ApiError(`Appeal already ${appeal.status.toLowerCase()}`, 400);
  }

  const event = await ReliabilityEvent.findById(appeal.event);
  if (!event) throw new ApiError('Reliability event not found', 404);

  if (action === 'APPROVE') {
    const restored = Math.abs(event.points);
    const approval = await applyScoreChange({
      workerId: appeal.worker,
      eventType: 'APPEAL_APPROVED',
      points: restored,
      reason: `Appeal approved — penalty reversal for ${event.eventType}`,
      bookingId: event.booking || null,
      admin,
      adminNote: decisionNote,
      metadata: { appealedEventId: event._id },
      silent: true,
    });

    appeal.status = 'APPROVED';
    appeal.decidedBy = admin;
    appeal.decisionNote = decisionNote || 'Appealed penalty reversed';
    appeal.decidedAt = new Date();
    await appeal.save();

    const wpUser = await Worker.findById(appeal.worker).select('user').lean();
    await createNotification({
      user: wpUser ? wpUser.user : undefined,
      type: 'APPEAL_STATUS',
      title: 'Appeal approved',
      message: `Your appeal was approved. ${restored} reliability points were restored from ${event.previousScore} → ${approval.newScore}.`,
      data: { appealId: appeal._id, restored },
    });

    return { appeal, reversalEvent: approval.event };
  }

  if (action === 'REJECT') {
    appeal.status = 'REJECTED';
    appeal.decidedBy = admin;
    appeal.decisionNote = decisionNote || 'Appeal rejected';
    appeal.decidedAt = new Date();
    await appeal.save();

    const wp = await Worker.findById(appeal.worker).select('user').lean();
    await createNotification({
      user: wp ? wp.user : undefined,
      type: 'APPEAL_STATUS',
      title: 'Appeal rejected',
      message: decisionNote || 'Your appeal was rejected. The penalty stands.',
      data: { appealId: appeal._id },
    });

    return { appeal };
  }

  throw new ApiError('Unknown decision action', 400);
};

module.exports = {
  createAppeal,
  getLatestAppeal,
  listAppeals,
  adminListAppeals,
  decideAppeal,
};