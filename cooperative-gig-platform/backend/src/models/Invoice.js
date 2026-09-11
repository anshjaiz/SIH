const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
    },
    service: {
      type: String,
      default: '',
    },
    serviceDate: Date,
    issuedDate: {
      type: Date,
      default: Date.now,
    },
    // Line items
    labourCost: {
      type: Number,
      default: 0,
    },
    materials: {
      type: Number,
      default: 0,
    },
    cooperativeContribution: {
      type: Number,
      default: 0,
    },
    fees: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'REFUNDED'],
      default: 'PENDING',
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    items: [
      {
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

invoiceSchema.index({ customer: 1 });

// Hook MUST be registered before the model is compiled, or the field stays
// null on save (which breaks the unique index).
invoiceSchema.pre('save', function (next) {
  if (!this.invoiceNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const random = Math.floor(10000 + Math.random() * 90000);
    this.invoiceNumber = `INV-${year}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);