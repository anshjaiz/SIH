/**
 * sanity_payment_flipside.js
 *
 * Real-gateway (Razorpay TEST) end-to-end sanity of the flip-side of the
 * payment lifecycle, all through the public HTTP API:
 *
 *   PAY → (held) → WORK COMPLETE → CUSTOMER CONFIRM → release earning →
 *   WORKER WITHDRAW (Payout PENDING) → ADMIN PROCESS → ADMIN COMPLETE
 *
 * Unlike the mock E2E, the verification signature is a genuine HMAC-SHA256
 * over "order_id|payment_id" computed with the real RAZORPAY_KEY_SECRET —
 * identical to what the live Razorpay checkout posts back.
 *
 * Re-runnable: it picks an as-yet-unpaid, customer-confirmable booking.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BASE = 'http://localhost:5001/api';
const ENV_FILE = path.join(__dirname, '..', '.env');
const MONGO_URI = 'mongodb://127.0.0.1:27017/cooperative_gig_platform';
const SERVICE_ID = '6aa01569a9f6f5694c19b477'; // Plumbing (see scripts/test_payments_e2e.js)
const CHENNAI_LOC = [80.2707, 13.0827];

// ── load a key from .env ────────────────────────────────────────────────
function envKey(name) {
  const txt = fs.readFileSync(ENV_FILE, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(new RegExp(`^${name}=(.*)$`));
    if (m && m[1] !== undefined) return m[1].trim();
  }
  return '';
}
const RAZORPAY_KEY_ID = envKey('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = envKey('RAZORPAY_KEY_SECRET');

// ── tiny assertion helpers ──────────────────────────────────────────────
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};
const inr = (n) => `₹${Number(n || 0).toFixed(2)}`;

// ── HTTP helper ─────────────────────────────────────────────────────────
async function call(method, url, { token, json } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  let body = null;
  try { body = await res.json(); } catch { /* no json */ }
  return { status: res.status, data: body };
}
const login = async (email, password) => {
  const r = await call('POST', '/auth/login', { json: { email, password } });
  if (r.status !== 200 || !r.data?.data?.token) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.data.token;
};

(async () => {
  console.log('Razorpay keys:', RAZORPAY_KEY_ID ? `${RAZORPAY_KEY_ID.slice(0, 9)}… (real gateway)` : 'ABSENT (mock)');
  check('K1 keys present (test mode)', RAZORPAY_KEY_ID.startsWith('rzp_test_') && !!RAZORPAY_KEY_SECRET);

  const adminToken = await login('admin@coop.in', 'Admin@123');
  const customerToken = await login('customer1@test.com', 'Pass@123');
  const workerToken = await login('worker1@test.com', 'Pass@123');
  check('K2 admin/customer/worker logins', !!(adminToken && customerToken && workerToken));

  await mongoose.connect(MONGO_URI);
  const Booking = require(path.join(__dirname, '..', 'src', 'models', 'Booking'));
  const Worker = require(path.join(__dirname, '..', 'src', 'models', 'WorkerProfile'));

  // ── find an eligible booking owned by customer1 AND worker1 ──
  const adminBookings = await call('GET', '/admin/bookings', { token: adminToken });
  const list = Array.isArray(adminBookings.data?.data) ? adminBookings.data.data : [];
  const custBookings = (await call('GET', '/customers/bookings', { token: customerToken })).data?.data || [];
  const workerProfile = (await call('GET', '/workers/profile', { token: workerToken })).data?.data;
  const workerId = workerProfile?._id;
  check('F0 resolved worker1 profile', !!workerId, String(workerProfile && workerProfile._id));

  const existingEligible = custBookings.filter((b) =>
    !b.customerConfirmed &&
    ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'].indexOf(b.status) !== -1 &&
    b.paymentStatus !== 'PAID' && b.paymentStatus !== 'REFUNDED'
  );
  console.log(`  · ${existingEligible.length} pre-existing eligible booking(s) — will reuse if worker matches`);
  let B1 = null;
  for (const b of custBookings) {
    if (b.customerConfirmed || ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'].indexOf(b.status) === -1) continue;
    if (b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED') continue;
    // verify the assigned worker is worker1 via the admin listing (worker populated)
    const match = list.find((a) => String(a._id) === String(b._id));
    if (match && String(match.worker?._id || match.worker) === String(workerId)) { B1 = match; break; }
  }
  if (!B1 && !existingEligible.length) {
    console.log('  · none matched worker1 — will seed a fresh booking');
  }
  if (!B1) {
    // Seed a fresh booking via the public API, then force the deterministic
    // worker assignment (matching the E2E convention — matching is out of scope).
    console.log('\n→ seeding a fresh booking…');
    const seq = new Date().getTime();
    const payload = {
      serviceId: SERVICE_ID,
      description: `Sanity flip-side booking ${seq}`,
      address: '10, Anna Nagar, Chennai',
      area: 'Anna Nagar',
      city: 'Chennai',
      requestedDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      timeSlot: 'Morning',
      location: { type: 'Point', coordinates: CHENNAI_LOC },
    };
    const created = await call('POST', '/customers/bookings', { token: customerToken, json: payload });
    const nb = created.data?.data?.booking;
    if (!nb?._id) { console.log('Seed failed:', created.status, JSON.stringify(created.data).slice(0, 300)); process.exit(1); }
    const freshWp = await Worker.findOne({ user: workerProfile.user });
    await Booking.updateOne(
      { _id: nb._id },
      { $set: { status: 'ACCEPTED', worker: freshWp._id, acceptedAt: new Date() } }
    );
    const relist = (await call('GET', '/admin/bookings', { token: adminToken })).data?.data || [];
    B1 = relist.find((a) => String(a._id) === String(nb._id));
    check('F1S seeded fresh booking assigned to worker1', !!B1, `${created.status}`);
  }
  console.log(`\nBooking: ${B1.bookingNumber} | ${B1.status} | service: ${B1.serviceSnapshot?.name || '—'} | total: ${inr(B1.priceBreakdown?.total)}`);

  // ── wallet snapshot before ──
  const walletBefore = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
  console.log('wallet before: avail', inr(walletBefore.availableBalance), '| pending', inr(walletBefore.pendingBalance));

  // ── STEP 1: create order (should be REAL Razorpay) ──
  const ord = await call('POST', '/payments/create-order', { token: customerToken, json: { bookingId: B1._id } });
  const orderId = ord.data?.data?.order?.id;
  const net = ord.data?.data?.amount >= 0 ? undefined : undefined; // placeholder
  check('C1 create-order success', ord.status === 201 || (ord.status === 200 && orderId), `${ord.status} ${ord.data?.message || ''}`);
  check('C2 gateway is razorpay (real order)', ord.data?.data?.gateway === 'razorpay', String(ord.data?.data?.gateway));
  check('C3 order id is a real Razorpay order', String(orderId || '').startsWith('order_'), String(orderId));
  check('C4 key returned (cart uses it for checkout.js)', String(ord.data?.data?.key || '').startsWith('rzp_test_'));
  check('C5 order amount equals booking total', ord.data?.data?.amount === B1.priceBreakdown?.total, `order=${ord.data?.data?.amount} total=${B1.priceBreakdown?.total}`);
  check('C6 breakdown has fee/coop labour/materials', ord.data?.data?.breakDown?.platformFee > 0 && ord.data?.data?.breakDown?.cooperativeContribution > 0, JSON.stringify(ord.data?.data?.breakDown));

  // ── STEP 2: verify with a GENUINE HMAC signature (what real checkout sends) ──
  const payId = 'pay_' + crypto.randomBytes(8).toString('hex');
  const sig = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|${payId}`).digest('hex');
  const ver = await call('POST', '/payments/verify', { token: customerToken, json: { razorpay_order_id: orderId, razorpay_payment_id: payId, razorpay_signature: sig } });
  check('V1 verify accepted (HMAC valid)', ver.status === 200 && ver.data?.data?.status === 'PAID', `${ver.status} ${ver.data?.message || ''}`);
  check('V2 payment id recorded', ver.data?.data?.transactionId, String(ver.data?.data?.transactionId));
  const payDoc = (await call('GET', `/payments/${B1._id}`, { token: customerToken })).data?.data;
  check('V2b HMAC-verified razorpayPaymentId persisted', payDoc?.razorpayPaymentId === payId, `${payDoc?.razorpayPaymentId} vs ${payId}`);

  // ── STEP 3: earning now HELD as PENDING ──
  const walletHeld = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
  const heldDelta = walletHeld.pendingBalance - walletBefore.pendingBalance;
  check('H1 earning held as PENDING (job not yet confirmed)', heldDelta > 0, `pendingΔ=${inr(heldDelta)} (now ${inr(walletHeld.pendingBalance)})`);
  check('H2 available unchanged while held', walletHeld.availableBalance === walletBefore.availableBalance, `avail ${walletBefore.availableBalance}→${walletHeld.availableBalance}`);

  // ── STEP 4: duplicate verify must be rejected w/o double-credit ──
  const dupPay = 'pay_' + crypto.randomBytes(8).toString('hex');
  const dupSig = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|${dupPay}`).digest('hex');
  const dup = await call('POST', '/payments/verify', { token: customerToken, json: { razorpay_order_id: orderId, razorpay_payment_id: dupPay, razorpay_signature: dupSig } });
  const walletAfterDup = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
  check('D1 duplicate verify rejected', dup.status === 400 && /already been paid|verification/i.test(dup.data?.message || ''), `${dup.status} ${dup.data?.message}`);
  check('D2 no double credit after replay', walletAfterDup.pendingBalance === walletHeld.pendingBalance, `pendingΔ=${inr(walletAfterDup.pendingBalance - walletHeld.pendingBalance)}`);

  // ── STEP 5: worker does the job → COMPLETED ──
  let bst = B1.status;
  if (['ASSIGNED'].includes(bst)) {
    const acc = await call('POST', `/workers/jobs/${B1._id}/accept`, { token: workerToken });
    bst = acc.data?.data?.status || bst;
    check('W0 worker accepts', acc.status === 200, String(bst));
  }
  if (['ACCEPTED', 'ON_THE_WAY'].includes(bst)) {
    const st = await call('POST', `/workers/jobs/${B1._id}/start`, { token: workerToken });
    bst = st.data?.data?.status || bst;
    check('W1 worker starts job', st.status === 200, String(bst));
  }
  const comp = await call('POST', `/workers/jobs/${B1._id}/complete`, { token: workerToken, json: {} });
  check('W2 worker completes job', comp.status === 200 && comp.data?.data?.status === 'COMPLETED', `${comp.status} ${comp.data?.message || ''}`);

  // ── STEP 6: customer confirms → earning released to AVAILABLE ──
  const conf = await call('POST', `/customers/bookings/${B1._id}/confirm`, { token: customerToken });
  check('E1 customer confirms completion', conf.status === 200, `${conf.status} ${conf.data?.message || ''}`);
  check('E2 earningReleased flagged', conf.data?.data?.earningReleased === true, JSON.stringify(conf.data?.data));
  check('E3 released amount matches held earning', conf.data?.data?.amountReleased === heldDelta, `released=${conf.data?.data?.amountReleased} held=${heldDelta}`);

  const walletReleased = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
  check('E4 available balance grew by held amount', Math.round(walletReleased.availableBalance - walletHeld.availableBalance) === Math.round(heldDelta), `avail ${walletHeld.availableBalance}→${walletReleased.availableBalance}`);
  check('E5 pending balance drained', walletReleased.pendingBalance === 0, `pending=${inr(walletReleased.pendingBalance)}`);

  // ── STEP 7: double-confirm idempotent ──
  const conf2 = await call('POST', `/customers/bookings/${B1._id}/confirm`, { token: customerToken });
  const walletAfterConf2 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
  check('E6 double-confirm does not double-release', conf2.status === 200 && walletAfterConf2.availableBalance === walletReleased.availableBalance, `availΔ=${inr(walletAfterConf2.availableBalance - walletReleased.availableBalance)}`);

  // ── STEP 8: worker withdraws → Payout PENDING, funds held ──
  const methods = (await call('GET', '/wallet/payout-methods', { token: workerToken })).data?.data || [];
  check('F2 worker has a payout method', methods.length > 0);
  if (methods.length > 0) {
    const amt = 100;
    const wd = await call('POST', '/wallet/payouts', { token: workerToken, json: { amount: amt, payoutMethodId: methods[0]._id } });
    const payout = wd.data?.data;
    check('F3 withdrawal request created', wd.status === 201 && payout?.status === 'PENDING', `${wd.status} ${wd.data?.message || ''}`);
    check('F4 payout has a payout number', /^PO-/.test(payout?.payoutNumber || ''), String(payout?.payoutNumber));

    const walletWd = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
    check('F5 available balance reduced by request', Math.round(walletReleased.availableBalance - walletWd.availableBalance) === amt, `avail ${walletReleased.availableBalance}→${walletWd.availableBalance}`);

    // ── STEP 9: admin PROCESS → COMPLETE ──
    const pr = await call('PUT', `/admin/payouts/${payout._id}/status`, { token: adminToken, json: { status: 'PROCESSING' } });
    check('P1 admin moves to PROCESSING', pr.status === 200 && pr.data?.data?.status === 'PROCESSING', `${pr.status} ${pr.data?.message || ''}`);

    const cp = await call('PUT', `/admin/payouts/${payout._id}/status`, { token: adminToken, json: { status: 'COMPLETED', transactionReference: 'UTR-SANITY-001' } });
    check('P2 admin completes payout', cp.status === 200 && cp.data?.data?.status === 'COMPLETED', `${cp.status} ${cp.data?.message || ''}`);
    check('P3 transaction reference stored', cp.data?.data?.transactionReference === 'UTR-SANITY-001', String(cp.data?.data?.transactionReference));

    const walletPaid = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
    check('P4 lifetime withdrawn incremented once', Math.round(walletPaid.totalWithdrawn - walletBefore.totalWithdrawn) === amt, `withdrawn ${walletBefore.totalWithdrawn}→${walletPaid.totalWithdrawn}`);
    check('P5 COMPLETED does not refund available (already debited)', Math.round(walletPaid.availableBalance - walletWd.availableBalance) === 0, `availΔ=${inr(walletPaid.availableBalance - walletWd.availableBalance)}`);

    // ── STEP 10: invalid transition guard ──
    const rev = await call('PUT', `/admin/payouts/${payout._id}/status`, { token: adminToken, json: { status: 'PROCESSING' } });
    check('P6 COMPLETED cannot go back to PROCESSING', rev.status === 400, `${rev.status} ${rev.data?.message}`);

    // ── STEP 11: admin overview reflects the processed payout ──
    const ov = (await call('GET', '/admin/payments/overview', { token: adminToken })).data?.data?.overview || {};
    check('P7 overview exposes completed payouts', Number(ov.completedPayouts) >= amt, `completedPayouts=${inr(ov.completedPayouts)}`);
  }

  // ── cleanup: cancel the dangling PENDING payout from the earlier mock E2E ──
  const payouts = (await call('GET', '/admin/payouts', { token: adminToken })).data?.data || [];
  const leftover = payouts.find((p) => p.status === 'PENDING');
  if (leftover) {
    const cc = await call('PUT', `/admin/payouts/${leftover._id}/status`, { token: adminToken, json: { status: 'CANCELLED' } });
    check('CL1 dangling legacy PENDING payout cancelled (cleanup)', cc.status === 200 && cc.data?.data?.status === 'CANCELLED', `${cc.status} ${cc.data?.message || ''}`);
  }

  const walletEnd = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary || {};
  console.log('\nwallet after: avail', inr(walletEnd.availableBalance), '| pending', inr(walletEnd.pendingBalance), '| earned', inr(walletEnd.totalEarned), '| withdrawn', inr(walletEnd.totalWithdrawn));
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });