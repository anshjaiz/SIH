const Complaint = require('../../models/Complaint');
const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const complaintService = require('../../services/complaint/complaintService');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

const toEvidence = (files) =>
  (files || []).map((f) => ({
    type: f.mimetype.startsWith('video') ? 'VIDEO' : f.mimetype === 'application/pdf' ? 'DOCUMENT' : 'IMAGE',
    path: f.path,
    uploadedAt: new Date(),
  }));

// Create complaint (customer) — accepts multipart `evidence` or JSON `images[]`
const createComplaint = asyncHandler(async (req, res) => {
  const { bookingId, category, description, preferredResolution, priority } = req.body;
  const evidence = req.files && req.files.length ? toEvidence(req.files) : (req.body.evidence ? JSON.parse(req.body.evidence) : []);
  const legacyImages = req.body.images || [];

  const complaint = await complaintService.createComplaint({
    customerId: req.user._id,
    bookingId,
    category,
    description,
    evidence,
    preferredResolution,
    priorityOverride: priority,
  });
  if (legacyImages.length) {
    complaint.images = complaint.images.concat(legacyImages);
    await complaint.save();
  }

  res.status(201).json({ success: true, message: 'Complaint filed', data: complaint });
});

// Role-aware list: customer sees complaints they filed; worker sees complaints against them
const getMyComplaints = asyncHandler(async (req, res) => {
  let complaints;
  if (req.user.role === 'worker') {
    const profile = await Worker.findOne({ user: req.user._id }).select('_id');
    complaints = profile
      ? await Complaint.find({ worker: profile._id })
          .populate('booking', 'bookingNumber serviceSnapshot')
          .sort({ createdAt: -1 })
      : [];
  } else {
    complaints = await Complaint.find({ customer: req.user._id })
      .populate('booking', 'bookingNumber serviceSnapshot')
      .sort({ createdAt: -1 });
  }
  res.json({ success: true, data: complaints });
});

// Get complaint by id (owner customer / assigned worker / admin)
const getComplaintById = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id)
    .populate('customer', 'name email phone')
    .populate('worker', 'verificationStatus user')
    .populate('booking', 'bookingNumber serviceSnapshot status city');
  if (!complaint) throw new ApiError('Complaint not found', 404);

  const isCustomer = complaint.customer?._id?.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  let isWorker = false;
  if (req.user.role === 'worker') {
    const profile = await Worker.findOne({ user: req.user._id }).select('_id');
    isWorker = complaint.worker?._id?.toString() === profile?._id?.toString();
  }
  if (!isCustomer && !isAdmin && !isWorker) throw new ApiError('Not authorized', 403);

  res.json({ success: true, data: complaint });
});

// Customer / worker respond to a complaint (worker can accept responsibility or dispute)
const respondToComplaint = asyncHandler(async (req, res) => {
  const { message, acceptResponsibility, dispute } = req.body;
  const evidence = req.files && req.files.length ? toEvidence(req.files) : [];

  const role = req.user.role === 'admin' ? 'ADMIN' : req.user.role === 'worker' ? 'WORKER' : 'CUSTOMER';
  const complaint = await complaintService.submitResponse({
    complaintId: req.params.id,
    byUserId: req.user._id,
    role,
    message,
    acceptResponsibility: acceptResponsibility === true || acceptResponsibility === 'true',
    dispute: dispute === true || dispute === 'true',
    evidence,
  });
  res.json({ success: true, message: 'Response submitted', data: complaint });
});

// Customer cancels their own complaint
const cancelComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError('Complaint not found', 404);
  if (complaint.customer.toString() !== req.user._id.toString()) throw new ApiError('Not authorized', 403);
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(complaint.status)) {
    throw new ApiError('Only open complaints can be cancelled', 400);
  }
  complaint.status = 'CANCELLED';
  complaint.history.push({ status: 'CANCELLED', action: 'CANCELLED', by: req.user._id, note: 'Cancelled by customer' });
  await complaint.save();
  res.json({ success: true, message: 'Complaint cancelled', data: complaint });
});

// Status milestones for the customer tracking UI
const getStatusFlow = asyncHandler(async (req, res) => {
  const flow = [
    { status: 'SUBMITTED', label: 'Submitted', description: 'Complaint received' },
    { status: 'UNDER_REVIEW', label: 'Under review', description: 'Team is reviewing' },
    { status: 'INVESTIGATING', label: 'Investigating', description: 'Gathering statements & evidence' },
    { status: 'RESOLUTION_PROPOSED', label: 'Resolution proposed', description: 'Resolution offered' },
    { status: 'RESOLVED', label: 'Resolved', description: 'Complaint closed' },
  ];
  res.json({ success: true, data: flow });
});

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  respondToComplaint,
  cancelComplaint,
  getStatusFlow,
};