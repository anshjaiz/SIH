const express = require('express');
const {
  addPayoutMethod,
  listPayoutMethods,
  deletePayoutMethod,
  requestPayout,
  listPayouts,
  getPayout,
} = require('../controllers/payments/walletController');
const { protect, authorize } = require('../middleware/authMiddleware');

// /api/payout-methods  (worker owns their methods; account numbers masked)
const payoutMethodRouter = express.Router();
payoutMethodRouter.use(protect, authorize('worker'));
payoutMethodRouter.get('/', listPayoutMethods);
payoutMethodRouter.post('/', addPayoutMethod);
payoutMethodRouter.delete('/:id', deletePayoutMethod);

// /api/payouts  (worker withdrawals)
const payoutsRouter = express.Router();
payoutsRouter.use(protect, authorize('worker'));
payoutsRouter.get('/', listPayouts);
payoutsRouter.post('/', requestPayout);
payoutsRouter.get('/:id', getPayout);

module.exports = { payoutMethodRouter, payoutsRouter };