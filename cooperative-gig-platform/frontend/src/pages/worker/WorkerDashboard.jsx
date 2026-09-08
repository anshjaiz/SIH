import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import StatsCard from '../../components/StatsCard';
import { HiOutlineBriefcase, HiOutlineCurrencyRupee, HiOutlineClock, HiOutlineStar } from 'react-icons/hi';

export default function WorkerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/workers/dashboard');
        setData(res.data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  const stats = data?.stats || {};
  const activeJobs = data?.activeJobs || [];
  const pendingRequests = data?.pendingRequests || [];
  const recentCompleted = data?.recentCompleted || [];
  const upcomingJobs = data?.upcomingJobs || [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Worker Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Earnings" value={`₹${(stats.totalEarnings || 0).toLocaleString()}`} icon={HiOutlineCurrencyRupee} color="success" />
        <StatsCard title="Weekly Earnings" value={`₹${(stats.weeklyEarnings || 0).toLocaleString()}`} icon={HiOutlineClock} color="info" />
        <StatsCard title="Completed Jobs" value={stats.completedJobs} icon={HiOutlineBriefcase} color="brand" />
        <StatsCard title="Rating" value={stats.rating?.toFixed(1) || 'N/A'} icon={HiOutlineStar} color="warning" suffix={`(${stats.ratingCount || 0})`} />
      </div>

      {/* Verification status */}
      {data?.profile?.verificationStatus !== 'VERIFIED' && (
        <div className="card bg-yellow-50 border border-yellow-200">
          <p className="text-yellow-700 font-medium">
            ⚠️ Your account is not yet verified. Complete your profile and upload certificates to get verified.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Requests */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Job Requests</h3>
            {pendingRequests.length > 0 && (
              <span className="badge bg-red-100 text-red-700">{pendingRequests.length} new</span>
            )}
          </div>
          {pendingRequests.length === 0 ? (
            <p className="text-gray-400 text-sm">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.slice(0, 3).map((job) => (
                <div key={job._id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{job.serviceSnapshot?.name}</p>
                    {job.isEmergency && <span className="badge bg-orange-100 text-orange-700">EMERGENCY</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Score: {job.matchScore}/100</p>
                  <Link to="/worker/jobs" className="text-xs text-brand-600 hover:underline mt-1 inline-block">View details →</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Jobs */}
        <div className="card">
          <h3 className="font-semibold mb-4">Active Jobs</h3>
          {activeJobs.length === 0 ? (
            <p className="text-gray-400 text-sm">No active jobs</p>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <div key={job._id} className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{job.serviceSnapshot?.name}</p>
                    <span className="badge badge-success">{job.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Customer: {job.customer?.name}</p>
                  <p className="text-xs text-gray-500">📞 {job.customer?.phone}</p>
                  <Link to="/worker/active" className="text-xs text-brand-600 hover:underline mt-1 inline-block">Manage →</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        {upcomingJobs.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">Upcoming</h3>
            <div className="space-y-3">
              {upcomingJobs.map((job) => (
                <div key={job._id} className="p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium text-sm">{job.serviceSnapshot?.name}</p>
                  <p className="text-xs text-gray-500">{new Date(job.requestedDate).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Completed */}
        <div className="card">
          <h3 className="font-semibold mb-4">Recent Completed</h3>
          {recentCompleted.length === 0 ? (
            <p className="text-gray-400 text-sm">No completed jobs</p>
          ) : (
            <div className="space-y-3">
              {recentCompleted.map((job) => (
                <div key={job._id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-sm">{job.serviceSnapshot?.name}</p>
                  <p className="text-xs text-gray-500">
                    {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
