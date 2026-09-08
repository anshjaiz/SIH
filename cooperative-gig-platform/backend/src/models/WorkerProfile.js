const mongoose = require('mongoose');

const workerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    bio: {
      type: String,
      maxlength: 500,
      default: '',
    },
    // Location structure: { type: 'Point', coordinates: [lng, lat] }
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: [78.4867, 17.385], // Default Hyderabad
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
    skills: [
      {
        skill: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Skill',
        },
        name: String, // denormalized for quick display
        yearsOfExperience: {
          type: Number,
          default: 0,
        },
      },
    ],
    experienceYears: {
      type: Number,
      default: 0,
    },
    languages: {
      type: [String],
      default: [],
    },
    serviceAreaRadiusKm: {
      type: Number,
      default: 15,
    },
    // Service area as a polygon/points
    serviceAreas: {
      type: [String],
      default: [],
    },
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'],
      default: 'PENDING',
    },
    verificationRemark: {
      type: String,
      default: '',
    },
    certificates: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Certificate',
      },
    ],
    // Rating/statistics (denormalized for performance)
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    completedJobs: {
      type: Number,
      default: 0,
    },
    totalEarnings: {
      type: Number,
      default: 0,
    },
    // Collaborator network / team collaboration profile
    collaborationsCount: {
      type: Number,
      default: 0,
    },
    collaborationRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    punctuality: {
      type: Number,
      default: 0, // percent 0-100
      max: 100,
    },
    reliability: {
      type: Number,
      default: 0, // percent 0-100
      max: 100,
    },
    // Welfare status
    insuranceActive: {
      type: Boolean,
      default: false,
    },
    welfareEnrolled: {
      type: Boolean,
      default: false,
    },
    emergencyContact: {
      type: String,
      default: '',
    },
    // ID verification fields
    aadhaarVerified: {
      type: Boolean,
      default: false,
    },
    documents: [
      {
        type: String, // file paths
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    joinedDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial index for nearby worker queries
workerProfileSchema.index({ location: '2dsphere' });
workerProfileSchema.index({ 'skills.skill': 1 });
workerProfileSchema.index({ verificationStatus: 1 });
workerProfileSchema.index({ city: 1 });

module.exports = mongoose.model('Worker', workerProfileSchema);
