import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [certs, setCerts] = useState([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.append('status', filter);
      const res = await api.get(`/admin/workers?${params}`);
      setWorkers(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
    loadCerts();
  };

  const loadCerts = async () => {
    try {
      const res = await api.get('/admin/certificates');
      setCerts(res.data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [filter]);

  const handleStatus = async (id, status) => {
    try {
      await api.put(`/admin/workers/${id}/status`, { status, remark: `Status updated to ${status}` });
      toast.success(`Worker status updated to ${status}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleCertReview = async (id, action) => {
    try {
      await api.put(`/admin/certificates/${id}/review`, { action });
      toast.success(`Certificate ${action === 'APPROVED' ? 'approved' : 'rejected'}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleSkillVerify = async (workerId, skillId, verified) => {
    try {
      await api.patch(`/admin/workers/${workerId}/skills/${skillId}`, { verified });
      toast.success(`Skill ${verified ? 'verified' : 'unverified'}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const statusColors = {
    PENDING: 'badge-warning', VERIFIED: 'badge-success', REJECTED: 'badge-danger', SUSPENDED: 'badge-danger',
  };

  const filtered = search
    ? workers.filter(w =>
        (w.user?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (w.user?.email || '').toLowerCase().includes(search.toLowerCase()) ||
        w.skills?.some(s => (s.name || '').toLowerCase().includes(search.toLowerCase()))
      )
    : workers;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-gray-900">Workers</h2>
        <input
          type="text"
          placeholder="Search workers..."
          className="input-field max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {['', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No workers found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => (
            <div key={w._id} className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                  {w.user?.name?.charAt(0) || 'W'}
                </div>
                <div>
                  <h3 className="font-semibold">{w.user?.name}</h3>
                  <p className="text-sm text-gray-500">{w.user?.email}</p>
                  <p className="text-xs text-gray-400">{w.area}, {w.city}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(w.skills || []).slice(0, 5).map((sk) => (
                      <span key={sk._id || sk.name} className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${sk.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {sk.name}
                        {sk.verified
                          ? <button title="Unverify skill" className="hover:underline" onClick={() => handleSkillVerify(w._id, sk._id, false)}>✓</button>
                          : <button title="Verify skill" className="hover:underline font-bold" onClick={() => handleSkillVerify(w._id, sk._id, true)}>verify</button>}
                      </span>
                    ))}
                    {(w.skills || []).length > 5 && <span className="text-xs text-gray-400">+{(w.skills.length - 5)} more</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right mr-4">
                  <p className="text-sm">⭐ {w.rating?.toFixed(1)} • {w.completedJobs} jobs</p>
                  <p className="text-xs text-gray-500">₹{(w.totalEarnings || 0).toLocaleString()} earned</p>
                </div>
                <span className={`badge ${statusColors[w.verificationStatus]}`}>{w.verificationStatus}</span>
                <div className="flex gap-1">
                  {w.verificationStatus !== 'VERIFIED' && (
                    <button onClick={() => handleStatus(w._id, 'VERIFIED')} className="text-xs bg-green-600 text-white px-2 py-1 rounded">Verify</button>
                  )}
                  {w.verificationStatus !== 'REJECTED' && w.verificationStatus !== 'SUSPENDED' && (
                    <button onClick={() => handleStatus(w._id, 'REJECTED')} className="text-xs bg-red-600 text-white px-2 py-1 rounded">Reject</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Certificates awaiting verification */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Certificate Verification</h2>
        {certs.filter((c) => c.status === 'PENDING').length === 0 ? (
          <div className="card text-gray-400 text-sm text-center py-8">No certificates pending verification</div>
        ) : (
          <div className="space-y-3">
            {certs.filter((c) => c.status === 'PENDING').map((cert) => (
              <div key={cert._id} className="card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{cert.title}</p>
                  <p className="text-sm text-gray-500">
                    {cert.worker?.user?.name || 'Worker'} ({cert.worker?.user?.email || ''})
                  </p>
                  <p className="text-xs text-gray-400">Issued by: {cert.issuingAuthority || 'Self-declared'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleCertReview(cert._id, 'APPROVED')} className="text-xs bg-green-600 text-white px-3 py-1 rounded">Approve</button>
                  <button onClick={() => handleCertReview(cert._id, 'REJECTED')} className="text-xs bg-red-600 text-white px-3 py-1 rounded">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
