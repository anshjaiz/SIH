/**
 * workerDemandAssistantService.js
 *
 * Worker-facing "AI Demand Assistant" + job-demand heatmap.
 *
 * IMPORTANT (honest-math): this is CURRENT DEMAND analytics on real bookings,
 * NOT machine-learning prediction. The scoring is a transparent, explainable
 * additive formula so a worker can understand WHY an area is shown as hot.
 *
 * Zones are fixed-size grid cells built from booking coordinates. Each zone
 * gets a demand score:
 *
 *   demandScore = recentJobWeight      (45)  -- recency-weighted requests
 *               + activeJobWeight      (35)  -- open / unassigned / in-progress
 *               + historicalJobWeight  (20)  -- recently completed jobs
 *
 * The recommended area is NOT simply the highest-score zone: distance from the
 * worker, inside/outside working radius, reachability, category relevance and
 * open-job availability all weigh in (see recommendZone()).
 */

const Booking = require('../../models/Booking');
const { haversineDistance } = require('../../utils/geoUtils');

const EARTH_RADIUS_M = 6371000;

// Statuses that represent concrete (still reachable) demand. Expired,
// cancelled and disputed jobs are deliberately ignored — they are not demand.
const EXCLUDED_STATUSES = ['CANCELLED', 'EXPIRED', 'DISPUTED', 'WORKER_NO_SHOW'];
// Jobs still waiting to be claimed (immediate opportunity for a worker).
const WAITING_STATUSES = ['REQUESTED', 'MATCHING', 'REASSIGNED'];
// Jobs already underway in the area (active supply).
const IN_PROGRESS_STATUSES = ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'];

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 14;
const CELL_SIZE_KM = 2.5;
const RECENCY_HALF_LIFE_DAYS = 2.8;
const EMERGENCY_BOOST = 1.5;

// Score weights (sum stays 100). Tune via these constants only.
const WEIGHTS = {
  recentJob: 45,
  activeJob: 35,
  historicalJob: 20,
};

const LEVELS = {
  VERY_HIGH: { min: 80, color: '#dc2626' },
  HIGH: { min: 55, color: '#f97316' },
  MEDIUM: { min: 30, color: '#eab308' },
  LOW: { min: 0, color: '#22c55e' },
};

const kmToDegLat = (km) => km / 111.32;
const kmToDegLng = (km, lat) => km / (111.32 * Math.cos((lat * Math.PI) / 180));

/**
 * Recency weight in [0,1]: a just-created booking ≈ 1, decays exponentially.
 */
const recencyWeight = (ageDays) => Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);

/**
 * Convert a { lat, lng } point + cell size into a stable zone key + cell center.
 */
const zoneOf = (lng, lat, latStep, lngStep) => {
  const ix = Math.floor(lng / lngStep);
  const iy = Math.floor(lat / latStep);
  return {
    key: `${iy}:${ix}`,
    centerLat: (iy + 0.5) * latStep,
    centerLng: (ix + 0.5) * lngStep,
  };
};

const levelFor = (score) => {
  if (score >= LEVELS.VERY_HIGH.min) return 'VERY_HIGH';
  if (score >= LEVELS.HIGH.min) return 'HIGH';
  if (score >= LEVELS.MEDIUM.min) return 'MEDIUM';
  return 'LOW';
};

/**
 * Workers' skill labels (verified only) — used to bias the recommendation
 * toward areas whose demand matches what the worker actually does.
 */
const workerSkillLabels = (worker) =>
  ((worker && worker.skills) || [])
    .filter((s) => s.verified === true && s.name)
    .map((s) => String(s.name).toLowerCase());

const categoryMatchesWorker = (categories, workerLabels) => {
  if (!workerLabels || !workerLabels.length) return true; // neutral for unknown
  return (categories || []).some((c) => {
    const cat = String(c).toLowerCase();
    return workerLabels.some((l) => cat && (l.includes(cat) || cat.includes(l)));
  });
};

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Aggregate real bookings into demand zones around the worker.
 *
 * @param {Object} worker WorkerProfile doc (uses .location + .serviceAreaRadiusKm)
 * @param {Object} opts   { days, now }
 * @returns zone summaries + metadata (no recommendation yet).
 */
const computeDemandZones = async (worker, opts = {}) => {
  const now = opts.now || new Date();
  const days = Math.min(30, Math.max(1, Number(opts.days) || DEFAULT_DAYS));
  const fromDate = new Date(now.getTime() - days * 86400000);

  const workerCoords = worker.location && Array.isArray(worker.location.coordinates)
    ? worker.location.coordinates
    : null;
  const radiusKm = Math.max(1, Number(worker.serviceAreaRadiusKm) || 15);
  // Surface demand a bit beyond the worker's own radius so they can see
  // where it's worth travelling to.
  const searchRadiusKm = Math.min(45, Math.max(Math.round(radiusKm * 2.5), 20));
  const reachableKm = Math.min(35, Math.max(Math.round(radiusKm * 2.5), 20));

  if (!workerCoords || workerCoords.length < 2) {
    return {
      zones: [],
      currentZone: null,
      workerCoords: null,
      radiusKm,
      searchRadiusKm,
      reachableKm,
      days,
      now,
    };
  }

  const [lng, lat] = workerCoords;
  const latStep = kmToDegLat(CELL_SIZE_KM);
  const lngStep = kmToDegLng(CELL_SIZE_KM, lat);

  // Only fetch bookings inside the search disc (2dsphere index in use).
  const bookings = await Booking.find({
    createdAt: { $gte: fromDate },
    status: { $nin: EXCLUDED_STATUSES },
    'location.coordinates': { $size: 2 },
    location: {
      $geoWithin: {
        $centerSphere: [[lng, lat], searchRadiusKm / (EARTH_RADIUS_M / 1000)],
      },
    },
  }).select(
    'location serviceSnapshot.category area city createdAt status isEmergency'
  ).lean();

  const zones = new Map(); // key -> aggregate

  for (const b of bookings) {
    const [blng, blat] = b.location.coordinates;
    const { key, centerLat, centerLng } = zoneOf(blng, blat, latStep, lngStep);
    const ageDays = Math.max(0, (now - new Date(b.createdAt)) / 86400000);
    const weight = recencyWeight(ageDays) * (b.isEmergency ? EMERGENCY_BOOST : 1);

    let z = zones.get(key);
    if (!z) {
      z = {
        key,
        lat: centerLat,
        lng: centerLng,
        count: 0,
        recentWeighted: 0,
        waiting: 0,
        inProgress: 0,
        completed: 0,
        categories: new Map(), // category -> weight
        areas: new Map(), // area/city label -> weight
        sumLat: 0,
        sumLng: 0,
        hasRecent3: false,
        hasPrior7: false,
      };
      zones.set(key, z);
    }

    z.count += 1;
    z.recentWeighted += weight;
    z.sumLat += blat;
    z.sumLng += blng;

    if (WAITING_STATUSES.includes(b.status)) z.waiting += 1;
    if (IN_PROGRESS_STATUSES.includes(b.status)) z.inProgress += 1;
    if (b.status === 'COMPLETED') z.completed += 1;

    const cat = b.serviceSnapshot && b.serviceSnapshot.category;
    if (cat) z.categories.set(cat, (z.categories.get(cat) || 0) + weight);

    const area = (b.area && String(b.area).trim()) || (b.city && String(b.city).trim()) || '';
    if (area) z.areas.set(area, (z.areas.get(area) || 0) + weight);

    if (ageDays <= 3) z.hasRecent3 = true;
    if (ageDays > 3 && ageDays <= 10) z.hasPrior7 = true;
  }

  if (zones.size === 0) {
    return {
      zones: [],
      currentZone: null,
      workerCoords,
      radiusKm,
      searchRadiusKm,
      reachableKm,
      days,
      now,
    };
  }

  // Normalize scoring components across zones (sqrt of the ratio so secondary
  // demand clusters still read as MEDIUM/HIGH instead of collapsing to LOW).
  const maxRecent = Math.max(...[...zones.values()].map((z) => z.recentWeighted));
  const maxOpen = Math.max(...[...zones.values()].map((z) => z.waiting + z.inProgress));
  const maxCompleted = Math.max(...[...zones.values()].map((z) => z.completed));

  const built = [];
  for (const z of zones.values()) {
    const recentN = maxRecent ? Math.sqrt(z.recentWeighted / maxRecent) : 0;
    const openN = maxOpen ? Math.sqrt((z.waiting + z.inProgress) / maxOpen) : 0;
    const doneN = maxCompleted ? Math.sqrt(z.completed / maxCompleted) : 0;
    const score = Math.round(
      WEIGHTS.recentJob * recentN + WEIGHTS.activeJob * openN + WEIGHTS.historicalJob * doneN
    );
    const centLat = z.sumLat / z.count;
    const centLng = z.sumLng / z.count;

    const topCategory = [...z.categories.entries()].sort((a, b) => b[1] - a[1])[0];
    const topArea = [...z.areas.entries()].sort((a, b) => b[1] - a[1])[0];
    const distanceKm = Math.round(haversineDistance([lng, lat], [centLng, centLat]) * 10) / 10;

    built.push({
      key: z.key,
      lat: Math.round(centLat * 100000) / 100000,
      lng: Math.round(centLng * 100000) / 100000,
      score,
      level: levelFor(score),
      recentRequests: z.count,
      recentWeighted: Math.round(z.recentWeighted * 100) / 100,
      activeJobs: z.waiting + z.inProgress,
      waitingJobs: z.waiting,
      completedJobs: z.completed,
      topCategory: topCategory ? topCategory[0] : null,
      topArea: topArea ? topArea[0] : null,
      distanceKm,
      insideRadius: distanceKm <= radiusKm,
    });
  }

  built.sort((a, b) => b.score - a.score);

  // Zone containing the worker's current grid cell.
  const workerCell = zoneOf(lng, lat, latStep, lngStep);
  const currentZone = built.find((z) => z.key === workerCell.key) || null;

  return {
    zones: built,
    currentZone,
    workerCoords,
    radiusKm,
    searchRadiusKm,
    reachableKm,
    days,
    now,
  };
};

/**
 * Pick the single most useful nearby area for THIS worker.
 *
 * This intentionally is not "highest score wins": outside-radius zones pay a
 * distance penalty, inside-radius zones are favoured, category relevance and
 * open jobs get small boosts. Areas beyond the reachable radius are ignored.
 */
const recommendZone = (zones, currentZone, worker, { radiusKm, reachableKm }) => {
  const labels = workerSkillLabels(worker);
  let best = null;
  let bestEff = -Infinity;

  for (const z of zones) {
    if (z.distanceKm > reachableKm) continue;
    if (z.score < 25) continue;

    const distPenalty =
      Math.max(0, z.distanceKm - radiusKm) / Math.max(1, reachableKm - radiusKm);
    const insideBonus = z.insideRadius ? 6 : 0;
    const categoryBonus = categoryMatchesWorker([z.topCategory], labels) ? 5 : 0;
    const openBonus = z.activeJobs > 0 ? 2 : 0;

    const eff =
      z.score + insideBonus + categoryBonus + openBonus - 30 * distPenalty;
    if (eff > bestEff) {
      bestEff = eff;
      best = { zone: z, eff, distPenalty, categoryBonus, openBonus };
    }
  }

  return best;
};

const buildRecommendationResponse = (best, worker, { radiusKm }) => {
  if (!best) return null;
  const z = best.zone;
  const label = z.topArea || `~${z.lat.toFixed(2)}, ${z.lng.toFixed(2)}`;
  const radiusWords =
    z.distanceKm <= 1
      ? 'right where you are'
      : z.insideRadius
      ? 'inside your work radius'
      : 'outside your work radius';

  const open = z.activeJobs > 0 ? `${z.activeJobs} open job(s)` : 'no open jobs right now';
  const reason = `${label}: ${z.recentRequests} recent request(s), ${open}, ${z.completedJobs} completed — ${radiusWords} at ${z.distanceKm} km.`;

  const title =
    z.insideRadius || z.distanceKm <= radiusKm * 1.2
      ? `Demand is ${z.level} in your area`
      : `High demand nearby (${z.level})`;

  return {
    title,
    reason,
    zoneKey: z.key,
    navigateTo: { lat: z.lat, lng: z.lng },
    demandLevel: z.level,
    distanceKm: z.distanceKm,
    insideRadius: z.insideRadius,
    score: z.score,
  };
};

/**
 * Optional, honest "prediction" layer.
 * Only reports a trend when the zone has data in BOTH the last 3 days and the
 * preceding 4–10 days. Explicitly labelled experimental — not ML.
 */
const buildPrediction = (zones) => {
  const candidates = zones.filter((z) => z.hasRecent3 && z.hasPrior7);
  if (!candidates.length) {
    return {
      available: false,
      note:
        'Not enough historical data yet. As requests accumulate over more days this will become a short-term trend layer (upgradeable to ML later).',
      areas: [],
    };
  }
  return {
    available: true,
    note:
      'Experimental short-term trend from recent history. This is CURRENT DEMAND analytics, not a machine-learning forecast yet.',
    areas: candidates
      .slice(0, 5)
      .map((z) => ({ key: z.key, topArea: z.topArea, level: z.level })),
  };
};

// ---------------------------------------------------------------------------
// Public entry point (used by the worker endpoint)
// ---------------------------------------------------------------------------

/**
 * Full payload for the worker dashboard assistant:
 * heatmap zones + this-worker recommendation + honest prediction layer.
 */
const getWorkerDemandAssistant = async (worker, opts = {}) => {
  const base = await computeDemandZones(worker, opts);
  const {
    zones,
    currentZone,
    workerCoords,
    radiusKm,
    searchRadiusKm,
    reachableKm,
    days,
    now,
  } = base;

  const best = recommendZone(zones, currentZone, worker, { radiusKm, reachableKm });
  const recommendation = buildRecommendationResponse(best, worker, {
    radiusKm,
    reachableKm,
  });
  const prediction = buildPrediction(zones);

  const summary = { VERY_HIGH: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  zones.forEach((z) => (summary[z.level] += 1));

  return {
    worker: {
      location: workerCoords ? { type: 'Point', coordinates: workerCoords } : null,
      radiusKm,
      city: worker.city || worker.area || '',
    },
    demandType: 'CURRENT_DEMAND',
    generatedAt: now,
    windowDays: days,
    searchRadiusKm,
    reachableKm,
    summary,
    zones,
    currentZone,
    recommendation,
    prediction,
  };
};

module.exports = {
  getWorkerDemandAssistant,
  computeDemandZones,
  recommendZone,
  levelFor,
  WEIGHTS,
};