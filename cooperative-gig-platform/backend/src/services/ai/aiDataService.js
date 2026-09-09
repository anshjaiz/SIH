/**
 * aiDataService.js
 *
 * Feature engineering + dataset construction straight from MongoDB.
 * Every value the ML models see is derived from real stored documents.
 */

const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const Worker = require('../../models/WorkerProfile');
const Review = require('../../models/Review');
const Complaint = require('../../models/Complaint');
const CollaborationRequest = require('../../models/CollaborationRequest');
const DemandRecord = require('../../models/DemandRecord');
const matching = require('../matching/matchingService');

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const toKey = (d) => startOfDay(d).getTime();

// ---------- date/time features ----------

const dateFeatures = (date, dayIndex, maxDay) => {
  const dow = date.getDay();
  const month = date.getMonth();
  return {
    dowSin: Math.round(Math.sin((dow / 7) * 2 * Math.PI) * 1000) / 1000,
    dowCos: Math.round(Math.cos((dow / 7) * 2 * Math.PI) * 1000) / 1000,
    isWeekend: dow === 0 || dow === 6 ? 1 : 0,
    monthSin: Math.round(Math.sin((month / 12) * 2 * Math.PI) * 1000) / 1000,
    monthCos: Math.round(Math.cos((month / 12) * 2 * Math.PI) * 1000) / 1000,
    tNorm: Math.round((dayIndex / (maxDay || 1)) * 1000) / 1000,
  };
};

/**
 * Daily demand time-series per (service × zone).
 * Returns a dense matrix: for every (service, zone, day) combo that has any
 * history, produce a feature row with target = bookings that day.
 */
const buildDemandSeries = async ({ windowDays = 70 } = {}) => {
  const today = startOfDay(new Date());
  const from = new Date(today.getTime() - (windowDays - 1) * DAY);

  const [services, bookings] = await Promise.all([
    Service.find({ isActive: true }).select('name category').lean(),
    Booking.find({ createdAt: { $gte: from }, status: { $ne: 'CANCELLED' } })
      .select('service city createdAt isEmergency requestedDate')
      .lean(),
  ]);

  // (serviceId|zone) -> dayCounts Map
  const counts = new Map(); // key -> Map(dayMs -> {count, emergency})
  const zoneIndex = [];

  for (const b of bookings) {
    if (!b.city) continue;
    const zIdx = zoneIndex.indexOf(b.city);
    const z = zIdx === -1 ? zoneIndex.push(b.city) - 1 : zIdx;
    const key = `${b.service}|${z}`;
    if (!counts.has(key)) counts.set(key, new Map());
    const byDay = counts.get(key);
    const dk = toKey(b.createdAt);
    const rec = byDay.get(dk) || { count: 0, emergency: 0 };
    rec.count += 1;
    if (b.isEmergency) rec.emergency += 1;
    byDay.set(dk, rec);
  }

  const servicesIdx = services.map((s) => s._id.toString());
  const daySeq = [];
  for (let i = 0; i < windowDays; i++) daySeq.push(new Date(today.getTime() - (windowDays - 1 - i) * DAY));

  const rows = [];
  const series = {}; // key -> [{date,count}]

  const serviceIdByName = new Map(services.map((s) => [s._id.toString(), s]));

  for (const key of counts.keys()) {
    const [sid, zIdx] = key.split('|');
    const byDay = counts.get(key);
    series[key] = daySeq
      .filter((d) => byDay.has(toKey(d)))
      .map((d) => ({ date: d, count: byDay.get(toKey(d)).count }));

    // dense fill from the combo's first appearance
    const firstDay = Math.min(...[...byDay.keys()]);
    const startIdx = daySeq.findIndex((d) => d.getTime() >= firstDay);
    const start = startIdx === -1 ? 0 : startIdx;

    let prev1 = 0;
    const prev7 = [];
    for (let i = start; i < windowDays; i++) {
      const day = daySeq[i];
      const dk = toKey(day);
      const rec = byDay.get(dk) || { count: 0, emergency: 0 };
      const lag1 = i === start ? 0 : prev1;
      const lag7 = prev7.length ? prev7[prev7.length - 1] : 0;
      const rollAvg = prev7.length ? prev7.reduce((a, b) => a + b, 0) / prev7.length : 0;
      rows.push({
        serviceIdx: servicesIdx.indexOf(sid),
        zoneIdx: Number(zIdx),
        y: rec.count,
        ...dateFeatures(day, i - start, windowDays - start),
        lag1,
        lag7,
        rollAvg,
        emergLag: rec.emergency,
      });
      prev1 = rec.count;
      prev7.push(rec.count);
      if (prev7.length > 7) prev7.shift();
    }
  }

  const validRows = rows.filter((r) => r.serviceIdx !== -1);
  const svcCategories = services.filter((s) => servicesIdx.includes(s._id.toString()));

  return {
    rows: validRows,
    services: svcCategories.map((s) => ({ _id: s._id, name: s.name, category: s.category })),
    zoneIndex,
    daySeq: daySeq.map((d) => d.toISOString()),
    series,
    from,
    today,
  };
};

// ---------- & matching training set ----------

/**
 * Historical worker-outcome rows: for each assigned/completed booking, the
 * assigned worker's feature vector + label = success (completed with a good
 * outcome: >=4 rating and no linked complaint; disputed/cancelled = failure).
 */
const buildMatchingDataset = async ({
  bookings = null,
  withBookings = true,
} = {}) => {
  const source = bookings || (await Booking.find({
    worker: { $exists: true },
    status: { $in: ['COMPLETED', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'DISPUTED'] },
  }).select('worker service location requestedDate isEmergency status').lean());

  const workerIds = [...new Set(source.map((b) => b.worker))];
  const workers = await Worker.find({ _id: { $in: workerIds } }).populate('user', 'name').lean();
  const workersById = new Map(workers.map((w) => [w._id.toString(), w]));
  const serviceById = new Map((await Service.find({}).select('name category requiredSkills basePrice').lean()).map((s) => [s._id.toString(), s]));

  const reviews = await Review.find({ reviewType: 'CUSTOMER_TO_WORKER' }).select('booking worker overallQuality').lean();
  const complaints = await Complaint.find({ booking: { $in: source.map((b) => b._id) } }).select('booking status category').lean();
  const complaintBookingIds = new Set(complaints.filter((c) => !['REJECTED', 'CANCELLED'].includes(c.status)).map((c) => c.booking.toString()));
  const reviewByBooking = new Map();
  reviews.forEach((r) => {
    if (!reviewByBooking.has(r.booking.toString()) || r.overallQuality > reviewByBooking.get(r.booking.toString()).overallQuality) {
      reviewByBooking.set(r.booking.toString(), r);
    }
  });

  const rows = [];
  for (const b of source) {
    const worker = workersById.get(b.worker.toString());
    const service = serviceById.get(b.service?.toString());
    if (!worker || !service) continue;

    const result = await matching.computeWorkerMatchScore(
      { ...worker, user: undefined },
      {
        service: { requiredSkills: service.requiredSkills || [], category: service.category },
        location: b.location?.coordinates,
        requestedDate: b.requestedDate,
        isEmergency: b.isEmergency,
      }
    );

    const review = reviewByBooking.get(b._id.toString());
    const isDispute = b.status === 'DISPUTED' || complaintBookingIds.has(b._id.toString());
    const good = b.status === 'COMPLETED' && !isDispute && (!review || review.overallQuality >= 4);
    const bad = isDispute || (b.status === 'COMPLETED' && review && review.overallQuality < 3);

    const loadNorm = Math.min(1, (worker.completedJobs || 0) / 30);
    rows.push({
      workerId: worker._id,
      bookingId: b._id,
      X: [
        (result.breakdown.skill || 0) / 100,
        (result.breakdown.distance || 0) / 100,
        (result.breakdown.availability || 0) / 100,
        (result.breakdown.rating || 0) / 100,
        (result.breakdown.experience || 0) / 100,
        loadNorm,
        b.isEmergency ? 1 : 0,
        Math.min(1, (worker.collaborationsCount || 0) / 10),
      ],
      label: good ? 1 : bad ? 0 : null,
    });
  }

  const labeled = rows.filter((r) => r.label !== null);
  return {
    rows: labeled,
    X: labeled.map((r) => r.X),
    y: labeled.map((r) => r.label),
    features: ['skillMatch', 'distance', 'availability', 'rating', 'experience', 'workloadNorm', 'isEmergency', 'collabExperience'],
  };
};

// ---------- collaboration training set ----------

/**
 * Historical collaboration rows: every booking labelled by whether a
 * CollaborationRequest exists for it (TRUE positive = needed a helper).
 */
const buildCollaborationDataset = async ({ bookings = null } = {}) => {
  const source = bookings || (await Booking.find({ status: { $ne: 'CANCELLED' } })
    .select('service city isEmergency priceBreakdown requestedDate timeSlot _id').lean());

  const collab = await CollaborationRequest.find({ status: { $in: ['FILLED', 'OPEN'] } }).select('booking').lean();
  const collabBookingIds = new Set(collab.map((c) => c.booking.toString()));
  const serviceById = new Map((await Service.find({}).select('category basePrice').lean()).map((s) => [s._id.toString(), s]));

  const rows = [];
  for (const b of source) {
    const svc = serviceById.get(b.service?.toString());
    if (!svc) continue;
    const total = b.priceBreakdown?.total || svc.basePrice || 0;
    const rowsArr = rows;
    const y = collabBookingIds.has(b._id.toString()) ? 1 : 0;
    rowsArr.push({
      bookingId: b._id,
      total,
      X: [
        Math.min(1, total / 30000),
        Math.min(1, svc.basePrice / 30000),
        b.isEmergency ? 1 : 0,
        catCode(svc.category),
      ],
      y,
    });
  }

  const labeled = rows.filter((r) => r.y >= 0);
  return {
    rows: labeled,
    X: labeled.map((r) => r.X),
    y: labeled.map((r) => r.y),
    features: ['priceNorm', 'basePriceNorm', 'isEmergency', 'complexityCode'],
    observedPositiveRate: labeled.length ? labeled.filter((r) => r.y === 1).length / labeled.length : 0,
  };
};

// simple categorical complexity code (not a rule — sigmoid input only)
const CATEGORY_COMPLEXITY = {
  'Plumbing': 0.9, 'Electrical': 0.8, 'Carpentry': 0.7, 'Painting': 0.6,
  'Cleaning': 0.5, 'Gardening': 0.5, 'Appliance Repair': 0.7, 'Domestic Help': 0.4,
  'Caregiving': 0.5, 'Driving': 0.4,
};
const catCode = (cat) => CATEGORY_COMPLEXITY[cat] ?? 0.5;

// ---------- demand records (heatmap/analytics basis) ----------

const refreshDemandRecords = async ({ days = 70 } = {}) => {
  const from = new Date(startOfDay(new Date()).getTime() - (days - 1) * DAY);
  const [services, aggr] = await Promise.all([
    Service.find({}).select('name category').lean(),
    Booking.aggregate([
      { $match: { createdAt: { $gte: from }, status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            service: '$service',
            city: '$city',
          },
          requestCount: { $sum: 1 },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          emergencyCount: { $sum: { $cond: ['$isEmergency', 1, 0] } },
          revenue: { $sum: '$priceBreakdown.total' },
          lat: { $avg: '$location.coordinates.1' },
          lng: { $avg: '$location.coordinates.0' },
        },
      },
    ]),
  ]);
  const nameById = new Map(services.map((s) => [s._id.toString(), s]));

  await DemandRecord.deleteMany({ date: { $gte: from } });
  const docs = aggr
    .filter((g) => nameById.has(g._id.service?.toString()))
    .map((g) => ({
      date: new Date(`${g._id.date}T00:00:00.000Z`),
      service: g._id.service,
      serviceName: nameById.get(g._id.service.toString()).name,
      category: nameById.get(g._id.service.toString()).category,
      zone: g._id.city || 'Unknown',
      area: g._id.city || '',
      location: { type: 'Point', coordinates: [g.lng ?? 0, g.lat ?? 0] },
      requestCount: g.requestCount,
      completedCount: g.completedCount,
      emergencyCount: g.emergencyCount,
      revenue: g.revenue || 0,
    }));
  if (docs.length) await DemandRecord.insertMany(docs);
  return { records: docs.length, from };
};

module.exports = {
  buildDemandSeries,
  buildMatchingDataset,
  buildCollaborationDataset,
  refreshDemandRecords,
  dateFeatures,
  startOfDay,
  DAY,
};