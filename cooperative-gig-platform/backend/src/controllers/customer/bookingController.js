const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const Worker = require('../../models/WorkerProfile');
const Notification = require('../../models/Notification');
const Customer = require('../../models/CustomerProfile');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const { matchWorkersForBooking } = require('../../services/matching/matchingService');
const { computePriceBreakdown } = require('../../utils/pricingUtils');
const Cooperative = require('../../models/Cooperative');
const { getIO } = require('../../config/socket');

// Create a service request
const createServiceRequest = asyncHandler(async (req, res) => {
  const {
    serviceId,
    description,
    address,
    location,
    area,
    city,
    requestedDate,
    timeSlot,
    isEmergency,
    emergencyType,
    materialsEstimate = 0,
  } = req.body;

  if (!serviceId) throw new ApiError('Service is required', 400);

  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError('Service not found', 404);

  if (!location || !location.coordinates) {
    throw new ApiError('Location is required', 400);
  }

  // Compute price
  const coop = await Cooperative.findOne().sort({ createdAt: -1 });
  const priceBreakdown = computePriceBreakdown(
    service.basePrice,
    materialsEstimate,
    coop
  );

  // Create booking with REQUESTED status
  const booking = await Booking.create({
    customer: req.user._id,
    service: service._id,
    serviceSnapshot: {
      name: service.name,
      category: service.category,
      basePrice: service.basePrice,
      unit: service.unit,
    },
    requiredSkillIds: service.requiredSkillRefs || [],
    requiredSkillNames: service.requiredSkills || [],
    description,
    problemImages: req.files ? req.files.map((f) => f.path) : [],
    location: {
      type: 'Point',
      coordinates: location.coordinates,
    },
    address,
    area,
    city,
    requestedDate: new Date(requestedDate),
    timeSlot,
    isEmergency,
    emergencyType,
    priceBreakdown,
    status: 'REQUESTED',
    statusHistory: [
      {
        status: 'REQUESTED',
        updatedAt: new Date(),
        updatedBy: req.user._id,
        note: isEmergency ? 'Emergency request created' : 'Service request created',
      },
    ],
  });

  // Update customer stats
  await Customer.findOneAndUpdate(
    { user: req.user._id },
    { $inc: { bookingsCount: 1 } },
    { upsert: true }
  );

  // Notify customer
  await Notification.create({
    user: req.user._id,
    type: 'BOOKING_CREATED',
    title: 'Booking created',
    message: `Your request for ${service.name} has been created (${booking.bookingNumber}). We are finding workers.`,
    data: { bookingId: booking._id, bookingNumber: booking.bookingNumber },
  });

  // Notify admins for emergency
  if (isEmergency) {
    const adminUsers = await require('../../models/User').find({ role: 'admin' });
    if (adminUsers.length) {
      await Notification.create(
        adminUsers.map((a) => ({
          user: a._id,
          type: 'EMERGENCY_REQUEST',
          title: 'Emergency request',
          message: `Emergency: ${service.name} requested by customer. Need priority action.`,
          data: { bookingId: booking._id },
        }))
      );
    }
  }

  // Queue matching to happen
  // Since this may take time, we set status to MATCHING and do matching
  // asynchronously (in real system would use a job queue)
  booking.status = 'MATCHING';
  booking.statusHistory.push({
    status: 'MATCHING',
    updatedAt: new Date(),
    note: 'Looking for suitable workers',
  });

  // Find matching workers
  const candidates = await matchWorkersForBooking(
    {
      service,
      location: location.coordinates,
      requestedDate: new Date(requestedDate),
      isEmergency,
      city,
    },
    isEmergency ? 3 : 10
  );

  booking.candidateWorkers = candidates.map((c) => ({
    worker: c.worker,
    score: c.score,
    reasons: c.reasons,
  }));

  await booking.save();

  // Notify candidate workers via socket
  const io = getIO();
  if (io) {
    for (const candidate of candidates) {
      io.to(`worker_${candidate.worker}`).emit('new_job', {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        serviceName: service.name,
        isEmergency,
        score: candidate.score,
      });
    }
  }

  // Notify workers in DB
  const workerNotifications = [];
  for (const c of candidates) {
    const candidateWorker = await Worker.findById(c.worker).select('user');
    if (candidateWorker && candidateWorker.user) {
      workerNotifications.push({
        user: candidateWorker.user,
        type: 'NEW_JOB',
        title: 'New job available',
        message: `${isEmergency ? '⚠️ EMERGENCY: ' : ''}${service.name} job in your area. Match score ${c.score}/100.`,
        data: { bookingId: booking._id, score: c.score },
      });
    }
  }
  await Notification.create(workerNotifications);

  res.status(201).json({
    success: true,
    message: 'Service request created. Finding suitable workers...',
    data: {
      booking,
      candidateWorkers: booking.candidateWorkers,
      priceBreakdown,
    },
  });
});

const getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('service')
    .populate('customer', 'name phone avatar')
    .populate('worker', 'verificationStatus rating')
    .populate('payment');

  if (!booking) throw new ApiError('Booking not found', 404);

  // Check authorization
  const workerProfile = await Worker.findOne({ user: req.user._id });
  const isWorker = req.user.role === 'worker';
  // 'customer' is populated -> compare by ._id, not toString() of the doc
  const customerId = booking.customer ? booking.customer._id || booking.customer : null;
  const bookingWorkerId = booking.worker ? booking.worker._id || booking.worker : null;
  const isOwner = customerId ? customerId.toString() === req.user._id.toString() : false;

  if (req.user.role === 'admin') {
    // admin can access all
  } else if (isWorker) {
    const candidate = booking.candidateWorkers.some(
      (c) => c.worker && c.worker.toString() === workerProfile?._id.toString()
    );
    if (bookingWorkerId && bookingWorkerId.toString() === workerProfile?._id.toString()) {
      // worker of this booking
    } else if (candidate) {
      // candidate
    } else {
      throw new ApiError('Not authorized to view this booking', 403);
    }
  } else if (!isOwner) {
    throw new ApiError('Not authorized to view this booking', 403);
  }

  res.json({ success: true, data: booking });
});

const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  const isOwner = booking.customer.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }

  if (['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(booking.status)) {
    throw new ApiError(`Cannot cancel booking in ${booking.status} status`, 400);
  }

  booking.status = 'CANCELLED';
  booking.cancelledBy = req.user.role === 'admin' ? 'admin' : 'customer';
  booking.cancellationReason = req.body.reason || 'Cancelled by customer';
  booking.statusHistory.push({
    status: 'CANCELLED',
    updatedAt: new Date(),
    updatedBy: req.user._id,
    note: booking.cancellationReason,
  });
  await booking.save();

  res.json({ success: true, message: 'Booking cancelled', data: booking });
});

module.exports = {
  createServiceRequest,
  getBookingById,
  cancelBooking,
};
