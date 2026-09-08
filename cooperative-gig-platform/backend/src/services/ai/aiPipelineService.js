/**
 * aiPipelineService.js
 *
 * Orchestrates the full AI pipeline:
 *   Historical data → feature engineering → demand models → workforce plan →
 *   customer booking → worker matching → complexity detection →
 *   collaborator recommendation → dynamic team formation → completion → retrain.
 */

const demandForecast = require('./demandForecastService');
const workforceAllocation = require('./workforceAllocationService');
const workerMatching = require('./workerMatchingService');
const collaboratorRecommendation = require('./collaboratorRecommendationService');
const AiModel = require('../../models/AiModel');

const PIPELINE_STEPS = [
  'collect-features',
  'demand-forecast',
  'workforce-requirement',
  'worker-matching',
  'complex-job-detection',
  'collaborator-recommendation',
  'team-formation',
  'model-update',
];

let status = {
  running: false,
  lastRunAt: null,
  lastDurationMs: 0,
  steps: [],
  error: null,
  history: null,
};

/**
 * Run every trainable model + refresh persisted artifacts.
 */
const runPipeline = async ({ quiet = true } = {}) => {
  if (status.running) return { running: true };
  status.running = true;
  status.error = null;
  const started = Date.now();
  const steps = [];

  const step = (name, fn) =>
    fn().then((res) => {
      steps.push({ name, ok: true, detail: res && typeof res === 'object' ? summarize(res) : res });
    }).catch((e) => {
      steps.push({ name, ok: false, error: e.message });
      if (!quiet) throw e;
    });

  try {
    await step('collect-features', async () => {
      const d = await require('./aiDataService').refreshDemandRecords({ days: 70 });
      return { records: d.records };
    });
    await step('demand-forecast', () => demandForecast.train());
    await step('workforce-requirement', () => workforceAllocation.analyzeWorkforceAllocation().then((a) => ({
      shortages: a.analysis.filter((x) => x.shortage > 0).length,
      zones: a.highDemandAreas.length,
      recommendations: a.recommendations.length,
    })));
    await step('worker-matching', () => workerMatching.train());
    await step('complex-job-detection', () => collaboratorRecommendation.train());
    await step('collaborator-recommendation', () => collaboratorRecommendation.train());
    await step('team-formation', async () => ({ maintained: true })); // done at runtime on accept
    await step('model-update', async () => {
      const models = await AiModel.find({});
      return models.map((m) => ({ key: m.key, trainedAt: m.trainedAt, samples: m.samples }));
    });

    status.lastRunAt = new Date();
    status.lastDurationMs = Date.now() - started;
    status.steps = steps;
    status.history = { generatedAt: new Date(), steps };
  } finally {
    status.running = false;
  }
  return { success: true, steps, durationMs: status.lastDurationMs };
};

const summarize = (obj) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => typeof v !== 'object' || v === null)
      .slice(0, 8)
  );

const getStatus = async () => {
  const models = await AiModel.find({}).select('key trainedAt samples metrics features').lean();
  return {
    ...status,
    pipelineSteps: PIPELINE_STEPS,
    models: models.map((m) => ({ key: m.key, trainedAt: m.trainedAt, samples: m.samples, metrics: m.metrics })),
  };
};

let retrainTimer = null;
const scheduleRetrain = async () => {
  // new historical data (job completion) → refresh models shortly after
  if (retrainTimer) clearTimeout(retrainTimer);
  retrainTimer = setTimeout(() => runPipeline({ quiet: true }).catch(() => {}), 20000);
};

module.exports = { runPipeline, getStatus, scheduleRetrain, PIPELINE_STEPS };