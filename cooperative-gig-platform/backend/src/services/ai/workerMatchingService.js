/**
 * workerMatchingService.js
 *
 * AI-assisted worker ranking.
 * A logistic model is TRAINED on historical (booking → assigned worker → outcome)
 * records. For a new booking, every eligible worker's feature vector is scored
 * with the fitted weights and the candidates are re-ranked. When no model is
 * trained yet, the existing fair-matching score is used unchanged.
 */

const Worker = require('../../models/WorkerProfile');
const AiModel = require('../../models/AiModel');
const matching = require('../matching/matchingService');
const aiData = require('./aiDataService');
const core = require('./aiModelCore');

const MODEL_KEY = 'matching-v1';
const FEATURES = ['skillMatch', 'distance', 'availability', 'rating', 'experience', 'workloadNorm', 'isEmergency', 'collabExperience'];

const train = async () => {
  const { X, y, features } = await aiData.buildMatchingDataset();
  let model = null;
  let metrics = {};
  if (y.length >= 8 && y.some((v) => v === 1) && y.some((v) => v === 0)) {
    model = core.fitLogistic(X, y, { iters: 500, lr: 0.6, lambda: 0.02 });
    metrics = model.metrics;
    await AiModel.findOneAndUpdate(
      { key: MODEL_KEY },
      { key: MODEL_KEY, model, features, trainedAt: new Date(), samples: y.length, metrics },
      { upsert: true, new: true }
    );
  } else {
    metrics = { note: 'insufficient labeled history — using fair-matching defaults', trainSamples: y.length };
  }
  return { model: model ? 'trained' : 'insufficient-data', samples: y.length, features, metrics };
};

const loadModel = async () => (await AiModel.findOne({ key: MODEL_KEY }).lean())?.model || null;

const workerFeatures = async (worker, bookingData) => {
  const result = await matching.computeWorkerMatchScore(worker, bookingData, matching.DEFAULT_WEIGHTS);
  return {
    breakdown: result.breakdown,
    distanceKm: result.distanceKm,
    features: [
      (result.breakdown.skill || 0) / 100,
      (result.breakdown.distance || 0) / 100,
      (result.breakdown.availability || 0) / 100,
      (result.breakdown.rating || 0) / 100,
      (result.breakdown.experience || 0) / 100,
      Math.min(1, (worker.completedJobs || 0) / 30),
      bookingData.isEmergency ? 1 : 0,
      Math.min(1, (worker.collaborationsCount || 0) / 10),
    ],
  };
};

/**
 * Rank eligible workers for a booking using the learned model (blended with the
 * existing fair-match score so the SIH fairness signal stays intact).
 */
const rankWorkersForBooking = async (bookingData, { limit = 10, blend = 0.5 } = {}) => {
  const { service, location, isEmergency } = bookingData;
  const model = await loadModel();

  const candidates = await Worker.find({
    isActive: true,
    verificationStatus: 'VERIFIED',
    location: { $near: { $geometry: { type: 'Point', coordinates: location }, $maxDistance: (isEmergency ? 15 : 30) * 1000 } },
  }).populate('user', 'name phone')
    .limit(50);

  const ranked = [];
  for (const worker of candidates) {
    const { breakdown, features, distanceKm } = await workerFeatures(worker, bookingData);
    if (breakdown.skill < 30) continue; // strict skill gate

    const fairScore = Math.round(
      (breakdown.skill * 30 + breakdown.distance * 20 + breakdown.availability * 15 +
        breakdown.rating * 15 + breakdown.experience * 10 + breakdown.workload * 10) / 100
    );

    let aiScore = fairScore;
    if (model) {
      const p = core.predictLogistic(model, features);
      aiScore = Math.round(p * 100);
    }

    const score = model ? Math.round(fairScore * (1 - blend) + aiScore * blend) : fairScore;
    ranked.push({
      worker: worker._id,
      name: worker.user?.name || '',
      score,
      aiScore,
      fairScore,
      distanceKm,
      breakdown,
      learned: !!model,
      reasons: [
        `${features[0] >= 0.8 ? 'Strong skill match' : features[0] >= 0.5 ? 'Partial skill match' : 'Weak skill match'}`,
        `~${distanceKm.toFixed(1)} km away`,
        `AI success-score ${aiScore}/100`,
      ],
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return {
    model: model ? 'trained' : 'fallback-fair-matching',
    features: FEATURES,
    ranked: ranked.slice(0, limit),
  };
};

module.exports = { train, loadModel, rankWorkersForBooking };