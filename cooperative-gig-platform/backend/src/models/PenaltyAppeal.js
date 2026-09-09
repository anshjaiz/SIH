const mongoose = require('mongoose');

const penaltyAppealSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkerProfile',
      required: true,
      index: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReliabilityEvent',
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
    explanation: {
      type: String,
      default: '',
    },
    evidenceUrls: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    decisionNote: {
      type: String,
      default: '',
    },
    decidedAt: Date,
  },
  {
    timestamps: true,
  }
);

penaltyAppealSchema.index({ status: 1, createdAt: -1 });
// only one open appeal per event
penaltyAppealSchema.index(
  { event: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

module.exports = mongoose.model('PenaltyAppeal', penaltyAppealSchema);