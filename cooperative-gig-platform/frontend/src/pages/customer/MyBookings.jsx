import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const params = filter ? `?status=${filter}` : '';
        const res = await api.get(`/customers/bookings${params}`);
        setBookings(res.data || []);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, [filter]);

  const statusColors = {
    REQUESTED: 'badge-gray', MATCHING: 'badge-info', ASSIGNED: 'badge-info',
    REASSIGNED: 'badge-warning', ACCEPTED: 'badge-success', ON_THE_WAY: 'badge-success',
    WORKER_ARRIVED: 'badge-success', STARTED: 'badge-success', IN_PROGRESS: 'badge-success',
    COMPLETED: 'badge-success', CANCELLED: 'badge-danger', DISPUTED: 'badge-warning',
    WORKER_NO_SHOW: 'badge-danger', EXPIRED: 'badge-danger',
  };

  const filters = ['', 'REQUESTED', 'MATCHING', 'REASSIGNED', 'ACCEPTED', 'STARTED', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'WORKER_NO_SHOW', 'EXPIRED'];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">My Bookings</h2>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : bookings.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No bookings found</div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <Link
              to={`/customer/bookings/${b._id}`}
              key={b._id}
              className="block card hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                    {b.serviceSnapshot?.name?.charAt(0) || 'S'}
                  </div>
                  <div>
                    <h3 className="font-semibold">{b.serviceSnapshot?.name}</h3>
                    <p className="text-sm text-gray-500">
                      {b.bookingNumber} • {new Date(b.requestedDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`badge ${statusColors[b.status]}`}>{b.status}</span>
                  <p className="text-sm font-semibold text-brand-600 mt-1">₹{b.priceBreakdown?.total}</p>
                </div>
              </div>
              {b.isEmergency && <p className="text-xs text-orange-600 font-medium mt-2">⚡ Emergency</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
