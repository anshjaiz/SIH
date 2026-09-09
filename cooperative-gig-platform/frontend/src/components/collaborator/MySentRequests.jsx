import { useEffect, useState } from 'react';
import { getSocket } from '../../services/socket';
import api from '../../services/api';

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const STATUS_BADGE = {
  PENDING: 'bg-gray-100 text-gray-600',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-600',
  REVOKED: 'bg-gray-200 text-gray-500',
};

const REQ_STATUS_BADGE = {
  OPEN: 'bg-blue-100 text-blue-700',
  FILLED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-200 text-gray-600',
};

export default function MySentRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get('/collaborations/requests/sent');
      setRequests(res.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return undefined;
    const onUpdate = () => load();
    socket.on('collaboration_update', onUpdate);
    socket.on('collaboration_invite', onUpdate);
    return () => {
      socket.off('collaboration_update', onUpdate);
      socket.off('collaboration_invite', onUpdate);
    };
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-9 w-9 border-b-2 border-brand-600"></div></div>;
  if (requests.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">📨 Your collaboration requests</h3>
      {requests.map((r) => {
        const accepted = (r.candidates || []).filter((c) => c.status === 'ACCEPTED').length;
        const need = Math.max((r.numberOfCollaborators || 1) - accepted, 0);
        const booking = r.booking || {};
        const leadName = r.leadWorker?.user?.name || 'You';
        return (
          <div key={r._id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-semibold text-gray-900">{booking.service || 'Job'}</h4>
                <p className="text-sm text-gray-500">{booking.bookingNumber} · {r._id.toString().slice(-6)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${REQ_STATUS_BADGE[r.status]}`}>{r.status}</span>
                {r.status === 'OPEN' && (
                  <span className="badge bg-amber-100 text-amber-700">Need {need} more</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
              <div>🧰 Role: {r.role}</div>
              <div>📅 {fmtDate(r.date)} · {r.startTime} · {r.durationHours}h</div>
              <div className="col-span-2">📍 {r.city || 'Hyderabad'} · {r.address}</div>
              <div className="col-span-2 font-medium text-brand-700">💰 Estimated earning ₹{r.estimatedPayment}</div>
            </div>

            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Invited workers <span className="normal-case font-normal">({accepted} of {r.numberOfCollaborators || 1} accepted)</span>
            </div>
            <div className="space-y-1.5">
              {(r.candidates || []).map((c, i) => {
                const name = c.worker?.user?.name || 'Worker';
                return (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700">
                      {c.status === 'ACCEPTED' ? '✅ ' : ''}{name}
                      {c.worker?.user?.phone ? ` · ${c.worker.user.phone}` : ''}
                    </span>
                    <span className={`badge ${STATUS_BADGE[c.status] || STATUS_BADGE.PENDING}`}>{c.status}</span>
                  </div>
                );
              })}
            </div>
            {r.leadWorker && (
              <p className="text-xs text-gray-400 mt-3">Requested by {leadName}</p>
            )}
            {r.instructions && (
              <p className="text-xs text-gray-500 mt-1 italic">"{r.instructions}"</p>
            )}
          </div>
        );
      })}
    </div>
  );
}