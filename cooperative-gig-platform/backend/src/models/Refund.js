const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema(
  {
    refundNumber: {
      type: String,
      unique: true,
      index: true,
    },
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    method: {
      type: String,
      enum: ['MOCK_REFUND', 'UPI', 'CARD', 'NET_BANKING', 'WALLET'],
      default: 'MOCK_REFUND',
    },
    gateway: {
      type: String,
      default: 'mock',
    },
    transactionId: {
      type: String,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    initiatedAt: Date,
    completedAt: Date,
    failureReason: String,
  },
  {
    timestamps: true,
  }
);

refundSchema.pre('save', async function (next) {
  if (!this.refundNumber) {
    const random = Math.floor(100000 + Math.random() * 900000);
    this.refundNumber = `RFD-${random}`;
  }
  if (!this.transactionId) {
    this.transactionId = `REF-TXN-${Date.now()}-${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

module.exports = mongoose.model('Refund', refundSchema);