/**
 * Smart Worker Matching Service
 *
 * Core SIH differentiator: FAIR WORK ALLOCATION
 *
 * Matching score (0-100):
 *  30% Skill Match
 *  20% Distance
 *  15% Availability
 *  15% Rating
 *  10% Experience
 *  10% Fair Workload
 *
 * The system deliberately does NOT always choose the highest-rated worker.
 * A workload fairness factor ensures sustainable, even income distribution.
 */

const Worker = require('../../models/WorkerProfile');
const Booking = require('../../models/Booking');
const WorkerAvailability = require('../../models/WorkerAvailability');
const Skill = require('../../models/Skill');
const Service = require('../../models/Service');
const Cooperative = require('../../models/Cooperative');
const Notification = require('../../models/Notification');
const { haversineDistance, estimateTravelMinutes } = require('../../utils/geoUtils');
const { getIO } = require('../../config/socket');
const {
  hasEligibleSkill,
  skillMatchPercent,
} = require('../../utils/skillUtils');

// Default weights (overridable from cooperative config)
const DEFAULT_WEIGHTS = {
  skill: 30,
  distance: 20,
  availability: 15,
  rating: 15,
  experience: 10,
  workload: 10,
};

/**
 * Mongo query fragment enforcing the STRICT skill eligibility gate at DB level.
 * A worker qualifies only when a SINGLE skill subdocument is (a) admin-verified
 * and (b) its skill _id is one of the job's required skills. No substring or
 * alias matching — stable identifiers only.
 */
const skillEligibleQuery = (service) => {
  const requiredSkillIds = (service && service.requiredSkillRefs) || [];
  if (requiredSkillIds.length === 0) return null;
  return {
    skills: { $elemMatch: { skill: { $in: requiredSkillIds }, verified: true } },
  };
};

/**
 * Required skill ids (as strings) for a service.
 */
const requiredSkillIdList = (service) =>
  ((service && service.requiredSkillRefs) || []).map(String);

/**
 * Calculate distance score (0-100)
 * Closer = higher score. Within 5km = 100, 5-20km decreasing, > 30km very low.
 */
const distanceScore = (distanceKm) => {
  if (distanceKm <= 2) return 100;
  if (distanceKm <= 5) return Math.round(100 - (distanceKm - 2) * 5); // 85-100
  if (distanceKm <= 15) return Math.round(75 - (distanceKm - 5) * 3); // 45-75
  if (distanceKm <= 30) return Math.round(45 - (distanceKm - 15) * 1.5); // 22-45
  return Math.max(5, Math.round(22 - (distanceKm - 30) * 0.6));
};

/**
 * Calculate availability score (0-100)
 */
const availabilityScore = async (worker, requestedDate) => {
  const dayOfWeek = new Date(requestedDate).getDay();

  // Find specific date availability
  const dateAvailability = await WorkerAvailability.findOne({
    worker: worker._id,
    date: requestedDate,
  });

  if (dateAvailability) {
    return dateAvailability.isAvailable ? 100 : 0;
  }

  // Check day-of-week availability
  const dayAvailability = await WorkerAvailability.find({
    worker: worker._id,
    dayOfWeek,
  });

  if (dayAvailability.length > 0) {
    // Has availability for this day
    return 100;
  }

  // Check general availability type
  if (worker.availability?.type === 'FULL_TIME') return 100;
  if (worker.availability?.type === 'PART_TIME') return 70;
  if (worker.availability?.type === 'WEEKENDS_ONLY' && (dayOfWeek === 0 || dayOfWeek === 6)) {
    return 90;
  }

  return 60; // default-unknown availability
};

/**
 * Calculate rating score (0-100)
 * Normalize rating 0-5 to 0-100
 */
const ratingScore = (rating) => {
  if (!rating) return 60; // default for new workers (neutral)
  return Math.round(Math.min((rating / 5) * 100, 100));
};

/**
 * Calculate experience score (0-100)
 */
const experienceScore = (experienceYears) => {
  if (!experienceYears) return 40;
  if (experienceYears >= 15) return 100;
  return Math.round((experienceYears / 15) * 100);
};

/**
 * Calculate workload fairness score (0-100)
 * Workers with fewer jobs this week get higher score.
 * This is the KEY FAIRNESS component.
 *
 * Options:
 *  - absoluteJobs: inverse of jobs count, normalized
 *  - loadRelative: worker's count relative to the median workload for
 *    workers in the same skill category
 */
const workloadScore = async (worker, now = new Date()) => {
  // Count this worker's active jobs this week
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

  const workerJobsThisWeek = await Booking.countDocuments({
    worker: worker._id,
    createdAt: { $gte: startOfWeek },
    status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'] },
  });

  // Compute distribution across all similar workers to normalize
  const similarWorkerSkills = worker.skills.map((s) => s.skill);
  const allWorkers = await Worker.find({
    _id: { $ne: worker._id },
    'skills.skill': { $in: similarWorkerSkills },
    isActive: true,
  }).select('_id');

  const workerIds = [worker._id, ...allWorkers.map((w) => w._id)];

  const aggregates = await Booking.aggregate([
    {
      $match: {
        worker: { $in: workerIds },
        createdAt: { $gte: startOfWeek },
        status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'] },
      },
    },
    { $group: { _id: '$worker', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Calibrate: workers with 0 jobs get highest score (~100)
  // Workers with max jobs that week get lowest (~30 least)
  const maxJobs = aggregates.length ? aggregates[0].count : Math.max(workerJobsThisWeek, 1);

  if (maxJobs <= 0) return 100;

  // Score decreases as jobs increase. Also apply gentle normalization.
  // e.g. 0 jobs = 100, 2 jobs = ~75, maxJobs = ~30
  let score = Math.round(100 - (workerJobsThisWeek / Math.max(maxJobs, 1)) * 70);
  score = Math.max(score, 20); // never entirely exclude, just de-prioritize

  return score;
};

/**
 * Calculate skill match score (0-100) based ONLY on stable skill _ids.
 * A worker needs at least one admin-verified skill whose _id is one of the
 * service's required skill refs. No substring/alias matching.
 */
const skillMatchScore = (worker, service) =>
  skillMatchPercent(worker, requiredSkillIdList(service));

/**
 * Compute full match score for a worker against a booking request
 * @returns { { score, breakdown, reasons } }
 */
const computeWorkerMatchScore = async (worker, bookingData, weights = DEFAULT_WEIGHTS) => {
  const { service, location, requestedDate, isEmergency } = bookingData;

  // --- Skill ---
  const skillScore = skillMatchScore(worker, service);
  const skillReason =
    skillScore >= 80
      ? 'Strong skill match'
      : skillScore >= 50
      ? 'Partial skill match'
      : 'Weak skill match';

  // --- Distance ---
  const distanceKm = haversineDistance(
    worker.location ? worker.location.coordinates : null,
    location
  );
  let distance = distanceScore(distanceKm);
  // Emergency jobs give higher priority to closer workers
  if (isEmergency) {
    distance += 10;
    distance = Math.min(distance, 100);
  }
  const distanceReason = `~${distanceKm.toFixed(1)} km away`;

  // --- Availability ---
  const availability = await availabilityScore(worker, requestedDate);
  const availabilityReason = availability >= 80 ? 'Available' : 'Limited availability';

  // --- Rating ---
  const rating = ratingScore(worker.rating);
  const ratingReason = worker.rating
    ? `Rated ${worker.rating.toFixed(1)} by ${worker.ratingCount} customers`
    : 'New worker, no ratings yet';

  // --- Experience ---
  const experience = experienceScore(worker.experienceYears);
  const experienceReason = `${worker.experienceYears} years of experience`;

  // --- Workload (fairness) ---
  const workload = await workloadScore(worker);
  const workloadReason =
    workload >= 80
      ? 'Low workload this week (fair allocation priority)'
      : workload >= 50
      ? 'Moderate workload this week'
      : 'High workload this week';

  // Combine normalized scores with weights
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  const w = {
    skill: weights.skill ?? DEFAULT_WEIGHTS.skill,
    distance: weights.distance ?? DEFAULT_WEIGHTS.distance,
    availability: weights.availability ?? DEFAULT_WEIGHTS.availability,
    rating: weights.rating ?? DEFAULT_WEIGHTS.rating,
    experience: weights.experience ?? DEFAULT_WEIGHTS.experience,
    workload: weights.workload ?? DEFAULT_WEIGHTS.workload,
  };

  const totalScore =
    (skillScore * w.skill +
      distance * w.distance +
      availability * w.availability +
      rating * w.rating +
      experience * w.experience +
      workload * w.workload) /
    totalWeight;

  const score = Math.round(Math.min(totalScore, 100));

  // Collect reasons for transparency (shows admin why a worker was chosen)
  const reasons = [
    skillReason,
    `${distanceReason}; ${distanceScore(distanceKm)}/100 distance score`,
    availabilityReason,
    ratingReason,
    experienceReason,
    workloadReason,
  ];

  const breakdown = {
    skill: skillScore,
    distance,
    availability,
    rating,
    experience,
    workload,
  };

  return { score, breakdown, reasons, distanceKm };
};

/**
 * Find and rank suitable workers for a booking
 * @param {Object} bookingData - { service, location, requestedDate, isEmergency, city }
 * @param {Number} limit
 */
const matchWorkersForBooking = async (bookingData, limit = 5) => {
  const { service, location, isEmergency } = bookingData;

  // Load weights from cooperative config (or defaults)
  let weights = DEFAULT_WEIGHTS;
  try {
    const coop = await Cooperative.findOne().sort({ createdAt: -1 });
    if (coop && coop.allocationWeights) {
      weights = coop.allocationWeights;
    }
  } catch (e) {
    // use defaults
  }

  // Required skill ids for this job (stable identifiers)
  const requiredSkillIds = requiredSkillIdList(service);

  // Find candidate workers
  // Location + radius gate: only workers within the service radius qualify.
  // Emergency jobs use a tighter 15 km radius.
  // Skill gate (STRICT): a worker must have a VERIFIED skill _id matching the
  // job's required skills — applied at the DB level, before any scoring.
  const skillFilter = skillEligibleQuery(service);
  const candidateWorkers = await Worker.find({
    isActive: true,
    verificationStatus: 'VERIFIED',
    // Do not match merit-suspended / under-review workers
    accountStatus: { $nin: ['TEMPORARILY_SUSPENDED', 'DEACTIVATION_REVIEW'] },
    ...(skillFilter ? skillFilter : {}),
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: location },
        $maxDistance: (isEmergency ? 15 : 30) * 1000, // meters
      },
    },
  }).limit(50);

  if (candidateWorkers.length === 0) {
    return [];
  }

  // Compute scores for all candidates
  const scored = [];
  for (const worker of candidateWorkers) {
    const result = await computeWorkerMatchScore(worker, bookingData, weights);
    // Strict skill gate (defense-in-depth — the DB filter already excluded
    // non-eligible workers).
    if (!hasEligibleSkill(worker, requiredSkillIds) || result.breakdown.skill < 30) continue;
    scored.push({
      worker: worker._id,
      score: result.score,
      breakdown: result.breakdown,
      reasons: result.reasons,
      distanceKm: result.distanceKm,
    });
  }

  // Sort by score descending; emergency jobs may add skill priority tie-break
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
};

/**
 * Re-evaluate a single worker against ALL open MATCHING bookings.
 *
 * Called when eligibility changes (skill verified/unverified, profile
 * verification status changes, skills added/removed). For each open booking:
 *   - If the worker is now eligible but NOT a candidate → re-match, insert,
 *     send NEW_JOB notification + socket event.
 *   - If the worker was a candidate but is no longer eligible → remove.
 */
const refreshWorkerEligibility = async (workerId) => {
  const worker = await Worker.findById(workerId);
  if (!worker) return { reassessed: 0, added: [], removed: [] };

  const isProfileEligible =
    worker.isActive &&
    worker.verificationStatus === 'VERIFIED' &&
    !['TEMPORARILY_SUSPENDED', 'DEACTIVATION_REVIEW'].includes(worker.accountStatus);

  const openBookings = await Booking.find({ status: 'MATCHING' });
  const added = [];
  const removed = [];

  for (const booking of openBookings) {
    const service = await Service.findById(booking.service);
    if (!service) continue;

    const requiredSkillIds = requiredSkillIdList(service);
    const wasCandidate = booking.candidateWorkers.some(
      (c) => c.worker.toString() === workerId.toString()
    );

    const isEligibleForBooking =
      isProfileEligible &&
      (requiredSkillIds.length === 0 ||
        hasEligibleSkill(worker, requiredSkillIds));

    if (isEligibleForBooking && !wasCandidate) {
      const candidates = await matchWorkersForBooking(
        {
          service,
          location: booking.location?.coordinates,
          requestedDate: booking.requestedDate,
          isEmergency: booking.isEmergency,
          city: booking.city,
        },
        booking.isEmergency ? 3 : 10
      );

      const thisWorkerResult = candidates.find(
        (c) => c.worker.toString() === workerId.toString()
      );
      if (!thisWorkerResult) continue;

      booking.candidateWorkers.push({
        worker: thisWorkerResult.worker,
        score: thisWorkerResult.score,
        reasons: thisWorkerResult.reasons,
      });
      booking.candidateWorkers.sort((a, b) => b.score - a.score);
      const cap = booking.isEmergency ? 3 : 10;
      booking.candidateWorkers = booking.candidateWorkers.slice(0, cap);
      await booking.save();

      const existingNotif = await Notification.findOne({
        user: worker.user,
        type: 'NEW_JOB',
        'data.bookingId': booking._id,
      });
      if (!existingNotif) {
        await Notification.create({
          user: worker.user,
          type: 'NEW_JOB',
          title: 'New job available',
          message: `${booking.isEmergency ? '⚠️ EMERGENCY: ' : ''}${service.name} job in your area. Match score ${thisWorkerResult.score}/100.`,
          data: { bookingId: booking._id, score: thisWorkerResult.score },
        });
      }

      const io = getIO();
      if (io) {
        io.to(`worker_${workerId}`).emit('new_job', {
          bookingId: booking._id,
          bookingNumber: booking.bookingNumber,
          serviceName: service.name,
          isEmergency: booking.isEmergency,
          score: thisWorkerResult.score,
        });
      }

      added.push({
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
      });
    } else if (!isEligibleForBooking && wasCandidate) {
      booking.candidateWorkers = booking.candidateWorkers.filter(
        (c) => c.worker.toString() !== workerId.toString()
      );
      await booking.save();
      removed.push({
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
      });
    }
  }

  return { reassessed: openBookings.length, added, removed };
};

/**
 * One-off: re-match ALL open MATCHING bookings from scratch.
 * Used to fix stale bookings where the candidate list was snapshotted
 * before skills were verified.
 */
const rematchAllOpenBookings = async () => {
  const openBookings = await Booking.find({ status: 'MATCHING' });
  let totalNewCandidates = 0;

  for (const booking of openBookings) {
    const service = await Service.findById(booking.service);
    if (!service) continue;

    const candidates = await matchWorkersForBooking(
      {
        service,
        location: booking.location?.coordinates,
        requestedDate: booking.requestedDate,
        isEmergency: booking.isEmergency,
        city: booking.city,
      },
      booking.isEmergency ? 3 : 10
    );

    const prevIds = new Set(
      booking.candidateWorkers.map((c) => c.worker.toString())
    );
    booking.candidateWorkers = candidates.map((c) => ({
      worker: c.worker,
      score: c.score,
      reasons: c.reasons,
    }));
    await booking.save();

    const newCandidates = candidates.filter(
      (c) => !prevIds.has(c.worker.toString())
    );
    if (newCandidates.length) {
      const workerIds = newCandidates.map((c) => c.worker);
      const workers = await Worker.find({ _id: { $in: workerIds } }).select(
        'user'
      );
      const userById = new Map(
        workers.map((w) => [w._id.toString(), w.user])
      );

      for (const c of newCandidates) {
        const userId = userById.get(c.worker.toString());
        if (userId) {
          const existingNotif = await Notification.findOne({
            user: userId,
            type: 'NEW_JOB',
            'data.bookingId': booking._id,
          });
          if (!existingNotif) {
            await Notification.create({
              user: userId,
              type: 'NEW_JOB',
              title: 'New job available',
              message: `${booking.isEmergency ? '⚠️ EMERGENCY: ' : ''}${service.name} job in your area. Match score ${c.score}/100.`,
              data: { bookingId: booking._id, score: c.score },
            });
          }
        }
      }

      const io = getIO();
      if (io) {
        for (const c of newCandidates) {
          io.to(`worker_${c.worker}`).emit('new_job', {
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            serviceName: service.name,
            isEmergency: booking.isEmergency,
            score: c.score,
          });
        }
      }
    }

    totalNewCandidates += newCandidates.length;
  }

  return {
    bookingsReprocessed: openBookings.length,
    newCandidatesAdded: totalNewCandidates,
  };
};

module.exports = {
  matchWorkersForBooking,
  computeWorkerMatchScore,
  skillMatchScore,
  skillEligibleQuery,
  requiredSkillIdList,
  hasEligibleSkill,
  distanceScore,
  availabilityScore,
  ratingScore,
  experienceScore,
  workloadScore,
  DEFAULT_WEIGHTS,
  refreshWorkerEligibility,
  rematchAllOpenBookings,
};
