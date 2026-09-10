/**
 * materialRequestController.js
 *
 * Material-cost approval flow. The customer never sets a material price:
 * the WORKER submits a material request after visiting the job, and the
 * CUSTOMER must explicitly approve or reject it. Only APPROVED requests are
 * summed into the booking's payable amount (computed here on the backend —
 * never trusting a client-sent total).
 */

const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const Cooperative = require('../../models/Cooperative');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const { computePriceBreakdown } = require('../../utils/pricingUtils');
const { createNotification } = require('../../services/notification/notificationService');
const { getIO } = require('../../config/socket');

const WORKER_ELIGIBLE_STATUSES = ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'];
// Customer can respond for any non-finalized state.
const RESPOND_BLOCKED_STATUSES = ['CANCELLED', 'EXPIRED', 'WORKER_NO_SHOW', 'DISPUTED'];

const getWorkerId = async (userId) => {
  const worker = await Worker.findOne({ user: userId });
  return worker ? worker._id : null;
};

const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Sum of every APPROVED material request on the booking.
const approvedMaterialTotal = (booking) =>
  round((booking.materialRequests || []).reduce((sum, mr) => sum + (mr.status === 'approved' ? Number(mr.amount) || 0 : 0), 0));

// Refresh the booking priceBreakdown from approved material requests only.
const recomputePriceBreakdown = async (booking) => {
  const coop = await Cooperative.findOne().sort({ createdAt: -1 });
  const materials = approvedMaterialTotal(booking);
  const next = computePriceBreakdown(booking.priceBreakdown?.labour, materials, coop);
  booking.priceBreakdown = { ...(booking.priceBreakdown || {}), ...next };
};

// POST /api/workers/jobs/:id/material-request  (worker submits a request)
const submitMaterialRequest = asyncHandler(async (req, res) => {
  const { description, amount, note } = req.body;

  if (!description || !String(description).trim()) {
    throw new ApiError('Material description is required', 400);
  }
  const materialsAmount = Number(amount);
  if (!Number.isFinite(materialsAmount) || materialsAmount <= 0) {
    throw new ApiError('Material cost must be greater than 0', 400);
  }

  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);
  if (!booking.worker || booking.worker.toString() !== worker._id.toString()) {
    throw new ApiError('Not your job', 403);
  }
  if (!WORKER_ELIGIBLE_STATUSES.includes(booking.status)) {
    throw new ApiError(`Material cost can only be requested for an accepted/in-progress job (current: ${booking.status})`, 400);
  }

  const existing = booking.materialRequests || [];
  if (existing.some((mr) => mr.status === 'pending')) {
    throw new ApiError('A material request is already awaiting customer approval', 400);
  }

  booking.materialRequests = existing;
  booking.materialRequests.push({
    description: String(description).trim(),
    amount: round(materialsAmount),
    note: note ? String(note).trim() : '',
    status: 'pending',
    requestedBy: worker._id,
    requestedAt: new Date(),
  });
  await booking.save();

  const request = booking.materialRequests[booking.materialRequests.length - 1];

  await createNotification({
    user: booking.customer,
    type: 'MATERIAL_REQUEST_CREATED',
    title: 'Additional material required',
    message: `${req.user.name || 'Your worker'} requested material cost ₹${request.amount} (${request.description}). Please approve to continue.`,
    data: { bookingId: booking._id, materialRequestId: request._id },
  });

  const io = getIO();
  if (io) io.to(`customer_${booking.customer}`).emit('material_request_update', { bookingId: booking._id, status: 'pending' });
  if (io) io.to(`customer_${booking.customer}`).emit('booking_update', { bookingId: booking._id, status: booking.status });

  res.status(201).json({ success: true, message: 'Material cost request submitted', data: { booking, request } });
});

// POST /api/customers/bookings/:id/material-request/:requestId/approve
const approveMaterialRequest = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  const customerUserId = booking.customer.toString();
  if (req.user._id.toString() !== customerUserId && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }
  if (RESPOND_BLOCKED_STATUSES.includes(booking.status)) {
    throw new ApiError(`Cannot approve material cost for a ${booking.status} booking`, 400);
  }

  const request = (booking.materialRequests || []).find((mr) => mr._id.toString() === req.params.requestId);
  if (!request) throw new ApiError('Material request not found', 404);
  if (request.status !== 'pending') {
    throw new ApiError(`Material request already ${request.status}`, 400);
  }

  request.status = 'approved';
  request.approvedAt = new Date();
  request.respondedBy = req.user._id;

  // Backend-computed final payable amount — never trust a frontend total.
  await recomputePriceBreakdown(booking);
  await booking.save();

  await createNotification({
    user: booking.worker ? (await Worker.findById(booking.worker).select('user'))?.user : undefined,
    type: 'MATERIAL_REQUEST_APPROVED',
    title: 'Material cost approved',
    message: `Customer approved ₹${request.amount} for ${request.description}. New total ₹${booking.priceBreakdown?.total}.`,
    data: { bookingId: booking._id, materialRequestId: request._id },
  });

  const io = getIO();
  if (io && booking.worker) {
    io.to(`worker_${booking.worker}`).emit('material_request_update', { bookingId: booking._id, status: 'approved' });
  }

  res.json({ success: true, message: 'Material cost approved', data: { booking, materialRequests: booking.materialRequests } });
});

// POST /api/customers/bookings/:id/material-request/:requestId/reject
const rejectMaterialRequest = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError('Booking not found', 404);

  const customerUserId = booking.customer.toString();
  if (req.user._id.toString() !== customerUserId && req.user.role !== 'admin') {
    throw new ApiError('Not authorized', 403);
  }
  if (RESPOND_BLOCKED_STATUSES.includes(booking.status)) {
    throw new ApiError(`Cannot reject material cost for a ${booking.status} booking`, 400);
  }

  const request = (booking.materialRequests || []).find((mr) => mr._id.toString() === req.params.requestId);
  if (!request) throw new ApiError('Material request not found', 404);
  if (request.status !== 'pending') {
    throw new ApiError(`Material request already ${request.status}`, 400);
  }

  // Rejected: NOT added to the payable amount, the service charge stays unchanged.
  request.status = 'rejected';
  request.rejectedAt = new Date();
  request.respondedBy = req.user._id;
  await booking.save();

  await createNotification({
    user: booking.worker ? (await Worker.findById(booking.worker).select('user'))?.user : undefined,
    type: 'MATERIAL_REQUEST_REJECTED',
    title: 'Material cost rejected',
    message: `Customer declined the ₹${request.amount} material request (${request.description}). Original service charge ₹${booking.priceBreakdown?.labour} stays unchanged.`,
    data: { bookingId: booking._id, materialRequestId: request._id },
  });

  const io = getIO();
  if (io && booking.worker) {
    io.to(`worker_${booking.worker}`).emit('material_request_update', { bookingId: booking._id, status: 'rejected' });
  }

  res.json({ success: true, message: 'Material cost rejected', data: { booking, materialRequests: booking.materialRequests } });
});

module.exports = { submitMaterialRequest, approveMaterialRequest, rejectMaterialRequest };