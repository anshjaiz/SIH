/**
 * complaintService.js
 *
 * Customer Complaint & Dispute Management — core business logic.
 *
 * Handles: complaint creation (with safety auto-priority), evidence,
 * worker/customer/admin responses, status workflow, admin investigation
 * bundle, resolution decisions, simulated refunds, escalation and
 * worker suspensions. Every event emits DB + Socket.IO notifications.
 */

const Complaint = require('../../models/Complaint');
const Booking = require('../../models/Booking');
const Payment = require('../../models/Payment');
const Invoice = require('../../models/Invoice');
const Review = require('../../models/Review');
const User = require('../../models/User');
const Worker = require('../../models/WorkerProfile');
const paymentService = require('../payment/paymentService');
const { createNotification, notifyUsers } = require('../notification/notificationService');

const { ApiError } = require('../../middleware/errorMiddleware');

const ACTIVE_BOOKING_STATUSES = ['REQUESTED', 'MATCHING', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'];

// Categories that automatically elevate priority and are flagged as safety-related
const SAFETY_CATEGORIES = new Map([
  ['SAFETY_CONCERN', 'URGENT'],
  ['WORKER_MISCONDUCT', 'URGENT'],
  ['DAMAGE_TO_PROPERTY', 'HIGH'],
  ['OVERCHARGING', 'HIGH'],
]);
const DEFAULT_PRIORITY = 'MEDIUM';

const priorityForCategory = (category) => SAFETY_CATEGORIES.get(category) || DEFAULT_PRIORITY;

const CUSTOMER_FACING_STATUSES = {
  SUBMITTED: 'Complaint received and awaiting review',
  UNDER_REVIEW: 'Our team is reviewing your complaint',
  INVESTIGATING: 'We are investigating and gathering evidence',
  RESOLUTION_PROPOSED: 'A resolution has been proposed for your approval',
  RESOLVED: 'Complaint resolved',
  REJECTED: 'Complaint rejected',
  CANCELLED: 'Complaint cancelled by customer',
  ESCALATED: 'Complaint escalated to higher authority',
  OPEN: 'Complaint received',
};

const VALID_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW', 'INVESTIGATING', 'REJECTED', 'CANCELLED', 'ESCALATED'],
  UNDER_REVIEW: ['INVESTIGATING', 'REJECTED', 'CANCELLED', 'ESCALATED'],
  INVESTIGATING: ['RESOLUTION_PROPOSED', 'RESOLVED', 'REJECTED', 'CANCELLED', 'ESCALATED'],
  RESOLUTION_PROPOSED: ['RESOLVED', 'INVESTIGATING', 'CANCELLED', 'ESCALATED'],
  OPEN: ['UNDER_REVIEW', 'INVESTIGATING', 'REJECTED', 'CANCELLED', 'ESCALATED'],
};

const toEvidence = (files) =>
  (files || []).map((f) => ({
    type: f.mimetype.startsWith('video') ? 'VIDEO' : f.mimetype === 'application/pdf' ? 'DOCUMENT' : 'IMAGE',
    path: f.path,
    uploadedAt: new Date(),
  }));

const getWorkerUserId = (workerProfile) => workerProfile?.user;

/**
 * Create a complaint (customer side).
 */
const createComplaint = async ({ customerId, bookingId, category, description, evidence, preferredResolution, priorityOverride }) => {
  if (!description) throw new ApiError('Description is required', 400);

  let workerId = null;
  let booking = null;
  if (bookingId) {
    booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError('Booking not found', 404);
    if (booking.customer.toString() !== customerId.toString()) {
      throw new ApiError('Not authorized for this booking', 403);
    }
    workerId = booking.worker;
  }

  const priority = priorityOverride || priorityForCategory(category);
  const complaint = await Complaint.create({
    customer: customerId,
    category: category || 'OTHER',
    description,
    preferredResolution: preferredResolution || 'OTHER',
    booking: bookingId,
    worker: workerId,
    evidence,
    priority,
    isSafety: priority === 'URGENT' || priority === 'HIGH',
    status: 'SUBMITTED',
    history: [
      {
        status: 'SUBMITTED',
        action: 'COMPLAINT_CREATED',
        by: customerId,
        note: 'Complaint filed by customer',
      },
    ],
  });

  // A complaint during an active booking opens a dispute on that booking
  if (booking && ACTIVE_BOOKING_STATUSES.includes(booking.status) && booking.status !== 'DISPUTED') {
    booking.status = 'DISPUTED';
    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({
      status: 'DISPUTED',
      updatedBy: customerId,
      note: `Disputed via complaint ${complaint.complaintNumber}`,
      updatedAt: new Date(),
    });
    await booking.save();
  }

  // Notify admins
  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyUsers(
    admins.map((a) => ({
      user: a._id,
      type: 'COMPLAINT_CREATED',
      title: `${priority === 'URGENT' ? '🚨 ' : ''}New complaint ${complaint.complaintNumber}`,
      message: `${description.slice(0, 120)}${description.length > 120 ? '…' : ''} (${category})`,
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, priority },
    }))
  );

  // Notify the worker a complaint was raised (if any)
  if (workerId) {
    const workerProfile = await Worker.findById(workerId).select('user');
    const workerUserId = getWorkerUserId(workerProfile);
    if (workerUserId) {
      await createNotification({
        user: workerUserId,
        type: 'COMPLAINT_CREATED',
        title: `A complaint was filed on booking`,
        message: `${category} — ${description.slice(0, 100)}. You can respond from your Complaints page.`,
        data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber },
      });
    }
  }

  return complaint;
};

/**
 * Submit a response as customer / worker / admin. A worker may also accept
 * responsibility (`acceptResponsibility`) or dispute (`dispute`) the claim.
 */
const submitResponse = async ({ complaintId, byUserId, role, message = '', acceptResponsibility = false, dispute = false, evidence = [] }) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new ApiError('Complaint not found', 404);
  if (['RESOLVED', 'REJECTED', 'CANCELLED'].includes(complaint.status)) {
    throw new ApiError(`Cannot respond to a ${complaint.status} complaint`, 400);
  }

  if (role === 'CUSTOMER') {
    if (complaint.customer.toString() !== byUserId.toString()) throw new ApiError('Not authorized', 403);
  } else if (role === 'WORKER') {
    if (!complaint.worker) throw new ApiError('No worker assigned to this complaint', 400);
    const profile = await Worker.findById(complaint.worker).select('user');
    if (!profile || profile.user.toString() !== byUserId.toString()) throw new ApiError('Not authorized', 403);
  }

  complaint.responses.push({
    role,
    user: byUserId,
    message,
    acceptResponsibility: !!acceptResponsibility,
    dispute: !!dispute,
    evidence,
  });

  // Notify the other side +
  if (role === 'WORKER') {
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyUsers(
      admins.map((a) => ({
        user: a._id,
        type: 'COMPLAINT_RESPONSE',
        title: `Worker responded to ${complaint.complaintNumber}`,
        message: dispute ? 'Worker disputes the complaint' : acceptResponsibility
          ? 'Worker accepted responsibility' : (message || 'Worker submitted a response').slice(0, 120),
        data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber },
      }))
    );
    await createNotification({
      user: complaint.customer,
      type: 'COMPLAINT_RESPONSE',
      title: `The worker responded to your complaint`,
      message: (message || 'A response was added').slice(0, 120),
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber },
    });
  } else if (role === 'CUSTOMER') {
    await notifyUsers(
      (await User.find({ role: 'admin' }).select('_id')).map((a) => ({
        user: a._id,
        type: 'COMPLAINT_RESPONSE',
        title: `Customer added info to ${complaint.complaintNumber}`,
        message: (message || 'Customer response').slice(0, 120),
        data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber },
      }))
    );
  } else if (role === 'ADMIN') {
    await createNotification({
      user: complaint.customer,
      type: 'COMPLAINT_UPDATE',
      title: `Update on ${complaint.complaintNumber}`,
      message: (message || 'An admin added a note').slice(0, 120),
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber },
    });
  }

  await complaint.save();
  return complaint;
};

/**
 * Transition complaint status (admin) and notify relevant parties.
 */
const transitionStatus = async ({ complaintId, status, note, byUserId }) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new ApiError('Complaint not found', 404);

  const allowed = VALID_TRANSITIONS[complaint.status] || [];
  if (status !== 'RESOLVED' && !allowed.includes(status)) {
    throw new ApiError(`${complaint.status} → ${status} is not a valid transition`, 400);
  }

  complaint.status = status;
  complaint.handledBy = byUserId;
  if (status === 'RESOLVED') complaint.resolvedAt = new Date();
  complaint.history.push({ status, action: 'STATUS_CHANGED', by: byUserId, note: note || '' });
  await complaint.save();

  const type = status === 'ESCALATED' ? 'COMPLAINT_ESCALATED' : status === 'RESOLVED' ? 'COMPLAINT_RESOLVED' : 'COMPLAINT_UPDATE';
  await notifyUsers([
    {
      user: complaint.customer,
      type,
      title: `Complaint ${complaint.complaintNumber} — ${status.replace('_', ' ')}`,
      message: CUSTOMER_FACING_STATUSES[status] || note || `Status changed to ${status}`,
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, status },
    },
  ]);
  if (complaint.worker) {
    const profile = await Worker.findById(complaint.worker).select('user');
    if (profile?.user) {
      await createNotification({
        user: profile.user,
        type,
        title: `Complaint ${complaint.complaintNumber} — ${status.replace('_', ' ')}`,
        message: CUSTOMER_FACING_STATUSES[status] || `Status changed to ${status}`,
        data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, status },
      });
    }
  }
  return complaint;
};

/**
 * Admin proposes a resolution (no side effects yet).
 */
const proposeResolution = async ({ complaintId, decisionType, reason, amount = 0, byUserId }) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new ApiError('Complaint not found', 404);

  complaint.resolutionDecision = {
    type: decisionType,
    reason: reason || '',
    amount,
    decidedBy: byUserId,
    decidedAt: new Date(),
  };
  complaint.status = 'RESOLUTION_PROPOSED';
  complaint.handledBy = byUserId;
  complaint.history.push({ status: 'RESOLUTION_PROPOSED', action: 'RESOLUTION_PROPOSED', by: byUserId, note: `${decisionType}${amount ? ` (₹${amount})` : ''} — ${reason || ''}` });
  await complaint.save();

  await notifyUsers([
    {
      user: complaint.customer,
      type: 'RESOLUTION_PROPOSED',
      title: `Resolution proposed for ${complaint.complaintNumber}`,
      message: `${decisionType.replace('_', ' ')}${amount ? ` — ₹${amount}` : ''}. ${reason || ''}`.slice(0, 160),
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, status: 'RESOLUTION_PROPOSED' },
    },
  ]);
  return complaint;
};

const REFUND_DECISIONS = ['FULL_REFUND', 'PARTIAL_REFUND', 'CUSTOMER_COMPENSATION'];

/**
 * Admin finalizes the resolution — applies refunds, worker actions,
 * and closes the complaint as RESOLVED.
 */
const finalizeResolution = async ({ complaintId, byUserId }) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new ApiError('Complaint not found', 404);
  if (complaint.status !== 'RESOLUTION_PROPOSED' && !complaint.resolutionDecision) {
    throw new ApiError('No resolution decision recorded yet', 400);
  }

  const decision = complaint.resolutionDecision;

  // 1. Refund flow
  if (REFUND_DECISIONS.includes(decision.type) && !complaint.refund.refundNumber) {
    const payment = await Payment.findOne({ booking: complaint.booking });
    if (!payment) throw new ApiError('No payment found for this booking — cannot refund', 400);
    try {
      const refund = await paymentService.initiateRefund(payment._id, {
        amount: decision.amount || payment.amount,
        complaintId: complaint._id,
        initiatedBy: byUserId,
      });
      complaint.refund = {
        status: refund.status,
        amount: refund.amount,
        refundNumber: refund.refundNumber,
        payment: payment._id,
        initiatedAt: refund.initiatedAt || new Date(),
      };
      await createNotification({
        user: complaint.customer,
        type: 'REFUND_STATUS',
        title: 'Refund initiated',
        message: `Refund of ₹${refund.amount} is being processed (${refund.refundNumber}).`,
        data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, refundId: refund._id, status: refund.status },
      });
    } catch (e) {
      complaint.refund = {
        status: 'FAILED',
        amount: decision.amount || 0,
        failureReason: e.message,
      };
    }
  }

  // 2. Worker disciplinary actions
  if (decision.type === 'WORKER_WARNING' || decision.type === 'WORKER_PENALTY') {
    if (complaint.worker) {
      await Worker.updateOne(
        { _id: complaint.worker },
        { $push: { warnings: { title: decision.type.replace('_', ' '), reason: decision.reason || '', complaint: complaint._id } } }
      );
      const profile = await Worker.findById(complaint.worker).select('user');
      if (profile?.user) {
        await createNotification({
          user: profile.user,
          type: 'COMPLAINT_RESOLVED',
          title: `A ${decision.type.replace('_', ' ').toLowerCase()} has been recorded`,
          message: decision.reason || `Recorded against complaint ${complaint.complaintNumber}`,
          data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber },
        });
      }
    }
  }

  // 3. Close the complaint
  complaint.status = 'RESOLVED';
  complaint.resolvedAt = new Date();
  complaint.handledBy = byUserId;
  complaint.resolution = complaint.resolution || decision.reason || decision.type.replace('_', ' ');
  complaint.actionTaken = complaint.actionTaken || decision.type.replace('_', ' ');
  complaint.history.push({ status: 'RESOLVED', action: 'RESOLVED', by: byUserId, note: `${decision.type} — ${decision.reason || ''}` });
  await complaint.save();

  await notifyUsers([
    {
      user: complaint.customer,
      type: 'COMPLAINT_RESOLVED',
      title: `Complaint ${complaint.complaintNumber} resolved`,
      message: `${decision.type.replace('_', ' ')}${decision.amount ? ` — ₹${decision.amount}` : ''}. ${decision.reason || ''}`.slice(0, 160),
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, status: 'RESOLVED' },
    },
  ]);

  return complaint;
};

/**
 * Escalate a complaint (safety or unresolvable internally).
 */
const escalate = async ({ complaintId, reason, to, byUserId }) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new ApiError('Complaint not found', 404);

  complaint.status = 'ESCALATED';
  complaint.escalation = {
    escalatedTo: to || 'Cooperative Dispute Committee',
    escalatedAt: new Date(),
    reason: reason || '',
  };
  complaint.handledBy = byUserId;
  complaint.history.push({ status: 'ESCALATED', action: 'ESCALATED', by: byUserId, note: reason || `Escalated to ${to}` });
  await complaint.save();

  await notifyUsers([
    {
      user: complaint.customer,
      type: 'COMPLAINT_ESCALATED',
      title: `Complaint ${complaint.complaintNumber} escalated`,
      message: `Your complaint has been escalated to ${complaint.escalation.escalatedTo}. ${reason || ''}`.slice(0, 160),
      data: { complaintId: complaint._id, complaintNumber: complaint.complaintNumber, status: 'ESCALATED' },
    },
  ]);
  return complaint;
};

/**
 * Admin-only worker suspension as part of a safety/high-severity complaint.
 * Never applied automatically — always requires an explicit admin decision.
 */
const suspendWorker = async ({ complaintId, temporary = true, until = null, reason = '', byUserId }) => {
  const complaint = await Complaint.findById(complaintId);
  if (!complaint) throw new ApiError('Complaint not found', 404);
  if (!complaint.worker) throw new ApiError('No worker attached to this complaint', 400);

  const profile = await Worker.findById(complaint.worker);
  if (!profile) throw new ApiError('Worker not found', 404);

  const now = new Date();

  // 3-strike rule: count every suspension; the 3rd one permanently terminates.
  profile.suspensionCount = (profile.suspensionCount || 0) + 1;
  const strike = profile.suspensionCount;
  let terminated = false;

  if (strike >= 3 || temporary === false) {
    terminated = true;
    profile.isActive = false;
    profile.suspendedFrom = now;
    profile.suspendedUntil = undefined;
    profile.terminatedAt = now;
    profile.terminationReason = reason || 'Permanently terminated after repeated suspensions';
    profile.suspensionNote = reason || 'Permanently terminated after repeated suspensions';
    await User.updateOne({ _id: profile.user }, { isActive: false });
  } else {
    profile.isActive = false;
    profile.suspendedFrom = now;
    profile.suspensionNote = reason || 'Suspended in connection with a safety complaint';
    if (until) profile.suspendedUntil = new Date(until);
  }

  complaint.workerAction = {
    suspensionApplied: true,
    suspensionType: terminated ? 'PERMANENT' : temporary ? 'TEMPORARY' : 'PERMANENT',
    suspensionReason: reason || (terminated ? 'Repeated suspensions' : 'Safety complaint'),
    suspensionUntil: terminated ? undefined : until ? new Date(until) : undefined,
    suspensionStrike: strike,
    terminated,
    appliedAt: now,
    appliedBy: byUserId,
  };
  complaint.history.push({
    status: complaint.status,
    action: terminated ? 'WORKER_TERMINATED' : 'WORKER_SUSPENDED',
    by: byUserId,
    note: terminated
      ? `Permanently terminated — 3rd suspension (why: ${reason || ''})`
      : `Suspension ${strike}/3 — ${reason || ''}`,
  });

  await Promise.all([profile.save(), complaint.save()]);

  await createNotification({
    user: profile.user,
    type: terminated ? 'ACCOUNT_TERMINATED' : 'ACCOUNT_SUSPENDED',
    title: terminated ? 'Your account has been permanently terminated' : `Your account has been suspended (${strike}/3)`,
    message: terminated
      ? 'Your account has been permanently terminated from the platform after repeated suspensions.'
      : temporary && until
        ? `Your account is suspended until ${new Date(until).toLocaleDateString()}. ${strike}/3 strikes used. ${reason || ''}`
        : `Your account is temporarily blocked from new bookings. ${strike}/3 strikes used. ${reason || ''}`,
    data: { complaintId: complaint._id, workerId: profile._id },
  });
  await notifyUsers(
    (await User.find({ role: 'admin' }).select('_id')).map((a) => ({
      user: a._id,
      type: terminated ? 'ACCOUNT_TERMINATED' : 'ACCOUNT_SUSPENDED',
      title: terminated
        ? `Worker TERMINATED (${complaint.complaintNumber})`
        : `Worker suspended ${strike}/3 (${complaint.complaintNumber})`,
      message: reason || 'Safety-related suspension applied',
      data: { complaintId: complaint._id, workerId: profile._id },
    }))
  );
  return { complaint, worker: profile, suspensionCount: strike, terminated };
};

/**
 * Full investigation bundle for the admin dashboard.
 */
const getInvestigationBundle = async (complaintId) => {
  const complaint = await Complaint.findById(complaintId)
    .populate('customer', 'name email phone')
    .populate('worker', 'user verificationStatus isActive completedJobs rating ratingCount city')
    .populate('booking', 'bookingNumber serviceSnapshot status priceBreakdown isEmergency city area address requestedDate timeSlot completedAt statusHistory cancellationReason')
    .populate('handledBy', 'name')
    .lean();

  if (!complaint) throw new ApiError('Complaint not found', 404);

  const workerId = complaint.worker?._id || complaint.worker;
  const workerProfile = workerId
    ? await Worker.findById(workerId)
        .populate('user', 'name email phone')
        .lean()
    : null;

  const bookingId = complaint.booking?._id || complaint.booking;
  const [payments, invoices, reviews] = bookingId
    ? await Promise.all([
        Payment.find({ booking: bookingId }).lean(),
        Invoice.find({ booking: bookingId }).lean(),
        Review.find({ booking: bookingId, reviewType: 'CUSTOMER_TO_WORKER' }).lean(),
      ])
    : [];

  return {
    complaint,
    workerProfile,
    payments,
    invoices,
    reviews,
  };
};

module.exports = {
  createComplaint,
  submitResponse,
  transitionStatus,
  proposeResolution,
  finalizeResolution,
  escalate,
  suspendWorker,
  getInvestigationBundle,
  priorityForCategory,
  CUSTOMER_FACING_STATUSES,
};