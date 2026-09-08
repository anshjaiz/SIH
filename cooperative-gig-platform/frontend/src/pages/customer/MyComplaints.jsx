import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import EvidenceList from '../../components/EvidenceList';
import { statusColors, priorityColors, label, COMPLAINT_CATEGORIES, PREFERRED_RESOLUTIONS, refundStatusColors } from '../../utils/complaints';

export default function MyComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/complaints/mine');
      setComplaints(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this complaint?')) return;
    try {
      await api.post(`/complaints/${id}/cancel`);
      toast.success('Complaint cancelled');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">My Complaints</h2>
        <p className="text-sm text-gray-500">Track the status of complaints raised against your bookings</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-20 text-gray-400">You haven't raised any complaints yet</div>
      ) : (
        <div className="space-y-4">
          {complaints.map((c) => (
            <div key={c._id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-900">{c.complaintNumber}</span>
                    <span className={`badge ${statusColors[c.status] || 'badge-gray'}`}>{c.status.replace('_', ' ')}</span>
                    <span className={`badge ${priorityColors[c.priority] || 'badge-gray'}`}>{c.priority}</span>
                    <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1"><span className="text-gray-400">Category:</span> {label(c.category, COMPLAINT_CATEGORIES)}</p>
                  <p className="text-sm text-gray-600">{c.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Booking: {c.booking?.bookingNumber || '—'} • {c.booking?.serviceSnapshot?.name || ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Requested: {label(c.preferredResolution, PREFERRED_RESOLUTIONS)}
                  </p>
                  {c.isSafety && <p className="text-xs text-red-600 font-medium mt-1">⚠ Marked urgent (safety)</p>}
                </div>
                <div className="flex flex-col gap-2 items-end shrink-0">
                  <button onClick={() => setSelected(selected && selected._id === c._id ? null : c)} className="text-xs text-brand-600 font-medium">
                    {selected && selected._id === c._id ? 'Hide details' : 'Details'}
                  </button>
                  {['SUBMITTED', 'UNDER_REVIEW'].includes(c.status) && (
                    <button onClick={() => handleCancel(c._id)} className="text-xs text-red-600 font-medium">Cancel complaint</button>
                  )}
                </div>
              </div>

              {selected && selected._id === c._id && (
                <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex items-center gap-1 text-xs">
                    {['SUBMITTED', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLUTION_PROPOSED', 'RESOLVED'].map((s, i) => {
                      const reached = ['SUBMITTED', 'UNDER_REVIEW', 'INVESTIGATING', 'RESOLUTION_PROPOSED', 'RESOLVED'].indexOf(c.status) >= i;
                      return (
                        <div key={s} className="flex items-center gap-1">
                          <span className={`px-2 py-1 rounded-full ${reached ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{s.replace('_', ' ')}</span>
                          {i < 4 && <span className="text-gray-300">→</span>}
                        </div>
                      );
                    })}
                  </div>

                  {c.evidence?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">My evidence</p>
                      <EvidenceList items={c.evidence} max={6} />
                    </div>
                  )}

                  {c.responses?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1">Conversation</p>
                      <div className="space-y-2">
                        {c.responses.map((r, i) => (
                          <div key={i} className="text-xs bg-gray-50 p-2 rounded-lg">
                            <span className="font-semibold text-gray-700">{r.role} · {new Date(r.submittedAt).toLocaleString()}</span>
                            {r.acceptResponsibility && <span className="ml-2 text-amber-600">accepts responsibility</span>}
                            {r.dispute && <span className="ml-2 text-red-600">disputes</span>}
                            {r.message && <p className="text-gray-600 mt-0.5">{r.message}</p>}
                            {r.evidence?.length > 0 && <div className="mt-1"><EvidenceList items={r.evidence} max={3} /></div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.resolutionDecision && (
                    <div className="text-xs bg-green-50 p-2 rounded-lg">
                      <span className="font-semibold text-green-700">Resolution: {c.resolutionDecision.decisionType?.replace('_', ' ')}</span>
                      {c.resolutionDecision.reason && <p className="text-green-700">{c.resolutionDecision.reason}</p>}
                      {c.resolutionDecision.amount > 0 && <p className="text-green-700 mt-1">Amount: ₹{c.resolutionDecision.amount}</p>}
                    </div>
                  )}

                  {c.refund?.status && c.refund.status !== 'NOT_REQUIRED' && (
                    <div className="text-xs bg-blue-50 p-2 rounded-lg flex items-center gap-2">
                      <span className="font-semibold text-blue-700">Refund {c.refund.refundNumber}</span>
                      <span className={`badge ${refundStatusColors[c.refund.status]}`}>{c.refund.status}</span>
                      <span>₹{c.refund.amount}</span>
                    </div>
                  )}

                  {c.history?.slice(0, 6).map((h, i) => (
                    <p key={i} className="text-[11px] text-gray-400">• {h.status.replace('_', ' ')} — {new Date(h.at || h.updatedAt).toLocaleString()}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}