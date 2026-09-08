const mongoose = require('mongoose');

// Single cooperative configuration document
const cooperativeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Community Services Cooperative',
    },
    // Platform fee percentage charged to customers
    platformFeePercent: {
      type: Number,
      default: 5, // %
    },
    // Cooperative contribution/savings percentage deducted from worker
    cooperativeContributionPercent: {
      type: Number,
      default: 2, // %
    },
    gstPercent: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Admin/cooperative office location
    officeLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: [Number],
    },
    address: {
      type: String,
      default: '',
    },
    contactEmail: {
      type: String,
      default: '',
    },
    contactPhone: {
      type: String,
      default: '',
    },
    emergencyHelpline: {
      type: String,
      default: '',
    },
    // WhatsApp / support
    supportWhatsApp: {
      type: String,
      default: '',
    },
    // Fair allocation weights (configurable)
    allocationWeights: {
      skill: { type: Number, default: 30 },
      distance: { type: Number, default: 20 },
      availability: { type: Number, default: 15 },
      rating: { type: Number, default: 15 },
      experience: { type: Number, default: 10 },
      workload: { type: Number, default: 10 },
    },
    safetyPolicies: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Cooperative', cooperativeSchema);
