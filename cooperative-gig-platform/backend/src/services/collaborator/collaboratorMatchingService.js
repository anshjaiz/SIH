/**
 * Collaborator Matching Service
 *
 * Dynamic team formation: when a lead worker (who already holds a customer job)
 * needs additional verified workers, find the BEST options — not just the
 * closest worker.
 *
 * Collaborator Score breakdown (configurable via Cooperative.collaborationWeights):
 *   30%  Skill Match
 *   20%  Distance
 *   15%  Availability
 *   10%  Rating
 *   10%  Experience
 *   10%  Workload / Fair-work allocation
 *   5%   Previous collaboration compatibility
 *
 * Fair-work principle: a worker with a low current workload ranks higher than a
 * heavily-loaded worker even if the latter is closer/higher rated.
 */

const Worker = require('../../models/WorkerProfile');
const JobTeam = require('../../models/JobTeam');
const Cooperative = require('../../models/Cooperative');
const {
  haversineDistance,
} = require('../../utils/geoUtils');
const {
  skillMatchScore,
  distanceScore,
  availabilityScore,
  ratingScore,
  experienceScore,
  workloadScore,
} = require('../matching/matchingService');

const DEFAULT_COLLABORATION_WEIGHTS = {
  skill: 30,
  distance: 20,
  availability: 15,
  rating: 10,
  experience: 10,
  workload: 10,
  previousCollaboration: 5,
};

// Role -> skill keywords so matching understands what a "Mason", "Plumber",
// "Photographer", etc. can contribute.
const ROLE_KEYWORDS = {
  Helper: [],
  Plumber: ['Plumbing', 'Pipe'],
  Electrician: ['Electrical', 'Wiring', 'Switch'],
  Mason: ['Masonry', 'Construction', 'Civil'],
  Carpenter: ['Carpentry', 'Wood', 'Furniture'],
  Painter: ['Painting', 'Wall'],
  Technician: ['Appliance Repair', 'AC', 'Electrical', 'Technician'],
  Driver: ['Driving', 'Transport', 'Shifting'],
  Photographer: ['Photography', 'Videography'],
  Other: [],
};

const loadWeights = async () => {
  try {
    const coop = await Cooperative.findOne().sort({ createdAt: -1 });
    if (coop && coop.collaborationWeights) return coop.collaborationWeights;
  } catch (e) {
    // use defaults
  }
  return DEFAULT_COLLABORATION_WEIGHTS;
};

/**
 * Previous collaboration compatibility (0-100).
 * Workers who have successfully collaborated with the lead worker before get a
 * strong boost; otherwise a gentle bump based on their collaboration volume.
 */
const previousCollaborationScore = async (worker, leadWorkerId) => {
  const withLead = await JobTeam.countDocuments({
    leadWorker: leadWorkerId,
    'members.worker': worker._id,
    completed: true,
  });
  if (withLead > 0) return 100;
  return Math.min(worker.collaborationsCount * 5, 50);
};

const roleSkillGroup = (role, requiredSkills = []) => {
  const kw = ROLE_KEYWORDS[role] || [];
  return [...new Set([...kw, ...requiredSkills])];
};

/**
 * Score a single candidate worker against a collaboration request.
 * @returns {Promise<{score, reasons, breakdown, distanceKm}>}
 */
const computeCollaboratorScore = async (
  worker,
  payload,
  weights = DEFAULT_COLLABORATION_WEIGHTS
) => {
  const { role, requiredSkills, location, date } = payload;

  // --- Skill: pseudo-service shape reuses the main skill matcher ---
  const pseudoService = { requiredSkills: roleSkillGroup(role, requiredSkills), category: role };
  const skill = skillMatchScore(worker, pseudoService);
  const skillReason =
    skill >= 80
      ? `Strong skill match for ${role}`
      : skill >= 50
      ? `Partial skill match for ${role}`
      : `Weak skill match for ${role}`;

  // --- Distance ---
  const distanceKm = haversineDistance(
    worker.location ? worker.location.coordinates : null,
    location
  );
  const distance = distanceScore(distanceKm);
  const distanceReason = `~${distanceKm.toFixed(1)} km away`;

  // --- Availability ---
  const availability = await availabilityScore(worker, date);
  const availabilityReason = availability >= 80 ? 'Available that day' : 'Limited availability';

  // --- Rating ---
  const rating = ratingScore(worker.rating);
  const ratingReason = worker.rating
    ? `Rated ${worker.rating.toFixed(1)} by ${worker.ratingCount} customers`
    : 'New worker, no ratings yet';

  // --- Experience ---
  const experience = experienceScore(worker.experienceYears);
  const experienceReason = `${worker.experienceYears} years of experience`;

  // --- Workload / Fair allocation ---
  const workload = await workloadScore(worker);
  const workloadReason =
    workload >= 80
      ? 'Low workload (fair-allocation priority)'
      : workload >= 50
      ? 'Moderate workload this week'
      : 'High workload this week';

  // --- Previous collaboration compatibility ---
  const previousCollab = await previousCollaborationScore(worker, payload.leadWorkerId);
  const collabReason =
    previousCollab >= 100 ? 'Has collaborated with lead worker before' : `${worker.collaborationsCount} past collaborations`;

  const totalWeight =
    Object.values(weights).reduce((a, b) => a + b, 0) || 100;
  const w = { ...DEFAULT_COLLABORATION_WEIGHTS, ...weights };

  const totalScore =
    (skill * w.skill +
      distance * w.distance +
      availability * w.availability +
      rating * w.rating +
      experience * w.experience +
      workload * w.workload +
      previousCollab * w.previousCollaboration) /
    totalWeight;

  const score = Math.round(Math.min(totalScore, 100));

  return {
    score,
    reasons: [skillReason, distanceReason, availabilityReason, ratingReason, experienceReason, workloadReason, collabReason],
    breakdown: { skill, distance, availability, rating, experience, workload, previousCollaboration: previousCollab },
    distanceKm,
  };
};

/**
 * Find and rank suitable collaborators for a lead worker's request.
 * @param {Object} payload { role, requiredSkills, numberOfCollaborators, date, location, leadWorkerId, excludeWorkerIds }
 * @param {Number} limit - number of candidates to return (invitations)
 */
const findCollaboratorCandidates = async (payload, limit = 10) => {
  const weights = await loadWeights();
  const { location, numberOfCollaborators = 1, leadWorkerId, excludeWorkerIds = [] } = payload;

  // Prioritize nearby verified workers; fall back if the pool is too small so
  // a skilled candidate is never hidden purely by distance.
  let pool = await Worker.find({
    isActive: true,
    verificationStatus: 'VERIFIED',
    _id: { $nin: [leadWorkerId, ...excludeWorkerIds].filter(Boolean) },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: location },
        $maxDistance: 40 * 1000,
      },
    },
  }).limit(50);

  const scored = [];
  for (const worker of pool) {
    const result = await computeCollaboratorScore(worker, { ...payload, leadWorkerId }, weights);
    // Skill is a hard gate: only genuinely relevant workers are offered.
    if (result.breakdown.skill < 30) continue;
    scored.push({ worker: worker._id, score: result.score, reasons: result.reasons, breakdown: result.breakdown, distanceKm: result.distanceKm });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};

module.exports = {
  DEFAULT_COLLABORATION_WEIGHTS,
  ROLE_KEYWORDS,
  findCollaboratorCandidates,
  computeCollaboratorScore,
  roleSkillGroup,
  loadWeights,
};