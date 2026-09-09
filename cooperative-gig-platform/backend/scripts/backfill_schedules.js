/**
 * backfill_schedules.js
 *
 * One-time (idempotent) migration: populate the absolute scheduling fields
 * (scheduledDate / scheduledStartTime / scheduledEndTime) for bookings created
 * before the scheduling/reliability phase. Without these, the reliability
 * scheduler cannot enforce job expiry / no-show detection for older bookings.
 *
 * Values are derived from requestedDate + timeSlot (or the emergency window),
 * using the same deriveScheduleWindow() the create flow uses. Already-scheduled
 * bookings are untouched.
 */

const mongoose = require('mongoose');
require('../src/models/Booking');
const Booking = require('../src/models/Booking');
const { deriveScheduleWindow } = require('../src/utils/scheduleUtils');

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/cooperative_gig_platform');

  const missing = await Booking.find({
    $or: [
      { scheduledStartTime: null, scheduledEndTime: null },
      { scheduledStartTime: { $exists: false }, scheduledEndTime: { $exists: false } },
    ],
    requestedDate: { $ne: null },
  }).select('_id bookingNumber requestedDate timeSlot isEmergency scheduledStartTime scheduledEndTime scheduledDate');

  console.log(`Bookings missing a schedule: ${missing.length}`);
  let filled = 0;
  let skipped = 0;
  for (const b of missing) {
    const schedule = deriveScheduleWindow(b.requestedDate, b.timeSlot, {
      isEmergency: !!b.isEmergency,
    });
    if (!schedule.scheduledStartTime || !schedule.scheduledEndTime) {
      skipped++;
      continue;
    }
    await Booking.updateOne(
      { _id: b._id, scheduledStartTime: null },
      {
        $set: {
          scheduledDate: schedule.scheduledDate,
          scheduledStartTime: schedule.scheduledStartTime,
          scheduledEndTime: schedule.scheduledEndTime,
        },
      }
    );
    filled++;
  }

  console.log(`✓ Backfilled ${filled} booking(s)${skipped ? ` (skipped ${skipped} with no derivable window)` : ''}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.stack); process.exit(1); });