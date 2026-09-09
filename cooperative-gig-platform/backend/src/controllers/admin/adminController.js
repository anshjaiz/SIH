const User = require('../../models/User');
const Worker = require('../../models/WorkerProfile');
const Customer = require('../../models/CustomerProfile');
const Certificate = require('../../models/Certificate');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const Complaint = require('../../models/Complaint');
const Review = require('../../models/Review');
const Service = require('../../models/Service');
const Notification = require('../../models/Notification');
const Cooperative = require('../../models/Cooperative');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const { refreshWorkerEligibility } = require('../../services/matching/matchingService');

// -------------------- Admin Dashboard --------------------

const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalWorkers,
    verifiedWorkers,
    activeWorkers,
    totalCustomers,
    todaysBookings,
    completedJobs,
    pendingJobs,
    revenueAgg,
    workerEarningsAgg,
    complaints,
    avgRatingAgg,
  ] = await Promise.all([
    Worker.countDocuments(),
    Worker.countDocuments({ verificationStatus: 'VERIFIED' }),
    Worker.countDocuments({ isActive: true }),
    Customer.countDocuments(),
    Booking.countDocuments({ createdAt: { $gte: startOfDay } }),
    Booking.countDocuments({ status: 'COMPLETED' }),
    Booking.countDocuments({ status: { $in: ['REQUESTED', 'MATCHING', 'ASSIGNED', 'ACCEPTED'] } }),
    Payment.aggregate([
      { $match: { status: 'SUCCESS' } },
      { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$workerNetEarnings' } } },
    ]),
    Complaint.find({ status: { $ne: 'RESOLVED' } }),
    Review.aggregate([
      { $match: { reviewType: 'CUSTOMER_TO_WORKER' } },
      { $group: { _id: null, avg: { $avg: '$overallQuality' }, count: { $sum: 1 } } },
    ]),
  ]);

  // Monthly bookings for chart
  const monthlyBookings = await Booking.aggregate([
    {
      $match: { createdAt: { $gte: startOfMonth } },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Revenue by day
  const dailyRevenue = await Payment.aggregate([
    {
      $match: {
        status: 'SUCCESS',
        paymentDate: { $gte: startOfMonth },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
        revenue: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Bookings by category
  const bookingsByCategory = await Booking.aggregate([
    { $group: { _id: '$serviceSnapshot.category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.json({
    success: true,
    data: {
      stats: {
        totalWorkers,
        verifiedWorkers,
        activeWorkers,
        totalCustomers,
        todaysBookings,
        completedJobs,
        pendingJobs,
        revenue: revenueAgg.length ? revenueAgg[0].revenue : 0,
        completedPayments: revenueAgg.length ? revenueAgg[0].count : 0,
        workerEarnings: workerEarningsAgg.length ? workerEarningsAgg[0].total : 0,
        openComplaints: complaints.length,
        customerSatisfaction: avgRatingAgg.length ? avgRatingAgg[0].avg : 0,
        reviewCount: avgRatingAgg.length ? avgRatingAgg[0].count : 0,
      },
      charts: {
        monthlyBookings,
        dailyRevenue,
        bookingsByCategory,
      },
    },
  });
});

// -------------------- Worker Management --------------------

const getWorkers = asyncHandler(async (req, res) => {
  const { status, search, category } = req.query;

  const filter = {};
  if (status) filter.verificationStatus = status;
  if (category) filter.city = category;

  const workers = await Worker.find(filter)
    .populate('user', 'name email phone avatar')
    .select('-documents')
    .sort({ joinedDate: -1 });

  // Client-side search
  let result = workers;
  if (search) {
    const s = search.toLowerCase();
    result = workers.filter(
      (w) =>
        (w.user && (w.user.name || '').toLowerCase().includes(s)) ||
        (w.user && (w.user.email || '').toLowerCase().includes(s)) ||
        (w.area || '').toLowerCase().includes(s) ||
        w.skills.some((sk) => (sk.name || '').toLowerCase().includes(s))
    );
  }

  res.json({ success: true, data: result });
});

// Get worker detail (admin)
const getWorkerDetail = asyncHandler(async (req, res) => {
  const worker = await Worker.findById(req.params.id)
    .populate('user', 'name email phone avatar')
    .populate('skills.skill')
    .populate('certificates');

  if (!worker) throw new ApiError('Worker not found', 404);

  // Booking stats
  const { thisWeek } = await require('../../services/ai/allocationService').getWorkerWorkload(
    worker._id
  );

  // Earnings
  const earnings = await Payment.aggregate([
    { $match: { worker: worker._id, status: 'SUCCESS' } },
    { $group: { _id: null, total: { $sum: '$workerNetEarnings' }, count: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    data: {
      worker,
      workloadThisWeek: thisWeek,
      totalEarnings: earnings.length ? earnings[0].total : 0,
      paymentCount: earnings.length ? earnings[0].count : 0,
    },
  });
});

// Verify / update worker status
const updateWorkerStatus = asyncHandler(async (req, res) => {
  const { status, remark } = req.body;
  const validStatuses = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
  if (!validStatuses.includes(status)) {
    throw new ApiError('Invalid status', 400);
  }

  const worker = await Worker.findByIdAndUpdate(
    req.params.id,
    { verificationStatus: status, verificationRemark: remark || '' },
    { new: true }
  );
  if (!worker) throw new ApiError('Worker not found', 404);

  refreshWorkerEligibility(worker._id).catch((err) =>
    console.error('refreshWorkerEligibility error:', err)
  );

  // Notify worker
  await Notification.create({
    user: worker.user,
    type: 'SYSTEM',
    title: 'Verification status updated',
    message: `Your verification status is now ${status}. ${remark || ''}`,
    data: { workerId: worker._id, status },
  });

  res.json({ success: true, message: `Worker status updated to ${status}`, data: worker });
});

// Verify / unverify a single worker skill (strict skill eligibility gate)
const updateWorkerSkillVerification = asyncHandler(async (req, res) => {
  const { verified } = req.body;
  if (typeof verified !== 'boolean') {
    throw new ApiError('verified must be a boolean', 400);
  }

  const worker = await Worker.findById(req.params.id);
  if (!worker) throw new ApiError('Worker not found', 404);

  const skillSubDoc = worker.skills.id(req.params.skillId);
  if (!skillSubDoc) throw new ApiError('Skill not found on worker', 404);

  skillSubDoc.verified = verified;
  skillSubDoc.verifiedAt = verified ? new Date() : null;
  await worker.save();

  // Re-evaluate all open MATCHING bookings for this worker — add if newly
  // eligible, remove if no longer eligible.  Fire-and-forget so the admin
  // response isn't delayed by the (potentially heavy) re-match.
  refreshWorkerEligibility(worker._id).catch((err) =>
    console.error('refreshWorkerEligibility error:', err)
  );

  // Notify worker
  await Notification.create({
    user: worker.user,
    type: 'SYSTEM',
    title: verified ? 'Skill verified' : 'Skill verification revoked',
    message: `Your skill "${skillSubDoc.name || 'skill'}" was ${
      verified ? 'verified' : 'marked unverified'
    } by the admin.`,
    data: { workerId: worker._id, skillId: req.params.skillId, verified },
  });

  res.json({
    success: true,
    message: `Skill "${skillSubDoc.name || ''}" ${verified ? 'verified' : 'unverified'}`,
    data: worker,
  });
});

// -------------------- Certificate Verification --------------------

const getCertificates = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const certificates = await Certificate.find(filter)
    .populate({
      path: 'worker',
      populate: { path: 'user', select: 'name email' },
    })
    .sort({ createdAt: -1 });

  res.json({ success: true, data: certificates });
});

const reviewCertificate = asyncHandler(async (req, res) => {
  const { action, remark } = req.body;
  const validActions = ['APPROVED', 'REJECTED', 'RE_UPLOAD_REQUESTED'];
  if (!validActions.includes(action)) {
    throw new ApiError('Invalid action', 400);
  }

  const certificate = await Certificate.findById(req.params.id).populate('worker');
  if (!certificate) throw new ApiError('Certificate not found', 404);

  certificate.status = action;
  certificate.adminRemark = remark || '';
  certificate.reviewedBy = req.user._id;
  certificate.reviewedAt = new Date();
  await certificate.save();

  // Notify worker
  await Notification.create({
    user: certificate.worker.user,
    type: 'SYSTEM',
    title: 'Certificate review',
    message: `Your certificate "${certificate.title}" was ${action}. ${remark || ''}`,
    data: { certificateId: certificate._id },
  });

  // If approved and all good, mark worker verified
  if (action === 'APPROVED') {
    // Check if worker has any pending/rejected certificates that block verification
    const pendingCerts = await Certificate.countDocuments({
      worker: certificate.worker._id,
      status: 'PENDING',
    });
    if (pendingCerts === 0) {
      await Worker.findByIdAndUpdate(certificate.worker._id, {
        verificationStatus: 'VERIFIED',
      });
    }
  }

  res.json({ success: true, message: `Certificate ${action}`, data: certificate });
});

// -------------------- Customers --------------------

const getCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().populate('user', 'name email phone avatar');
  res.json({ success: true, data: customers });
});

// -------------------- Bookings --------------------

const getAllBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('service', 'name category')
      .populate('customer', 'name email phone')
      .populate('worker', 'verificationStatus completedJobs')
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit)),
    Booking.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: bookings,
    meta: { page: Number(page), limit: Number(limit), total },
  });
});

// -------------------- Payments --------------------

const getAllPayments = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const payments = await Payment.find(filter)
    .populate('customer', 'name email')
    .populate('worker', 'verificationStatus')
    .populate('booking', 'bookingNumber serviceSnapshot')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ success: true, data: payments });
});

// -------------------- Complaints --------------------

const getComplaints = asyncHandler(async (req, res) => {
  const { status, priority } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;

  const complaints = await Complaint.find(filter)
    .populate('customer', 'name email phone')
    .populate('worker', 'verificationStatus completedJobs')
    .populate('booking', 'bookingNumber serviceSnapshot')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: complaints });
});

const updateComplaint = asyncHandler(async (req, res) => {
  const { status, resolution, actionTaken, priority } = req.body;
  const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'];
  if (status && !validStatuses.includes(status)) {
    throw new ApiError('Invalid status', 400);
  }

  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError('Complaint not found', 404);

  if (status) complaint.status = status;
  if (resolution) complaint.resolution = resolution;
  if (actionTaken) complaint.actionTaken = actionTaken;
  if (priority) complaint.priority = priority;
  complaint.handledBy = req.user._id;
  if (status === 'RESOLVED') complaint.resolvedAt = new Date();

  await complaint.save();

  res.json({ success: true, message: 'Complaint updated', data: complaint });
});

// -------------------- Training admin --------------------

const createTraining = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    category,
    skill,
    duration,
    mode,
    instructor,
    cost,
    startDate,
    maxSeats,
  } = req.body;

  if (!title) throw new ApiError('Training title is required', 400);

  const training = await require('../../models/Training').Training.create({
    title,
    description,
    category,
    skill,
    duration,
    mode,
    instructor,
    cost,
    startDate,
    maxSeats: maxSeats || 100,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, message: 'Training created', data: training });
});

const updateTraining = asyncHandler(async (req, res) => {
  const { Training } = require('../../models/Training');
  const training = await Training.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true }
  );
  if (!training) throw new ApiError('Training not found', 404);
  res.json({ success: true, message: 'Training updated', data: training });
});

// -------------------- Cooperative settings --------------------

const getCooperativeSettings = asyncHandler(async (req, res) => {
  let coop = await Cooperative.findOne().sort({ createdAt: -1 });
  if (!coop) {
    coop = await Cooperative.create({});
  }
  res.json({ success: true, data: coop });
});

const updateCooperativeSettings = asyncHandler(async (req, res) => {
  let coop = await Cooperative.findOne().sort({ createdAt: -1 });
  if (!coop) {
    coop = await Cooperative.create({});
  }

  const fields = ['name', 'platformFeePercent', 'cooperativeContributionPercent', 'gstPercent', 'address', 'contactEmail', 'contactPhone', 'emergencyHelpline', 'allocationWeights'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) coop[f] = req.body[f];
  });
  await coop.save();

  res.json({ success: true, message: 'Cooperative settings updated', data: coop });
});

module.exports = {
  getDashboardStats,
  getWorkers,
  getWorkerDetail,
  updateWorkerStatus,
  updateWorkerSkillVerification,
  getCertificates,
  reviewCertificate,
  getCustomers,
  getAllBookings,
  getAllPayments,
  getComplaints,
  updateComplaint,
  createTraining,
  updateTraining,
  getCooperativeSettings,
  updateCooperativeSettings,
};
