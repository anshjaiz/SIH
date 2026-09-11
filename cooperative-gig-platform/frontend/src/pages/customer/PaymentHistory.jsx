import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS = {
  PENDING: 'bg-gray-100 text-gray-600',
  CREATED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

export default function PaymentHistory() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/payments/customer/history');
      setPayments(res.data || []);
      setTotal((res.data || []).reduce((s, p) => s + (p.status === 'PAID' || p.status === 'SUCCESS' ? p.amount : 0), 0));
    } catch (err) {
      toast.error(err.message || 'Could not load payments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">My Payments</h2>
        <div className="badge bg-brand-50 text-brand-700 px-4 py-2 text-sm font-semibold">
          Total paid: {inr(total)}
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">💸</p>
          <p className="text-gray-500">No payments yet.</p>
          <p className="text-sm text-gray-400 mt-1">When you pay for a booking, your payment history will appear here.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Booking</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3 font-medium">{p.booking?.serviceSnapshot?.name || 'Service'}</td>
                    <td className="px-5 py-3 text-gray-500">{p.booking?.bookingNumber || '—'}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {p.paidAt || p.paymentDate ? new Date(p.paidAt || p.paymentDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="badge bg-blue-50 text-blue-700">{p.method || 'UPI'}</span>
                      {p.gateway === 'razorpay' && <span className="text-[10px] text-gray-400 ml-1">Razorpay</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-bold">{inr(p.amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`badge ${STATUS[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                      {p.status === 'PAID' && p.transactionId && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Txn: {p.transactionId}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Every payment is processed on the platform&apos;s secure gateway and verified server-side. Worker earnings are only
        released after you confirm the job is complete.
      </p>
    </div>
  );
}