const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    issuingAuthority: {
      type: String,
      default: '',
    },
    issueDate: {
      type: Date,
    },
    expiryDate: {
      type: Date,
    },
    fileUrl: {
      type: String,
      default: '', // path/URL to uploaded certificate image
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'RE_UPLOAD_REQUESTED'],
      default: 'PENDING',
    },
    adminRemark: {
      type: String,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Certificate', certificateSchema);
