/**
 * chatController.js
 *
 * Direct customer ↔ worker messaging active once a worker has accepted a job.
 * Access is enforced per booking: only the customer who booked it and the
 * assigned worker can read/send.
 */

const Booking = require('../models/Booking');
const Worker = require('../models/WorkerProfile');
const ChatMessage = require('../models/Message');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../middleware/errorMiddleware');
const { createNotification } = require('../services/notification/notificationService');
const { getIO } = require('../config/socket');

// Chat unlocks once the worker has accepted (or the job is already underway).
const CHAT_ACTIVE_STATUSES = [
  'ACCEPTED',
  'ON_THE_WAY',
  'WORKER_ARRIVED',
  'STARTED',
  'IN_PROGRESS',
  'COMPLETED',
];

const getAssignedWorkerUser = async (booking) => {
  if (!booking.worker) return null;
  const worker = await Worker.findById(booking.worker).select('user').lean();
  return worker ? worker.user : null;
};

/**
 * Resolve the other party for a booking based on the requesting user.
 * Returns { requester: UserId, other: UserId } — customer ↔ assigned worker.
 */
const resolveParticipants = async (booking, userId) => {
  const workerUser = await getAssignedWorkerUser(booking);
  const isCustomer = String(booking.customer) === String(userId);
  const isWorker = workerUser && String(workerUser) === String(userId);
  if (!isCustomer && !isWorker) {
    throw new ApiError('You are not part of this job conversation', 403);
  }
  return {
    requester: userId,
    other: isCustomer ? workerUser : booking.customer,
  };
};

const assertChatActive = (booking) => {
  if (!booking.worker || !CHAT_ACTIVE_STATUSES.includes(booking.status)) {
    throw new ApiError('Messaging opens once the worker accepts the job', 400);
  }
};

// POST /api/chat/:bookingId/messages
const sendMessage = asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new ApiError('Message cannot be empty', 400);
  if (text.length > 2000) throw new ApiError('Message too long (max 2000 chars)', 400);

  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);
  assertChatActive(booking);

  const { requester, other } = await resolveParticipants(booking, req.user._id);
  if (!other) throw new ApiError('The other party is not available', 400);

  const message = await ChatMessage.create({
    booking: booking._id,
    sender: requester,
    recipient: other,
    text,
  });

  const payload = {
    _id: message._id,
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    sender: message.sender,
    recipient: message.recipient,
    text: message.text,
    createdAt: message.createdAt,
  };

  const io = getIO();
  if (io) {
    // Delivery to the other party + echo to the sender's own open tabs.
    io.to(`user_${other}`).emit('chat_message', payload);
    io.to(`user_${requester}`).emit('chat_message', payload);
  }

  await createNotification({
    user: other,
    type: 'CHAT_MESSAGE',
    title: 'New message',
    message: `${req.user.name}: ${text.slice(0, 120)}`,
    data: { bookingId: booking._id, bookingNumber: booking.bookingNumber, senderId: requester },
  });

  const otherUser = await User.findById(other).select('name').lean();
  res.status(201).json({
    success: true,
    data: { ...payload, otherName: otherUser?.name },
  });
});

// GET /api/chat/:bookingId/messages
const listMessages = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);

  const { requester } = await resolveParticipants(booking, req.user._id);

  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

  // Mark anything from the other side as read first, then fetch fresh state.
  await ChatMessage.updateMany(
    { booking: booking._id, recipient: requester, readAt: null },
    { $set: { readAt: new Date() } }
  );
  const messages = await ChatMessage.find({ booking: booking._id })
    .sort({ createdAt: -1 })
    .limit(limit);

  const otherUserId = messages.length ? messages[0].recipient : null;
  const otherUser = otherUserId
    ? await User.findById(otherUserId).select('name').lean()
    : null;

  res.json({
    success: true,
    data: {
      booking: { _id: booking._id, bookingNumber: booking.bookingNumber, status: booking.status },
      otherName: otherUser?.name,
      messages: messages.reverse().map((m) => ({
        _id: m._id,
        sender: m.sender,
        recipient: m.recipient,
        text: m.text,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
    },
  });
});

// GET /api/chat/conversations
const listConversations = asyncHandler(async (req, res) => {
  const query = { status: { $in: CHAT_ACTIVE_STATUSES }, worker: { $ne: null } };

  let bookings;
  if (req.user.role === 'worker') {
    const worker = await Worker.findOne({ user: req.user._id }).select('_id').lean();
    if (!worker) return res.json({ success: true, data: [] });
    bookings = await Booking.find({ ...query, worker: worker._id })
      .select('bookingNumber status customer worker scheduledStartTime scheduledEndTime')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
  } else {
    bookings = await Booking.find({ ...query, customer: req.user._id })
      .select('bookingNumber status customer worker scheduledStartTime scheduledEndTime')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
  }

  const conversations = await Promise.all(
    bookings.map(async (b) => {
      const last = await ChatMessage.findOne({ booking: b._id })
        .sort({ createdAt: -1 })
        .select('text createdAt sender')
        .lean();
      const unread = await ChatMessage.countDocuments({ booking: b._id, recipient: req.user._id, readAt: null });
      const otherUserId = req.user.role === 'worker' ? b.customer : (await getAssignedWorkerUser(b));
      const other = otherUserId ? await User.findById(otherUserId).select('name avatar').lean() : null;
      return {
        bookingId: b._id,
        bookingNumber: b.bookingNumber,
        status: b.status,
        startTime: b.scheduledStartTime,
        other: other ? { _id: other._id, name: other.name } : null,
        lastMessage: last
          ? { text: last.text, sent: last.sender === String(req.user._id), createdAt: last.createdAt }
          : null,
        unread,
      };
    })
  );

  conversations.sort((a, b2) => {
    const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b2.lastMessage ? new Date(b2.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });

  res.json({ success: true, data: conversations });
});

// POST /api/chat/:bookingId/read
const markRead = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);

  const { requester } = await resolveParticipants(booking, req.user._id);
  await ChatMessage.updateMany(
    { booking: booking._id, recipient: requester, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ success: true, data: { read: new Date() } });
});

module.exports = {
  sendMessage,
  listMessages,
  listConversations,
  markRead,
};