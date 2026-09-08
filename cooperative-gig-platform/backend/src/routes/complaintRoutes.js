const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getComplaintById,
} = require('../controllers/shared/complaintController');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

router.use(protect);
router.get('/mine', getMyComplaints);
router.post('/', upload.array('images', 5), createComplaint);
router.get('/:id', getComplaintById);

module.exports = router;