const express = require('express');
const router = express.Router();
const {
  getWallet,
  getTransactions,
  addPayoutMethod,
  listPayoutMethods,
  deletePayoutMethod,
  requestPayout,
  listPayouts,
  getPayout,
} = require('../controllers/payments/walletController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Every wallet endpoint is WORKER-only and scoped to the caller's own wallet.
router.use(protect, authorize('worker'));

router.get('/', getWallet);
router.get('/transactions', getTransactions);

router.get('/payout-methods', listPayoutMethods);
router.post('/payout-methods', addPayoutMethod);
router.delete('/payout-methods/:id', deletePayoutMethod);

router.get('/payouts', listPayouts);
router.post('/payouts', requestPayout);
router.get('/payouts/:id', getPayout);

module.exports = router;