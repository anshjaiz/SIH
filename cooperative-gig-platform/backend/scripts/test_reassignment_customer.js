const mongoose = require('mongoose');
const BASE = 'http://localhost:5001/api';
const call = async (method, path, { token, json } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method, headers, body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/cooperative_gig_platform');
  require('../src/models/User');
  require('../src/models/Booking');
  const Booking = require('../src/models/Booking');

  const login = await call('POST', '/auth/login', { json: { email: 'customer10@test.com', password: 'Pass@123' } });
  const token = login.data.data.token;

  const B5 = await Booking.findOne({ description: 'E2E no-show test job' }).sort({ createdAt: -1 }).lean();
  console.log('B5 status before:', B5.status, 'attempts', B5.reassignmentAttempts);

  // Previous tick exhausted candidates; give the re-match room to find the
  // other Hyderabad workers by clearing the (already-offered) candidate list.
  await Booking.updateOne(
    { _id: B5._id },
    { $set: { status: 'EXPIRED', expiredAt: new Date(), candidateWorkers: [] } }
  );

  const r = await call('POST', `/customers/bookings/${B5._id}/reassign`, { token, json: {} });
  console.log('reassign response:', r.status, JSON.stringify(r.data));

  const after = await Booking.findById(B5._id).lean();
  console.log('B5 after:', after.status, 'attempts', after.reassignmentAttempts,
    'candidates', (after.candidateWorkers || []).length,
    'CUSTOMER', String(after.customer));
  console.log('candidate ids:', (after.candidateWorkers || []).map((c) => String(c.worker)).join(', '));

  const offenderId = String(after.worker || '');
  const excluded = (after.candidateWorkers || []).some((c) => String(c.worker) === offenderId);
  const hasQuality = (after.candidateWorkers || []).every((c) => Number.isFinite(c.score) && Array.isArray(c.reasons));

  const ok = after.status === 'REASSIGNED' && after.reassignmentAttempts >= 1 && !excluded && hasQuality && (after.candidateWorkers || []).length > 0;
  console.log(ok ? 'PASS  reassignment via customer endpoint (REASSIGNED, offender excluded, scored)' : 'FAIL  reassignment flow');

  // Restore coherence: revert to EXPIRED, keep failed-bookings accounting tidy.
  await Booking.updateOne(
    { _id: B5._id },
    { $set: { status: 'EXPIRED', expiredAt: new Date(), candidateWorkers: [] } }
  );
  console.log('cleanup: B5 restored to EXPIRED');
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FATAL', e.stack); process.exit(1); });