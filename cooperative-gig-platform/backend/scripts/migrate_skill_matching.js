/**
 * Migrate existing data to the strict skillId-based matching model.
 * Safe to re-run (additive — no documents are deleted or overwritten once set).
 *
 * Run:
 *   node backend/scripts/migrate_skill_matching.js
 */

const mongoose = require('mongoose');

require('dotenv').config();
const { mongoURI } = require('../src/config/env');

const Service = require('../src/models/Service');
const Booking = require('../src/models/Booking');
const Worker = require('../src/models/WorkerProfile');
const { syncServiceSkillRefs, resolveSkillRefs, ACCEPTABLE_SKILLS } = require('../src/utils/skillUtils');

(async () => {
  await mongoose.connect(mongoURI);
  console.log('Connected to MongoDB...');

  // 1. Services → resolve requiredSkillRefs from requiredSkills names
  const services = await Service.find({});
  console.log(`Services found: ${services.length}`);
  for (const svc of services) {
    await syncServiceSkillRefs(svc);
    await svc.save();
    console.log(`  ✓ ${svc.name}: refs=${(svc.requiredSkillRefs || []).length}`);
  }

  // 2. Bookings → snapshot required skills from their service (where missing)
  const bookings = await Booking.find({
    $or: [
      { requiredSkillIds: { $exists: false } },
      { requiredSkillIds: { $size: 0 } },
    ],
  }).populate('service', 'requiredSkillRefs requiredSkills');
  console.log(`Bookings to backfill: ${bookings.length}`);
  for (const b of bookings) {
    if (!b.service) continue;
    b.requiredSkillIds = b.service.requiredSkillRefs || [];
    b.requiredSkillNames = b.service.requiredSkills || [];
    await b.save();
    console.log(`  ✓ ${b.bookingNumber}: skillRefs=${b.requiredSkillIds.length}`);
  }

  // 3. Workers → legacy skills are considered verified by default so they
  //    continue to match jobs immediately after migration. Newly added skills
  //    will stay unverified until an admin approves.
  const workers = await Worker.find({});
  let updated = 0;
  for (const w of workers) {
    let changed = false;
    for (const sk of w.skills) {
      if (sk.verified === undefined || sk.verified === null) {
        sk.verified = true;
        sk.verifiedAt = sk.verifiedAt || new Date();
        changed = true;
      }
    }
    if (changed) {
      await w.save();
      updated++;
    }
  }
  console.log(`Workers backfilled (legacy skills → verified=true): ${updated}`);

  console.log('\n✓ Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});