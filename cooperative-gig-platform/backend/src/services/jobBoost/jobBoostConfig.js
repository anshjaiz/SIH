/**
 * jobBoostConfig.js
 *
 * Centralised, admin-tunable settings for the "Job Boost" / customer price
 * increase feature. Settings live under the single Cooperative config
 * document (`cooperative.jobBoost`) and are cached for a short TTL; when no
 * document exists the ENV_DEFAULTS below are used so the feature works
 * out of the box.
 */

const Cooperative = require('../../models/Cooperative');

const ENV_DEFAULTS = {
  // Flag a booking as "low acceptance" when it has had no acceptance for this
  // long (minutes). The clock restarts after every customer-approved increase.
  lowAcceptanceWaitMinutes: 5,
  // OR when this many eligible workers have rejected the request (per offer
  // round). Reset to 0 after every customer-approved increase.
  lowAcceptanceRejectionThreshold: 3,
  // Hard cap on how many times the customer may increase the price of a
  // single request. Once a worker accepts the price is locked anyway.
  maxPriceIncreases: 3,
  // Suggested bump (percent) shown to the customer (e.g. 200 -> 250 at 25%).
  recommendedIncreasePercent: 25,
  // Maximum bookings scanned per low-acceptance sweep tick.
  sweepLimit: 100,
};

let settingsCache = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30 * 1000;

/**
 * Resolve current settings (cached; pass force=true to bypass).
 */
const getSettings = async (force = false) => {
  if (!force && settingsCache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return settingsCache;
  }

  let stored = {};
  try {
    const coop = await Cooperative.findOne().sort({ createdAt: -1 }).lean();
    if (coop && coop.jobBoost && typeof coop.jobBoost === 'object') {
      stored = coop.jobBoost;
    }
  } catch (e) {
    stored = {};
  }

  settingsCache = {
    lowAcceptanceWaitMinutes:
      stored.lowAcceptanceWaitMinutes ?? ENV_DEFAULTS.lowAcceptanceWaitMinutes,
    lowAcceptanceRejectionThreshold:
      stored.lowAcceptanceRejectionThreshold ?? ENV_DEFAULTS.lowAcceptanceRejectionThreshold,
    maxPriceIncreases:
      stored.maxPriceIncreases ?? ENV_DEFAULTS.maxPriceIncreases,
    recommendedIncreasePercent:
      stored.recommendedIncreasePercent ?? ENV_DEFAULTS.recommendedIncreasePercent,
    sweepLimit: stored.sweepLimit ?? ENV_DEFAULTS.sweepLimit,
  };
  cacheLoadedAt = Date.now();
  return settingsCache;
};

const reloadSettings = async () => getSettings(true);

module.exports = { getSettings, reloadSettings, ENV_DEFAULTS };