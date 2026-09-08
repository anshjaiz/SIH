const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  respondToComplaint,
  cancelComplaint,
  getStatusFlow,
} = require('../controllers/shared/complaintController');
const { protect } = require('../middleware/authMiddleware');
const { uploadEvidence } = require('../middleware/uploadMiddleware');

router.use(protect);
router.get('/mine', getMyComplaints);
router.get('/status-flow', getStatusFlow);
router.post('/', uploadEvidence.array('evidence', 10), createComplaint);
router.post('/:id/respond', uploadEvidence.array('evidence', 10), respondToComplaint);
router.post('/:id/cancel', cancelComplaint);
router.get('/:id', getComplaintById);

module.exports = router;