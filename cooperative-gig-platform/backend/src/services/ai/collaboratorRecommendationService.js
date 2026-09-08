/**
 * collaboratorRecommendationService.js
 *
 * Learns from historical jobs whether a job is likely to need additional
 * helpers, then — when recommended — ranks suitable verified workers.
 *
 *   train()   logistic model P(needs-collaborator | price, category, emergency, …)
 *   recommend()  → { probability, recommended, nCollaborators, suggestedWorkers[] }
 */

const Booking = require('../../models/Booking');
const Worker = require('../../models/WorkerProfile');
const Service = require('../../models/Service');
const AiModel = require('../../models/AiModel');
const CollaborationRequest = require('../../models/CollaborationRequest');
const aiData = require('./aiDataService');
const core = require('./aiModelCore');
const collaboratorMatching = require('../collaborator/collaboratorMatchingService');

const MODEL_KEY = 'collaboration-v1';
const FEATURES = ['priceNorm', 'basePriceNorm', 'isEmergency', 'complexityCode'];

const train = async () => {
  const { X, y, features, observedPositiveRate } = await aiData.buildCollaborationDataset();
  let model = null;
  let metrics = {};
  if (y.length >= 8 && y.some((v) => v === 1) && y.some((v) => v === 0)) {
    model = core.fitLogistic(X, y, { iters: 600, lr: 0.6, lambda: 0.03 });
    metrics = model.metrics;
    await AiModel.findOneAndUpdate(
      { key: MODEL_KEY },
      {
        key: MODEL_KEY,
        model,
        features,
        trainedAt: new Date(),
        samples: y.length,
        metrics,
        metadata: { observedPositiveRate },
      },
      { upsert: true, new: true }
    );
  } else {
    metrics = { note: 'insufficient labeled history', trainSamples: y.length, observedPositiveRate };
  }
  return { model: model ? 'trained' : 'insufficient-data', samples: y.length, features, metrics, observedPositiveRate };
};

const loadModel = async () => (await AiModel.findOne({ key: MODEL_KEY }).lean())?.model || null;

const bookingFeatures = (booking, service) => {
  const total = booking.priceBreakdown?.total || service?.basePrice || 0;
  return [
    Math.min(1, total / 30000),
    Math.min(1, (service?.basePrice || 0) / 30000),
    booking.isEmergency ? 1 : 0,
    collabCatCode(service?.category),
  ];
};

// same complexity mapping as aiDataService
const collabCatCode = (cat) => {
  const m = {
    'Plumbing': 0.9, 'Electrical': 0.8, 'Carpentry': 0.7, 'Painting': 0.6,
    'Cleaning': 0.5, 'Gardening': 0.5, 'Appliance Repair': 0.7, 'Domestic Help': 0.4,
    'Caregiving': 0.5, 'Driving': 0.4,
  };
  return m[cat] ?? 0.5;
};

/**
 * Historical positive rate for a category (transparency for the UI).
 */
const observeCategoryRate = async (category) => {
  if (!category) return null;
  const source = await Booking.find({ status: { $ne: 'CANCELLED' } }).select('service').lean();
  const collab = await CollaborationRequest.find({}).select('booking').lean();
  const collabIds = new Set(collab.map((c) => c.booking.toString()));
  const svcIds = source.map((b) => b.service?.toString());
  const withCat = (await Service.find({ _id: { $in: svcIds } }).select('category').lean())
    .filter((s) => s.category === category).map((s) => s._id.toString());
  const subset = source.filter((b) => withCat.includes(b.service?.toString()));
  if (!subset.length) return null;
  return subset.filter((b) => collabIds.has(b._id.toString())).length / subset.length;
};

const suggestHelpers = async (booking, service, n) => {
  const candidates = await collaboratorMatching.findCollaboratorCandidates({
    requiredSkills: service?.requiredSkills || [],
    location: booking.location?.coordinates,
    requestedDate: booking.requestedDate,
  }, 20);
  const pool = (candidates || []).slice(0, n);
  const ids = pool.map((c) => c.worker);
  const workers = await Worker.find({ _id: { $in: ids } }).populate('user', 'name phone').select('_id user rating collaborationsCount');
  const byId = new Map(workers.map((w) => [w._id.toString(), w]));
  return pool.map((c) => {
    const w = byId.get(c.worker.toString());
    return {
      worker: c.worker,
      name: w?.user?.name || 'Worker',
      score: c.score,
      reasons: c.reasons || [],
      distanceKm: c.distanceKm,
      rating: w?.rating || 0,
      collaborationsCount: w?.collaborationsCount || 0,
    };
  });
};

/**
 * Recommend a collaboration for a booking.
 */
const recommendForBooking = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new Error('Booking not found');
  const svcDoc = await Service.findById(booking.service).lean();
  const model = await loadModel();
  const X = bookingFeatures(booking, svcDoc);
  let probability = model ? core.predictLogistic(model, X) : 0;
  if (!model) {
    // data-driven base rate from stored history (no hardcoded rule)
    const { observedPositiveRate } = (await AiModel.findOne({ key: MODEL_KEY }).lean())?.metadata || {};
    probability = observedPositiveRate ?? 0;
  }

  const recommended = probability >= 0.5;
  const nCollaborators = recommended ? Math.max(1, Math.min(3, Math.round(probability * 3))) : 0;
  const basis = [];
  if (model) {
    basis.push(`Learned model from ${(await AiModel.findOne({ key: MODEL_KEY }))?.samples || 0} historical jobs.`);
  }
  const catRate = await observeCategoryRate(svcDoc?.category);
  if (catRate != null) basis.push(`${Math.round(catRate * 100)}% of similar historical ${svcDoc?.category} jobs needed an extra helper.`);

  let suggestedWorkers = [];
  if (recommended && nCollaborators > 0) {
    suggestedWorkers = await suggestHelpers(booking, svcDoc, nCollaborators);
  }

  return {
    bookingId,
    service: svcDoc?.name,
    category: svcDoc?.category,
    probability: Math.round(probability * 100),
    recommended,
    nCollaborators,
    basis,
    suggestedWorkers,
  };
};

module.exports = { train, loadModel, recommendForBooking };