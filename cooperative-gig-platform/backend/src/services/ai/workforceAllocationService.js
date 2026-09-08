/**
 * workforceAllocationService.js
 *
 * Combines the ML demand forecast with the current, real worker pool to
 * quantify workforce requirements:
 *   predicted demand  vs  available workers  vs  skill capacity  vs  workload
 * Produces shortages, surpluses, high-demand zones, peak periods,
 * underutilized workers and actionable recommendations.
 */

const Worker = require('../../models/WorkerProfile');
const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const DemandRecord = require('../../models/DemandRecord');
const Forecast = require('../../models/Forecast');
const demandForecast = require('./demandForecastService');

const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'];

// skill name -> service category inference (used only to bucket workers)
const CATEGORY_KEYWORDS = [
  ['Plumbing', ['plumb', 'pipe', 'sanitary', 'tap', 'water heater']],
  ['Electrical', ['electr', 'wiring', 'inverter', 'appliance', 'refrigerator', 'washing machine', 'ac ', 'air conditioner']],
  ['Carpentry', ['carpent', 'wood', 'furniture', 'cabinet']],
  ['Painting', ['paint', 'wall']],
  ['Cleaning', ['clean', 'maid', 'housekeeping', 'domestic help']],
  ['Gardening', ['garden', 'landscape']],
  ['Driving', ['driver', 'driving']],
  ['Caregiving', ['care', 'nurs', 'elderly', 'patient']],
];

const inferCategory = (skillName) => {
  const s = (skillName || '').toLowerCase();
  if (!s) return null;
  for (const [cat, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => s.includes(w))) return cat;
  }
  return 'Other community services';
};

const WORKER_CATEGORY_CACHE = {};

const categoryOfWorker = (worker) => {
  if (WORKER_CATEGORY_CACHE[worker._id.toString()]) return WORKER_CATEGORY_CACHE[worker._id.toString()];
  const cats = new Set();
  for (const sk of worker.skills || []) {
    const c = inferCategory(sk.name);
    if (c) cats.add(c);
  }
  const arr = [...cats];
  WORKER_CATEGORY_CACHE[worker._id.toString()] = arr;
  return arr;
};

const zoneName = (worker) => worker.city || worker.area || '';

/**
 * Count a worker's current weekly + active workload.
 */
const getWorkerWorkload = async (workerId) => {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const [thisWeek, activeNow] = await Promise.all([
    Booking.countDocuments({
      worker: workerId,
      createdAt: { $gte: startOfWeek },
      status: { $in: [...ACTIVE_STATUSES, 'COMPLETED'] },
    }),
    Booking.countDocuments({ worker: workerId, status: { $in: ACTIVE_STATUSES } }),
  ]);
  return { thisWeek, activeNow };
};

const zonesForWorkers = async (zone) => {
  if (!zone) return {};
  const cand = await DemandRecord.find({ zone }).sort({ date: -1 });
  if (!cand.length) return {};
  const lats = cand.map((c) => c.location?.coordinates?.[1]).filter(Boolean);
  const lngs = cand.map((c) => c.location?.coordinates?.[0]).filter(Boolean);
  if (!lats.length || !lngs.length) return {};
  return {
    lat: lats.reduce((a, b) => a + b, 0) / lats.length,
    lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
  };
};

/**
 * Main analysis: forecast vs workforce by (zone × category).
 */
const analyzeWorkforceAllocation = async (targetDate = null) => {
  const WIN = { WA: { lat: 17.384, lng: 78.4867 }, KA: { lat: 22.5726, lng: 88.3639 } };
  const date = targetDate || new Date();
  date.setHours(0, 0, 0, 0);

  // 1. Forecasts for the target date (ML if available, else statistical fallback)
  let forecasts = await Forecast.find({
    forecastDate: { $gte: date, $lt: new Date(date.getTime() + DAY) },
    type: 'SERVICE',
    modelType: 'ml',
  });
  if (!forecasts.length) {
    const fresh = await demandForecast.forecastDemand({ days: 3 });
    forecasts = fresh.filter((f) => f.forecastDate.toISOString().split('T')[0] === date.toISOString().split('T')[0]);
    if (forecasts.length) await demandForecast.persistForecasts(forecasts);
  }

  // 2. Next-7-days forecast for peak-period detection
  let weekForecasts = await Forecast.find({
    forecastDate: { $gte: date, $lt: new Date(date.getTime() + 7 * DAY) },
    type: 'SERVICE',
    modelType: 'ml',
  });
  if (!weekForecasts.length) {
    weekForecasts = await demandForecast.forecastDemand({ days: 7 });
  }

  // 3. Available verified+active workers split by zone + inferred category
  const workers = await Worker.find({ isActive: true, verificationStatus: 'VERIFIED' });
  const workersByZone = new Map(); // zone -> array
  for (const w of workers) {
    const z = zoneName(w);
    if (!z) continue;
    if (!workersByZone.has(z)) workersByZone.set(z, []);
    workersByZone.get(z).push(w);
  }

  const zones = [...new Set([...forecasts.map((f) => f.zone), ...workersByZone.keys()])];
  const analysis = [];
  const serviceCat = new Map((await Service.find({}).select('category').lean()).map((s) => [s._id.toString(), s.category]));

  const zoneCapacity = new Map(); // zone -> Set(workerId)
  for (const z of zones) {
    const ws = workersByZone.get(z) || [];
    zoneCapacity.set(z, ws);
    for (const w of ws) categoryOfWorker(w);
  }

  // (zone|category) capacities
  const capacityBy = new Map();
  for (const [z, ws] of zoneCapacity) {
    for (const w of ws) {
      for (const cat of categoryOfWorker(w)) {
        const key = `${z}|${cat}`;
        if (!capacityBy.has(key)) capacityBy.set(key, []);
        capacityBy.get(key).push(w);
      }
    }
  }

  const forecastsBy = new Map();
  for (const f of forecasts) {
    const cat = f.category || serviceCat.get(f.service?.toString()) || '';
    const key = `${f.zone}|${cat}`;
    if (!forecastsBy.has(key)) forecastsBy.set(key, { expected: 0, confidence: 0 });
    forecastsBy.get(key).expected += f.expectedRequests || 0;
    forecastsBy.get(key).confidence = (forecastsBy.get(key).confidence + (f.confidence || 0)) / 2;
  }

  const overloadedWorkers = [];
  let underutilizedWorkers = [];
  const recommendations = [];

  for (const [key, f] of forecastsBy) {
    const [z, cat] = key.split('|');
    const catWorkers = capacityBy.get(key) || [];
    const expected = f.expected;
    const capacity = catWorkers.length * WORKER_CAPACITY_PER_DAY; // jobs/day each
    const shortage = Math.max(0, Math.round(expected - capacity));
    const surplus = Math.max(0, Math.round(capacity - expected));

    analysis.push({
      zone: z,
      category: cat,
      serviceName: cat,
      expectedRequests: Math.round(expected),
      availableWorkers: catWorkers.length,
      estimatedCapacity: Math.round(capacity),
      shortage,
      surplus,
      confidence: Math.round(f.confidence),
    });

    if (shortage > 0) {
      recommendations.push({
        type: 'SHORTAGE',
        zone: z,
        category: cat,
        severity: shortage > 5 ? 'HIGH' : 'MEDIUM',
        message: `Additional ${cat.toLowerCase()} workforce required in ${z}. Predicted ${Math.round(expected)} jobs vs ${catWorkers.length} available workers (capacity ${capacity}). Shortage ${shortage}.`,
      });
    } else if (surplus > 0) {
      recommendations.push({
        type: 'SURPLUS',
        zone: z,
        category: cat,
        severity: 'LOW',
        message: `${cat} capacity exceeds predicted demand in ${z} (${surplus} spare jobs). Consider shifting workers to a high-demand zone.`,
      });
    }

    for (const w of catWorkers) {
      const wl = await getWorkerWorkload(w._id);
      if (wl.thisWeek >= 8) {
        overloadedWorkers.push({
          workerId: w._id,
          name: '(loading)',
          zone: z,
          category: cat,
          workload: wl.thisWeek,
          recommendedAction: 'Distribute future bookings to underloaded peers',
        });
      } else if (wl.thisWeek <= 1) {
        underutilizedWorkers.push({
          workerId: w._id,
          name: '(loading)',
          zone: z,
          category: cat,
          workload: wl.thisWeek,
          recommendedAction: 'Prioritize this worker for next booking',
        });
      }
    }
  }

  // dudup underutilized/overloaded
  const seenU = new Set();
  underutilizedWorkers = underutilizedWorkers.filter((u) => (seenU.has(u.workerId.toString()) ? false : (seenU.add(u.workerId.toString()), true)));

  // 4. High-demand areas + peak periods from the 7-day window
  const zoneTotals = new Map();
  const dayTotals = new Map();
  for (const f of weekForecasts) {
    const d = f.forecastDate.toISOString().split('T')[0];
    zoneTotals.set(f.zone, (zoneTotals.get(f.zone) || 0) + (f.expectedRequests || 0));
    dayTotals.set(d, (dayTotals.get(d) || 0) + (f.expectedRequests || 0));
  }
  const sortedZones = [...zoneTotals.entries()].sort((a, b) => b[1] - a[1]);
  const highDemandAreas = sortedZones.slice(0, Math.max(1, Math.ceil(sortedZones.length / 3))).map(([zone, total]) => ({ zone, total }));

  const sortedDays = [...dayTotals.entries()].sort((a, b) => b[1] - a[1]);
  const peakDay = sortedDays.length ? sortedDays[0][0] : null;
  const peakPeriod = {
    date: peakDay,
    expected: sortedDays.length ? sortedDays[0][1] : 0,
    message: peakDay ? `Highest expected demand on ${peakDay} (${sortedDays[0][1]} jobs across all services).` : '',
  };

  if (highDemandAreas.length) {
    recommendations.push({
      type: 'PRIORITY',
      severity: 'MEDIUM',
      message: `High-demand areas: ${highDemandAreas.map((h) => `${h.zone} (${h.total} predicted)`).join(', ')}. Prioritize allocation here.`,
    });
  }

  return {
    date,
    analysis,
    overloadedWorkers,
    underutilizedWorkers,
    highDemandAreas,
    peakPeriod,
    recommendations,
    generatedAt: new Date(),
  };
};

const recommendWorkerForBooking = async (bookingData) => {
  const matchingService = require('../matching/matchingService');
  return matchingService.matchWorkersForBooking(bookingData, 1);
};

const WORKER_CAPACITY_PER_DAY = 2;
const DAY = 24 * 60 * 60 * 1000;

module.exports = {
  analyzeWorkforceAllocation,
  getWorkerWorkload,
  recommendWorkerForBooking,
};