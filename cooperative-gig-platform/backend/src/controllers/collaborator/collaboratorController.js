const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const CollaborationRequest = require('../../models/CollaborationRequest');
const WorkerAvailability = require('../../models/WorkerAvailability');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const {
  findCollaboratorCandidates,
} = require('../../services/collaborator/collaboratorMatchingService');
const teamFormationService = require('../../services/collaborator/teamFormationService');
const {
  notifyCandidates,
  notifyLeadWorker,
  notifyAcceptedConfirmation,
} = require('../../services/collaborator/collaboratorNotificationService');

const getWorkerId = async (userId) => {
  const worker = await Worker.findOne({ user: userId });
  return worker ? worker._id : null;
};

const populateUserFields = {
  path: 'user',
  select: 'name email phone avatar role',
};

// -------------------- Create --------------------

const createCollaborationRequest = asyncHandler(async (req, res) => {
  const workerId = await getWorkerId(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const { bookingId, role, requiredSkills, numberOfCollaborators, date, startTime, durationHours, address, city, estimatedPayment, instructions } = req.body;

  if (!bookingId) throw new ApiError('bookingId is required', 400);
  if (!role) throw new ApiError('Collaborator role is required', 400);
  const count = Number(numberOfCollaborators) || 1;
  if (count < 1 || count > 10) throw new ApiError('numberOfCollaborators must be between 1 and 10', 400);
  if (!date) throw new ApiError('Collaboration date is required', 400);

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);

  // Only the assigned lead worker may build a team for this job.
  const assigned = booking.worker ? booking.worker.toString() : null;
  if (!assigned || assigned !== workerId.toString()) {
    throw new ApiError('Only the lead worker assigned to this job can request collaborators', 403);
  }
  if (!['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'].includes(booking.status)) {
    throw new ApiError('Collaboration is only possible for an active job', 400);
  }

  const location = booking.location && booking.location.coordinates
    ? booking.location.coordinates
    : [78.4867, 17.385];

  const payload = {
    role,
    requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : [],
    numberOfCollaborators: count,
    date: new Date(date),
    location,
    leadWorkerId: workerId,
    excludeWorkerIds: [workerId],
  };

  const candidates = await findCollaboratorCandidates(payload, Math.max(count + 5, 10));

  const request = await CollaborationRequest.create({
    booking: booking._id,
    leadWorker: workerId,
    role,
    requiredSkills: payload.requiredSkills,
    numberOfCollaborators: count,
    date: payload.date,
    startTime: startTime || '09:00',
    durationHours: Number(durationHours) || 4,
    location: { type: 'Point', coordinates: location },
    address: address || booking.address || '',
    city: city || booking.city || 'Hyderabad',
    estimatedPayment: Number(estimatedPayment) || 0,
    instructions: instructions || '',
    status: 'OPEN',
    candidates: candidates.map((c) => ({
      worker: c.worker,
      score: c.score,
      reasons: c.reasons,
      status: 'PENDING',
    })),
  });

  notifyCandidates(request, candidates);

  res.status(201).json({
    success: true,
    message: `Matched ${candidates.length} verified worker(s) for ${role} collaboration`,
    data: { request, candidates },
  });
});

// -------------------- Read --------------------

const getCollaborationRequest = asyncHandler(async (req, res) => {
  const request = await CollaborationRequest.findById(req.params.id)
    .populate('booking')
    .populate('leadWorker', populateUserFields)
    .populate('candidates.worker', populateUserFields);

  if (!request) throw new ApiError('Collaboration request not found', 404);

  const workerId = await getWorkerId(req.user._id);
  const isLead = request.leadWorker._id.toString() === (workerId ? workerId.toString() : '');
  const isCandidate = request.candidates.some((c) => c.worker._id.toString() === (workerId ? workerId.toString() : ''));

  if (req.user.role !== 'admin' && !isLead && !isCandidate) {
    throw new ApiError('Not authorized to view this collaboration request', 403);
  }

  res.json({ success: true, data: request });
});

const getRequestsForBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const workerId = await getWorkerId(req.user._id);
  const requests = await CollaborationRequest.find({ booking: bookingId }).populate('leadWorker', populateUserFields).populate('candidates.worker', populateUserFields);
  if (req.user.role !== 'admin') {
    const mine = requests.filter(
      (r) => r.leadWorker._id.toString() === (workerId ? workerId.toString() : '')
    );
    return res.json({ success: true, data: mine });
  }
  res.json({ success: true, data: requests });
});

// Incoming collaboration opportunities for a worker
const getMyCollaborationRequests = asyncHandler(async (req, res) => {
  const workerId = await getWorkerId(req.user._id);
  if (!workerId) return res.json({ success: true, data: [] });

  const requests = await CollaborationRequest.find({
    'candidates.worker': workerId,
    status: { $in: ['OPEN'] },
  })
    .populate('booking')
    .populate('leadWorker', populateUserFields)
    .populate('candidates.worker', 'user rating ratingCount collaborationsCount')
    .sort({ createdAt: -1 });

  const enriched = await Promise.all(
    requests.map(async (r) => {
      const mySlot = (r.candidates || []).find((c) => c.worker._id.toString() === workerId.toString());
      const lead = await Worker.findById(r.leadWorker ? r.leadWorker._id : null).populate('user', 'name email phone');
      return {
        ...r.toObject(),
        myStatus: mySlot ? mySlot.status : null,
        myScore: mySlot ? mySlot.score : null,
        myReasons: mySlot ? mySlot.reasons : [],
        lead: lead,
      };
    })
  );

  res.json({ success: true, data: enriched });
});

// -------------------- Respond --------------------

const respondCollaborationRequest = asyncHandler(async (req, res) => {
  const workerId = await getWorkerId(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const { action } = req.body;
  if (!['ACCEPT', 'DECLINE'].includes(action)) {
    throw new ApiError('action must be ACCEPT or DECLINE', 400);
  }

  const request = await CollaborationRequest.findById(req.params.id);
  if (!request) throw new ApiError('Collaboration request not found', 404);
  if (request.leadWorker.toString() === workerId.toString()) {
    throw new ApiError('Lead worker cannot accept their own request', 400);
  }

  let result;
  if (action === 'ACCEPT') {
    result = await teamFormationService.acceptCollaborator(request._id, workerId);
    if (!result.ok) throw new ApiError(result.error, 400);
    const team = await teamFormationService.getTeamForRequest(request._id);
    notifyLeadWorker(result.request, `${req.user.name} accepted the ${request.role} collaboration!`, team);
    notifyAcceptedConfirmation(workerId, { requestId: request._id, role: request.role, status: 'ACCEPTED' });
    res.json({ success: true, message: result.full ? 'Team is now full!' : 'Collaboration accepted. See you on the job!', data: { request: result.request, team } });
  } else {
    result = await teamFormationService.declineCollaborator(request._id, workerId);
    if (!result.ok) throw new ApiError(result.error, 400);
    notifyLeadWorker(result.request, `${req.user.name} declined the ${request.role} collaboration.`);
    res.json({ success: true, message: 'Collaboration declined', data: { request: result.request } });
  }
});

const cancelCollaborationRequest = asyncHandler(async (req, res) => {
  const workerId = await getWorkerId(req.user._id);
  if (!workerId) throw new ApiError('Worker profile not found', 404);

  const result = await teamFormationService.cancelTeam(req.params.id, workerId);
  if (!result.ok) throw new ApiError(result.error, 400);

  res.json({ success: true, message: 'Collaboration request cancelled', data: { request: result.request } });
});

// -------------------- Team --------------------

const getJobTeam = asyncHandler(async (req, res) => {
  const bookingId = req.params.bookingId;
  if (!bookingId) throw new ApiError('bookingId is required', 400);

  const workerId = await getWorkerId(req.user._id);
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);

  if (req.user.role !== 'admin') {
    const isLead = booking.worker && booking.worker.toString() === (workerId ? workerId.toString() : '');
    if (!isLead) throw new ApiError('Only the lead worker can view this team', 403);
  }

  let team = await teamFormationService.getTeamForBooking(bookingId);
  if (!team) {
    return res.json({ success: true, data: null });
  }

  // enrich member workers + lead
  const workerDocs = await Worker.find({
    _id: { $in: team.members.map((m) => m.worker).concat([team.leadWorker]) },
  }).populate('user', 'name email phone avatar');

  const byId = (id) => workerDocs.find((w) => w._id.toString() === id.toString());
  const payload = {
    ...team.toObject(),
    lead: byId(team.leadWorker) ? { user: byId(team.leadWorker).user, rating: byId(team.leadWorker).rating } : null,
    members: team.members.map((m) => ({
      ...m.toObject(),
      workerProfile: byId(m.worker) ? { user: byId(m.worker).user, rating: byId(m.worker).rating, collaborationsCount: byId(m.worker).collaborationsCount } : null,
    })),
  };

  res.json({ success: true, data: payload });
});

// -------------------- Collaborator profile --------------------

const getCollaboratorProfile = asyncHandler(async (req, res) => {
  const workerId = req.params.workerId || (await getWorkerId(req.user._id));
  if (!workerId) throw new ApiError('Worker not found', 404);

  const worker = await Worker.findById(workerId).populate('user', 'name email phone avatar');
  if (!worker) throw new ApiError('Worker not found', 404);

  const [availability, activeJobs] = await Promise.all([
    WorkerAvailability.find({ worker: worker._id }).select('dayOfWeek startTime endTime date isAvailable availabilityType'),
    Booking.countDocuments({
      worker: worker._id,
      status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'] },
    }),
  ]);

  res.json({
    success: true,
    data: {
      workerId: worker._id,
      user: worker.user,
      rating: worker.rating,
      ratingCount: worker.ratingCount,
      completedJobs: worker.completedJobs,
      collaborationsCount: worker.collaborationsCount,
      collaborationRating: worker.collaborationRating,
      punctuality: worker.punctuality,
      reliability: worker.reliability,
      verificationStatus: worker.verificationStatus,
      skills: (worker.skills || []).map((s) => ({ name: s.name, yearsOfExperience: s.yearsOfExperience })),
      experienceYears: worker.experienceYears,
      languages: worker.languages,
      serviceAreaRadiusKm: worker.serviceAreaRadiusKm,
      location: worker.location,
      address: worker.address,
      city: worker.city,
      availability: availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, isAvailable: a.isAvailable })),
      currentWorkload: activeJobs,
    },
  });
});

module.exports = {
  createCollaborationRequest,
  getCollaborationRequest,
  getRequestsForBooking,
  getMyCollaborationRequests,
  respondCollaborationRequest,
  cancelCollaborationRequest,
  getJobTeam,
  getCollaboratorProfile,
};