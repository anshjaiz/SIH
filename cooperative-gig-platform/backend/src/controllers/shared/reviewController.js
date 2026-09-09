const Review = require('../../models/Review');
const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const User = require('../../models/User');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// Create a review
const createReview = asyncHandler(async (req, res) => {
  const { bookingId, reviewType, ...ratings } = req.body;

  if (!bookingId || !reviewType) {
    throw new ApiError('bookingId and reviewType are required', 400);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);

  // Booking must be completed
  if (booking.status !== 'COMPLETED') {
    throw new ApiError('Can only review completed bookings', 400);
  }

  // Determine reviewer/reviewee based on type
  let reviewee;
  if (reviewType === 'CUSTOMER_TO_WORKER') {
    // Only customer can review worker
    if (booking.customer.toString() !== req.user._id.toString()) {
      throw new ApiError('Only the customer can review the worker', 403);
    }
    if (!booking.worker) throw new ApiError('No worker assigned to this booking', 400);
    const workerUser = await Worker.findById(booking.worker).select('user');
    reviewee = workerUser.user;
  } else if (reviewType === 'WORKER_TO_CUSTOMER') {
    // Only worker can review customer
    const worker = await Worker.findOne({ user: req.user._id });
    if (!worker || booking.worker.toString() !== worker._id.toString()) {
      throw new ApiError('Only the assigned worker can review the customer', 403);
    }
    reviewee = booking.customer;
  } else {
    throw new ApiError('Invalid review type', 400);
  }

  // Check for existing review (prevent duplicates)
  const existing = await Review.findOne({ booking: bookingId, reviewType });
  if (existing) {
    throw new ApiError('You have already reviewed this booking', 400);
  }

  // Build review object based on type
  const reviewData = {
    booking: bookingId,
    reviewer: req.user._id,
    reviewee,
    reviewType,
    comment: req.body.comment || '',
  };

  if (reviewType === 'CUSTOMER_TO_WORKER') {
    if (!ratings.overallQuality) throw new ApiError('Overall quality rating is required', 400);
    reviewData.overallQuality = ratings.overallQuality;
    reviewData.punctuality = ratings.punctuality || 0;
    reviewData.behaviour = ratings.behaviour || 0;
    reviewData.pricing = ratings.pricing || 0;
  } else {
    reviewData.customerBehaviour = ratings.customerBehaviour || 0;
    reviewData.customerAccessibility = ratings.customerAccessibility || 0;
    reviewData.customerPaymentReliability = ratings.customerPaymentReliability || 0;
  }

  const review = await Review.create(reviewData);

  // Update worker reputation score (recalculate average)
  if (reviewType === 'CUSTOMER_TO_WORKER') {
    const worker = await Worker.findOne({ user: reviewee });
    if (worker) {
      const agg = await Review.aggregate([
        { $match: { reviewee, reviewType: 'CUSTOMER_TO_WORKER' } },
        { $group: { _id: null, avg: { $avg: '$overallQuality' }, count: { $sum: 1 } } },
      ]);
      if (agg.length) {
        worker.rating = Math.round(agg[0].avg * 10) / 10;
        worker.ratingCount = agg[0].count;
        await worker.save();
      }
    }
    // Reliability merit: a good rating adds points to the worker.
    if (Number(ratings.overallQuality) >= 4 && booking.worker) {
      require('../../services/reliability/reliabilityService')
        .handleGoodRating(booking.worker, bookingId, Number(ratings.overallQuality))
        .catch((e) => console.error('[reliability] rating bonus error:', e.message));
    }
  }

  res.status(201).json({ success: true, message: 'Review submitted', data: review });
});

// Get reviews for a worker (public)
const getWorkerReviewsPublic = asyncHandler(async (req, res) => {
  const { workerId } = req.params;
  const worker = await Worker.findById(workerId).select('user');
  if (!worker) throw new ApiError('Worker not found', 404);

  const reviews = await Review.find({
    reviewee: worker.user,
    reviewType: 'CUSTOMER_TO_WORKER',
  })
    .populate('reviewer', 'name avatar')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: reviews });
});

// Get reviews by customer
const getMyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ reviewer: req.user._id })
    .populate('booking', 'serviceSnapshot')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: reviews });
});

module.exports = {
  createReview,
  getWorkerReviewsPublic,
  getMyReviews,
};
