const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Plumbing',
        'Electrical',
        'Carpentry',
        'Painting',
        'Cleaning',
        'Gardening',
        'Driving',
        'Appliance Repair',
        'Domestic Help',
        'Caregiving',
        'Other community services',
      ],
      index: true,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedDuration: {
      type: Number, // in minutes
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      default: 'per visit',
      enum: ['per visit', 'per hour', 'per month', 'per day'],
    },
    requiredSkills: {
      type: [String],
      default: [],
    },
    emergencyAvailable: {
      type: Boolean,
      default: false,
    },
    descriptionFromWorker: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    icon: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes
serviceSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Service', serviceSchema);
