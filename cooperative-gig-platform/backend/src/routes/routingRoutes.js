const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const { getRoute } = require('../controllers/routingController');

router.get('/', protect, getRoute);

module.exports = router;