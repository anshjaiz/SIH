/**
 * migrate_reliability.js
 *
 * One-time backfill for the reliability module:
 *  - seeds the ReliabilitySettings singleton (tunable config)
 *  - creates a WorkerReliability row for every worker (score initialised to
 *    the profile's reliability value, or the 100 starting point)
 *  - normalises WorkerProfile.accountStatus (defaults to ACTIVE)
 *
 * Safe to run repeatedly (idempotent). It does NOT touch bookings, payments,
 * complaints or any business data.
 *
 * Usage:  node scripts/migrate_reliability.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { mongoURI } = require('../src/config/env');
const Worker = require('../src/models/WorkerProfile');
const WorkerReliability = require('../src/models/WorkerReliability');
const ReliabilitySettings = require('../src/models/ReliabilitySettings');
const { deriveLevel } = require('../src/services/reliability/reliabilityService');
const { ENV_DEFAULTS } = require('../src/services/reliability/reliabilityConfig');

const run = async () => {
  if (mongoURI.includes('cooperative_gig_platform') === false) {
    console.warn('Not running against the cooperative_gig_platform DB — aborting.');
    process.exit(1);
  }
  await mongoose.connect(mongoURI);

  // 1) Settings singleton
  await ReliabilitySettings.updateOne(
    { key: 'default' },
    { $setOnInsert: ENV_DEFAULTS },
    { upsert: true }
  );
  console.log('✓ ReliabilitySettings seeded');

  // 2) Worker reliability backfill
  const workers = await Worker.find().select('reliability accountStatus verificationStatus isActive');
  const before = await WorkerReliability.countDocuments();
  for (const wp of workers) {
    const initial =
      wp.reliability && wp.reliability > 0 ? Math.min(100, wp.reliability) : 100;
    const level = deriveLevel(initial, ENV_DEFAULTS.thresholds);
    await WorkerReliability.findOneAndUpdate(
      { worker: wp._id },
      {
        $setOnInsert: { score: initial, level, lastEventAt: new Date() },
      },
      { upsert: true }
    );
    await Worker.updateOne(
      { _id: wp._id },
      { $set: { reliability: initial, accountStatus: wp.accountStatus || 'ACTIVE' } }
    );
  }
  const after = await WorkerReliability.countDocuments();
  console.log(`✓ WorkerReliability backfilled: ${workers.length} workers (${after - before} new rows)`);

  await mongoose.disconnect();
  console.log('✓ Migration complete');
};

run().catch(async (e) => {
  console.error('Migration failed:', e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});