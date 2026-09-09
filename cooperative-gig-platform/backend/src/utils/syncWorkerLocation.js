const Booking = require('../models/Booking');
const JobTeam = require('../models/JobTeam');
const { getIO } = require('../config/socket');

/**
 * Push a worker's current coordinates into every active surface that shows
 * live location:
 *  - the worker's active Booking.workerLocation (shown to the customer),
 *  - checked-in collaborators' team member location (shown to the lead worker).
 * Returns nothing (fire-and-forget friendly).
 */
const syncWorkerLocation = async (worker, coordinates) => {
  const activeBookings = await Booking.find({
    worker: worker._id,
    status: { $in: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'] },
  });
  await Promise.all(
    activeBookings.map((b) =>
      Booking.updateOne(
        { _id: b._id },
        { workerLocation: { type: 'Point', coordinates } }
      )
    )
  );

  const io = getIO();
  if (io) {
    for (const b of activeBookings) {
      io.to(`customer_${b.customer}`).emit('worker_location', {
        bookingId: b._id,
        coordinates,
      });
    }
  }

  if (!io) return;

  const teams = await JobTeam.find({
    'members.worker': worker._id,
    'members.status': 'ACCEPTED',
    completed: false,
  });
  for (const team of teams) {
    const member = (team.members || []).find((m) => m.worker.toString() === worker._id.toString());
    if (!member || !member.joinedAt) continue;
    member.location = { type: 'Point', coordinates };
    member.lastLocationUpdate = new Date();
    await team.save();
    io.to(`worker_${team.leadWorker.toString()}`).emit('worker_location', {
      helperId: worker._id,
      bookingId: team.booking,
      role: member.role,
      coordinates,
      lastLocationUpdate: member.lastLocationUpdate,
    });
  }
};

module.exports = syncWorkerLocation;