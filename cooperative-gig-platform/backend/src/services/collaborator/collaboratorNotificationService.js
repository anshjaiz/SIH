/**
 * Collaborator notification service.
 *
 * Delivers real-time notifications over Socket.IO to:
 *  - candidate workers who were matched for a collaboration request
 *  - the lead worker when a collaborator accepts/declines
 */

const { getIO } = require('../../config/socket');

const io = () => getIO();

/**
 * Notify matched candidate workers about a new collaboration opportunity.
 */
const notifyCandidates = (request, candidates) => {
  const s = io();
  if (!s) return;

  candidates.forEach((c) => {
    s.to(`worker_${c.worker.toString()}`).emit('collaboration_invite', {
      requestId: request._id,
      bookingId: request.booking,
      leadWorker: request.leadWorker,
      role: request.role,
      requiredSkills: request.requiredSkills || [],
      date: request.date,
      startTime: request.startTime,
      durationHours: request.durationHours,
      address: request.address,
      city: request.city,
      distanceKm: c.distanceKm ? +c.distanceKm.toFixed(1) : null,
      estimatedPayment: request.estimatedPayment,
      instructions: request.instructions,
      score: c.score,
      reasons: c.reasons || [],
    });
  });
};

/**
 * Notify the lead worker of a collaborator's response / team progress.
 */
const notifyLeadWorker = (request, message, team) => {
  const s = io();
  if (!s) return;

  const payload = {
    requestId: request._id,
    bookingId: request.booking,
    status: request.status,
    role: request.role,
    message,
    team: team
      ? team.members.map((m) => ({
          worker: m.worker,
          role: m.role,
          status: m.status,
          paymentEstimate: m.paymentEstimate,
        }))
      : null,
  };

  s.to(`worker_${request.leadWorker.toString()}`).emit('collaboration_update', payload);
};

/**
 * Notify a single worker that they weren't selected (keep it simple: reuse invite channel).
 */
const notifyAcceptedConfirmation = (workerId, payload) => {
  const s = io();
  if (!s) return;
  s.to(`worker_${workerId}`).emit('collaboration_accepted', payload);
};

module.exports = {
  notifyCandidates,
  notifyLeadWorker,
  notifyAcceptedConfirmation,
};