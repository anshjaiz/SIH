const express = require('express');
const router = express.Router();
const {
  getOwnProfile,
  updateOwnProfile,
  addSkill,
  removeSkill,
  uploadCertificate,
  getCertificates,
  setAvailability,
  getAvailability,
} = require('../controllers/worker/workerProfileController');
const {
  getWorkerDashboard,
  getJobRequests,
  acceptJob,
  rejectJob,
  getActiveJobs,
  startJob,
  arriveBooking,
  updateLocation,
  completeJob,
  getEarnings,
  getWorkerReviews,
  updateJobStatus,
  confirmCompletion,
  getJobHistory,
} = require('../controllers/worker/workerJobsController');
const {
  getMyReliability,
  getMyReliabilityHistory,
  submitAppeal,
  getMyAppeals,
} = require('../controllers/reliability/workerReliabilityController');
const {
  getWelfare,
  updateWelfare,
  getTrainings,
  enrollTraining,
  getMyTrainings,
} = require('../controllers/worker/welfareController');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

// Dashboard
router.get('/dashboard', protect, getWorkerDashboard);
router.get('/wand', protect, getWorkerDashboard); // alias for dashboard

// Profile
router.get('/profile', protect, getOwnProfile);
router.put('/profile', protect, upload.single('avatar'), updateOwnProfile);

// Skills
router.post('/skills', protect, addSkill);
router.delete('/skills/:skillId', protect, removeSkill);

// Certificates
router.get('/certificates', protect, getCertificates);
router.post('/certificates', protect, upload.single('file'), uploadCertificate);

// Availability
router.get('/availability', protect, getAvailability);
router.post('/availability', protect, setAvailability);

// Jobs
router.get('/jobs/requests', protect, getJobRequests);
router.get('/jobs/active', protect, getActiveJobs);
router.get('/jobs/history', protect, getJobHistory);
router.post('/jobs/:id/accept', protect, acceptJob);
router.post('/jobs/:id/reject', protect, rejectJob);
router.post('/jobs/:id/start', protect, startJob);
router.post('/jobs/:id/arrive', protect, arriveBooking);
router.post('/jobs/:id/complete', protect, upload.array('afterImages', 5), completeJob);
router.post('/jobs/:id/status', protect, updateJobStatus);
router.post('/jobs/:id/confirm', protect, confirmCompletion);

// Reliability
router.get('/me/reliability', protect, getMyReliability);
router.get('/me/reliability/history', protect, getMyReliabilityHistory);
router.post('/me/appeals', protect, submitAppeal);
router.get('/me/appeals', protect, getMyAppeals);

// Location
router.put('/location', protect, updateLocation);

// Earnings
router.get('/earnings', protect, getEarnings);

// Reviews
router.get('/reviews', protect, getWorkerReviews);

// Welfare
router.get('/welfare', protect, getWelfare);
router.put('/welfare', protect, updateWelfare);

// Training
router.get('/trainings', protect, getTrainings);
router.post('/trainings/enroll', protect, enrollTraining);
router.get('/trainings/my', protect, getMyTrainings);

module.exports = router;
