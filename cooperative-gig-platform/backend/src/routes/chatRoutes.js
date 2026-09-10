const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  sendMessage,
  listMessages,
  listConversations,
  markRead,
} = require('../controllers/chatController');

router.use(protect);

router.get('/conversations', listConversations);
router.get('/:bookingId/messages', listMessages);
router.post('/:bookingId/messages', sendMessage);
router.post('/:bookingId/read', markRead);

module.exports = router;