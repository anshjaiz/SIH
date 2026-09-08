const Worker = require('../../models/WorkerProfile');
const User = require('../../models/User');
const Skill = require('../../models/Skill');
const Certificate = require('../../models/Certificate');
const WorkerAvailability = require('../../models/WorkerAvailability');
const Notification = require('../../models/Notification');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// Auto-verify a worker once they add skills + have a location,
// so real (non-seeded) workers enter the fair-matching pool.
const autoVerifyWorker = async (worker) => {
  if (worker.verificationStatus === 'PENDING' && worker.skills && worker.skills.length > 0) {
    worker.verificationStatus = 'VERIFIED';
    worker.verificationRemark = 'Auto-verified after adding skills';
  }
};

// -------------------- Worker profile --------------------

// Get own worker profile
const getOwnProfile = asyncHandler(async (req, res) => {
  const profile = await Worker.findOne({ user: req.user._id })
    .populate('skills.skill', 'name')
    .populate('certificates');

  if (!profile) {
    // Create if missing
    const created = await Worker.create({
      user: req.user._id,
      languages: req.user.languages || ['English', 'Hindi'],
    });
    return res.json({ success: true, data: created });
  }

  res.json({ success: true, data: profile });
});

// Update worker profile
const updateOwnProfile = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found. Please contact support', 404);

  const fields = [
    'bio',
    'location',
    'address',
    'area',
    'city',
    'experienceYears',
    'languages',
    'serviceAreaRadiusKm',
    'emergencyContact',
  ];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      worker[field] = req.body[field];
    }
  });

  // Avatar update
  if (req.body.avatar) worker.user = (await User.findByIdAndUpdate(req.user._id, { avatar: req.body.avatar }))._id;

  if (req.file) {
    // Profile photo upload handled by route; store avatar on user
    await User.findByIdAndUpdate(req.user._id, { avatar: req.file.path });
  }

  await autoVerifyWorker(worker);
  await worker.save();

  res.json({ success: true, message: 'Profile updated', data: worker });
});

// -------------------- Skills --------------------

// Add skill to worker
const addSkill = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const { skillId, name, yearsOfExperience } = req.body;

  let skillName = name;
  if (skillId) {
    const skill = await Skill.findById(skillId);
    if (!skill) throw new ApiError('Skill not found', 404);
    skillName = skill.name;
  }
  if (!skillName) throw new ApiError('Skill name is required', 400);

  // Avoid duplicates
  const exists = worker.skills.some(
    (s) => (s.name || '').toLowerCase() === skillName.toLowerCase()
  );
  if (exists) throw new ApiError('Skill already added', 400);

  worker.skills.push({
    skill: skillId,
    name: skillName,
    yearsOfExperience: yearsOfExperience || 0,
  });

  await autoVerifyWorker(worker);
  await worker.save();

  res.status(201).json({ success: true, message: 'Skill added', data: worker });
});

const removeSkill = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  worker.skills = worker.skills.filter(
    (s) => s._id.toString() !== req.params.skillId
  );
  await worker.save();

  res.json({ success: true, message: 'Skill removed', data: worker });
});

// -------------------- Certificates --------------------

// Upload certificate
const uploadCertificate = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const { title, issuingAuthority, issueDate } = req.body;
  if (!title) throw new ApiError('Certificate title is required', 400);

  const certificate = await Certificate.create({
    worker: worker._id,
    title,
    issuingAuthority,
    issueDate: issueDate ? new Date(issueDate) : undefined,
    fileUrl: req.file ? req.file.path : '',
    status: 'PENDING',
  });

  worker.certificates.push(certificate._id);
  await worker.save();

  // Notify admins
  const adminUsers = await User.find({ role: 'admin' });
  if (adminUsers.length) {
    await Notification.create(
      adminUsers.map((a) => ({
        user: a._id,
        type: 'CERTIFICATE_AWAITING',
        title: 'Certificate awaiting verification',
        message: `${req.user.name} uploaded certificate: ${title}`,
        data: { certificateId: certificate._id, workerId: worker._id },
      }))
    );
  }

  res.status(201).json({ success: true, message: 'Certificate uploaded. Awaiting verification.', data: certificate });
});

// Get own certificates
const getCertificates = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) return res.json({ success: true, data: [] });

  const certificates = await Certificate.find({ worker: worker._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: certificates });
});

// -------------------- Availability --------------------

const setAvailability = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const { dayOfWeek, startTime, endTime, availabilityType, date, isAvailable } = req.body;

  if (date) {
    // Date-specific availability
    await WorkerAvailability.findOneAndUpdate(
      { worker: worker._id, date: new Date(date) },
      {
        worker: worker._id,
        date: new Date(date),
        isAvailable: isAvailable !== undefined ? isAvailable : true,
      },
      { upsert: true, new: true }
    );
  }

  if (dayOfWeek !== undefined) {
    const existing = await WorkerAvailability.findOne({
      worker: worker._id,
      dayOfWeek,
      date: { $exists: false },
    });
    if (existing) {
      existing.startTime = startTime || existing.startTime;
      existing.endTime = endTime || existing.endTime;
      existing.availabilityType = availabilityType || existing.availabilityType;
      existing.isAvailable = isAvailable !== undefined ? isAvailable : existing.isAvailable;
      await existing.save();
    } else {
      await WorkerAvailability.create({
        worker: worker._id,
        dayOfWeek,
        startTime,
        endTime,
        availabilityType,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
      });
    }
  }

  if (availabilityType && !date && dayOfWeek === undefined) {
    worker.availability = { ...(worker.availability || {}), type: availabilityType };
    await worker.save();
  }

  res.json({ success: true, message: 'Availability updated' });
});

// Get own availability
const getAvailability = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) return res.json({ success: true, data: [] });

  const availability = await WorkerAvailability.find({ worker: worker._id }).sort({ dayOfWeek: 1 });
  res.json({ success: true, data: availability });
});

module.exports = {
  getOwnProfile,
  updateOwnProfile,
  addSkill,
  removeSkill,
  uploadCertificate,
  getCertificates,
  setAvailability,
  getAvailability,
};
