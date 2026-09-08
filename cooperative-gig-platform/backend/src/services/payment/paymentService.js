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
const { generateRef } = require('../../utils/authHelper');
const { asyncHandler } = require('../../middleware/errorMiddleware');

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
  verifyPayment,
  getPaymentStatus,
};
