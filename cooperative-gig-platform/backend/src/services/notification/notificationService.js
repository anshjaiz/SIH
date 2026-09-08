/**
 * notificationService.js
 *
 * Central helper: persists a Notification and emits it over Socket.IO
 * to the recipient's personal room (`user_<userId>`) — the room every
 * client joins via `identity`.
 */

const Notification = require('../../models/Notification');
const { getIO } = require('../../config/socket');

/**
 * Create a notification (DB) and emit it live if the user is connected.
 * @param {Object} n { user, type, title, message, data }
 */
const createNotification = async ({ user, type = 'SYSTEM', title, message, data = {} }) => {
  if (!user) return null;
  const notif = await Notification.create({ user, type, title, message, data });
  try {
    const io = getIO();
    if (io) {
      io.to(`user_${user.toString()}`).emit('notification', {
        id: notif._id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        data: notif.data,
        createdAt: notif.createdAt,
      });
    }
  } catch (e) {
    // socket emission must never break the business flow
  }
  return notif;
};

/**
 * Create notifications for many recipients.
 */
const notifyUsers = (items) => {
  const itemsArr = Array.isArray(items) ? items : [items];
  return Promise.all(itemsArr.map((n) => createNotification(n)));
};

module.exports = { createNotification, notifyUsers };