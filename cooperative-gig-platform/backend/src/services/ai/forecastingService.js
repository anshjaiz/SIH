/**
 * AI Demand Forecasting Service
 *
 * For the SIH prototype this uses a STATISTICAL approach
 * (moving average + seasonality) over historical booking data.
 *
 * The architecture is modular so a real Python ML model can be
 * swapped in later without changing the API contract.
 *
 * Currently an in-process statistical model. Future: call external
 * ML service (e.g. Python FastAPI) via HTTP.
 */

const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const DemandRecord = require('../../models/DemandRecord');
const Forecast = require('../../models/Forecast');

/**
 * Aggregate historical demand by service and date
 * @param {Date} fromDate
 * @param {Date} toDate
 */
const getHistoricalDemand = async (fromDate, toDate) => {
  const bookings = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: fromDate, $lte: toDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          service: '$service',
        },
        count: { $sum: 1 },
      },
    },
  ]);

  return bookings;
};

/**
 * Statistical model to forecast demand
 * Uses weekly moving average + day-of-week seasonality factor
 *
 * @param {Number} predictionsDays - number of days ahead
 */
const forecastDemand = async (predictionsDays = 3) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lookbackDays = 28; // 4 weeks of history
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - lookbackDays);

  const services = await Service.find({ isActive: true });

  const forecasts = [];

  for (const service of services) {
    // Get historical counts per day for this service
    const historical = await Booking.aggregate([
      {
        $match: {
          service: service._id,
          createdAt: { $gte: fromDate, $lte: new Date() },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const avgDaily = historical.length
      ? historical.reduce((sum, h) => sum + h.count, 0) / historical.length
      : 0;

    for (let dayOffset = 1; dayOffset <= predictionsDays; dayOffset++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(forecastDate.getDate() + dayOffset);

      const dayOfWeek = forecastDate.getDay();

      // Seasonality factor: weekends generally lower for household services
      const seasonalityFactors = {
        0: 0.7, // Sunday
        1: 1.1,
        2: 1.1,
        3: 1.1,
        4: 1.1,
        5: 1.2, // Saturday
        6: 1.0,
      };

      const factor = seasonalityFactors[dayOfWeek] || 1.0;
      const expected = avgDaily * (1 + (factor - 1) * 0.5);

      // Confidence based on amount of history data
      const confidence = historical.length
        ? Math.min(95, Math.round(50 + (historical.length / lookbackDays) * 45))
        : 30;

      // Trend
      let trend = 'STABLE';
      const recentAvg = historical.length
        ? historical.slice(-7).reduce((s, h) => s + h.count, 0) / Math.min(7, historical.length)
        : 0;
      if (recentAvg > avgDaily * 1.2) trend = 'UP';
      else if (recentAvg < avgDaily * 0.8) trend = 'DOWN';

      forecasts.push({
        forecastDate,
        service: service._id,
        serviceName: service.name,
        category: service.category,
        type: 'SERVICE',
        expectedRequests: Math.round(expected),
        confidence,
        historicalAverage: Math.round(avgDaily * 100) / 100,
        trend,
        modelType: 'statistical',
      });
    }
  }

  // Optionally persist forecasts
  return forecasts;
};

/**
 * Forecast demand by location/zone
 * @param {Date} forecastDate
 */
const forecastByLocation = async (forecastDate = null) => {
  const date = forecastDate || new Date();

  // Use DemandRecord + Booking aggregates to estimate demand by zone
  const zones = await Booking.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    },
    {
      $group: {
        _id: '$city',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return zones;
};

/**
 * Persist forecasts to DB
 */
const persistForecasts = async (forecasts) => {
  // Remove existing forecasts for the same dates to avoid duplicates
  const dates = [...new Set(forecasts.map((f) => f.forecastDate))];
  await Forecast.deleteMany({
    forecastDate: { $in: dates },
    type: 'SERVICE',
  });

  const docs = forecasts.map((f) => ({
    ...f,
    modelType: 'statistical',
  }));
  return Forecast.insertMany(docs);
};

/**
 * Public API method - get forecasts and optionally refresh
 */
const getForecasts = async (refresh = false) => {
  if (refresh) {
    const forecasts = await forecastDemand();
    await persistForecasts(forecasts);
  }

  const forecasts = await Forecast.find({ forecastDate: { $gte: this.today || new Date() } })
    .sort({ forecastDate: 1 })
    .limit(100);

  return forecasts;
};

module.exports = {
  forecastDemand,
  forecastByLocation,
  persistForecasts,
  getForecasts,
  getHistoricalDemand,
};
