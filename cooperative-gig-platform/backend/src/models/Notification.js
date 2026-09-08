const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'BOOKING_CREATED',
        'WORKER_ASSIGNED',
        'WORKER_ACCEPTED',
        'WORKER_ARRIVING',
        'JOB_COMPLETED',
        'PAYMENT_SUCCESS',
        'NEW_JOB',
        'PAYMENT_RECEIVED',
        'TRAINING_AVAILABLE',
        'WELFARE_UPDATE',
        'NEW_WORKER',
        'CERTIFICATE_AWAITING',
        'EMERGENCY_REQUEST',
        'NEW_COMPLAINT',
        'COMPLAINT_CREATED',
        'COMPLAINT_RESPONSE',
        'COMPLAINT_UPDATE',
        'COMPLAINT_RESPONSE_REQUESTED',
        'RESOLUTION_PROPOSED',
        'REFUND_STATUS',
        'COMPLAINT_RESOLVED',
        'COMPLAINT_ESCALATED',
        'ACCOUNT_SUSPENDED',
        'DEMAND_SPIKE',
        'CUSTOM_REQUEST',
        'SYSTEM',
      ],
      default: 'SYSTEM',
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
