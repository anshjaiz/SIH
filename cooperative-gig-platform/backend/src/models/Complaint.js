const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['IMAGE', 'DOCUMENT', 'VIDEO'],
    default: 'IMAGE',
  },
  path: {
    type: String,
    required: true,
  },
  caption: {
    type: String,
    default: '',
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const responseSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['CUSTOMER', 'WORKER', 'ADMIN'],
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: '',
  },
  acceptResponsibility: {
    type: Boolean,
    default: false,
  },
  dispute: {
    type: Boolean,
    default: false,
  },
  evidence: {
    type: [evidenceSchema],
    default: [],
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
});

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
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      index: true,
    },
    category: {
      type: String,
      enum: [
        'POOR_SERVICE_QUALITY',
        'WORKER_NOT_ARRIVED',
        'WORKER_ARRIVED_LATE',
        'WRONG_SERVICE',
        'OVERCHARGING',
        'PAYMENT_ISSUE',
        'WORKER_BEHAVIOUR',
        'SAFETY_CONCERN',
        'DAMAGE_TO_PROPERTY',
        'INCOMPLETE_WORK',
        'OTHER',
        // legacy values kept for compatibility with seeded data
        'SERVICE_QUALITY',
        'PRICING',
        'BEHAVIOUR',
        'LATE_ARRIVAL',
        'WORK_NOT_COMPLETED',
        'WORKER_MISCONDUCT',
      ],
      default: 'OTHER',
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    preferredResolution: {
      type: String,
      enum: ['FULL_REFUND', 'PARTIAL_REFUND', 'REWORK', 'APOLOGY', 'NO_REFUND', 'OTHER'],
      default: 'OTHER',
    },
    evidence: {
      type: [evidenceSchema],
      default: [],
    },
    // legacy support
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: [
        'SUBMITTED',
        'UNDER_REVIEW',
        'INVESTIGATING',
        'RESOLUTION_PROPOSED',
        'RESOLVED',
        'REJECTED',
        'CANCELLED',
        'ESCALATED',
        'OPEN',
      ],
      default: 'SUBMITTED',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
      index: true,
    },
    isSafety: {
      type: Boolean,
      default: false,
    },
    responses: {
      type: [responseSchema],
      default: [],
    },
    resolutionDecision: {
      type: {
        type: String,
        enum: [
          'FULL_REFUND',
          'PARTIAL_REFUND',
          'NO_REFUND',
          'REWORK',
          'WORKER_WARNING',
          'WORKER_PENALTY',
          'CUSTOMER_COMPENSATION',
          'ESCALATION',
          'OTHER',
        ],
      },
      reason: {
        type: String,
        default: '',
      },
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      decidedAt: Date,
    },
    refund: {
      status: {
        type: String,
        enum: ['NOT_REQUIRED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'NOT_REQUIRED',
      },
      amount: {
        type: Number,
        default: 0,
      },
      refundNumber: String,
      payment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
      },
      initiatedAt: Date,
      completedAt: Date,
      failureReason: String,
    },
    escalation: {
      escalatedTo: {
        type: String,
        default: '',
      },
      escalatedAt: Date,
      reason: String,
    },
    workerAction: {
      suspensionApplied: {
        type: Boolean,
        default: false,
      },
      suspensionType: {
        type: String,
        enum: ['NONE', 'TEMPORARY', 'BLOCK_ONLY', 'PERMANENT'],
        default: 'NONE',
      },
      suspensionReason: String,
      suspensionUntil: Date,
      appliedAt: Date,
      appliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
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
    history: [
      {
        status: String,
        action: {
          type: String,
          default: '',
        },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        note: String,
        at: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

complaintSchema.index({ status: 1, priority: 1 });
complaintSchema.index({ customer: 1, createdAt: -1 });
complaintSchema.index({ worker: 1, createdAt: -1 });

// Auto-generate complaint number
complaintSchema.pre('save', async function (next) {
  if (!this.complaintNumber) {
    const random = Math.floor(100000 + Math.random() * 900000);
    this.complaintNumber = `CMP-${random}`;
  }
  next();
});

module.exports = mongoose.model('Complaint', complaintSchema);