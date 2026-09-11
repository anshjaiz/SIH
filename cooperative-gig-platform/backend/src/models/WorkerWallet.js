const mongoose = require('mongoose');

// WorkerWallet — audit-safe aggregate balances. NEVER updated by simple
// increments from the client; every movement goes through a
// WalletTransaction record (ledger) in walletService.
const workerWalletSchema = new mongoose.Schema(
  {
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
      unique: true,
      index: true,
    },
    // Released, withdrawable earnings (customer confirmed the job).
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Earned but still awaiting customer confirmation to release.
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Lifetime net earnings ever released (never decremented except reversals).
    totalEarned: {
      type: Number,
      default: 0,
    },
    // Lifetime successfully paid out.
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WorkerWallet', workerWalletSchema);