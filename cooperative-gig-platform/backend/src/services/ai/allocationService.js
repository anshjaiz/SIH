/**
 * AI Workforce Allocation Service
 *
 * Uses demand forecasts + current worker availability to recommend
 * optimal worker allocation across zones/skills.
 *
 * Goals:
 *  - Identify skill shortages
 *  - Identify areas with insufficient workers
 *  - Identify overloaded workers
 *  - Identify underutilized workers
 *  - Recommend reallocation / job assignment
 */

const Worker = require('../../models/WorkerProfile');
const Booking = require('../../models/Booking');
const Service = require('../../models/Service');
const Forecast = require('../../models/Forecast');
const { haversineDistance } = require('../../utils/geoUtils');

/**
 * Count worker's current active workload
 */
const getWorkerWorkload = async (workerId) => {
  const activeStatuses = ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'];
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const [thisWeek, activeNow] = await Promise.all([
    Booking.countDocuments({
      worker: workerId,
      createdAt: { $gte: startOfWeek },
      status: { $in: [...activeStatuses, 'COMPLETED'] },
    }),
    Booking.countDocuments({
      worker: workerId,
      status: { $in: activeStatuses },
      // only jobs in near future
      requestedDate: { $gte: new Date() },
    }),
  ]);

  return { thisWeek, activeNow };
};

/**
 * Analyze the workforce vs forecasted demand
 * @returns {Object} Analysis with shortages, overloads, recommendations
 */
const analyzeWorkforceAllocation = async (targetDate = null) => {
  const date = targetDate || new Date();
  date.setHours(0, 0, 0, 0);

  // 1. Get forecasts for the date
  const forecasts = await Forecast.find({
    forecastDate: {
      $gte: date,
      $lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
    },
    type: 'SERVICE',
  });

  // 2. Get all active verified workers with their skills
  const workers = await Worker.find({
    isActive: true,
    verificationStatus: 'VERIFIED',
  });

  // Group workers by skills/categories
  const workersByCategory = {};

  // Helper: determine which services a worker can do
  workers.forEach((worker) => {
    const workerSkills = worker.skills.map((s) => (s.name || '').toLowerCase());
    // For each category the worker could serve
    const categories = new Set([
      ...workerSkills.map((s) => {
        // Map skill keywords to categories roughly
        if (s.includes('plumb')) return 'Plumbing';
        if (s.includes('electr')) return 'Electrical';
        if (s.includes('carpent')) return 'Carpentry';
        if (s.includes('paint')) return 'Painting';
        if (s.includes('clean')) return 'Cleaning';
        if (s.includes('garden')) return 'Gardening';
        if (s.includes('drive')) return 'Driving';
        if (s.includes('appliance') || s.includes('repair')) return 'Appliance Repair';
        if (s.includes('domestic') || s.includes('house')) return 'Domestic Help';
        if (s.includes('care') || s.includes('nurs')) return 'Caregiving';
        return 'Other community services';
      }),
    ]);

    categories.forEach((cat) => {
      if (!workersByCategory[cat]) workersByCategory[cat] = [];
      workersByCategory[cat].push(worker);
    });
  });

  // 3. Match forecasts against workers
  const analysis = [];
  const overloadedWorkers = [];
  const underutilizedWorkers = [];

  for (const forecast of forecasts) {
    const category = forecast.category;
    const workersForCategory = workersByCategory[category] || [];

    const expectedDemand = forecast.expectedRequests;
    const availableCapacity = workersForCategory.length * 2; // assume each handles ~2/day

    const shortage = Math.max(0, expectedDemand - availableCapacity);

    analysis.push({
      category,
      serviceName: forecast.serviceName,
      expectedRequests: expectedDemand,
      availableWorkers: workersForCategory.length,
      estimatedCapacity: availableCapacity,
      shortage,
      confidence: forecast.confidence,
    });

    // Check overloaded/underutilized within this category
    for (const worker of workersForCategory) {
      const workload = await getWorkerWorkload(worker._id);

      if (workload.thisWeek >= 10) {
        overloadedWorkers.push({
          workerId: worker._id,
          name: worker.user ? undefined : 'Worker',
          category,
          workload: workload.thisWeek,
          recommendedAction: 'Reduce allocation, distribute to others',
        });
      }

      if (workload.thisWeek <= 2 || workload.thisWeek === 0) {
        underutilizedWorkers.push({
          workerId: worker._id,
          name: worker.user ? undefined : 'Worker',
          category,
          workload: workload.thisWeek,
          recommendedAction: 'Prioritize this worker for next booking',
        });
      }
    }
  }

  // 4. Generate recommendations
  const recommendations = [];

  for (const item of analysis) {
    if (item.shortage > 0) {
      recommendations.push({
        type: 'SHORTAGE',
        category: item.category,
        message: `Move/allocate ${Math.ceil(item.shortage / 2)} workers to ${item.category}. Demand exceeds capacity by ${item.shortage}.`,
        severity: item.shortage > 10 ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // Recommendations for underutilized workers
  underutilizedWorkers.slice(0, 10).forEach((w) => {
    recommendations.push({
      type: 'ALLOCATION',
      workerId: w.workerId,
      message: `Worker ${w.workerId} has low workload (${w.workload} jobs this week) in ${w.category}. Prioritize for next booking.`,
      severity: w.workload === 0 ? 'HIGH' : 'MEDIUM',
    });
  });

  return {
    date,
    analysis,
    overloadedWorkers,
    underutilizedWorkers,
    recommendations,
    generatedAt: new Date(),
  };
};

/**
 * Recommend the next worker for a specific booking using the allocation logic
 */
const recommendWorkerForBooking = async (bookingData) => {
  // Reuse the matching service which incorporates workload fairness
  const matchingService = require('../matching/matchingService');
  return matchingService.matchWorkersForBooking(bookingData, 1);
};

module.exports = {
  analyzeWorkforceAllocation,
  getWorkerWorkload,
  recommendWorkerForBooking,
};
