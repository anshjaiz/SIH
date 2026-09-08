const express = require('express');
const router = express.Router();
const {
  createReview,
  getWorkerReviewsPublic,
  getMyReviews,
} = require('../controllers/shared/reviewController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createReview);
router.get('/mine', protect, getMyReviews);
router.get('/worker/:workerId', getWorkerReviewsPublic);

module.exports = router;
