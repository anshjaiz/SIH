import { useEffect, useState } from 'react';
import api from '../../services/api';

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({});

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.append('status', filter);
      params.append('page', page);
      const res = await api.get(`/admin/bookings?${params}`);
      setBookings(res.data || []);
      setMeta(res.meta || {});
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter, page]);

  const statusColors = {
    REQUESTED: 'badge-gray', MATCHING: 'badge-info', ASSIGNED: 'badge-info',
    REASSIGNED: 'badge-warning', ACCEPTED: 'badge-success', ON_THE_WAY: 'badge-success',
    WORKER_ARRIVED: 'badge-success', STARTED: 'badge-success', IN_PROGRESS: 'badge-success',
    COMPLETED: 'badge-success', CANCELLED: 'badge-danger', DISPUTED: 'badge-warning',
    WORKER_NO_SHOW: 'badge-danger', EXPIRED: 'badge-danger',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">All Bookings</h2>

      <div className="flex flex-wrap gap-2">
        {['', 'REQUESTED', 'MATCHING', 'ASSIGNED', 'REASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'WORKER_NO_SHOW', 'EXPIRED'].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No bookings found</div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-3 font-medium">Booking #</th>
                  <th className="pb-3 font-medium">Service</th>
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Worker</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map((b) => (
                  <tr key={b._id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium">{b.bookingNumber}</td>
                    <td className="py-3">{b.serviceSnapshot?.name}</td>
                    <td className="py-3 text-gray-600">{b.customer?.name || '—'}</td>
                    <td className="py-3 text-gray-600">{b.worker?.verificationStatus || '—'}</td>
                    <td className="py-3 text-gray-500">{new Date(b.requestedDate).toLocaleDateString()}</td>
                    <td className="py-3 font-medium">₹{b.priceBreakdown?.total}</td>
                    <td className="py-3"><span className={`badge ${statusColors[b.status]}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta.total > meta.limit && (
            <div className="flex justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-sm">← Prev</button>
              <span className="text-sm text-gray-500 py-2">Page {page} of {Math.ceil((meta.total || 0) / (meta.limit || 20))}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page * (meta.limit || 20) >= meta.total} className="btn-secondary text-sm">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
