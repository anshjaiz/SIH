const express = require('express');
const router = express.Router();
const {
  getServices,
  getServiceById,
  getCategories,
  createService,
  updateService,
  deleteService,
  getSkills,
} = require('../controllers/shared/serviceController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', getServices);
router.get('/categories', getCategories);
router.get('/skills/list', getSkills);
router.get('/:id', getServiceById);

// Admin-only mutations
router.post('/', protect, authorize('admin'), createService);
router.put('/:id', protect, authorize('admin'), updateService);
router.delete('/:id', protect, authorize('admin'), deleteService);

module.exports = router;
