const Worker = require('../../models/WorkerProfile');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const { getWorkerDemandAssistant } = require('../../services/ai/workerDemandAssistantService');

// GET /api/workers/demand/assistant
// Worker dashboard: real job-demand heatmap zones + AI demand assistant reply.
const getDemandAssistant = asyncHandler(async (req, res) => {
  const worker = await Worker.findOne({ user: req.user._id });
  if (!worker) throw new ApiError('Worker profile not found', 404);

  const days = Number(req.query.days) || undefined;
  const data = await getWorkerDemandAssistant(worker, { days });

  res.json({ success: true, data });
});

module.exports = { getDemandAssistant };