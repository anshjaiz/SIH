const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    complaintNumber: {
      type: String,
      unique: true,
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
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      index: true,
    },
    category: {
      type: String,
      enum: [
        'SERVICE_QUALITY',
        'PRICING',
        'BEHAVIOUR',
        'LATE_ARRIVAL',
        'WORK_NOT_COMPLETED',
        'WORKER_MISCONDUCT',
        'PAYMENT_ISSUE',
        'OTHER',
      ],
      default: 'OTHER',
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
      default: 'OPEN',
      index: true,
    },
    resolution: {
      type: String,
      default: '',
    },
    actionTaken: {
      type: String,
      default: '',
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
    },
  },
  {
    timestamps: true,
  }
);

complaintSchema.index({ status: 1, priority: 1 });
complaintSchema.index({ customer: 1 });

// Auto-generate complaint number
complaintSchema.pre('save', async function (next) {
  if (!this.complaintNumber) {
    const random = Math.floor(100000 + Math.random() * 900000);
    this.complaintNumber = `CMP-${random}`;
  }
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);
