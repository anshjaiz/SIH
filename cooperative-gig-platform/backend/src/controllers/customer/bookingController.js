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
const { deriveScheduleWindow } = require('../../utils/scheduleUtils');
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
    startTime,
    endTime,
    isEmergency,
    emergencyType,
  } = req.body;

  if (!serviceId) throw new ApiError('Service is required', 400);

  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError('Service not found', 404);

  if (!location || !location.coordinates) {
    throw new ApiError('Location is required', 400);
  }

  // Compute price. No material estimate at booking time — the customer is not
  // expected to know material costs before the worker visits. Materials are
  // added later only via the worker's + customer-approved material request.
  const coop = await Cooperative.findOne().sort({ createdAt: -1 });
  const priceBreakdown = computePriceBreakdown(
    service.basePrice,
    0,
    coop
  );

  // Absolute schedule window used by the reliability scheduler
  const schedule = deriveScheduleWindow(requestedDate, timeSlot, {
    isEmergency,
    explicitStartTime: startTime,
    explicitEndTime: endTime,
  });

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
    scheduledDate: schedule.scheduledDate,
    scheduledStartTime: schedule.scheduledStartTime,
    scheduledEndTime: schedule.scheduledEndTime,
    isEmergency,
    emergencyType,
    priceBreakdown,
    // Job Boost baseline: the customer-facing labour price starts at the base
    // price. currentPrice tracks any customer-approved increase.
    initialPrice: service.basePrice,
    currentPrice: service.basePrice,
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

  // Lazy low-acceptance detection on the read path: if the request has been
  // waiting long enough (or enough workers declined), flag it so the customer
  // sees the "increase the price?" prompt right away — no need to wait for the
  // background sweep. Idempotent and non-blocking for the response.
  const { evaluateAndFlag } = require('../../services/jobBoost/jobBoostService');
  await evaluateAndFlag(booking).catch(() => {});

  // Surface the Job Boost config so the UI can show remaining increases + the
  // recommended bump without hard-coding limits on the client.
  const { getSettings } = require('../../services/jobBoost/jobBoostConfig');
  const boostSettings = await getSettings();

  const data = booking.toObject();
  data.priceBoost = {
    maxIncreases: boostSettings.maxPriceIncreases,
    recommendedIncreasePercent: boostSettings.recommendedIncreasePercent,
    remainingIncreases: Math.max(
      0,
      boostSettings.maxPriceIncreases - (booking.priceIncreaseCount || 0)
    ),
    lowAcceptance:
      !!booking.lowAcceptanceFlaggedAt &&
      ['REQUESTED', 'MATCHING', 'REASSIGNED'].includes(booking.status) &&
      !booking.acceptedAt,
  };

  res.json({ success: true, data });
});

// Customer-approved price increase (Job Boost). Same booking, higher price,
// re-offered to eligible workers. NOT a bidding system — workers only ever
// Accept or Reject at the price the customer sets.
const increaseBookingPrice = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  if (booking.customer.toString() !== req.user._id.toString()) {
    throw new ApiError('Not authorized', 403);
  }

  const service = await Service.findById(booking.service);
  if (!service) throw new ApiError('Service not found', 404);

  const { increasePrice } = require('../../services/jobBoost/jobBoostService');
  const result = await increasePrice({
    booking,
    service,
    newPrice: req.body && req.body.newPrice,
    requestedBy: req.user._id,
  });

  res.json({
    success: true,
    message: 'Price increased. Sending your request to workers again.',
    data: result,
  });
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

  const workerHadAccepted =
    booking.acceptedAt &&
    ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(booking.status);

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

  // Reliability: cancelling after a worker accepted unfairly penalises the worker.
  if (workerHadAccepted && booking.worker) {
    require('../../services/reliability/reliabilityService')
      .handleCancelledAfterAccept(booking.worker, booking._id)
      .catch((e) => console.error('[reliability] cancel penalty error:', e.message));
  }

  if (booking.worker && workerHadAccepted) {
    const workerUser = await Worker.findById(booking.worker).select('user');
    if (workerUser) {
      await Notification.create({
        user: workerUser.user,
        type: 'BOOKING_CREATED',
        title: 'Booking cancelled by customer',
        message: `The customer cancelled ${booking.bookingNumber} after you accepted it.`,
        data: { bookingId: booking._id, bookingNumber: booking.bookingNumber },
      });
    }
  }

  // Refund any money already paid for this booking. The gateway refund is
  // simulated in TEST mode (Razorpay refund attempted when test keys exist)
  // and any held/released worker earning is reversed in the wallet ledger.
  if (booking.payment && ['PAID', 'SUCCESS'].includes(booking.paymentStatus)) {
    const { initiateRefund } = require('../../services/payment/paymentService');
    try {
      const refund = await initiateRefund(booking.payment, {
        initiatedBy: req.user._id,
        method: 'MOCK_REFUND',
        amount: booking.priceBreakdown?.total || undefined,
      });
      booking.statusHistory.push({
        status: 'CANCELLED',
        updatedAt: new Date(),
        updatedBy: req.user._id,
        note: `Refund initiated (${refund.refundNumber || refund._id})`,
      });
      await booking.save();
      await Notification.create({
        user: booking.customer,
        type: 'REFUND_STATUS',
        title: 'Refund initiated',
        message: `Your refund of ₹${refund.amount} for ${booking.bookingNumber} is being processed.`,
        data: { bookingId: booking._id, refundId: refund._id, refundNumber: refund.refundNumber },
      });
    } catch (e) {
      console.error('[refund] cancellation refund error:', e.message);
    }
  }

  res.json({ success: true, message: 'Booking cancelled', data: booking });
});

// Request a replacement worker after a no-show / worker failure
const requestReassignment = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  const isOwner = booking.customer.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }

  if (!['WORKER_NO_SHOW', 'REASSIGNED', 'EXPIRED'].includes(booking.status)) {
    throw new ApiError(`Cannot request a replacement in ${booking.status} status`, 400);
  }

  const { attemptReassignment } = require('../../services/reliability/reliabilityService');
  const result = await attemptReassignment(booking, { reason: 'CUSTOMER_REQUEST' });

  if (result.reassigned) {
    return res.json({
      success: true,
      message: 'Looking for a replacement worker',
      data: { status: 'REASSIGNED', candidateCount: result.candidateCount },
    });
  }
  return res.json({
    success: false,
    message: 'No replacement worker available right now. Please try later or contact support.',
    data: { status: 'EXPIRED' },
  });
});

module.exports = {
  createServiceRequest,
  getBookingById,
  cancelBooking,
  requestReassignment,
  increaseBookingPrice,
};
