/**
 * migrate_reconcile_wallets.js
 *
 * Rebuilds every WorkerWallet from the WalletTransaction ledger. The wallet
 * is a DERIVED aggregate, so any manual drift (buggy increments, partial
 * migrations) is corrected by re-summing the audit rows:
 *
 *   pending  = unpaid held earnings  (JOB_EARNING · PENDING)
 *   available= released earnings − held withdrawals
 *            = Σ JOB_EARNING COMPLETED − Σ WITHDRAWAL PENDING − Σ WITHDRAWAL COMPLETED
 *   totalEarned = Σ JOB_EARNING (PENDING + COMPLETED)
 *   totalWithdrawn = Σ WITHDRAWAL COMPLETED
 *
 * Run: node scripts/migrate_reconcile_wallets.js
 */

const mongoose = require('mongoose');
const WalletTransaction = require('../src/models/WalletTransaction');
const WorkerWallet = require('../src/models/WorkerWallet');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/cooperative_gig_platform');

  const txns = await WalletTransaction.find({});
  const byWorker = {};
  for (const t of txns) {
    if (!t.worker) continue;
    byWorker[t.worker] = byWorker[t.worker] || [];
    byWorker[t.worker].push(t);
  }

  let updated = 0;
  for (const [workerId, rows] of Object.entries(byWorker)) {
    let pending = 0;
    let available = 0;
    let totalEarned = 0;
    let totalWithdrawn = 0;
    for (const t of rows) {
      const amt = round2(t.amount || 0);
      if (t.type === 'JOB_EARNING') {
        if (t.status === 'REVERSED') continue;
        totalEarned += amt;
        if (t.status === 'PENDING') pending += amt;
        else if (t.status === 'COMPLETED') available += amt;
      } else if (t.type === 'WITHDRAWAL') {
        if (t.status === 'PENDING') available -= amt;
        else if (t.status === 'COMPLETED') {
          available -= amt;
          totalWithdrawn += amt;
        }
      }
    }
    const res = await WorkerWallet.bulkWrite([
      {
        updateOne: {
          filter: { worker: workerId },
          update: {
            $set: {
              availableBalance: round2(available),
              pendingBalance: round2(pending),
              totalEarned: round2(totalEarned),
              totalWithdrawn: round2(totalWithdrawn),
              currency: 'INR',
            },
          },
        },
      },
    ]);
    if (res.modifiedCount) updated++;
  }

  console.log(`Reconciled ${updated} wallet(s) from the ledger.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});