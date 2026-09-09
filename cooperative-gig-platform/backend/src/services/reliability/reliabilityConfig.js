/**
 * reliabilityConfig.js
 *
 * Centralised, admin-tunable settings for the reliability / no-show module.
 * Settings are stored in a single ReliabilitySettings document (seeded by
 * scripts/migrate_reliability.js) and cached for a short TTL. When no document
 * exists the ENV_DEFAULTS below are used so the system works out of the box.
 */

const ReliabilitySettings = require('../../models/ReliabilitySettings');

const ENV_DEFAULTS = {
  thresholds: {
    good: 80,
    warning: 60,
    lowReliability: 40,
    temporarySuspend: 20,
    deactivationReview: 0,
  },
  points: {
    initialScore: 100,
    completeJob: 2,
    onTime: 1,
    goodRating: 1,
    collaboration: 1,
    noShow: -10,
    lateArrival: -3,
    cancelAfterAccept: -5,
    repeatedNoShowExtra: -5,
  },
  noShowGraceMinutes: 15,
  jobExpiryGraceMinutes: 120,
  lateToleranceMinutes: 30,
  reassignmentGraceMinutes: 30,
  reminderLeadMinutes: 60,
  maxReassignmentAttempts: 2,
  schedulerIntervalSeconds: 60,
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
  let doc = null;
  try {
    doc = await ReliabilitySettings.findOne({ key: 'default' }).lean();
  } catch (e) {
    doc = null;
  }
  // Deep-merge stored settings over defaults so any missing field keeps a sane value.
  const stored = doc || {};
  const merge = (obj, dflt) => ({ ...dflt, ...(obj || {}) });

  settingsCache = {
    thresholds: merge(stored.thresholds, ENV_DEFAULTS.thresholds),
    points: merge(stored.points, ENV_DEFAULTS.points),
    noShowGraceMinutes:
      stored.noShowGraceMinutes ?? ENV_DEFAULTS.noShowGraceMinutes,
    jobExpiryGraceMinutes:
      stored.jobExpiryGraceMinutes ?? ENV_DEFAULTS.jobExpiryGraceMinutes,
    lateToleranceMinutes:
      stored.lateToleranceMinutes ?? ENV_DEFAULTS.lateToleranceMinutes,
    reassignmentGraceMinutes:
      stored.reassignmentGraceMinutes ?? ENV_DEFAULTS.reassignmentGraceMinutes,
    reminderLeadMinutes:
      stored.reminderLeadMinutes ?? ENV_DEFAULTS.reminderLeadMinutes,
    maxReassignmentAttempts:
      stored.maxReassignmentAttempts ?? ENV_DEFAULTS.maxReassignmentAttempts,
    schedulerIntervalSeconds:
      stored.schedulerIntervalSeconds ??
      ENV_DEFAULTS.schedulerIntervalSeconds,
  };
  cacheLoadedAt = Date.now();
  return settingsCache;
};

const reloadSettings = async () => getSettings(true);

module.exports = { getSettings, reloadSettings, ENV_DEFAULTS };