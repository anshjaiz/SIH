/**
 * walletController.js
 *
 * Worker wallet, ledger transactions, payout methods and payout requests.
 * Only WORKER role can access these; a worker can only ever read their OWN
 * wallet — balances can never be modified through these APIs.
 */

const Worker = require('../../models/WorkerProfile');
const WorkerPayoutMethod = require('../../models/WorkerPayoutMethod');
const Notification = require('../../models/Notification');
const Payout = require('../../models/Payout');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');
const walletService = require('../../services/wallet/walletService');
const { createNotification } = require('../../services/notification/notificationService');

const getWorkerId = async (userId) => {
  const worker = await Worker.findOne({ user: userId });
  return worker ? worker._id : null;
};

const requireWorker = (worker) => {
  if (!worker) throw new ApiError('Worker profile not found', 404);
  return worker;
};

// GET /api/wallet
const getWallet = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const data = await walletService.getWalletSummary(workerId);
  res.json({ success: true, data });
});

// GET /api/wallet/transactions
const getTransactions = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const WalletTransaction = require('../../models/WalletTransaction');
  const transactions = await WalletTransaction.find({ worker: workerId })
    .populate('booking', 'bookingNumber serviceSnapshot')
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ success: true, data: transactions });
});

// POST /api/wallet/payout-methods
const addPayoutMethod = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const { type, accountHolderName, accountNumber, ifsc, upiId, isDefault } = req.body;

  if (!type || !['BANK', 'UPI'].includes(type)) {
    throw new ApiError('Payout method type must be BANK or UPI', 400);
  }
  if (type === 'BANK') {
    if (!accountHolderName || !accountNumber || !ifsc) {
      throw new ApiError('Bank details are incomplete (name, account number and IFSC required)', 400);
    }
  } else if (!upiId || !String(upiId).includes('@')) {
    throw new ApiError('A valid UPI ID is required (e.g. name@upi)', 400);
  }

  if (isDefault) {
    await WorkerPayoutMethod.updateMany({ worker: workerId }, { $set: { isDefault: false } });
  }
  const method = await WorkerPayoutMethod.create({
    worker: workerId,
    type,
    accountHolderName: accountHolderName || '',
    accountNumber: type === 'BANK' ? String(accountNumber).trim() : '',
    ifsc: type === 'BANK' ? String(ifsc).trim().toUpperCase() : '',
    upiId: type === 'UPI' ? String(upiId).trim() : '',
    isDefault: Boolean(isDefault),
    verified: false,
  });

  res.status(201).json({ success: true, message: 'Payout method added', data: method.mask() });
});

// GET /api/wallet/payout-methods
const listPayoutMethods = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const methods = await WorkerPayoutMethod.find({ worker: workerId });
  res.json({ success: true, data: methods.map((m) => m.mask()) });
});

// DELETE /api/wallet/payout-methods/:id
const deletePayoutMethod = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const method = await WorkerPayoutMethod.findOne({ _id: req.params.id, worker: workerId });
  if (!method) throw new ApiError('Payout method not found', 404);
  await method.deleteOne();
  res.json({ success: true, message: 'Payout method removed' });
});

// POST /api/wallet/payouts  (worker requests withdrawal)
const requestPayout = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const { amount, payoutMethodId } = req.body;

  let method = null;
  if (payoutMethodId) {
    method = await WorkerPayoutMethod.findOne({ _id: payoutMethodId, worker: workerId });
    if (!method) throw new ApiError('Payout method not found. Add one before withdrawing.', 404);
  }

  let payout;
  try {
    payout = await walletService.requestWithdrawal({
      workerId,
      amount,
      payoutMethodId: method ? method._id : undefined,
    });
  } catch (err) {
    throw new ApiError(err.userMessage || 'Withdrawal could not be processed', 400);
  }

  // Notify all admins so the payout can be reviewed.
  const adminUsers = await require('../../models/User').find({ role: 'admin' }, '_id');
  if (adminUsers.length) {
    await Notification.create(
      adminUsers.map((a) => ({
        user: a._id,
        type: 'WITHDRAWAL_REQUESTED',
        title: 'New withdrawal request',
        message: `Worker requested withdrawal of ₹${payout.amount} (${payout.payoutNumber}).`,
        data: { payoutId: payout._id, payoutNumber: payout.payoutNumber, amount: payout.amount },
      }))
    );
  }

  await createNotification({
    user: req.user._id,
    type: 'WITHDRAWAL_REQUESTED',
    title: 'Withdrawal requested',
    message: `Your withdrawal of ₹${payout.amount} is pending admin review (${payout.payoutNumber}).`,
    data: { payoutId: payout._id, payoutNumber: payout.payoutNumber },
  });

  res.status(201).json({ success: true, message: 'Withdrawal requested. Funds are held pending admin review.', data: payout });
});

// GET /api/wallet/payouts
const listPayouts = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const payouts = await Payout.find({ worker: workerId })
    .populate('payoutMethodId')
    .sort({ requestedAt: -1 });
  res.json({ success: true, data: payouts });
});

// GET /api/wallet/payouts/:id
const getPayout = asyncHandler(async (req, res) => {
  const workerId = requireWorker(await getWorkerId(req.user._id));
  const payout = await Payout.findOne({ _id: req.params.id, worker: workerId }).populate('payoutMethodId');
  if (!payout) throw new ApiError('Payout not found', 404);
  res.json({ success: true, data: payout });
});

module.exports = {
  getWallet,
  getTransactions,
  addPayoutMethod,
  listPayoutMethods,
  deletePayoutMethod,
  requestPayout,
  listPayouts,
  getPayout,
};