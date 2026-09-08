const mongoose = require('mongoose');

const workerAvailabilitySchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    // General availability
    dayOfWeek: {
      type: Number, // 0 = Sunday ... 6 = Saturday
      index: true,
    },
    startTime: String,
    endTime: String,
    // Full-time / part-time
    availabilityType: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'WEEKENDS_ONLY', 'UNSPECIFIED'],
      default: 'UNSPECIFIED',
    },
    // Date-specific availability
    date: {
      type: Date,
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

workerAvailabilitySchema.index({ worker: 1, date: 1 });

module.exports = mongoose.model('WorkerAvailability', workerAvailabilitySchema);
