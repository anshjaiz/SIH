const mongoose = require('mongoose');

const forecastSchema = new mongoose.Schema(
  {
    forecastDate: {
      type: Date,
      required: true,
      index: true,
    },
    // Forecast by service
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
      default: '',
    },
    type: {
      type: String,
      enum: ['SERVICE', 'LOCATION', 'TIME', 'SERVICE_LOCATION'],
      default: 'SERVICE',
    },
    zone: {
      type: String,
      default: '',
    },
    expectedRequests: {
      type: Number,
      default: 0,
    },
    confidence: {
      type: Number, // 0-100
      default: 0,
    },
    // Historical basis
    historicalAverage: {
      type: Number,
      default: 0,
    },
    trend: {
      type: String,
      enum: ['UP', 'DOWN', 'STABLE'],
      default: 'STABLE',
    },
    peakTime: {
      type: String,
      default: '',
    },
    // Model type: statistical/mock or real ML later
    modelType: {
      type: String,
      default: 'statistical',
      enum: ['statistical', 'ml'],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

forecastSchema.index({ forecastDate: 1, type: 1, service: 1 });
forecastSchema.index({ forecastDate: 1, zone: 1 });

module.exports = mongoose.model('Forecast', forecastSchema);
