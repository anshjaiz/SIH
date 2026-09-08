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
const Cooperative = require('../../models/Cooperative');
const { haversineDistance, estimateTravelMinutes } = require('../../utils/geoUtils');

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
 * Alias mapping so related skills surface the right jobs
 * (e.g. "Electrician" counts toward Refrigerator Repair / Appliance Repair).
 * Keys are required skill names (lowercased), values are related skill words.
 */
const SKILL_ALIASES = {
  'appliance repair': ['appliance', 'refrigerator', 'fridge', 'washing machine', 'ac', 'air conditioner', 'electrician', 'electrical', 'dishwasher', 'microwave', 'oven'],
  'carpentry': ['carpenter', 'wood', 'carpentry', 'furniture', 'cabinet', 'joinery'],
  'cleaning': ['clean', 'maid', 'housekeeping', 'domestic help', 'housemaid'],
  'plumbing': ['plumber', 'plumbing', 'pipe', 'sanitary', 'water heater', 'tap'],
  'electrical': ['electrician', 'electrical', 'wiring', 'inverter', 'fan', 'switch'],
  'gardening': ['garden', 'lawn', 'landscaping', 'gardener', 'horticulture'],
  'driving': ['driver', 'driving', 'shifting', 'transport'],
  'painting': ['painter', 'paint', 'wall'],
  'caregiving': ['caregiver', 'care giving', 'nursing', 'nurse', 'elderly', 'patient'],
  'domestic help': ['clean', 'maid', 'housekeeping', 'cook', 'domestic'],
};

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Check if a worker skill (lowercased) counts toward a required skill.
 * Uses exact/substring match plus alias expansion.
 */
const skillMatches = (workerSkill, reqSkill) => {
  const ws = (workerSkill || '').toLowerCase();
  const rq = (reqSkill || '').toLowerCase();
  if (!ws) return false;
  if (ws.includes(rq) || rq.includes(ws)) return true;

  // Split both into tokens ("refrigerator repair" -> refrigerator/repair)
  const wsTokens = ws.split(/[\s,/-]+/);
  const rqTokens = rq.split(/[\s,/-]+/);
  for (const w of wsTokens) {
    if (w.length >= 3 && rqTokens.some((r) => r.length >= 3 && (r.includes(w) || w.includes(r)))) {
      return true;
    }
  }

  // Alias expansion
  const aliases = SKILL_ALIASES[rq];
  if (aliases) {
    for (const word of aliases) {
      if (word.endsWith('*')) {
        if (new RegExp(word.slice(0, -1), 'i').test(ws)) return true;
        continue;
      }
      if (ws.includes(word)) return true;
      const tokens = word.split(' ');
      for (const t of tokens) {
        if (t.length >= 3 && new RegExp(`\\b${escRe(t)}`, 'i').test(ws)) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Calculate skill match score (0-100)
 * @param {Object} worker - worker profile
 * @param {Object} service - service being requested
 */
const skillMatchScore = (worker, service) => {
  if (!service || !service.requiredSkills || service.requiredSkills.length === 0) {
    return 100; // no specific skills required, all match
  }

  const workerSkills = (worker.skills || []).map((s) => s.name || '');

  let matched = 0;
  service.requiredSkills.forEach((reqSkill) => {
    if (workerSkills.some((ws) => skillMatches(ws, reqSkill))) {
      matched++;
    }
  });

  // Also check category match
  const category = service.category || '';
  const categoryMatches = worker.skills.some((s) =>
    skillMatches(s.name || '', category)
  );

  const skillMatchPercent = (matched / service.requiredSkills.length) * 100;

  // Combine: 70% skill names, 30% category
  let score = skillMatchPercent * 0.7 + (categoryMatches ? 30 : 0);

  return Math.round(Math.min(score, 100));
};

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
    status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED', 'COMPLETED'] },
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
        status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED', 'COMPLETED'] },
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

  // Find candidate workers
  // Location + radius gate: only workers within the service radius qualify.
  // Emergency jobs use a tighter 15 km radius.
  const candidateWorkers = await Worker.find({
    isActive: true,
    verificationStatus: 'VERIFIED',
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
    // STRICT SKILL GATE: only workers whose skills match this service qualify.
    // A worker must match at least one required skill (breakdown.skill is the
    // 0-100 skill component; >=30 means at least a partial/category match).
    if (result.breakdown.skill < 30) continue;
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

module.exports = {
  matchWorkersForBooking,
  computeWorkerMatchScore,
  skillMatchScore,
  distanceScore,
  availabilityScore,
  ratingScore,
  experienceScore,
  workloadScore,
  DEFAULT_WEIGHTS,
};
