/**
 * adminComplaintController.js
 *
 * Admin side of the Complaints & Disputes module: list with filters,
 * investigation bundle, status handling, resolution flow, escalation and
 * worker suspension.
 */

const Complaint = require('../../models/Complaint');
const User = require('../../models/User');
const complaintService = require('../../services/complaint/complaintService');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// GET /api/admin/complaints — filterable, pageable list
const getComplaints = asyncHandler(async (req, res) => {
  const { status, priority, category, safety, search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (safety === 'true' || safety === '1') filter.isSafety = true;

  if (search) {
    const re = { $regex: search.trim(), $options: 'i' };
    filter.$or = [
      { complaintNumber: re },
      { description: re },
      { 'booking.bookingNumber': re },
    ];
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

  const [complaints, total] = await Promise.all([
    Complaint.find(filter)
      .populate('customer', 'name email phone')
      .populate('worker', 'verificationStatus isActive completedJobs rating user')
      .populate('booking', 'bookingNumber serviceSnapshot status priceBreakdown')
      .sort({ priority: 1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Complaint.countDocuments(filter),
  ]);

  const enriched = [];
  const workerUserIds = [...new Set(complaints.filter((c) => c.worker?.user).map((c) => c.worker.user))];
  const workerUsers = await User.find({ _id: { $in: workerUserIds } }).select('name').lean();
  const nameById = new Map(workerUsers.map((u) => [u._id.toString(), u.name]));
  for (const c of complaints) {
    const workerUser = c.worker?.user ? nameById.get(c.worker.user.toString()) : null;
    enriched.push({ ...c, workerName: workerUser || 'Worker' });
  }

  res.json({
    success: true,
    data: enriched,
    meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
  });
});

// GET /api/admin/complaints/:id — full investigation bundle
const getComplaintDetail = asyncHandler(async (req, res) => {
  const bundle = await complaintService.getInvestigationBundle(req.params.id);
  res.json({ success: true, data: bundle });
});

// POST /api/admin/complaints/:id/respond — admin note on file
const respond = asyncHandler(async (req, res) => {
  const complaint = await complaintService.submitResponse({
    complaintId: req.params.id,
    byUserId: req.user._id,
    role: 'ADMIN',
    message: req.body.message || '',
  });
  res.json({ success: true, message: 'Note added', data: complaint });
});

// PUT /api/admin/complaints/:id — status transition + priority override
const updateComplaint = asyncHandler(async (req, res) => {
  const { status, priority, note } = req.body;
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError('Complaint not found', 404);

  if (priority && ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) {
    complaint.priority = priority;
    complaint.isSafety = ['HIGH', 'URGENT'].includes(priority);
  }
  if (status) {
    return res.json({
      success: true,
      data: await complaintService.transitionStatus({
        complaintId: complaint._id,
        status,
        note: note || '',
        byUserId: req.user._id,
      }),
    });
  }
  await complaint.save();
  res.json({ success: true, data: complaint });
});

// POST /api/admin/complaints/:id/propose-resolution
const proposeResolution = asyncHandler(async (req, res) => {
  const { decisionType, reason, amount } = req.body;
  const complaint = await complaintService.proposeResolution({
    complaintId: req.params.id,
    decisionType,
    reason,
    amount: Number(amount) || 0,
    byUserId: req.user._id,
  });
  res.json({ success: true, message: 'Resolution proposed', data: complaint });
});

// POST /api/admin/complaints/:id/finalize-resolution
const finalizeResolution = asyncHandler(async (req, res) => {
  const complaint = await complaintService.finalizeResolution({ complaintId: req.params.id, byUserId: req.user._id });
  res.json({ success: true, message: 'Complaint resolved', data: complaint });
});

// POST /api/admin/complaints/:id/escalate
const escalate = asyncHandler(async (req, res) => {
  const { reason, to } = req.body;
  const complaint = await complaintService.escalate({
    complaintId: req.params.id,
    reason,
    to,
    byUserId: req.user._id,
  });
  res.json({ success: true, message: 'Complaint escalated', data: complaint });
});

// POST /api/admin/complaints/:id/suspend-worker
const suspendWorker = asyncHandler(async (req, res) => {
  const { temporary = true, until, reason } = req.body;
  const result = await complaintService.suspendWorker({
    complaintId: req.params.id,
    temporary: temporary !== 'false',
    until,
    reason,
    byUserId: req.user._id,
  });
  res.json({ success: true, message: 'Worker suspended', data: result });
});

module.exports = {
  getComplaints,
  getComplaintDetail,
  respond,
  updateComplaint,
  proposeResolution,
  finalizeResolution,
  escalate,
  suspendWorker,
};