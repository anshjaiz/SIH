const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');

const ai = require('../controllers/ai/aiController');

// Worker + admin can view forecasts / matching / collaboration insight
router.get('/status', protect, ai.status);
router.get('/forecast', protect, ai.forecast);
router.get('/workforce', protect, authorize('admin'), ai.workforce);
router.get('/worker-ranking/:bookingId', protect, ai.workerRanking);
router.get('/collaborator-recommendation/:bookingId', protect, ai.collaboratorRecommendationEndpoint);
router.get('/pipeline', protect, authorize('admin'), ai.pipeline);

// Retraining is an admin operation
router.post('/train', protect, authorize('admin'), ai.train);

module.exports = router;