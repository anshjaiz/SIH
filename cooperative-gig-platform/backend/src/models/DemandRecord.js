const mongoose = require('mongoose');

// Store daily demand per service per area for analytics & forecasting
const demandRecordSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      index: true,
    },
    serviceName: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      index: true,
    },
    // Geographic zone (city/area)
    zone: {
      type: String,
      index: true,
    },
    area: {
      type: String,
      default: '',
    },
    // Approximate location for heatmap
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number],
    },
    requestCount: {
      type: Number,
      default: 0,
    },
    completedCount: {
      type: Number,
      default: 0,
    },
    emergencyCount: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
    // From aggregating bookings
  },
  {
    timestamps: true,
  }
);

demandRecordSchema.index({ date: 1, zone: 1, category: 1 });
demandRecordSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('DemandRecord', demandRecordSchema);
