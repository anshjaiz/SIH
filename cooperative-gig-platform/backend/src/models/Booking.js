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
    // Required skills snapshot (strict skillId-based eligibility of workers)
    requiredSkillIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Skill',
      default: [],
    },
    requiredSkillNames: {
      type: [String],
      default: [],
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
    // Derived/structured schedule window used by the reliability scheduler.
    // Start/End are absolute instants derived from requestedDate + timeSlot
    // (or explicit customer-start/end times) at booking creation.
    scheduledDate: {
      type: Date,
      index: true,
    },
    scheduledStartTime: {
      type: Date,
      index: true,
    },
    scheduledEndTime: {
      type: Date,
      index: true,
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
        'WORKER_ARRIVED',
        'STARTED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'DISPUTED',
        'WORKER_NO_SHOW',
        'EXPIRED',
        'REASSIGNED',
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
    // Customer "Job Boost" price increases. The customer-facing labour price
    // starts at the service base price and may only go UP, and only while the
    // request is still open for offers (MATCHING / REASSIGNED). Every increase
    // is customer-approved, recorded in priceIncreaseHistory, recomputes
    // priceBreakdown (same booking, never a duplicate job), and re-offers the
    // request to eligible nearby workers. The price is locked as soon as a
    // worker accepts.
    initialPrice: {
      type: Number,
      default: 0,
    },
    currentPrice: {
      type: Number,
      default: 0,
    },
    priceIncreaseCount: {
      type: Number,
      default: 0,
    },
    lastPriceIncreaseAt: Date,
    priceIncreaseHistory: [
      {
        from: { type: Number, required: true },
        to: { type: Number, required: true },
        increaseAmount: { type: Number, required: true },
        byUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Low-acceptance detection bookkeeping. rejectionsCount counts workers who
    // rejected the CURRENT offer round (reset on each price increase). The
    // flag gates the customer-facing "No worker accepted yet — increase the
    // price?" card; notifiedAt prevents duplicate push notifications.
    rejectionsCount: {
      type: Number,
      default: 0,
    },
    lastRejectionAt: Date,
    lowAcceptanceFlaggedAt: Date,
    lowAcceptanceNotifiedAt: Date,
    // Material-cost approval flow: the worker requests and the customer
    // explicitly approves/rejects before it counts toward the payable total.
    // Only APPROVED requests are summed into priceBreakdown.materials/total.
    materialRequests: [
      {
        description: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true, default: '' },
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected'],
          default: 'pending',
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
        requestedAt: { type: Date, default: Date.now },
        approvedAt: Date,
        rejectedAt: Date,
        respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    // Payment gate — kept SEPARATE from the job/booking lifecycle status.
    // UNPAID → PENDING (order created) → PAID (verified) → REFUNDED.
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'UNPAID',
      index: true,
    },
    paidAt: Date,
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
    // Reliability / no-show lifecycle
    acceptedAt: Date,
    workerCheckInAt: Date,
    noShowDetectedAt: Date,
    expiredAt: Date,
    reassignmentAttempts: {
      type: Number,
      default: 0,
    },
    reassignedAt: Date,
    remindersSent: {
      type: [Date],
      default: [],
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
bookingSchema.index({ status: 1, scheduledStartTime: 1 });
bookingSchema.index({ status: 1, scheduledEndTime: 1 });
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
