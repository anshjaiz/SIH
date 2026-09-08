import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminWelfare() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/workers');
        setWorkers(res.data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const stats = {
    total: workers.length,
    verified: workers.filter(w => w.verificationStatus === 'VERIFIED').length,
    withInsurance: workers.filter(w => w.insuranceActive).length,
    welfareEnrolled: workers.filter(w => w.welfareEnrolled).length,
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Worker Welfare Monitoring</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-blue-50"><p className="text-sm text-blue-700 font-medium">Total Workers</p><p className="text-2xl font-bold">{stats.total}</p></div>
        <div className="card bg-green-50"><p className="text-sm text-green-700 font-medium">Verified</p><p className="text-2xl font-bold">{stats.verified}</p></div>
        <div className="card bg-purple-50"><p className="text-sm text-purple-700 font-medium">With Insurance</p><p className="text-2xl font-bold">{stats.withInsurance}</p></div>
        <div className="card bg-orange-50"><p className="text-sm text-orange-700 font-medium">Welfare Enrolled</p><p className="text-2xl font-bold">{stats.welfareEnrolled}</p></div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-4">Workers by Verification Status</h3>
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {['VERIFIED', 'PENDING', 'REJECTED', 'SUSPENDED'].map(status => {
              const count = workers.filter(w => w.verificationStatus === status).length;
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div key={status} className="flex items-center gap-4">
                  <span className="w-24 text-sm font-medium">{status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4">
                    <div
                      className={`h-4 rounded-full ${
                        status === 'VERIFIED' ? 'bg-green-500' :
                        status === 'PENDING' ? 'bg-yellow-400' :
                        status === 'REJECTED' ? 'bg-red-400' : 'bg-gray-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-16 text-right">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
