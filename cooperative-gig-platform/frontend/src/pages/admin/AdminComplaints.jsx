import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.append('status', filter);
      const res = await api.get(`/admin/complaints?${params}`);
      setComplaints(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleUpdate = async (id, status) => {
    try {
      await api.put(`/admin/complaints/${id}`, { status, resolution: `Resolved by admin on ${new Date().toLocaleDateString()}` });
      toast.success(`Complaint ${status}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const statusColors = {
    OPEN: 'badge-danger', UNDER_REVIEW: 'badge-warning', RESOLVED: 'badge-success', REJECTED: 'badge-gray',
  };

  const priorityColors = {
    LOW: 'text-gray-500', MEDIUM: 'text-yellow-600', HIGH: 'text-orange-600', URGENT: 'text-red-600',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Complaints</h2>

      <div className="flex flex-wrap gap-2">
        {['', 'OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No complaints</div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <div key={c._id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">{c.complaintNumber}</span>
                    <span className={`badge ${statusColors[c.status]}`}>{c.status}</span>
                    <span className={`text-xs font-medium ${priorityColors[c.priority]}`}>{c.priority}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{c.category?.replace('_', ' ')}</p>
                  <p className="text-sm text-gray-500">{c.description}</p>
                  {c.customer && (
                    <p className="text-xs text-gray-400 mt-2">
                      Customer: {c.customer.name} ({c.customer.email})
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {c.status === 'OPEN' && (
                    <>
                      <button onClick={() => handleUpdate(c._id, 'UNDER_REVIEW')} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Review</button>
                      <button onClick={() => handleUpdate(c._id, 'RESOLVED')} className="text-xs bg-green-600 text-white px-2 py-1 rounded">Resolve</button>
                    </>
                  )}
                  {c.status === 'UNDER_REVIEW' && (
                    <>
                      <button onClick={() => handleUpdate(c._id, 'RESOLVED')} className="text-xs bg-green-600 text-white px-2 py-1 rounded">Resolve</button>
                      <button onClick={() => handleUpdate(c._id, 'REJECTED')} className="text-xs bg-gray-500 text-white px-2 py-1 rounded">Reject</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
