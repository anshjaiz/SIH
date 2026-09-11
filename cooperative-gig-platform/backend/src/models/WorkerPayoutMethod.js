const mongoose = require('mongoose');

// WorkerPayoutMethod — worker's registered payout destination (Bank/UPI).
// Full account numbers are never returned to the UI — only masked.
const payoutMethodSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['BANK', 'UPI'],
      required: true,
    },
    accountHolderName: {
      type: String,
      default: '',
    },
    accountNumber: {
      type: String,
      default: '',
      select: false,
    },
    ifsc: {
      type: String,
      default: '',
    },
    upiId: {
      type: String,
      default: '',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

payoutMethodSchema.index({ worker: 1, isDefault: 1 });

// Mask the account number for any serialized output.
payoutMethodSchema.methods.mask = function mask() {
  const obj = this.toObject();
  if (obj.accountNumber) {
    const acct = String(obj.accountNumber);
    obj.accountNumber =
      'XXXX XXXX ' + acct.slice(Math.max(0, acct.length - 4));
  }
  return obj;
};

module.exports = mongoose.model(
  'WorkerPayoutMethod',
  payoutMethodSchema
);