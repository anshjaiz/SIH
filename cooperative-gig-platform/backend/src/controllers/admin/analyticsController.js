const DemandRecord = require('../../models/DemandRecord');
const Booking = require('../../models/Booking');
const Forecast = require('../../models/Forecast');
const Worker = require('../../models/WorkerProfile');
const Service = require('../../models/Service');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const forecastingService = require('../../services/ai/forecastingService');
const allocationService = require('../../services/ai/allocationService');

// Get forecast for specified dates
const getForecasts = asyncHandler(async (req, res) => {
  const { date, refresh } = req.query;

  let forecasts;
  if (refresh === 'true') {
    // Generate fresh forecasts
    const newForecasts = await forecastingService.forecastDemand(3);
    await forecastingService.persistForecasts(newForecasts);
  }

  const query = {};
  if (date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    query.forecastDate = {
      $gte: d,
      $lt: new Date(d.getTime() + 24 * 60 * 60 * 1000),
    };
  } else {
    query.forecastDate = { $gte: new Date() };
  }

  forecasts = await Forecast.find(query).sort({ forecastDate: 1, expectedRequests: -1 });

  res.json({ success: true, data: forecasts });
});

// Get workforce allocation analysis
const getWorkforceAllocation = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const result = await allocationService.analyzeWorkforceAllocation(
    date ? new Date(date) : null
  );
  res.json({ success: true, data: result });
});

// Get demand records / heatmap data
const getDemandData = asyncHandler(async (req, res) => {
  const { days = 7, category, zone } = req.query;

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - Number(days));

  const query = { date: { $gte: fromDate } };
  if (category) query.category = category;
  if (zone) query.zone = zone;

  const records = await DemandRecord.find(query).sort({ date: -1 });

  // If no demand records exist, derive from bookings
  if (!records.length) {
    // Aggregate bookings into demand records on the fly
    const bookings = await Booking.aggregate([
      {
        $match: { createdAt: { $gte: fromDate } },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            category: '$serviceSnapshot.category',
            city: '$city',
            area: '$area',
          },
          count: { $sum: 1 },
          emergencyCount: {
            $sum: { $cond: ['$isEmergency', 1, 0] },
          },
          revenue: { $sum: '$priceBreakdown.total' },
        },
      },
    ]);

    return res.json({ success: true, data: bookings, derived: true });
  }

  res.json({ success: true, data: records });
});

// Get demand heatmap points
const getDemandHeatmap = asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - Number(days));

  // Get bookings with locations
  const bookings = await Booking.find({
    createdAt: { $gte: fromDate },
    'location.coordinates': { $exists: true },
  }).select('location serviceSnapshot.category isEmergency createdAt');

  // Aggregate points by proximity and intensity
  const points = bookings.map((b) => ({
    lat: b.location.coordinates[1],
    lng: b.location.coordinates[0],
    category: b.serviceSnapshot.category,
    isEmergency: b.isEmergency,
    count: 1,
    intensity: b.isEmergency ? 5 : 1, // emergency = high intensity
  }));

  res.json({ success: true, data: points });
});

// Get analytics data (for charts)
const getAnalytics = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - Number(days));

  // Revenue over time
  const revenueOverTime = await Booking.aggregate([
    { $match: { createdAt: { $gte: fromDate }, status: 'COMPLETED' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        revenue: { $sum: '$priceBreakdown.total' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Demand by service
  const demandByService = await Booking.aggregate([
    { $match: { createdAt: { $gte: fromDate } } },
    { $group: { _id: '$serviceSnapshot.category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Worker workload distribution
  const activeWorkers = await Worker.find({ isActive: true, verificationStatus: 'VERIFIED' }).select('_id');
  const workloads = [];
  for (const w of activeWorkers.slice(0, 50)) {
    const wl = await allocationService.getWorkerWorkload(w._id);
    workloads.push(wl.thisWeek);
  }

  // Complaints by category
  const complaintsByCategory = await require('../../models/Complaint').aggregate([
    { $match: { createdAt: { $gte: fromDate } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  // Customer satisfaction trend
  const satisfactionTrend = await require('../../models/Review').aggregate([
    { $match: { reviewType: 'CUSTOMER_TO_WORKER', createdAt: { $gte: fromDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        avg: { $avg: '$overallQuality' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      revenueOverTime,
      demandByService,
      workloadDistribution: workloads,
      complaintsByCategory,
      satisfactionTrend,
    },
  });
});

module.exports = {
  getForecasts,
  getWorkforceAllocation,
  getDemandData,
  getDemandHeatmap,
  getAnalytics,
};
