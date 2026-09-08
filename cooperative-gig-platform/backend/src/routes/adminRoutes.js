const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getWorkers,
  getWorkerDetail,
  updateWorkerStatus,
  getCertificates,
  reviewCertificate,
  getCustomers,
  getAllBookings,
  getAllPayments,
  getComplaints,
  updateComplaint,
  createTraining,
  updateTraining,
  getCooperativeSettings,
  updateCooperativeSettings,
} = require('../controllers/admin/adminController');
const {
  getForecasts,
  getWorkforceAllocation,
  getDemandData,
  getDemandHeatmap,
  getAnalytics,
} = require('../controllers/admin/analyticsController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All admin routes protected + admin only
router.use(protect, authorize('admin'));

// Dashboard
router.get('/dashboard', getDashboardStats);

// Analytics & AI
router.get('/analytics', getAnalytics);
router.get('/forecast', getForecasts);
router.get('/allocations', getWorkforceAllocation);
router.get('/demand', getDemandData);
router.get('/heatmap', getDemandHeatmap);

// Workers
router.get('/workers', getWorkers);
router.get('/workers/:id', getWorkerDetail);
router.put('/workers/:id/status', updateWorkerStatus);

// Certificates
router.get('/certificates', getCertificates);
router.put('/certificates/:id/review', reviewCertificate);

// Customers
router.get('/customers', getCustomers);

// Bookings
router.get('/bookings', getAllBookings);

// Payments
router.get('/payments', getAllPayments);

// Complaints
router.get('/complaints', getComplaints);
router.put('/complaints/:id', updateComplaint);

// Training (admin)
router.post('/trainings', createTraining);
router.put('/trainings/:id', updateTraining);

// Cooperative settings
router.get('/settings', getCooperativeSettings);
router.put('/settings', updateCooperativeSettings);

module.exports = router;
