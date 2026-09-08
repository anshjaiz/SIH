const express = require('express');
const router = express.Router();
const {
  createCollaborationRequest,
  getCollaborationRequest,
  getRequestsForBooking,
  getMyCollaborationRequests,
  respondCollaborationRequest,
  cancelCollaborationRequest,
  getJobTeam,
  getCollaboratorProfile,
} = require('../controllers/collaborator/collaboratorController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

// Collaborator profile
router.get('/profile/:workerId', getCollaboratorProfile);
router.get('/profile', getCollaboratorProfile);

// Collaboration requests / team formation
router.post('/requests', authorize('worker'), createCollaborationRequest);
router.get('/requests/mine', authorize('worker'), getMyCollaborationRequests);
router.get('/requests/booking/:bookingId', getRequestsForBooking);
router.get('/requests/:id', getCollaborationRequest);
router.post('/requests/:id/respond', authorize('worker'), respondCollaborationRequest);
router.put('/requests/:id/cancel', authorize('worker'), cancelCollaborationRequest);

// Job team
router.get('/teams/booking/:bookingId', getJobTeam);

module.exports = router;