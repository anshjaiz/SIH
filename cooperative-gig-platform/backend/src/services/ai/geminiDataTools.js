/**
 * geminiDataTools.js
 *
 * Tool definitions and data-fetching functions for the Gemini-powered
 * ShramikSetu AI Assistant. Each tool is a MongoDB query that Gemini
 * can call when it determines the worker's question needs platform data.
 *
 * Only the minimum relevant data is returned — never the entire database,
 * never passwords, never other workers' private data, never API keys.
 */

const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const Service = require('../../models/Service');
const Skill = require('../../models/Skill');
const Review = require('../../models/Review');
const Payment = require('../../models/Payment');
const WorkerAvailability = require('../../models/WorkerAvailability');
const WorkerReliability = require('../../models/WorkerReliability');
const { computeDemandZones } = require('./workerDemandAssistantService');
const { haversineDistance } = require('../../utils/geoUtils');

const DAY_MS = 86400000;

/* ─────────────── Gemini function declarations (schema) ─────────────── */

const toolDeclarations = [
  {
    name: 'getWorkerProfile',
    description: "Retrieve the current worker's profile including name, skills, location, working radius, rating, experience, and service areas. Call when the question references the worker's personal information, skills, or profile.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getWorkerJobHistory',
    description: "Retrieve the worker's recent and historical jobs. Returns completed, cancelled, and active jobs with service names, areas, dates, prices, and ratings. Call when the question references job history, work experience, or past jobs.",
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max jobs to return (default 20)' },
        status: { type: 'string', description: 'Filter by status: COMPLETED, CANCELLED, ACCEPTED, etc.' },
      },
      required: [],
    },
  },
  {
    name: 'getWorkerEarnings',
    description: "Retrieve the worker's earnings breakdown. Returns total, weekly, monthly, per-job averages, and payment methods. Call when the question references money, earnings, income, or payments.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getWorkerPerformance',
    description: "Retrieve the worker's performance metrics: rating, completion rate, acceptance rate, cancellation rate, punctuality, reviews summary, and reliability score. Call when the question references performance, rating, reviews, or reliability.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getNearbyDemand',
    description: "Get real job demand zones near the worker's location based on recent job requests. Returns demand levels (VERY_HIGH, HIGH, MEDIUM, LOW) for nearby areas with distances and top service categories. Call when the question asks where to go, demand by area, or location recommendations.",
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look-back window in days (default 14)' },
      },
      required: [],
    },
  },
  {
    name: 'getDemandBySkill',
    description: "Get platform-wide demand breakdown by service category. Shows which service types have most job requests and how many workers provide each. Call when the question asks about which skill or service is in demand, or skill recommendations.",
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look-back window in days (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'getAvailableJobs',
    description: "Get currently available job requests in the worker's area that match their skills. Returns job details with distance, price, and service type. Call when the worker asks about current job opportunities.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getJobDetails',
    description: "Get detailed information about a specific job by booking number or ID. Call when the worker asks about a specific job, e.g. 'should I accept BK-260910-3727?'",
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Booking number (e.g. BK-260910-3727) or MongoDB ObjectId' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'getWorkerReliability',
    description: "Get the worker's reliability score and history. Returns score (0-100), level, no-show count, late count, cancellation count, and recent events. Call when the question references reliability, dependability, or trust score.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getWorkerAvailability',
    description: "Get the worker's current availability schedule (days and time slots). Call when the question references working hours, availability, or schedule.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getDemandTrend',
    description: "Get demand trends over the past weeks — how demand changes by day of week, time slot, and recent growth. Call when the worker asks about when to work, peak times, or demand patterns.",
    parameters: {
      type: 'object',
      properties: {
        weeks: { type: 'number', description: 'Number of weeks to analyse (default 4)' },
      },
      required: [],
    },
  },
  {
    name: 'getWorkerGrowthScore',
    description: "Calculate the worker's growth score (0-100) based on rating, reliability, skill diversity, job volume, and demand coverage. Returns score, strengths, and improvement areas. Call when the worker asks about their overall standing, growth, or improvement opportunities.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

/* ─────────────── Tool handler implementations ──────────────────────── */

async function getWorkerProfile(workerId) {
  const worker = await Worker.findById(workerId)
    .populate('skills.skill', 'name category')
    .lean();

  if (!worker) return { error: 'Worker profile not found' };

  return {
    name: worker.user?.name || 'Worker',
    skills: (worker.skills || []).map((s) => ({
      name: s.skill?.name || s.name,
      category: s.skill?.category || '',
      verified: s.verified,
      experience: s.yearsOfExperience || 0,
    })),
    location: worker.location?.coordinates
      ? { lat: worker.location.coordinates[1], lng: worker.location.coordinates[0] }
      : null,
    area: worker.area || '',
    city: worker.city || '',
    address: worker.address || '',
    workingRadiusKm: worker.serviceAreaRadiusKm || 15,
    rating: worker.rating || 0,
    ratingCount: worker.ratingCount || 0,
    completedJobs: worker.completedJobs || 0,
    totalEarnings: worker.totalEarnings || 0,
    experienceYears: worker.experienceYears || 0,
    languages: worker.languages || [],
    serviceAreas: worker.serviceAreas || [],
    verificationStatus: worker.verificationStatus || 'PENDING',
    accountStatus: worker.accountStatus || 'ACTIVE',
  };
}

async function getWorkerJobHistory(workerId, { limit = 20, status } = {}) {
  const query = { worker: workerId };
  if (status) query.status = status;

  const jobs = await Booking.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50))
    .select('bookingNumber status serviceSnapshot area city requestedDate timeSlot priceBreakdown isEmergency completedAt cancelledBy cancellationReason')
    .lean();

  return {
    count: jobs.length,
    jobs: jobs.map((j) => ({
      id: j.bookingNumber,
      status: j.status,
      service: j.serviceSnapshot?.name || 'Unknown',
      category: j.serviceSnapshot?.category || '',
      area: j.area || j.city || '',
      date: j.requestedDate || j.createdAt,
      timeSlot: j.timeSlot,
      price: j.priceBreakdown?.total || 0,
      isEmergency: j.isEmergency,
      completedAt: j.completedAt,
      cancelledBy: j.cancelledBy,
    })),
  };
}

async function getWorkerEarnings(workerId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS);
  const sevenDaysAgo = new Date(now - 7 * DAY_MS);

  const [allPayments, recent30, recent7, allJobs] = await Promise.all([
    Payment.find({ worker: workerId, status: 'SUCCESS' }).sort({ paymentDate: -1 }).lean(),
    Payment.find({ worker: workerId, status: 'SUCCESS', paymentDate: { $gte: thirtyDaysAgo } }).lean(),
    Payment.find({ worker: workerId, status: 'SUCCESS', paymentDate: { $gte: sevenDaysAgo } }).lean(),
    Booking.find({ worker: workerId, status: 'COMPLETED' }).lean(),
  ]);

  const totalAllTime = allPayments.reduce((s, p) => s + (p.workerNetEarnings || 0), 0);
  const total30 = recent30.reduce((s, p) => s + (p.workerNetEarnings || 0), 0);
  const total7 = recent7.reduce((s, p) => s + (p.workerNetEarnings || 0), 0);
  const avgPerJob = allPayments.length > 0 ? Math.round(totalAllTime / allPayments.length) : 0;

  // Earnings by category
  const byCategory = {};
  for (const j of allJobs) {
    const cat = j.serviceSnapshot?.category || 'Unknown';
    byCategory[cat] = (byCategory[cat] || 0) + (j.priceBreakdown?.total || 0);
  }

  return {
    totalAllTime: Math.round(totalAllTime),
    last30Days: Math.round(total30),
    last7Days: Math.round(total7),
    averagePerJob: avgPerJob,
    totalPayments: allPayments.length,
    byCategory: Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amount]) => ({ category: cat, amount: Math.round(amount) })),
  };
}

async function getWorkerPerformance(workerId) {
  const worker = await Worker.findById(workerId).lean();
  if (!worker) return { error: 'Worker not found' };

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

  const [recentCompleted, recentCancelled, recentTotal, reviews, reliability] = await Promise.all([
    Booking.countDocuments({ worker: workerId, status: 'COMPLETED', completedAt: { $gte: thirtyDaysAgo } }),
    Booking.countDocuments({ worker: workerId, status: { $in: ['CANCELLED', 'WORKER_NO_SHOW'] }, updatedAt: { $gte: thirtyDaysAgo } }),
    Booking.countDocuments({ worker: workerId, createdAt: { $gte: thirtyDaysAgo } }),
    Review.find({ reviewee: worker.user, reviewType: 'CUSTOMER_TO_WORKER' }).sort({ createdAt: -1 }).limit(10).lean(),
    WorkerReliability.findOne({ worker: workerId }).lean(),
  ]);

  const totalCompleted = await Booking.countDocuments({ worker: workerId, status: 'COMPLETED' });
  const totalAccepted = await Booking.countDocuments({ worker: workerId, status: { $in: ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'] } });

  const avgQuality = reviews.length ? (reviews.reduce((s, r) => s + (r.overallQuality || 0), 0) / reviews.length).toFixed(1) : 0;
  const avgPunctuality = reviews.length ? (reviews.reduce((s, r) => s + (r.punctuality || 0), 0) / reviews.length).toFixed(1) : 0;
  const avgBehaviour = reviews.length ? (reviews.reduce((s, r) => s + (r.behaviour || 0), 0) / reviews.length).toFixed(1) : 0;

  return {
    overallRating: worker.rating || 0,
    ratingCount: worker.ratingCount || 0,
    totalCompleted,
    completionRate: totalAccepted > 0 ? Math.round((totalCompleted / totalAccepted) * 100) : null,
    last30Days: { completed: recentCompleted, cancelled: recentCancelled, total: recentTotal },
    averages: { quality: Number(avgQuality), punctuality: Number(avgPunctuality), behaviour: Number(avgBehaviour) },
    recentReviews: reviews.slice(0, 5).map((r) => ({
      rating: r.overallQuality,
      comment: r.comment || '',
      date: r.createdAt,
    })),
    reliability: reliability ? { score: reliability.score, level: reliability.level } : null,
  };
}

async function getNearbyDemand(workerId, { days = 14 } = {}) {
  const worker = await Worker.findById(workerId).lean();
  if (!worker?.location?.coordinates) return { error: 'Location not available' };

  const result = await computeDemandZones(worker, { days });
  const zones = (result.zones || []).slice(0, 8);

  return {
    currentZone: result.currentZone
      ? { area: result.currentZone.topArea, level: result.currentZone.level, score: result.currentZone.score }
      : null,
    nearbyZones: zones.map((z) => ({
      area: z.topArea || 'Nearby',
      level: z.level,
      score: z.score,
      distanceKm: z.distanceKm,
      recentRequests: z.recentRequests,
      topCategory: z.topCategory,
      insideRadius: z.insideRadius,
    })),
    workerRadiusKm: worker.serviceAreaRadiusKm || 15,
  };
}

async function getDemandBySkill(workerId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * DAY_MS);
  const worker = await Worker.findById(workerId).populate('skills.skill', 'name category').lean();

  const workerCategories = new Set(
    (worker?.skills || [])
      .map((s) => s.skill?.category || '')
      .filter(Boolean)
      .map((c) => c.toLowerCase())
  );

  const [demandByCategory, workerSkillCounts, skills] = await Promise.all([
    Booking.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: '$serviceSnapshot.category', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } },
      { $sort: { count: -1 } },
    ]),
    Worker.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$skills' },
      { $group: { _id: { $toLower: '$skills.name' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Skill.find({ isActive: true }).select('name category').lean(),
  ]);

  // Map skill name → category (a skill can belong to multiple categories)
  const catsBySkill = {};
  for (const sk of skills) {
    const key = (sk.name || '').toLowerCase();
    if (!key) continue;
    if (!catsBySkill[key]) catsBySkill[key] = new Set();
    if (sk.category) catsBySkill[key].add(sk.category);
  }

  // Active workers offering each category = competition / worker-to-job ratio
  const offeringByCategory = {};
  for (const row of workerSkillCounts) {
    const cats = catsBySkill[row._id] || new Set();
    for (const c of cats) {
      const key = c.toLowerCase();
      offeringByCategory[key] = (offeringByCategory[key] || 0) + row.count;
    }
  }

  const workerSkills = (worker?.skills || []).map((s) => s.skill?.name || s.name);

  const demandList = demandByCategory.map((d) => {
    const cat = (d._id || '').toLowerCase();
    const workerOffering = offeringByCategory[cat] || 0;
    const jobPerWorker = workerOffering > 0
      ? Math.round((d.count / workerOffering) * 10) / 10
      : (d.count > 0 ? d.count : 0);
    return {
      category: d._id || 'Unknown',
      jobs: d.count,
      completed: d.completed,
      workerOffering,
      jobPerWorker,
      inYourSkills: workerCategories.has(cat),
    };
  });

  return {
    windowDays: days,
    demandByCategory: demandList,
    workerSkills,
    unmetDemandCategories: demandList
      .filter((d) => !d.inYourSkills)
      .slice(0, 4)
      .map((d) => ({
        category: d.category,
        jobs: d.jobs,
        workerOffering: d.workerOffering,
        jobPerWorker: d.jobPerWorker,
      })),
  };
}

async function getAvailableJobs(workerId) {
  const worker = await Worker.findById(workerId).lean();
  if (!worker?.location?.coordinates) return { error: 'Location not available' };

  const [lng, lat] = worker.location.coordinates;
  const radiusKm = worker.serviceAreaRadiusKm || 15;
  const workerSkills = (worker.skills || []).map((s) => (s.skill?.name || s.name || '').toLowerCase());

  const candidates = await Booking.find({
    status: { $in: ['REQUESTED', 'MATCHING'] },
    location: {
      $geoWithin: {
        $centerSphere: [[lng, lat], radiusKm / 6378.1],
      },
    },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('bookingNumber serviceSnapshot area city requestedDate timeSlot priceBreakdown isEmergency location requiredSkillNames')
    .lean();

  return {
    count: candidates.length,
    jobs: candidates.map((j) => {
      const dist = worker.location?.coordinates && j.location?.coordinates
        ? Math.round(haversineDistance(worker.location.coordinates, j.location.coordinates) * 10) / 10
        : null;
      return {
        id: j.bookingNumber,
        service: j.serviceSnapshot?.name || 'Unknown',
        category: j.serviceSnapshot?.category || '',
        area: j.area || j.city || '',
        distanceKm: dist,
        price: j.priceBreakdown?.labour || j.serviceSnapshot?.basePrice || 0,
        date: j.requestedDate,
        timeSlot: j.timeSlot,
        isEmergency: j.isEmergency,
        requiredSkills: j.requiredSkillNames || [],
      };
    }),
  };
}

async function getJobDetails(workerId, { jobId } = {}) {
  if (!jobId) return { error: 'Job ID required' };

  const booking = await Booking.findOne({
    $or: [{ bookingNumber: jobId }, { _id: jobId }],
  })
    .select('bookingNumber status serviceSnapshot area city requestedDate timeSlot priceBreakdown isEmergency location requiredSkillNames description address')
    .lean();

  if (!booking) return { error: `Job "${jobId}" not found` };

  const worker = await Worker.findById(workerId).lean();
  const [lng, lat] = worker?.location?.coordinates || [];
  const dist = (lng && lat && booking.location?.coordinates)
    ? Math.round(haversineDistance([lng, lat], booking.location.coordinates) * 10) / 10
    : null;

  return {
    id: booking.bookingNumber,
    status: booking.status,
    service: booking.serviceSnapshot?.name || 'Unknown',
    category: booking.serviceSnapshot?.category || '',
    description: booking.description || '',
    area: booking.area || booking.city || '',
    address: booking.address || '',
    date: booking.requestedDate,
    timeSlot: booking.timeSlot,
    price: booking.priceBreakdown?.total || 0,
    labour: booking.priceBreakdown?.labour || 0,
    isEmergency: booking.isEmergency,
    requiredSkills: booking.requiredSkillNames || [],
    distanceKm: dist,
  };
}

async function getWorkerReliability(workerId) {
  const rel = await WorkerReliability.findOne({ worker: workerId }).lean();
  if (!rel) return { score: 100, level: 'GOOD', note: 'No reliability events recorded yet' };

  return {
    score: rel.score,
    level: rel.level,
    noShowCount: rel.noShowCount || 0,
    lateCount: rel.lateCount || 0,
    cancelledAfterAcceptCount: rel.cancelledAfterAcceptCount || 0,
    completedCount: rel.completedCount || 0,
    onTimeCount: rel.onTimeCount || 0,
  };
}

async function getWorkerAvailability(workerId) {
  const availability = await WorkerAvailability.find({ worker: workerId }).lean();
  if (!availability.length) return { note: 'No availability schedule set' };

  const schedule = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const a of availability) {
    const day = dayNames[a.dayOfWeek] || `Day ${a.dayOfWeek}`;
    schedule[day] = {
      available: a.isAvailable,
      startTime: a.startTime || '',
      endTime: a.endTime || '',
      type: a.availabilityType || 'UNSPECIFIED',
    };
  }

  return { schedule };
}

async function getDemandTrend(workerId, { weeks = 4 } = {}) {
  const since = new Date(Date.now() - weeks * 7 * DAY_MS);
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const [byDayOfWeek, byTimeSlot, byWeek] = await Promise.all([
    Booking.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: { $dayOfWeek: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: '$timeSlot', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: { $isoWeek: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    byDayOfWeek: byDayOfWeek.map((d) => ({ day: DAY_NAMES[d._id - 1] || `Day${d._id}`, jobs: d.count })),
    byTimeSlot: byTimeSlot.map((d) => ({ slot: d._id || 'Flexible', jobs: d.count })),
    weekTrend: byWeek.map((w) => ({ week: w._id, jobs: w.count })),
  };
}

async function getWorkerGrowthScore(workerId) {
  const worker = await Worker.findById(workerId).lean();
  if (!worker) return { error: 'Worker not found' };

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

  const [totalJobs30d, totalJobsAll, reviews, reliability] = await Promise.all([
    Booking.countDocuments({ worker: workerId, createdAt: { $gte: thirtyDaysAgo } }),
    Booking.countDocuments({ worker: workerId }),
    Review.find({ reviewee: worker.user, reviewType: 'CUSTOMER_TO_WORKER' }).lean(),
    WorkerReliability.findOne({ worker: workerId }).lean(),
  ]);

  // Score components (each 0-100)
  const ratingScore = Math.min(100, ((worker.rating || 0) / 5) * 100);
  const reliabilityScore = reliability?.score ?? 100;
  const skillDiversity = Math.min(100, (worker.skills?.length || 0) * 15);
  const jobVolume = Math.min(100, totalJobsAll * 3);
  const recentActivity = Math.min(100, totalJobs30d * 10);

  const score = Math.round(
    ratingScore * 0.3 +
    reliabilityScore * 0.25 +
    skillDiversity * 0.15 +
    jobVolume * 0.15 +
    recentActivity * 0.15
  );

  const strengths = [];
  const opportunities = [];
  if (ratingScore >= 75) strengths.push('Customer rating');
  else opportunities.push('Improve customer rating');
  if (reliabilityScore >= 80) strengths.push('Reliability');
  else opportunities.push('Improve reliability score');
  if (skillDiversity >= 60) strengths.push('Skill diversity');
  else opportunities.push('Learn new skills');
  if (recentActivity >= 50) strengths.push('Recent activity');
  else opportunities.push('Take on more jobs recently');

  return {
    score: Math.min(100, Math.max(0, score)),
    components: { rating: Math.round(ratingScore), reliability: Math.round(reliabilityScore), skillDiversity: Math.round(skillDiversity), jobVolume: Math.round(jobVolume), recentActivity: Math.round(recentActivity) },
    strengths,
    opportunities,
    totalJobs: totalJobsAll,
    recentJobs: totalJobs30d,
    skills: worker.skills?.length || 0,
  };
}

/* ─────────────── Tool dispatch map ─────────────────────────────────── */

const toolHandlers = {
  getWorkerProfile: (args, wid) => getWorkerProfile(wid),
  getWorkerJobHistory: (args, wid) => getWorkerJobHistory(wid, args),
  getWorkerEarnings: (args, wid) => getWorkerEarnings(wid),
  getWorkerPerformance: (args, wid) => getWorkerPerformance(wid),
  getNearbyDemand: (args, wid) => getNearbyDemand(wid, args),
  getDemandBySkill: (args, wid) => getDemandBySkill(wid, args),
  getAvailableJobs: (args, wid) => getAvailableJobs(wid),
  getJobDetails: (args, wid) => getJobDetails(wid, args),
  getWorkerReliability: (args, wid) => getWorkerReliability(wid),
  getWorkerAvailability: (args, wid) => getWorkerAvailability(wid),
  getDemandTrend: (args, wid) => getDemandTrend(wid, args),
  getWorkerGrowthScore: (args, wid) => getWorkerGrowthScore(wid),
};

module.exports = { toolDeclarations, toolHandlers };