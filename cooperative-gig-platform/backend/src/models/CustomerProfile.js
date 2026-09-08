const mongoose = require('mongoose');

const customerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // Primary/default location
    address: {
      type: String,
      default: '',
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
    city: {
      type: String,
      default: '',
    },
    defaultContact: {
      type: String,
      default: '',
    },
    savedAddresses: [
      {
        label: String,
        address: String,
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: [Number],
        },
      },
    ],
    bookingsCount: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    preferredLanguages: {
      type: [String],
      default: ['English', 'Hindi'],
    },
  },
  {
    timestamps: true,
  }
);

customerProfileSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Customer', customerProfileSchema);
