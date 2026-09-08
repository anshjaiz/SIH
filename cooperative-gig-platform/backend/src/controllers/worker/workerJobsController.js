const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const Notification = require('../../models/Notification');
const Payment = require('../../models/Payment');
const Invoice = require('../../models/Invoice');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const { getIO } = require('../../config/socket');
const { computeWorkerEarnings } = require('../../utils/pricingUtils');
const Cooperative = require('../../models/Cooperative');

// Helper to get worker profile for current user
const getWorkerId = async (userId) => {
  const worker = await Worker.findOne({ user: userId });
  return worker ? worker._id : null;
};

// Worker dashboard
const getWorkerDashboard = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);
  const workerId = worker._id;

  const now = new Date();

  const [
    activeJobs,
    pendingRequests,
    upcomingJobs,
    recentCompleted,
    totalEarningsAgg,
    weeklyEarningsAgg,
  ] = await Promise.all([
    // Active/ongoing jobs
    Booking.find({
      worker: workerId,
      status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'] },
    })
      .populate('service', 'name category')
      .populate('customer', 'name phone avatar')
      .sort({ updatedAt: -1 }),

    // Jobs awaiting accept
    Booking.find({
      'candidateWorkers.worker': workerId,
      status: 'MATCHING',
    })
      .populate('service', 'name category')
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(10),

    // Future jobs
    Booking.find({
      worker: workerId,
      status: 'ACCEPTED',
      requestedDate: { $gte: now },
    })
      .populate('service', 'name')
      .sort({ requestedDate: 1 }),

    Booking.find({
      worker: workerId,
      status: 'COMPLETED',
    })
      .populate('service', 'name')
      .sort({ completedAt: -1 })
      .limit(5),

    // Total earnings
    Payment.aggregate([
      { $match: { worker: workerId, status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$workerNetEarnings' } } },
    ]),

    // This week's earnings
    (() => {
      const startOfWeek = new Date(now);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      return Payment.aggregate([
        { $match: { worker: workerId, status: 'SUCCESS', paymentDate: { $gte: startOfWeek } } },
        { $group: { _id: null, total: { $sum: '$workerNetEarnings' } } },
      ]);
    })(),
  ]);

  res.json({
    success: true,
    data: {
      profile: worker,
      stats: {
        totalEarnings: totalEarningsAgg.length ? totalEarningsAgg[0].total : 0,
        weeklyEarnings: weeklyEarningsAgg.length ? weeklyEarningsAgg[0].total : 0,
        activeJobs: activeJobs.length,
        pendingRequests: pendingRequests.length,
        completedJobs: worker.completedJobs,
        rating: worker.rating,
        ratingCount: worker.ratingCount,
      },
      activeJobs,
      pendingRequests,
      upcomingJobs,
      recentCompleted,
    },
  });
});

// Get job requests (MATCHING)
const getJobRequests = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const requests = await Booking.find({
    'candidateWorkers.worker': worker._id,
    status: 'MATCHING',
  })
    .populate('service', 'name category basePrice')
    .populate('customer', 'name phone avatar')
    .sort({ isEmergency: -1, createdAt: -1 });

  // Attach match score
  const enriched = requests.map((booking) => {
    const candidate = booking.candidateWorkers.find(
      (c) => c.worker.toString() === worker._id.toString()
    );
    const b = booking.toObject();
    b.matchScore = candidate ? candidate.score : 0;
    b.matchReasons = candidate ? candidate.reasons : [];
    return b;
  });

  res.json({ success: true, data: enriched });
});

// Accept a job
const acceptJob = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);
  const workerId = worker._id;

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  if (!booking.candidateWorkers.some((c) => c.worker.toString() === workerId.toString())) {
    throw new ApiError('This job was not offered to you', 403);
  }

  if (booking.status !== 'MATCHING' && booking.status !== 'ASSIGNED') {
    throw new ApiError(`Cannot accept job in ${booking.status} status`, 400);
  }

  booking.worker = workerId;
  booking.status = 'ACCEPTED';
  booking.matchedScore = booking.candidateWorkers.find(
    (c) => c.worker.toString() === workerId.toString()
  )?.score || 0;
  booking.matchReasons = booking.candidateWorkers.find(
    (c) => c.worker.toString() === workerId.toString()
  )?.reasons || [];
  booking.statusHistory.push({
    status: 'ACCEPTED',
    updatedAt: new Date(),
    updatedBy: req.user._id,
    note: 'Worker accepted the job',
  });
  await booking.save();

  // Notify customer
  await Notification.create({
    user: booking.customer,
    type: 'WORKER_ACCEPTED',
    title: 'Worker accepted your job',
    message: `${req.user.name} accepted your request for ${booking.serviceSnapshot.name}.`,
    data: { bookingId: booking._id },
  });
  const io = getIO();
  if (io) io.to(`customer_${booking.customer}`).emit('booking_update', { bookingId: booking._id, status: 'ACCEPTED' });

  res.json({ success: true, message: 'Job accepted', data: booking });
});

// Reject a job
const rejectJob = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);
  const workerId = worker._id;

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  // Remove from candidate list
  booking.candidateWorkers = booking.candidateWorkers.filter(
    (c) => c.worker.toString() !== workerId.toString()
  );
  await booking.save();

  res.json({ success: true, message: 'Job rejected' });
});

// Get active jobs
const getActiveJobs = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const jobs = await Booking.find({
    worker: worker._id,
    status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'] },
  })
    .populate('service', 'name category')
    .populate('customer', 'name phone avatar')
    .sort({ updatedAt: -1 });

  res.json({ success: true, data: jobs });
});

// Start job
const startJob = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);
  if (booking.worker.toString() !== worker._id.toString()) {
    throw new ApiError('Not your job', 403);
  }
  if (booking.status !== 'ACCEPTED' && booking.status !== 'ON_THE_WAY') {
    throw new ApiError(`Cannot start job in ${booking.status} status`, 400);
  }

  booking.status = 'STARTED';
  booking.statusHistory.push({
    status: 'STARTED',
    updatedAt: new Date(),
    updatedBy: req.user._id,
    note: 'Work started',
  });
  await booking.save();

  res.json({ success: true, message: 'Job started', data: booking });
});

// Update worker location (for tracking)
const updateLocation = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const { coordinates } = req.body;
  if (!coordinates || !Array.isArray(coordinates)) {
    throw new ApiError('Invalid coordinates', 400);
  }

  worker.location = { type: 'Point', coordinates };
  await worker.save();

  // Also update active booking worker location
  const activeBooking = await Booking.findOneAndUpdate(
    {
      worker: worker._id,
      status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'] },
    },
    {
      workerLocation: { type: 'Point', coordinates },
      'statusHistory.$.lastUpdatedAt': new Date(),
    },
    { new: true }
  );

  if (activeBooking) {
    const io = getIO();
    if (io) io.to(`customer_${activeBooking.customer}`).emit('worker_location', {
      bookingId: activeBooking._id,
      coordinates,
    });
  }

  res.json({ success: true, message: 'Location updated' });
});

// Complete job
const completeJob = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);
  if (booking.worker.toString() !== worker._id.toString()) {
    throw new ApiError('Not your job', 403);
  }
  if (booking.status !== 'STARTED') {
    throw new ApiError(`Cannot complete job in ${booking.status} status`, 400);
  }

  booking.status = 'COMPLETED';
  booking.completedAt = new Date();
  booking.afterImages = req.files ? req.files.map((f) => f.path) : booking.afterImages;
  booking.statusHistory.push({
    status: 'COMPLETED',
    updatedAt: new Date(),
    updatedBy: req.user._id,
    note: 'Work completed and awaiting customer confirmation',
  });
  await booking.save();

  // Update worker stats
  worker.completedJobs = (worker.completedJobs || 0) + 1;
  await worker.save();

  // Finalize collaboration team (credits collaborators)
  const { completeTeam } = require('../../services/collaborator/teamFormationService');
  await completeTeam(booking._id);

  // Notify customer
  await Notification.create({
    user: booking.customer,
    type: 'JOB_COMPLETED',
    title: 'Job completed',
    message: `${req.user.name} marked the job as completed. Please confirm.`,
    data: { bookingId: booking._id },
  });
  const io = getIO();
  if (io) io.to(`customer_${booking.customer}`).emit('booking_update', { bookingId: booking._id, status: 'COMPLETED' });

  res.json({ success: true, message: 'Job completed', data: booking });
});

// Confirm completion (customer confirms)
const confirmCompletion = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('service', 'name');
  if (!booking) throw new ApiError('Booking not found', 404);
  if (booking.customer.toString() !== req.user._id.toString()) {
    throw new ApiError('Not authorized', 403);
  }
  if (booking.status !== 'COMPLETED') {
    throw new ApiError('Booking not in completed state', 400);
  }

  booking.customerConfirmed = true;
  await booking.save();

  // Generate payment & invoice here? Handled by payment flow

  res.json({ success: true, message: 'Completion confirmed. Payment processed.' });
});

// Worker earnings summary
const getEarnings = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const payments = await Payment.find({
    worker: worker._id,
    status: 'SUCCESS',
  }).populate('booking', 'serviceSnapshot');

  const totalGross = payments.reduce((s, p) => s + (p.workerGross || p.amount), 0);
  const totalCoopDeduction = payments.reduce((s, p) => s + (p.cooperativeDeduction || 0), 0);
  const totalNet = payments.reduce((s, p) => s + (p.workerNetEarnings || 0), 0);

  res.json({
    success: true,
    data: {
      payments,
      summary: {
        totalGross,
        totalCoopDeduction,
        totalNet,
        count: payments.length,
      },
    },
  });
});

// Get worker reviews
const getWorkerReviews = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const Review = require('../../models/Review');
  const reviews = await Review.find({
    reviewee: req.user._id,
    reviewType: 'CUSTOMER_TO_WORKER',
  })
    .populate('reviewer', 'name avatar')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: reviews });
});

// Update job status (worker) - generic for ON_THE_WAY etc.
const updateJobStatus = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);
  if (booking.worker.toString() !== worker._id.toString()) {
    throw new ApiError('Not your job', 403);
  }

  const { status } = req.body;
  const allowed = {
    ASSIGNED: 'ACCEPTED',
    ACCEPTED: 'ON_THE_WAY',
    ON_THE_WAY: 'STARTED',
    STARTED: 'STARTED',
  };

  if (!allowed[booking.status] || allowed[booking.status] !== status) {
    throw new ApiError(`Cannot transition from ${booking.status} to ${status}`, 400);
  }

  booking.status = status;
  booking.statusHistory.push({
    status,
    updatedAt: new Date(),
    updatedBy: req.user._id,
    note: `Status updated to ${status}`,
  });
  await booking.save();

  res.json({ success: true, message: `Status updated to ${status}`, data: booking });
});

module.exports = {
  getWorkerDashboard,
  getJobRequests,
  acceptJob,
  rejectJob,
  getActiveJobs,
  startJob,
  updateLocation,
  completeJob,
  confirmCompletion,
  getEarnings,
  getWorkerReviews,
  updateJobStatus,
  getWorkerId,
};
