const mongoose = require('mongoose');

// Singleton document holding tunable reliability/no-show settings.
// Seeded by scripts/migrate_reliability.js; falls back to env/config defaults
// in reliabilityConfig.js when the document is absent.
const reliabilitySettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default',
      unique: true,
    },
    // Score thresholds => level buckets
    thresholds: {
      good: { type: Number, default: 80 },
      warning: { type: Number, default: 60 },
      lowReliability: { type: Number, default: 40 },
      temporarySuspend: { type: Number, default: 20 },
      deactivationReview: { type: Number, default: 0 },
    },
    points: {
      initialScore: { type: Number, default: 100 },
      completeJob: { type: Number, default: 2 },
      onTime: { type: Number, default: 1 },
      goodRating: { type: Number, default: 1 },
      collaboration: { type: Number, default: 1 },
      noShow: { type: Number, default: -10 },
      lateArrival: { type: Number, default: -3 },
      cancelAfterAccept: { type: Number, default: -5 },
      repeatedNoShowExtra: { type: Number, default: -5 },
    },
    // Scheduling / enforcement
    noShowGraceMinutes: { type: Number, default: 15 },
    jobExpiryGraceMinutes: { type: Number, default: 120 },
    lateToleranceMinutes: { type: Number, default: 30 },
    reassignmentGraceMinutes: { type: Number, default: 30 },
    reminderLeadMinutes: { type: Number, default: 60 },
    maxReassignmentAttempts: { type: Number, default: 2 },
    schedulerIntervalSeconds: { type: Number, default: 60 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  'ReliabilitySettings',
  reliabilitySettingsSchema
);