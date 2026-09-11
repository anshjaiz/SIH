const mongoose = require('mongoose');

// Payout — a worker withdrawal request. For the SIH demo the money is NOT
// transferred for real: admin reviews it through PENDING → PROCESSING →
// COMPLETED/FAILED. A real payout provider can later consume the same record.
const payoutSchema = new mongoose.Schema(
  {
    payoutNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    payoutMethodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkerPayoutMethod',
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    transactionReference: {
      type: String,
      default: '',
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: Date,
    failureReason: {
      type: String,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

payoutSchema.index({ worker: 1, status: 1 });
payoutSchema.index({ status: 1, requestedAt: 1 });

payoutSchema.pre('save', async function (next) {
  if (!this.payoutNumber) {
    const date = new Date();
    const ymd =
      date.getFullYear().toString().slice(-2) +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');
    const rand = Math.floor(10000 + Math.random() * 90000);
    this.payoutNumber = `PO-${ymd}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('Payout', payoutSchema);