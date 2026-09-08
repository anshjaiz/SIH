const mongoose = require('mongoose');

const welfareSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    // Insurance
    insurance: {
      type: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'PENDING', 'EXPIRED'],
        default: 'INACTIVE',
      },
      provider: String,
      policyNumber: String,
      premiumAmount: Number,
      coverageAmount: Number,
      validUntil: Date,
    },
    // Welfare schemes
    schemesEnrolled: [
      {
        name: String,
        category: {
          type: String,
          enum: [
            'GOVERNMENT',
            'COOPERATIVE',
            'HEALTH',
            'PENSION',
            'EDUCATION',
            'OTHER',
          ],
          default: 'COOPERATIVE',
        },
        description: String,
        status: {
          type: String,
          enum: ['ENROLLED', 'ELIGIBLE', 'NOT_ELIGIBLE', 'EXPIRED'],
          default: 'ENROLLED',
        },
        benefits: String,
        startedAt: Date,
      },
    ],
    // Funds and benefits
    cooperativeFundBalance: {
      type: Number,
      default: 0,
    },
    pensionFundBalance: {
      type: Number,
      default: 0,
    },
    // Training / certification opportunities
    recommendedTrainings: [
      {
        training: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Training',
        },
        reason: String,
        priority: Number,
      },
    ],
    // Emergency assistance
    emergencyAssistanceAvailable: {
      type: Boolean,
      default: false,
    },
    emergencyFund: {
      type: Number,
      default: 0,
    },
    lastMedicalCheckup: Date,
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

welfareSchema.index({ worker: 1 }, { unique: true });

module.exports = mongoose.model('Welfare', welfareSchema);
