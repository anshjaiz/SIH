const express = require('express');
const router = express.Router();
const {
  createOrder,
  verify,
  getByBooking,
  getCustomerHistory,
} = require('../controllers/payments/paymentController');
const { protect } = require('../middleware/authMiddleware');

// Always the customer who owns the booking (admin allowed to create orders).
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verify);

// NOTE: /customer/history MUST be declared before /:bookingId.
router.get('/customer/history', protect, getCustomerHistory);
router.get('/:bookingId', protect, getByBooking);

module.exports = router;