const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
    },
    // Who is reviewing whom
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // could be worker or customer
      required: true,
    },
    reviewType: {
      type: String,
      enum: ['CUSTOMER_TO_WORKER', 'WORKER_TO_CUSTOMER'],
      required: true,
    },
    // Customer-to-Worker ratings
    overallQuality: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    punctuality: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    behaviour: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    pricing: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    // Worker-to-Customer ratings
    customerBehaviour: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    customerAccessibility: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    customerPaymentReliability: {
      type: Number,
      default: 0,
      validate: {
        validator: (v) => v === 0 || (v >= 1 && v <= 5),
        message: 'Rating must be between 1 and 5',
      },
    },
    comment: {
      type: String,
      maxlength: 500,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

reviewSchema.index({ reviewee: 1 });
reviewSchema.index({ booking: 1 });

module.exports = mongoose.model('Review', reviewSchema);
