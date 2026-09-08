/**
 * Payment Abstraction Layer
 *
 * For SIH prototype, uses a MOCK payment system.
 * Designed so Razorpay/other gateways can be plugged in later
 * via the same interface.
 *
 * Gateway implementations:
 *  - mock: instant success (can simulate failure)
 *  - razorpay: (future) - implement processPayment
 */

const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const Invoice = require('../../models/Invoice');
const { generateRef } = require('../../utils/authHelper');
const { asyncHandler } = require('../../middleware/errorMiddleware');
const { createNotification } = require('../notification/notificationService');

// ============ Gateway-agnostic interface ============

/**
 * Create a payment record
 * @param {Object} paymentData
 */
const createPayment = async (paymentData) => {
  const transactionId = `TXN-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const payment = await Payment.create({
    ...paymentData,
    transactionId,
    status: 'PENDING',
  });
  return payment;
};

/**
 * Process a payment through the configured gateway
 * @param {Object} payment - payment record
 * @param {Object} opts - { amount, method }
 */
const processPayment = async (payment, opts = {}) => {
  const gateway = payment.gateway || 'mock';
  const amount = opts.amount || payment.amount;

  try {
    switch (gateway) {
      case 'razorpay':
        // Placeholder for Razorpay integration
        // await razorpay.orders.create({ amount: amount * 100, ... });
        return await processMockPayment(payment, amount, opts);
      case 'mock':
      default:
        return await processMockPayment(payment, amount, opts);
    }
  } catch (err) {
    payment.status = 'FAILED';
    payment.notes = err.message;
    await payment.save();
    throw err;
  }
};

/**
 * Mock payment processing
 * Can simulate a failure if opts.shouldFail is true or method is 'CASH' handled differently
 */
const processMockPayment = async (payment, amount, opts = {}) => {
  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  const shouldFail = opts.shouldFail === true || (opts.failureRate && Math.random() < opts.failureRate);

  if (shouldFail) {
    payment.status = 'FAILED';
    payment.notes = 'Mock payment failed (simulated)';
    await payment.save();
    return { status: 'FAILED', transactionId: payment.transactionId };
  }

  payment.status = 'SUCCESS';
  payment.paymentDate = new Date();
  await payment.save();

  return {
    status: 'SUCCESS',
    transactionId: payment.transactionId,
    paymentId: payment._id,
    amount: payment.amount,
  };
};

/**
 * Process refund (for cancelled/disputed bookings)
 */
const processRefund = async (paymentId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new Error('Payment not found');

  payment.status = 'REFUNDED';
  await payment.save();

  return { status: 'REFUNDED', transactionId: payment.transactionId };
};

/**
 * Initiate a (simulated) refund against a payment.
 *
 * Hackathon MVP: refund is simulated locally but every state and record
 * mirrors a real gateway flow (Refund doc + gateway/transactionId), so a
 * live gateway (e.g. Razorpay) can be swapped in later behind this method.
 *
 * @param {String} paymentId
 * @param {Object} opts { amount, complaintId, initiatedBy, method }
 */
const initiateRefund = async (paymentId, opts = {}) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new Error('Payment not found');

  const refundAmount = Math.min(opts.amount ?? payment.amount, payment.amount);
  if (refundAmount <= 0) throw new Error('Refund amount must be greater than 0');
  if (payment.status !== 'SUCCESS') {
    throw new Error(`Cannot refund payment in ${payment.status} state`);
  }

  const existing = await Refund.findOne({ payment: payment._id, status: { $in: ['PROCESSING', 'PENDING'] } });
  if (existing) return existing;

  const refund = await Refund.create({
    complaint: opts.complaintId,
    booking: payment.booking,
    payment: payment._id,
    customer: payment.customer,
    amount: refundAmount,
    status: 'PROCESSING',
    method: opts.method || 'MOCK_REFUND',
    initiatedBy: opts.initiatedBy,
    initiatedAt: new Date(),
  });

  // mark the payment + invoice so no double charge can occur
  payment.status = 'REFUNDED';
  payment.notes = `Refund ${refundAmount} initiated (${refund.refundNumber})`;
  payment.refundedAt = new Date();
  await payment.save();
  await Invoice.updateOne({ booking: payment.booking }, { $set: { paymentStatus: 'REFUNDED' } });

  // Simulated gateway callback — complete the refund shortly after,
  // the same way a payment-webhook would confirm a real transfer.
  setTimeout(() => {
    completeRefund(refund._id).catch(() => {});
  }, 3000);

  return refund;
};

/**
 * Complete a simulated refund (called by the mock gateway callback).
 */
const completeRefund = async (refundId) => {
  const refund = await Refund.findById(refundId).populate('payment').populate('customer', 'name email');
  if (!refund || refund.status === 'COMPLETED') return refund;
  refund.status = 'COMPLETED';
  refund.completedAt = new Date();
  refund.gateway = 'mock';
  await refund.save();

  // Push a live notification to the customer
  await createNotification({
    user: refund.customer?._id,
    type: 'REFUND_STATUS',
    title: 'Refund completed',
    message: `Refund of ₹${refund.amount} for ${refund.refundNumber} has been credited to your original payment method.`,
    data: { refundId: refund._id, refundNumber: refund.refundNumber, complaintId: refund.complaint?.toString() },
  });
  return refund;
};

/**
 * Abort a simulated refund (sets FAILED so admin can retry/investigate).
 */
const failRefund = async (refundId, reason) => {
  const refund = await Refund.findById(refundId);
  if (!refund) throw new Error('Refund not found');
  refund.status = 'FAILED';
  refund.failureReason = reason || 'Gateway error (simulated)';
  await refund.save();
  return refund;
};

/**
 * Verify a payment by transaction ID
 */
const verifyPayment = async (transactionId) => {
  const payment = await Payment.findOne({ transactionId });
  if (!payment) throw new Error('Payment not found');
  return payment;
};

/**
 * Get payment status for a booking
 */
const getPaymentStatus = async (bookingId) => {
  const payment = await Payment.findOne({ booking: bookingId });
  return payment ? payment.status : 'NOT_FOUND';
};

module.exports = {
  createPayment,
  processPayment,
  processRefund,
  initiateRefund,
  completeRefund,
  failRefund,
  verifyPayment,
  getPaymentStatus,
};
