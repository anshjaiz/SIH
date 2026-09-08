/**
 * aiController.js
 *
 * REST surface for the AI module (/api/ai/*).
 */

const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const demandForecast = require('../../services/ai/demandForecastService');
const workforceAllocation = require('../../services/ai/workforceAllocationService');
const workerMatching = require('../../services/ai/workerMatchingService');
const collaboratorRecommendation = require('../../services/ai/collaboratorRecommendationService');
const aiPipeline = require('../../services/ai/aiPipelineService');

// POST /api/ai/train — retrain all models + refresh forecast/records
const train = asyncHandler(async (req, res) => {
  const result = await aiPipeline.runPipeline({ quiet: false });
  res.json({ success: true, data: result });
});

// GET /api/ai/status
const status = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await aiPipeline.getStatus() });
});

// GET /api/ai/forecast
const forecast = asyncHandler(async (req, res) => {
  const { days = 3, zone, date, refresh } = req.query;
  const data = await demandForecast.getForecasts({
    refresh: refresh === 'true',
    days: Math.min(14, Math.max(1, Number(days) || 3)),
    zone,
    date,
  });
  res.json({ success: true, data });
});

// GET /api/ai/workforce?date=
const workforce = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const data = await workforceAllocation.analyzeWorkforceAllocation(date ? new Date(date) : null);
  res.json({ success: true, data });
});

// GET /api/ai/worker-ranking/:bookingId
const workerRanking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new ApiError('Booking not found', 404);
  const service = await Service.findById(booking.service).lean();
  const data = await workerMatching.rankWorkersForBooking({
    service,
    location: booking.location?.coordinates,
    requestedDate: booking.requestedDate,
    isEmergency: booking.isEmergency,
  }, { limit: 12 });
  res.json({ success: true, data: { booking: { bookingNumber: booking.bookingNumber, service: service?.name, city: booking.city, isEmergency: booking.isEmergency }, ...data } });
});

// GET /api/ai/collaborator-recommendation/:bookingId
const collaboratorRecommendationEndpoint = asyncHandler(async (req, res) => {
  const data = await collaboratorRecommendation.recommendForBooking(req.params.bookingId);
  res.json({ success: true, data });
});

// GET /api/ai/pipeline — full workflow report
const pipeline = asyncHandler(async (req, res) => {
  const s = await aiPipeline.getStatus();
  res.json({ success: true, data: s });
});

module.exports = {
  train,
  status,
  forecast,
  workforce,
  workerRanking,
  collaboratorRecommendationEndpoint,
  pipeline,
};