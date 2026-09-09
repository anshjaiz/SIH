/**
 * workerReliabilityController.js
 *
 * Worker-facing reliability endpoints: current score, level, recent events,
 * full history and appeals against penalties.
 */

const Worker = require('../../models/WorkerProfile');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const {
  getWorkerReliabilitySnapshot,
  listWorkerReliabilityEvents,
} = require('../../services/reliability/reliabilityService');
const {
  createAppeal,
  listAppeals,
} = require('../../services/reliability/appealService');

const getWorkerIdForUser = async (userId) => {
  const worker = await Worker.findOne({ user: userId });
  return worker ? worker._id : null;
};

// GET /workers/me/reliability
const getMyReliability = asyncHandler(async (req, res) => {
  const workerId = await getWorkerIdForUser(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const data = await getWorkerReliabilitySnapshot(workerId);
  res.json({ success: true, data });
});

// GET /workers/me/reliability/history
const getMyReliabilityHistory = asyncHandler(async (req, res) => {
  const workerId = await getWorkerIdForUser(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const data = await listWorkerReliabilityEvents(workerId, { page, limit });
  res.json({ success: true, data });
});

// POST /workers/me/appeals
const submitAppeal = asyncHandler(async (req, res) => {
  const workerId = await getWorkerIdForUser(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const appeal = await createAppeal({
    worker: { _id: workerId },
    eventId: req.body.eventId,
    reason: req.body.reason,
    explanation: req.body.explanation || '',
    evidenceUrls: Array.isArray(req.body.evidenceUrls) ? req.body.evidenceUrls : [],
  });

  res.status(201).json({ success: true, message: 'Appeal submitted', data: appeal });
});

// GET /workers/me/appeals
const getMyAppeals = asyncHandler(async (req, res) => {
  const workerId = await getWorkerIdForUser(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const data = await listAppeals(workerId, { status: req.query.status || null, page, limit });
  res.json({ success: true, data });
});

module.exports = {
  getMyReliability,
  getMyReliabilityHistory,
  submitAppeal,
  getMyAppeals,
};