const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: '',
    },
    skill: {
      type: String,
      default: '',
    },
    duration: {
      type: String, // e.g. "2 weeks", "10 hours"
      default: '',
    },
    mode: {
      type: String,
      enum: ['ONLINE', 'OFFLINE', 'HYBRID'],
      default: 'ONLINE',
    },
    instructor: {
      type: String,
      default: '',
    },
    cost: {
      type: Number,
      default: 0, // 0 = free
    },
    currency: {
      type: String,
      default: 'INR',
    },
    startDate: Date,
    maxSeats: {
      type: Number,
      default: 100,
    },
    enrolledCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    image: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Enrollment tracking
const trainingEnrollmentSchema = new mongoose.Schema(
  {
    training: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Training',
      required: true,
      index: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CERTIFIED', 'DROPPED'],
      default: 'ENROLLED',
    },
    progressPercent: {
      type: Number,
      default: 0,
    },
    certificateIssued: {
      type: Boolean,
      default: false,
    },
    certificateFile: {
      type: String,
      default: '',
    },
    completedAt: Date,
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

trainingEnrollmentSchema.index({ training: 1, worker: 1 }, { unique: true });

module.exports = {
  Training: mongoose.model('Training', trainingSchema),
  TrainingEnrollment: mongoose.model('TrainingEnrollment', trainingEnrollmentSchema),
};
