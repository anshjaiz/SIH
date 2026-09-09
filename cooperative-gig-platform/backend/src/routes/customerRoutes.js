const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getBookings,
  getCustomerProfile,
  updateCustomerProfile,
} = require('../controllers/customer/customerController');
const {
  createServiceRequest,
  getBookingById,
  cancelBooking,
  requestReassignment,
} = require('../controllers/customer/bookingController');
const {
  getInvoiceByBooking,
  getCustomerInvoices,
} = require('../controllers/customer/invoiceController');
const {
  confirmCompletion,
} = require('../controllers/worker/workerJobsController');
const {
  initiatePayment,
  getPaymentForBooking,
} = require('../controllers/shared/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

// Dashboard (authenticated customer)
router.get('/dashboard', protect, getDashboard);

// Profile
router.get('/profile', protect, getCustomerProfile);
router.put('/profile', protect, updateCustomerProfile);

// Bookings
router.get('/bookings', protect, getBookings);
router.post('/bookings', protect, upload.array('images', 5), createServiceRequest);
router.get('/bookings/:id', protect, getBookingById);
router.put('/bookings/:id/cancel', protect, cancelBooking);
router.post('/bookings/:id/reassign', protect, requestReassignment);
router.post('/bookings/:id/confirm', protect, confirmCompletion);

// Payments
router.post('/payments', protect, initiatePayment);
router.get('/payments/booking/:bookingId', protect, getPaymentForBooking);

// Invoices
router.get('/invoices', protect, getCustomerInvoices);
router.get('/invoices/booking/:bookingId', protect, getInvoiceByBooking);

module.exports = router;
