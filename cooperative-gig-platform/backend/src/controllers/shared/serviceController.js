const Service = require('../../models/Service');
const Skill = require('../../models/Skill');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// @desc    Get all active services
// @route   GET /api/services
// @access  Public
const getServices = asyncHandler(async (req, res) => {
  const { category, search, includeInactive } = req.query;

  let query = {};
  if (!includeInactive || includeInactive !== 'true') {
    query.isActive = true;
  }
  if (category) {
    query.category = category;
  }
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const services = await Service.find(query).sort({ category: 1, name: 1 });

  res.json({
    success: true,
    data: services,
  });
});

// @desc    Get service by ID
// @route   GET /api/services/:id
// @access  Public
const getServiceById = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) {
    throw new ApiError('Service not found', 404);
  }
  res.json({ success: true, data: service });
});

// @desc    Get service categories
// @route   GET /api/services/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Service.distinct('category', { isActive: true });
  res.json({ success: true, data: categories });
});

// @desc    Create service (admin)
// @route   POST /api/services
// @access  Admin
const createService = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    category,
    basePrice,
    estimatedDuration,
    unit,
    requiredSkills,
    emergencyAvailable,
    icon,
  } = req.body;

  // Validate required fields
  if (!name || !description || !category || !basePrice || !estimatedDuration) {
    throw new ApiError('Name, description, category, basePrice and estimatedDuration are required', 400);
  }

  // Validate category
  if (
    ![
      'Plumbing',
      'Electrical',
      'Carpentry',
      'Painting',
      'Cleaning',
      'Gardening',
      'Driving',
      'Appliance Repair',
      'Domestic Help',
      'Caregiving',
      'Other community services',
    ].includes(category)
  ) {
    throw new ApiError('Invalid category', 400);
  }

  const service = await Service.create({
    name,
    description,
    category,
    basePrice,
    estimatedDuration,
    unit: unit || 'per visit',
    requiredSkills: requiredSkills || [],
    emergencyAvailable: emergencyAvailable || false,
    icon,
  });

  res.status(201).json({ success: true, message: 'Service created', data: service });
});

// @desc    Update service (admin)
// @route   PUT /api/services/:id
// @access  Admin
const updateService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) {
    throw new ApiError('Service not found', 404);
  }

  const fields = [
    'name',
    'description',
    'category',
    'basePrice',
    'estimatedDuration',
    'unit',
    'requiredSkills',
    'emergencyAvailable',
    'isActive',
    'icon',
  ];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      service[field] = req.body[field];
    }
  });

  await service.save();

  res.json({ success: true, message: 'Service updated', data: service });
});

// @desc    Delete service (admin)
// @route   DELETE /api/services/:id
// @access  Admin
const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) {
    throw new ApiError('Service not found', 404);
  }
  // Soft delete
  service.isActive = false;
  await service.save();
  res.json({ success: true, message: 'Service deactivated' });
});

// @desc    Get all skills
// @route   GET /api/services/skills/list
// @access  Public
const getSkills = asyncHandler(async (req, res) => {
  const skills = await Skill.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: skills });
});

module.exports = {
  getServices,
  getServiceById,
  getCategories,
  createService,
  updateService,
  deleteService,
  getSkills,
};
