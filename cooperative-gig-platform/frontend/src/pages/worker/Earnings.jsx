import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const PAYOUT_STATUS = {
  PENDING: { label: 'Pending review', cls: 'bg-yellow-100 text-yellow-700' },
  PROCESSING: { label: 'Processing', cls: 'bg-blue-100 text-blue-700' },
  COMPLETED: { label: 'Paid out', cls: 'bg-emerald-100 text-emerald-700' },
  FAILED: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
};

const TXN_STATUS = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  REVERSED: 'bg-gray-100 text-gray-600',
};

export default function Earnings() {
  const [wallet, setWallet] = useState(null);
  const [methods, setMethods] = useState([]);
  const [legacy, setLegacy] = useState({ summary: {}, payments: [] });
  const [loading, setLoading] = useState(true);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', payoutMethodId: '' });

  const [methodForm, setMethodForm] = useState({ type: 'BANK', accountHolderName: '', accountNumber: '', ifsc: '', upiId: '' });
  const [addingMethod, setAddingMethod] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [w, m, e] = await Promise.all([
        api.get('/wallet'),
        api.get('/wallet/payout-methods'),
        api.get('/workers/earnings'),
      ]);
      setWallet(w.data);
      setMethods(m.data || []);
      setLegacy(e.data || { summary: {}, payments: [] });
    } catch (err) {
      toast.error(err.message || 'Could not load wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const summary = wallet?.summary || {};
  const transactions = wallet?.transactions || [];
  const payouts = wallet?.payouts || [];
  const legacySummary = legacy.summary || {};
  const payments = legacy.payments || [];

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!withdrawForm.amount || Number(withdrawForm.amount) <= 0) {
      toast.error('Enter an amount to withdraw');
      return;
    }
    if (Number(withdrawForm.amount) > summary.availableBalance) {
      toast.error('Amount exceeds your available balance');
      return;
    }
    try {
      setWithdrawing(true);
      await api.post('/wallet/payouts', {
        amount: Number(withdrawForm.amount),
        payoutMethodId: withdrawForm.payoutMethodId || undefined,
      });
      toast.success('Withdrawal requested. It will be reviewed by our admin team.');
      setWithdrawOpen(false);
      setWithdrawForm({ amount: '', payoutMethodId: '' });
      reload();
    } catch (err) {
      toast.error(err.message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleAddMethod = async (e) => {
    e.preventDefault();
    try {
      setAddingMethod(true);
      await api.post('/wallet/payout-methods', methodForm);
      toast.success('Payout method added');
      setMethodForm({ type: 'BANK', accountHolderName: '', accountNumber: '', ifsc: '', upiId: '' });
      reload();
    } catch (err) {
      toast.error(err.message || 'Could not add payout method');
    } finally {
      setAddingMethod(false);
    }
  };

  const handleDeleteMethod = async (id) => {
    if (!window.confirm('Remove this payout method?')) return;
    try {
      await api.delete(`/wallet/payout-methods/${id}`);
      toast.success('Method removed');
      reload();
    } catch (err) {
      toast.error(err.message || 'Could not remove method');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const chartData = payments.slice(0, 10).map((p, i) => ({
    name: p.booking?.serviceSnapshot?.name || `Job ${i + 1}`,
    gross: p.workerGross || p.amount,
    net: p.workerNetEarnings || p.amount,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">My Wallet &amp; Earnings</h2>

      {/* ── Balance cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-green-50 border-green-200">
          <p className="text-sm text-green-700 font-medium">Available Balance</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{inr(summary.availableBalance)}</p>
          <p className="text-xs text-green-600 mt-1">Ready to withdraw</p>
        </div>
        <div className="card bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-700 font-medium">Pending (awaiting release)</p>
          <p className="text-2xl font-bold text-yellow-800 mt-1">{inr(summary.pendingBalance)}</p>
          <p className="text-xs text-yellow-600 mt-1">Released when the customer confirms completion</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Lifetime Earnings</p>
          <p className="text-2xl font-bold mt-1">{inr(summary.totalEarned)}</p>
          <p className="text-xs text-gray-400 mt-1">Net after fees &amp; cooperative contribution</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Total Withdrawn</p>
          <p className="text-2xl font-bold mt-1">{inr(summary.totalWithdrawn)}</p>
          <p className="text-xs text-gray-400 mt-1">Lifetime payouts completed</p>
        </div>
      </div>

      {summary.availableBalance > 0 && (
        <div className="card bg-brand-50 border-brand-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-brand-800">You have {inr(summary.availableBalance)} available to withdraw.</p>
              <p className="text-xs text-brand-600 mt-0.5">Withdrawals are reviewed and processed by the cooperative admin.</p>
            </div>
            <button onClick={() => setWithdrawOpen(true)} className="btn-primary text-sm">Withdraw Funds</button>
          </div>
        </div>
      )}

      {/* Earnings report (summary + chart + history) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Gross Amount</p>
          <p className="text-2xl font-bold mt-1">{inr(legacySummary.totalGross)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Cooperative Contribution</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{inr(legacySummary.totalCoopDeduction)}</p>
          <p className="text-xs text-gray-500">For your welfare fund</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 font-medium">Platform Fee Paid</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{inr(legacySummary.totalPlatformFee)}</p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Recent Earnings</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="gross" fill="#93c5fd" name="Gross" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" fill="#22c55e" name="Net" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Payout methods ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-4">Payout Methods</h3>
          {methods.length === 0 ? (
            <p className="text-gray-400 text-sm mb-3">No payout methods yet. Add a bank account or UPI ID to receive withdrawals.</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {methods.map((m) => (
                <li key={m._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">
                      {m.type === 'BANK' ? '🏦 Bank Account' : '📱 UPI'}
                      {m.isDefault && <span className="badge bg-brand-100 text-brand-700 ml-2">Default</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {m.type === 'BANK'
                        ? `${m.accountHolderName || ''} • ${m.accountNumber} • ${m.ifsc}`
                        : m.upiId}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteMethod(m._id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddMethod} className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMethodForm({ ...methodForm, type: 'BANK' })}
                className={`btn text-sm flex-1 ${methodForm.type === 'BANK' ? 'btn-primary' : 'btn-secondary'}`}
              >Bank Account</button>
              <button
                type="button"
                onClick={() => setMethodForm({ ...methodForm, type: 'UPI' })}
                className={`btn text-sm flex-1 ${methodForm.type === 'UPI' ? 'btn-primary' : 'btn-secondary'}`}
              >UPI</button>
            </div>
            {methodForm.type === 'BANK' ? (
              <>
                <input placeholder="Account holder name" value={methodForm.accountHolderName} onChange={(e) => setMethodForm({ ...methodForm, accountHolderName: e.target.value })} className="input-field" required />
                <input placeholder="Account number" value={methodForm.accountNumber} onChange={(e) => setMethodForm({ ...methodForm, accountNumber: e.target.value })} className="input-field" required />
                <input placeholder="IFSC code" value={methodForm.ifsc} onChange={(e) => setMethodForm({ ...methodForm, ifsc: e.target.value })} className="input-field" required />
              </>
            ) : (
              <input placeholder="UPI ID (name@bank)" value={methodForm.upiId} onChange={(e) => setMethodForm({ ...methodForm, upiId: e.target.value })} className="input-field" required />
            )}
            <button type="submit" disabled={addingMethod} className="btn btn-primary text-sm">
              {addingMethod ? 'Saving…' : 'Add Payout Method'}
            </button>
          </form>
        </div>

        {/* ── Payout history ── */}
        <div className="card">
          <h3 className="font-semibold mb-4">Withdrawal History</h3>
          {payouts.length === 0 ? (
            <p className="text-gray-400 text-sm">No withdrawals yet</p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {payouts.map((p) => (
                <div key={p._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{p.payoutNumber}</p>
                    <p className="text-xs text-gray-500">{p.status === 'PENDING' ? 'Awaiting admin review' : new Date(p.requestedAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">₹{p.amount.toLocaleString('en-IN')}</p>
                    <span className={`badge ${PAYOUT_STATUS[p.status]?.cls || 'bg-gray-100 text-gray-600'}`}>{PAYOUT_STATUS[p.status]?.label || p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Ledger ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Ledger (all wallet movements)</h3>
          <span className="text-xs text-gray-400">Audit trail — every movement is recorded</span>
        </div>
        {transactions.length === 0 ? (
          <p className="text-gray-400 text-sm">No wallet activity yet</p>
        ) : (
          <div className="space-y-3 max-h-[440px] overflow-y-auto">
            {transactions.map((t) => (
              <div key={t._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">
                    {t.type === 'JOB_EARNING' ? '💰 Job earning' : t.type === 'WITHDRAWAL' ? '🏦 Withdrawal' : t.type}
                    {t.booking?.serviceSnapshot?.name ? ` — ${t.booking.serviceSnapshot.name}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">{t.description || ''}{t.reference ? ` (${t.reference})` : ''}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${t.type === 'JOB_EARNING' ? 'text-green-600' : 'text-gray-700'}`}>
                    {t.type === 'WITHDRAWAL' && t.status === 'REVERSED' ? '+' : t.type === 'WITHDRAWAL' ? '−' : '+'}{inr(t.amount)}
                  </p>
                  <span className={`badge ${TXN_STATUS[t.status] || 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Withdraw modal ── */}
      {withdrawOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Withdraw Funds</h3>
              <button onClick={() => setWithdrawOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleWithdraw} className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Available balance: <span className="font-bold text-green-700">{inr(summary.availableBalance)}</span>
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600">Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={summary.availableBalance}
                  value={withdrawForm.amount}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                  className="input-field mt-1"
                  placeholder="Enter amount"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Payout method</label>
                <select
                  value={withdrawForm.payoutMethodId}
                  onChange={(e) => setWithdrawForm({ ...withdrawForm, payoutMethodId: e.target.value })}
                  className="input-field mt-1"
                >
                  <option value="">Select a method</option>
                  {methods.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.type === 'BANK'
                        ? `${m.accountHolderName || 'Bank'} ${m.accountNumber} • ${m.ifsc}`
                        : `UPI ${m.upiId}`}
                    </option>
                  ))}
                </select>
                {methods.length === 0 && (
                  <p className="text-xs text-orange-500 mt-1">Add a payout method above first.</p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setWithdrawOpen(false)} className="btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={withdrawing} className="btn-primary text-sm">
                  {withdrawing ? 'Requesting…' : 'Request Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}