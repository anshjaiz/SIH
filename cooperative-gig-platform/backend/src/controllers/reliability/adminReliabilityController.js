/**
 * adminReliabilityController.js
 *
 * Admin reliability management:
 *  - worker list/detail (score, level, accountStatus, events, appeals)
 *  - manual score adjustment (audited with admin identity)
 *  - merit suspension / reactivation (earning block — never deletes accounts)
 *  - appeal review (approve restores points, reject keeps them)
 *  - tunable settings
 */

const User = require('../../models/User');
const Worker = require('../../models/WorkerProfile');
const WorkerReliability = require('../../models/WorkerReliability');
const ReliabilityEvent = require('../../models/ReliabilityEvent');
const ReliabilitySettings = require('../../models/ReliabilitySettings');
const PenaltyAppeal = require('../../models/PenaltyAppeal');
const Booking = require('../../models/Booking');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const reliabilityConfig = require('../../services/reliability/reliabilityConfig');
const {
  applyScoreChange,
  deriveLevel,
} = require('../../services/reliability/reliabilityService');
const {
  adminListAppeals,
  decideAppeal,
} = require('../../services/reliability/appealService');
const { createNotification } = require('../../services/notification/notificationService');

const toWorkerId = (v) => (typeof v === 'string' ? v : String(v));

// GET /admin/reliability/workers
const listReliabilityWorkers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { search, status, sort = 'score' } = req.query;

  let workers = await Worker.find()
    .populate('user', 'name email phone avatar')
    .lean();

  if (search) {
    const q = String(search).toLowerCase();
    workers = workers.filter(
      (w) =>
        (w.user && (w.user.name || '').toLowerCase().includes(q)) ||
        (w.user && (w.user.email || '').toLowerCase().includes(q)) ||
        (w.city || '').toLowerCase().includes(q)
    );
  }
  if (status) {
    workers = workers.filter((w) => w.accountStatus === status);
  }

  let reliabilityDocs = [];
  const pageIds = workers.slice((page - 1) * limit, page * limit).map((w) => w._id);
  if (pageIds.length) {
    reliabilityDocs = await WorkerReliability.find({ worker: { $in: pageIds } }).lean();
  }
  const relByWorker = new Map(reliabilityDocs.map((r) => [String(r.worker), r]));

  const rows = workers
    .map((w) => {
      const rel = relByWorker.get(String(w._id));
      return {
        _id: w._id,
        name: w.user ? w.user.name : null,
        email: w.user ? w.user.email : null,
        avatar: w.user ? w.user.avatar : null,
        city: w.city,
        verificationStatus: w.verificationStatus,
        isActive: w.isActive,
        accountStatus: w.accountStatus,
        reliability: rel ? rel.score : w.reliability,
        level: rel ? rel.level : deriveLevel(w.reliability ?? 100, {}),
        skillsCount: (w.skills || []).length,
      };
    })
    .sort((a, b) => {
      if (sort === 'reliability' || sort === 'score') return (a.reliability ?? 0) - (b.reliability ?? 0);
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

  const total = workers.length;
  res.json({
    success: true,
    data: {
      workers: rows.slice((page - 1) * limit, page * limit),
      meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    },
  });
});

// GET /admin/reliability/workers/:workerId
const getWorkerReliabilityDetail = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.workerId)
    .populate('user', 'name email phone avatar')
    .lean();
  if (!worker) throw new ApiError('Worker not found', 404);

  const [rel, events, appeals, activeBookings, failedBookings] = await Promise.all([
    WorkerReliability.findOne({ worker: worker._id }).lean(),
    ReliabilityEvent.find({ worker: worker._id }).sort({ createdAt: -1 }).limit(50).lean(),
    PenaltyAppeal.find({ worker: worker._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Booking.countDocuments({
      worker: worker._id,
      status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'] },
    }),
    Booking.countDocuments({
      worker: worker._id,
      status: { $in: ['WORKER_NO_SHOW', 'EXPIRED', 'REASSIGNED'] },
    }),
  ]);

  res.json({
    success: true,
    data: {
      worker,
      reliability: rel || { worker: worker._id, score: worker.reliability, level: deriveLevel(worker.reliability ?? 100, {}) },
      events,
      appeals,
      stats: { activeBookings, failedBookings },
    },
  });
});

// POST /admin/reliability/workers/:workerId/adjust
const adjustWorkerReliability = asyncHandler(async (req, res) => {
  const { points, reason } = req.body;
  if (!Number.isFinite(points)) throw new ApiError('points is required', 400);
  if (!reason) throw new ApiError('reason is required', 400);

  const worker = await Worker.findById(req.params.workerId);
  if (!worker) throw new ApiError('Worker not found', 404);

  const result = await applyScoreChange({
    workerId: worker._id,
    eventType: 'ADMIN_ADJUSTMENT',
    points,
    reason,
    admin: req.user._id,
    adminNote: req.body.adminNote || req.body.note || '',
    metadata: { bookingId: req.body.bookingId || null },
  });

  res.json({
    success: true,
    message: `Reliability score adjusted by ${points}`,
    data: result,
  });
});

// POST /admin/reliability/workers/:workerId/suspend
const suspendWorkerReliability = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.workerId);
  if (!worker) throw new ApiError('Worker not found', 404);

  const targetStatus =
    req.body.accountStatus === 'DEACTIVATION_REVIEW'
      ? 'DEACTIVATION_REVIEW'
      : 'TEMPORARILY_SUSPENDED';
  const reason = req.body.reason || req.body.note || `Suspended by admin (${targetStatus})`;

  let suspendedUntil = null;
  if (req.body.durationDays && targetStatus === 'TEMPORARILY_SUSPENDED') {
    suspendedUntil = new Date(Date.now() + req.body.durationDays * 86400000);
  }

  await Worker.updateOne(
    { _id: worker._id },
    { $set: { accountStatus: targetStatus, suspensionNote: reason, suspendedUntil } }
  );

  const rel = await WorkerReliability.findOneAndUpdate(
    { worker: worker._id },
    { $set: { level: targetStatus } },
    { upsert: true, new: true }
  );

  await ReliabilityEvent.create({
    worker: worker._id,
    booking: null,
    eventType: 'ADMIN_SUSPENSION',
    points: 0,
    previousScore: worker.reliability ?? 100,
    newScore: rel.score,
    levelAfter: targetStatus,
    reason,
    admin: req.user._id,
    adminNote: req.body.adminNote || '',
  });

  await createNotification({
    user: worker.user,
    type: 'RELIABILITY_SUSPENDED',
    title: targetStatus === 'DEACTIVATION_REVIEW' ? 'Under deactivation review' : 'Merit suspension',
    message:
      targetStatus === 'DEACTIVATION_REVIEW'
        ? `Your account is under deactivation review. ${reason}`
        : `You are temporarily suspended from accepting jobs. ${reason}`,
    data: { accountStatus: targetStatus },
  });

  res.json({ success: true, message: `Worker ${targetStatus}`, data: { accountStatus: targetStatus, suspendedUntil } });
});

// POST /admin/reliability/workers/:workerId/reactivate
const reactivateWorkerReliability = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.workerId);
  if (!worker) throw new ApiError('Worker not found', 404);

  const reason = req.body.reason || 'Reactivated by admin';
  const rel = await WorkerReliability.findOne({ worker: worker._id });
  const score = rel ? rel.score : worker.reliability ?? 100;

  await Worker.updateOne(
    { _id: worker._id },
    { $set: { accountStatus: 'ACTIVE', suspensionNote: '', suspendedUntil: null } }
  );
  await WorkerReliability.updateOne(
    { worker: worker._id },
    { $set: { level: deriveLevel(score, (await reliabilityConfig.getSettings()).thresholds) } }
  );

  await ReliabilityEvent.create({
    worker: worker._id,
    booking: null,
    eventType: 'ADMIN_REACTIVATION',
    points: 0,
    previousScore: score,
    newScore: score,
    levelAfter: deriveLevel(score, (await reliabilityConfig.getSettings()).thresholds),
    reason,
    admin: req.user._id,
    adminNote: req.body.adminNote || '',
  });

  await createNotification({
    user: worker.user,
    type: 'APPEAL_STATUS',
    title: 'Account reactivated',
    message: `Your account was reactivated. ${reason}`,
    data: { accountStatus: 'ACTIVE' },
  });

  res.json({ success: true, message: 'Worker reactivated', data: { accountStatus: 'ACTIVE' } });
});

// GET /admin/reliability/appeals
const getAppeals = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const data = await adminListAppeals({ status: req.query.status || null, page, limit });
  res.json({ success: true, data });
});

// POST /admin/reliability/appeals/:id/approve | /reject
const reviewAppeal = asyncHandler(async (req, res) => {
  const action = req.path.endsWith('/approve') ? 'APPROVE' : 'REJECT';
  const result = await decideAppeal({
    appealId: req.params.id,
    admin: req.user._id,
    action,
    decisionNote: req.body.note || req.body.decisionNote || '',
  });
  res.json({ success: true, message: `Appeal ${action}`, data: result });
});

// GET /admin/reliability/settings
const getReliabilitySettings = asyncHandler(async (req, res) => {
  const settings = await reliabilityConfig.reloadSettings();
  res.json({ success: true, data: settings });
});

// PUT /admin/reliability/settings
const updateReliabilitySettings = asyncHandler(async (req, res) => {
  const doc = await ReliabilitySettings.findOneAndUpdate(
    { key: 'default' },
    { $set: req.body },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await reliabilityConfig.reloadSettings();
  res.json({ success: true, data: doc });
});

module.exports = {
  listReliabilityWorkers,
  getWorkerReliabilityDetail,
  adjustWorkerReliability,
  suspendWorkerReliability,
  reactivateWorkerReliability,
  getAppeals,
  reviewAppeal,
  getReliabilitySettings,
  updateReliabilitySettings,
  toWorkerId,
};