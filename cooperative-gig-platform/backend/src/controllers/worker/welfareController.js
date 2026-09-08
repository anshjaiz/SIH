const Welfare = require('../../models/Welfare');
const Worker = require('../../models/WorkerProfile');
const { Training, TrainingEnrollment } = require('../../models/Training');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

// Get worker welfare info
const getWelfare = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  let welfare = await Welfare.findOne({ worker: worker._id });
  if (!welfare) {
    welfare = await Welfare.create({
      worker: worker._id,
      insurance: { type: 'INACTIVE' },
    });
  }

  res.json({ success: true, data: welfare });
});

// Update welfare (admin or worker)
const updateWelfare = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const welfare = await Welfare.findOneAndUpdate(
    { worker: worker._id },
    {
      $set: {
        insurance: req.body.insurance ?? undefined,
        schemesEnrolled: req.body.schemesEnrolled ?? undefined,
        cooperativeFundBalance: req.body.cooperativeFundBalance ?? undefined,
        pensionFundBalance: req.body.pensionFundBalance ?? undefined,
        emergencyAssistanceAvailable: req.body.emergencyAssistanceAvailable ?? undefined,
        notes: req.body.notes ?? undefined,
      },
    },
    { new: true, upsert: true }
  );

  // Update worker welfare flags
  if (req.body.insurance?.type === 'ACTIVE') {
    await Worker.findByIdAndUpdate(worker._id, { insuranceActive: true });
  }

  res.json({ success: true, message: 'Welfare updated', data: welfare });
});

// Get all available training programs
const getTrainings = asyncHandler(async (req, res) => {
  const trainings = await Training.find({ isActive: true }).sort({ createdAt: -1 });
  res.json({ success: true, data: trainings });
});

// Enroll worker in training
const enrollTraining = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const { trainingId } = req.body;
  const training = await Training.findById(trainingId);
  if (!training) throw new ApiError('Training not found', 404);

  if (training.enrolledCount >= training.maxSeats) {
    throw new ApiError('Training is full', 400);
  }

  // Check if already enrolled
  const existing = await TrainingEnrollment.findOne({ training: trainingId, worker: worker._id });
  if (existing) throw new ApiError('Already enrolled in this training', 400);

  const enrollment = await TrainingEnrollment.create({
    training: trainingId,
    worker: worker._id,
    status: 'ENROLLED',
  });

  // Update count
  await Training.findByIdAndUpdate(trainingId, { $inc: { enrolledCount: 1 } });

  res.status(201).json({ success: true, message: 'Enrolled in training', data: enrollment });
});

// Get worker's enrolled trainings
const getMyTrainings = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const enrollments = await TrainingEnrollment.find({ worker: worker._id })
    .populate('training')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: enrollments });
});

module.exports = {
  getWelfare,
  updateWelfare,
  getTrainings,
  enrollTraining,
  getMyTrainings,
};
