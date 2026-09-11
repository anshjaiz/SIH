/**
 * E2E test for the Razorpay-first payment + worker wallet + payout feature.
 *
 * Covers: order creation (amount backend-computed), server-side verification,
 * booking paid, wallet earning held as PENDING, duplicate-verify idempotency,
 * completion → customer confirmation → earning released (AVAILABLE), payout
 * method management (masked), withdrawal with funds held, admin payout
 * lifecycle PROCESSING → COMPLETED (with invalid-transition guard), failed
 * payout refunds funds, cancellation refunds + reverses earning, and role
 * isolation (customer cannot touch the worker wallet).
 *
 * Uses the LIVE server (http://localhost:5001) exactly like a real client,
 * with the same force-assign pattern the reliability E2E uses for the
 * worker → job relationship.
 *
 * Asserts balance DELTAS (baseline wallet state is captured first) so the
 * script is repeatable against an already-populated local DB.
 */

const mongoose = require('mongoose');
require('../src/models/User');
require('../src/models/Skill');
require('../src/models/Service');
require('../src/models/Cooperative');
require('../src/models/WorkerAvailability');
require('../src/models/WorkerProfile');
require('../src/models/CustomerProfile');
require('../src/models/Booking');
require('../src/models/Payment');
require('../src/models/Refund');
require('../src/models/Invoice');

const Booking = require('../src/models/Booking');
const Worker = require('../src/models/WorkerProfile');
const Payment = require('../src/models/Payment');

const BASE = 'http://localhost:5001/api';
const SERVICE_ID = '6aa01569a9f6f5694c19b477'; // Deep House Cleaning
const CHENNAI_LOC = [80.2707, 13.0827]; // Anna Nagar, Chennai

const results = [];
function check(name, cond, extra = '') {
  const ok = !!cond;
  results.push({ name, ok, extra: ok ? '' : String(extra) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '   <- ' + extra}`);
}

const call = async (method, path, { token, json } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(BASE + path, { method, headers, body });
  let data;
  try { data = await res.json(); } catch (_) { data = {}; }
  return { status: res.status, data };
};

const login = async (email, password) => {
  const r = await call('POST', '/auth/login', { json: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status}`);
  return r.data.data.token;
};

const createBooking = async (token, overrides = {}) => {
  const payload = {
    serviceId: SERVICE_ID,
    description: overrides.description || 'E2E payment test booking',
    address: '10, Anna Nagar, Chennai',
    area: 'Anna Nagar',
    city: 'Chennai',
    requestedDate: overrides.requestedDate || new Date(Date.now() + 2 * 86400000).toISOString(),
    timeSlot: 'Morning',
    location: { type: 'Point', coordinates: CHENNAI_LOC },
  };
  const r = await call('POST', '/customers/bookings', { token, json: payload });
  const booking = r.data?.data?.booking;
  if (r.status < 200 || r.status >= 300 || !booking || !booking._id) {
    throw new Error(`createBooking failed: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  }
  return booking;
};

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/cooperative_gig_platform');

  const adminToken = await login('admin@coop.in', 'Admin@123');
  const customerToken = await login('customer1@test.com', 'Pass@123');
  const workerToken = await login('worker1@test.com', 'Pass@123');

  // The worker (customer1 → worker1 pairing forced like the reliability E2E).
  const profile = (await call('GET', '/workers/profile', { token: workerToken })).data.data;
  const worker = await Worker.findOne({ user: profile.user }).select('_id');
  const workerId = worker._id.toString();

  // Baseline wallet state (idempotency-safe deltas).
  const wallet0 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
  check('W0 wallet endpoint exists', !!wallet0, JSON.stringify(wallet0));
  const bas = {
    availableBalance: wallet0.availableBalance,
    pendingBalance: wallet0.pendingBalance,
    totalEarned: wallet0.totalEarned,
    totalWithdrawn: wallet0.totalWithdrawn,
  };
  const delta = (now, field) => Number((now[field] - bas[field]).toFixed(2));

  // Role isolation: a customer must never reach the wallet.
  const custWallet = await call('GET', '/wallet', { token: customerToken });
  check('SEC wallet is worker-only (customer 403)', custWallet.status === 403, `${custWallet.status}`);

  // ================= BOOKING A — happy path =================
  let B1, net1;
  try {
    B1 = await createBooking(customerToken, { description: 'E2E payment happy path' });
    await Booking.updateOne(
      { _id: B1._id },
      { $set: {
        status: 'ACCEPTED', worker: workerId, acceptedAt: new Date(),
        scheduledStartTime: new Date(Date.now() - 2 * 3600 * 1000),
        scheduledEndTime: new Date(Date.now() + 2 * 3600 * 1000),
      } }
    );

    // Also confirm priceBreakdown (amount source) is present and all-inclusive.
    const freshB1 = await Booking.findById(B1._id).lean();
    check('A1 booking carries backend priceBreakdown', !!freshB1.priceBreakdown && freshB1.priceBreakdown.total > 0, JSON.stringify(freshB1.priceBreakdown));
    check('A1 all-inclusive: total = labour + materials', freshB1.priceBreakdown.total === freshB1.priceBreakdown.labour + freshB1.priceBreakdown.materials, JSON.stringify(freshB1.priceBreakdown));
    B1 = freshB1;

    // ---- order creation ----
    const ord = await call('POST', '/payments/create-order', { token: customerToken, json: { bookingId: B1._id } });
    check('A2 order created (mock gateway)', ord.status === 201 && ord.data?.data?.gateway === 'mock', `${ord.status} ${JSON.stringify(ord.data)}`);
    check('A3 order amount equals booking total', ord.data?.data?.amount === B1.priceBreakdown.total, `order=${ord.data?.data?.amount} total=${B1.priceBreakdown.total}`);
    check('A4 order breakdown computed on backend', ord.data?.data?.breakDown?.platformFee > 0, JSON.stringify(ord.data?.data?.breakDown));
    const paymentId = ord.data?.data?.paymentId;
    const orderId = ord.data?.data?.order?.id;

    // ---- verification ----
    const ver = await call('POST', '/payments/verify', { token: customerToken, json: { razorpay_order_id: orderId, razorpay_payment_id: 'mock_pay_123', razorpay_signature: 'mock' } });
    check('A5 verification succeeds', ver.status === 200 && ver.data?.data?.status === 'PAID', `${ver.status} ${JSON.stringify(ver.data)}`);

    const payA = await Payment.findById(paymentId).lean();
    check('A6 payment status PAID', payA.status === 'PAID', payA.status);
    net1 = payA.workerNetEarnings || 0;
    const expectedNet = Math.round((payA.labourAmount - payA.platformFee - payA.cooperativeContribution) * 100) / 100;
    check('A7 worker net = labour − fee − coop', net1 === expectedNet, `net=${net1} expected=${expectedNet}`);
    const paidBooking = await Booking.findById(B1._id).lean();
    check('A8 booking paymentStatus PAID', paidBooking.paymentStatus === 'PAID', paidBooking.paymentStatus);

    let w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('A9 earning held as PENDING (wallet)', delta(w1, 'pendingBalance') === net1 && delta(w1, 'totalEarned') === net1, `pendingΔ=${delta(w1, 'pendingBalance')} totalΔ=${delta(w1, 'totalEarned')} net=${net1}`);
    check('A10 available balance untouched by PENDING', delta(w1, 'availableBalance') === 0, `availΔ=${delta(w1, 'availableBalance')}`);
    const txn1 = (await call('GET', '/wallet/transactions', { token: workerToken })).data?.data;
    const txnBookingId = (t) => String((t.booking && t.booking._id) || t.booking);
    check('A11 ledger JOB_EARNING row PENDING', txn1.some((t) => t.type === 'JOB_EARNING' && t.status === 'PENDING' && txnBookingId(t) === String(B1._id)), JSON.stringify(txn1[0]));

    // ---- duplicate verification must be a no-op ----
    const dup = await call('POST', '/payments/verify', { token: customerToken, json: { razorpay_order_id: orderId, razorpay_payment_id: 'mock_pay_456', razorpay_signature: 'mock' } });
    check('A12 duplicate verify rejected (already paid)', dup.status === 400 && /already been paid/i.test(dup.data?.message || ''), `${dup.status} ${dup.data?.message}`);
    w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('A13 duplicate verify did NOT double-credit', delta(w1, 'pendingBalance') === net1, `pendingΔ=${delta(w1, 'pendingBalance')}`);

    // ---- non-owner cannot create an order ----
    const outsider = await call('POST', '/payments/create-order', { token: workerToken, json: { bookingId: B1._id } });
    check('SEC create-order blocked for non-owner', outsider.status === 403, `${outsider.status} ${outsider.data?.message}`);

    // ---- work: STARTED → complete → customer confirms ----
    await Booking.updateOne({ _id: B1._id }, { $set: { status: 'STARTED', startedAt: new Date() } });
    const done = await call('POST', `/workers/jobs/${B1._id}/complete`, { token: workerToken });
    check('A14 worker completes job', done.status === 200 && done.data?.data?.status === 'COMPLETED', `${done.status} ${JSON.stringify(done.data)}`);

    const conf = await call('POST', `/customers/bookings/${B1._id}/confirm`, { token: customerToken });
    check('A15 customer confirms completion', conf.status === 200, `${conf.status} ${JSON.stringify(conf.data)}`);

    w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('A16 earning released into available balance', delta(w1, 'availableBalance') === net1 && delta(w1, 'pendingBalance') === 0, `availΔ=${delta(w1, 'availableBalance')} pendingΔ=${delta(w1, 'pendingBalance')}`);
    const txn2 = (await call('GET', '/wallet/transactions', { token: workerToken })).data?.data;
    check('A17 ledger JOB_EARNING now COMPLETED', txn2.some((t) => t.type === 'JOB_EARNING' && t.status === 'COMPLETED' && txnBookingId(t) === String(B1._id)), '');

    // ---- double-confirm is idempotent ----
    const conf2 = await call('POST', `/customers/bookings/${B1._id}/confirm`, { token: customerToken });
    w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('A18 double-confirm does not double-release', conf2.status === 200 && delta(w1, 'availableBalance') === net1, `availΔ=${delta(w1, 'availableBalance')} ${conf2.data?.message}`);
  } catch (e) { check('BOOKING A happy path', false, e.stack); }

  // ================= WITHDRAWAL + ADMIN PAYOUT =================
  try {
    // add a bank payout method (masked on read)
    const meth = await call('POST', '/wallet/payout-methods', {
      token: workerToken,
      json: { type: 'BANK', accountHolderName: 'Test Worker', accountNumber: '123456789012', ifsc: 'HDFC0001234' },
    });
    check('P1 payout method added', meth.status === 201 && meth.data?.data?.type === 'BANK', `${meth.status} ${JSON.stringify(meth.data)}`);
    const masked = meth.data?.data?.accountNumber || '';
    check('P2 account number masked', /^XXXX/.test(masked) && !masked.includes('123456'), `masked=${masked}`);
    const methodId = meth.data?.data?._id;

    const w = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    const withdrawAmount = Math.min(net1, w.availableBalance);
    const preWithdraw = Number(w.availableBalance);

    const wd = await call('POST', '/wallet/payouts', { token: workerToken, json: { amount: withdrawAmount, payoutMethodId: methodId } });
    check('P3 withdrawal request accepted', wd.status === 201 && wd.data?.data?.status === 'PENDING', `${wd.status} ${JSON.stringify(wd.data)}`);
    const payoutId = wd.data?.data?._id;
    check('P4 payout request has reference number', /^PO-\d{6}-\d{5}$/.test(wd.data?.data?.payoutNumber || ''), wd.data?.data?.payoutNumber);

    let w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('P5 funds held on withdrawal (available −amount)', Number(w1.availableBalance) === preWithdraw - withdrawAmount, `before=${preWithdraw} after=${w1.availableBalance} amt=${withdrawAmount}`);

    // invalid transition guard: PENDING must not jump to COMPLETED
    const skip = await call('PUT', `/admin/payouts/${payoutId}/status`, { token: adminToken, json: { status: 'COMPLETED' } });
    check('P6 payout cannot skip PROCESSING (guard)', skip.status === 400, `${skip.status} ${skip.data?.message}`);

    const proc = await call('PUT', `/admin/payouts/${payoutId}/status`, { token: adminToken, json: { status: 'PROCESSING' } });
    check('P7 payout → PROCESSING', proc.status === 200 && proc.data?.data?.status === 'PROCESSING', `${proc.status}`);

    const comp = await call('PUT', `/admin/payouts/${payoutId}/status`, { token: adminToken, json: { status: 'COMPLETED', transactionReference: 'UTR-TEST-0001' } });
    check('P8 payout → COMPLETED', comp.status === 200 && comp.data?.data?.status === 'COMPLETED', `${comp.status} ${JSON.stringify(comp.data)}`);

    w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('P9 totalWithdrawn increased', delta(w1, 'totalWithdrawn') === withdrawAmount, `withdrawnΔ=${delta(w1, 'totalWithdrawn')} amt=${withdrawAmount}`);

    const wdTxns = (await call('GET', '/wallet/transactions', { token: workerToken })).data?.data;
    check('P10 withdrawal ledger WITHDRAWAL COMPLETED', wdTxns.some((t) => t.type === 'WITHDRAWAL' && t.status === 'COMPLETED'), JSON.stringify(wdTxns[0]));

    const adminOv = await call('GET', '/admin/payments/overview', { token: adminToken });
    check('P11 admin payment overview', adminOv.status === 200 && typeof adminOv.data?.data?.overview?.platformRevenue === 'number', `${adminOv.status} ${JSON.stringify(adminOv.data).slice(0, 200)}`);

    // failed payout must repay held funds
    const wd2 = await call('POST', '/wallet/payouts', { token: workerToken, json: { amount: Math.min(1, w1.availableBalance), payoutMethodId: methodId } });
    if (wd2.status === 201) {
      const fpId = wd2.data?.data?._id;
      const preFail = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
      await call('PUT', `/admin/payouts/${fpId}/status`, { token: adminToken, json: { status: 'FAILED', failureReason: 'E2E test failure' } });
      const afterFail = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
      check('P12 failed payout restored held funds', Number(afterFail.availableBalance) === Number(preFail.availableBalance) + 1, `before=${preFail.availableBalance} after=${afterFail.availableBalance}`);
    } else {
      check('P12 failed payout restore (skipped, no balance)', true, 'no available balance to withdraw');
    }
  } catch (e) { check('WITHDRAWAL + ADMIN PAYOUT', false, e.stack); }

  // ================= BOOKING B — verify → cancel → refund + reversal =================
  try {
    const B2 = await createBooking(customerToken, { description: 'E2E payment refund path' });
    await Booking.updateOne(
      { _id: B2._id },
      { $set: { status: 'ACCEPTED', worker: workerId, acceptedAt: new Date(),
        scheduledStartTime: new Date(Date.now() + 24 * 3600 * 1000),
        scheduledEndTime: new Date(Date.now() + 28 * 3600 * 1000) } }
    );

    const ord = await call('POST', '/payments/create-order', { token: customerToken, json: { bookingId: B2._id } });
    const orderId = ord.data?.data?.order?.id;
    await call('POST', '/payments/verify', { token: customerToken, json: { razorpay_order_id: orderId, razorpay_payment_id: 'mock_pay_789', razorpay_signature: 'mock' } });
    const payB = await Payment.findOne({ booking: B2._id }).lean();
    const net2 = payB.workerNetEarnings || 0;

    let w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('R1 earning held PENDING pre-cancel', delta(w1, 'pendingBalance') === net2, `pendingΔ=${delta(w1, 'pendingBalance')}`);

    const canc = await call('PUT', `/customers/bookings/${B2._id}/cancel`, { token: customerToken, json: { reason: 'E2E refund test' } });
    check('R2 cancellation succeeds', canc.status === 200, `${canc.status} ${JSON.stringify(canc.data)}`);

    const payB2 = await Payment.findById(payB._id).lean();
    check('R3 payment marked REFUNDED', payB2.status === 'REFUNDED', payB2.status);
    const b2 = await Booking.findById(B2._id).lean();
    check('R4 booking paymentStatus REFUNDED', b2.paymentStatus === 'REFUNDED', b2.paymentStatus);

    w1 = (await call('GET', '/wallet', { token: workerToken })).data?.data?.summary;
    check('R5 earning reversed (pending back to baseline)', delta(w1, 'pendingBalance') === 0, `pendingΔ=${delta(w1, 'pendingBalance')}`);

    // mock gateway completes the refund async ~3s after initiation.
    await new Promise((r) => setTimeout(r, 3500));
    const refunds = await require('../src/models/Refund').find({ booking: B2._id }).lean();
    check('R6 refund record exists and completed', refunds.length === 1 && refunds[0].status === 'COMPLETED', JSON.stringify(refunds));

    // history endpoints
    const hist = await call('GET', '/payments/customer/history', { token: customerToken });
    check('R7 customer payment history lists booking A payment', hist.status === 200 && hist.data?.data?.some((p) => String(p.booking?._id || p.booking) === String(B1._id)), `${hist.status}`);
  } catch (e) { check('BOOKING B refund path', false, e.stack); }

  // ================= summary =================
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  results.filter((r) => !r.ok).forEach((r) => console.log('  FAILED:', r.name, '->', r.extra));

  // cleanup: cancel leftover no-worker synthetic bookings
  const leftovers = await Booking.find({ description: /E2E payment/, worker: null, status: { $in: ['REQUESTED', 'MATCHING'] } });
  for (const lb of leftovers) {
    await call('PUT', `/customers/bookings/${lb._id}/cancel`, { token: customerToken, json: { reason: 'E2E cleanup' } }).catch(() => {});
  }

  await mongoose.disconnect();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e.stack || e);
  process.exit(1);
});