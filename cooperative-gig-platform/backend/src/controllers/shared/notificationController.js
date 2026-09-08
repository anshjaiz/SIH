const Notification = require('../../models/Notification');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// Get my notifications
const getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ success: true, data: notifications });
});

// Get unread count
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });
  res.json({ success: true, data: { count } });
});

// Mark all as read
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});

// Mark single as read
const markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new ApiError('Notification not found', 404);
  res.json({ success: true, data: notification });
});

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
};
