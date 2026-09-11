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
        'ACCOUNT_TERMINATED',
        'ACCOUNT_UNSUSPENDED',
        'RELIABILITY_UPDATE',
        'WORKER_NO_SHOW',
        'WORKER_EXPIRED',
        'REMINDER_UPCOMING_JOB',
        'REASSIGNED',
        'RELIABILITY_WARNING',
        'RELIABILITY_SUSPENDED',
        'APPEAL_STATUS',
        'DEMAND_SPIKE',
        'CUSTOM_REQUEST',
        'CHAT_MESSAGE',
        'MATERIAL_REQUEST_CREATED',
        'MATERIAL_REQUEST_APPROVED',
        'MATERIAL_REQUEST_REJECTED',
        'PAYMENT_FAILED',
        'PAYMENT_MARKED_PAID',
        'EARNING_RELEASED',
        'EARNING_REVERSED',
        'WITHDRAWAL_REQUESTED',
        'WITHDRAWAL_UPDATED',
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
