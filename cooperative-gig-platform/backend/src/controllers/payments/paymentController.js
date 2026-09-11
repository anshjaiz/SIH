/**
 * paymentController.js
 *
 * Razorpay-first payment flow (with graceful MOCK fallback when test keys
 * are absent, so the SIH demo always works).
 *
 * Security model:
 *   - Amount is ALWAYS recomputed on the backend from booking.priceBreakdown
 *     at order-creation time. Client amounts are ignored.
 *   - The customer can only pay for a booking they own.
 *   - Verification requires the HMAC-SHA256 signature (Razorpay) on the
 *     backend; a booking is PAID only after that check passes.
 *   - Replayed/duplicate verification cannot double-credit anyone (the
 *     wallet ledger is unique per payment).
 */

const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const Worker = require('../../models/WorkerProfile');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const paymentService = require('../../services/payment/paymentService');

// Translate every gateway/ledger error into a friendly, frontend-safe message.
const friendly = (err, fallback = 'Payment could not be completed. Please try again.') => {
  const e = new ApiError(err.userMessage || fallback, err instanceof ApiError ? err.statusCode : 400);
  return e;
};

const PAYABLE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'];

// POST /api/payments/create-order
const createOrder = asyncHandler(async (req, res) => {
  const { bookingId, method } = req.body;
  if (!bookingId) throw new ApiError('Booking is required', 400);

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError('Booking not found or you do not have permission to pay for it.', 404);
  if (booking.customer.toString() !== req.user._id.toString()) {
    throw new ApiError('Booking not found or you do not have permission to pay for it.', 403);
  }

  // Already paid → never create a second order.
  if (booking.paymentStatus === 'PAID' || booking.paymentStatus === 'REFUNDED') {
    const existingPayment = booking.payment ? await Payment.findById(booking.payment) : null;
    throw new ApiError(
      booking.paymentStatus === 'PAID'
        ? 'This booking has already been paid.'
        : 'This booking has been refunded.',
      400
    );
  }

  // Not payable in this lifecycle state (cancelled/expired/no-show/disputed).
  if (!PAYABLE_STATUSES.includes(booking.status)) {
    throw new ApiError(`Payment is not possible while the booking is ${booking.status}.`, 400);
  }

  // If an order already exists but was never verified, reuse it instead of
  // spawning a duplicate payment record.
  if (booking.payment) {
    const existing = await Payment.findById(booking.payment);
    if (existing && ['CREATED', 'PENDING'].includes(existing.status)) {
      return res.json({
        success: true,
        message: 'Payment order already created',
        data: {
          gateway: existing.gateway,
          key: existing.gateway === 'razorpay' ? process.env.RAZORPAY_KEY_ID || '' : '',
          order: { id: existing.razorpayOrderId || `mock_${existing._id}`, amount: existing.amount, currency: 'INR' },
          paymentId: existing._id,
          amount: existing.amount,
          breakDown: {
            labour: existing.labourAmount,
            materials: existing.materialsAmount,
            platformFee: existing.platformFee,
          },
        },
      });
    }
  }

  let result;
  try {
    result = await paymentService.createOrder({
      booking,
      customer: booking.customer,
      worker: booking.worker,
      method,
    });
  } catch (err) {
    throw friendly(err);
  }

  res.status(201).json({
    success: true,
    message: 'Payment order created',
    data: {
      gateway: result.gateway,
      key: result.keyId,
      order: result.order,
      paymentId: result.payment._id,
      amount: result.payment.amount,
      breakDown: {
        labour: result.payment.labourAmount,
        materials: result.payment.materialsAmount,
        platformFee: result.payment.platformFee,
        cooperativeContribution: result.payment.cooperativeContribution,
      },
    },
  });
});

// POST /api/payments/verify
const verify = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id) {
    throw new ApiError('Payment verification failed. Your booking has not been marked as paid.', 400);
  }

  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
  if (!payment) {
    throw new ApiError('Payment verification failed. Your booking has not been marked as paid.', 400);
  }

  // Ownership: the verified user must be the customer who owns the booking.
  const booking = await Booking.findById(payment.booking);
  if (!booking || booking.customer.toString() !== req.user._id.toString()) {
    throw new ApiError('Booking not found or you do not have permission to pay for it.', 403);
  }

  let verified;
  try {
    verified = await paymentService.verifyOrder({
      payment,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
  } catch (err) {
    if (err.code === 'DUPLICATE') throw new ApiError(err.userMessage, 400);
    throw friendly(err, 'Payment verification failed. Your booking has not been marked as paid.');
  }

  res.json({
    success: true,
    message: 'Payment successful',
    data: {
      payment: verified,
      status: 'PAID',
      paymentId: verified._id,
      transactionId: verified.transactionId || verified.razorpayPaymentId,
      amount: verified.amount,
      method: verified.method,
    },
  });
});

// GET /api/payments/booking/:bookingId
const getByBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const booking = await Booking.findById(bookingId).populate('payment');
  if (!booking) throw new ApiError('Booking not found', 404);

  const isOwner = booking.customer && booking.customer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  let isWorker = false;
  if (booking.worker) {
    const wp = await Worker.findById(booking.worker);
    if (wp && wp.user && String(wp.user) === String(req.user._id)) isWorker = true;
  }
  if (!isOwner && !isAdmin && !isWorker) {
    throw new ApiError('Not authorized', 403);
  }

  res.json({ success: true, data: booking.payment || null });
});

// GET /api/payments/customer/history
const getCustomerHistory = asyncHandler(async (req, res) => {
  if (req.user.role !== 'customer' && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }
  const payments = await Payment.find({ customer: req.user._id })
    .populate('booking', 'bookingNumber serviceSnapshot requestedDate status')
    .populate('worker', 'user rating')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({
    success: true,
    data: payments,
    meta: { count: payments.length },
  });
});

module.exports = { createOrder, verify, getByBooking, getCustomerHistory };