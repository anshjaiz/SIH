const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Break down payments for transparency
    labourAmount: {
      type: Number,
      default: 0,
    },
    materialsAmount: {
      type: Number,
      default: 0,
    },
    cooperativeContribution: {
      type: Number,
      default: 0,
    },
    platformFee: {
      type: Number,
      default: 0,
    },
    method: {
      type: String,
      enum: ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'WALLET', 'MOCK_REDIRECT'],
      default: 'MOCK_REDIRECT',
    },
    gateway: {
      type: String,
      default: 'mock', // 'mock' | 'razorpay' | 'other'
    },
    transactionId: {
      type: String,
      unique: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    paymentDate: Date,
    refundedAt: Date,
    // Shared earnings breakdown with worker
    workerGross: {
      type: Number,
      default: 0,
    },
    cooperativeDeduction: {
      type: Number,
      default: 0,
    },
    workerNetEarnings: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
