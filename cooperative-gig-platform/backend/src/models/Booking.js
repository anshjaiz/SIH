const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      unique: true,
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
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    // For flexibility, store service snapshot
    serviceSnapshot: {
      name: String,
      category: String,
      basePrice: Number,
      unit: String,
    },
    description: {
      type: String,
      default: '',
    },
    problemImages: {
      type: [String], // file paths
      default: [],
    },
    beforeImages: {
      type: [String],
      default: [],
    },
    afterImages: {
      type: [String],
      default: [],
    },
    // Location details
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    address: {
      type: String,
      default: '',
    },
    area: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: '',
    },
    // Scheduling
    requestedDate: {
      type: Date,
      required: true,
      index: true,
    },
    timeSlot: {
      type: String,
      default: 'Flexible',
    },
    isEmergency: {
      type: Boolean,
      default: false,
    },
    emergencyType: {
      type: String,
      default: '',
    },
    // Price and payment
    status: {
      type: String,
      enum: [
        'REQUESTED',
        'MATCHING',
        'ASSIGNED',
        'ACCEPTED',
        'ON_THE_WAY',
        'STARTED',
        'COMPLETED',
        'CANCELLED',
        'DISPUTED',
      ],
      default: 'REQUESTED',
      index: true,
    },
    priceBreakdown: {
      labour: { type: Number, default: 0 },
      materials: { type: Number, default: 0 },
      cooperativeContribution: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    // Matching info
    matchedScore: {
      type: Number,
      default: 0,
    },
    matchReasons: {
      type: [String],
      default: [],
    },
    candidateWorkers: [
      {
        worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
        score: Number,
        reasons: [String],
      },
    ],
    // Timeline for lifecycle tracking
    statusHistory: [
      {
        status: String,
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        note: String,
      },
    ],
    // Worker tracking
    workerLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number],
      lastUpdatedAt: Date,
    },
    // Confirmation
    customerConfirmed: {
      type: Boolean,
      default: false,
    },
    completedAt: Date,
    cancelledBy: {
      type: String, // 'customer' | 'worker' | 'admin' | 'system'
      default: '',
    },
    cancellationReason: {
      type: String,
      default: '',
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for queries
bookingSchema.index({ location: '2dsphere' });
bookingSchema.index({ status: 1, requestedDate: 1 });
bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ worker: 1, status: 1 });
bookingSchema.index({ isEmergency: 1, status: 1 });
bookingSchema.index({ createdAt: -1 });

// Auto-generate booking number before saving
bookingSchema.pre('save', async function (next) {
  if (!this.bookingNumber) {
    const date = new Date();
    const dateStr =
      date.getFullYear().toString().slice(-2) +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    this.bookingNumber = `BK-${dateStr}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
