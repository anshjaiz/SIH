const mongoose = require('mongoose');

const collaborationRequestSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    leadWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: [
        'Helper',
        'Plumber',
        'Electrician',
        'Mason',
        'Carpenter',
        'Painter',
        'Technician',
        'Driver',
        'Photographer',
        'Other',
      ],
      default: 'Helper',
    },
    requiredSkills: {
      type: [String],
      default: [],
    },
    requiredSkillIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Skill',
      default: [],
    },
    numberOfCollaborators: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      default: '09:00',
    },
    durationHours: {
      type: Number,
      default: 4,
      min: 0.5,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [78.4867, 17.385],
      },
    },
    address: {
      type: String,
      default: '',
    },
    city: {
      type: String,
      default: 'Hyderabad',
    },
    estimatedPayment: {
      type: Number,
      default: 0,
    },
    instructions: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['OPEN', 'FILLED', 'CANCELLED', 'EXPIRED'],
      default: 'OPEN',
    },
    // Candidate collaborators with transparent match scoring.
    candidates: [
      {
        worker: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Worker',
        },
        score: Number,
        reasons: [String],
        status: {
          type: String,
          enum: ['PENDING', 'ACCEPTED', 'DECLINED'],
          default: 'PENDING',
        },
        respondedAt: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

collaborationRequestSchema.index({ booking: 1, status: 1 });
collaborationRequestSchema.index({ leadWorker: 1, status: 1 });

module.exports = mongoose.model('CollaborationRequest', collaborationRequestSchema);