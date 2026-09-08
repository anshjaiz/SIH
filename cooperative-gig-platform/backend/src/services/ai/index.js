/**
 * AI Services index
 * Modular entry point - swap statistical models with ML later
 */
const forecastingService = require('./forecastingService');
const allocationService = require('./allocationService');

module.exports = {
  forecasting: forecastingService,
  allocation: allocationService,
};
