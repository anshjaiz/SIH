import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import StatsCard from '../../components/StatsCard';
import AIDemandAssistant from '../../components/worker/AIDemandAssistant';
import WorkerAIAssistant from '../../components/worker/WorkerAIAssistant';
import { HiOutlineBriefcase, HiOutlineCurrencyRupee, HiOutlineClock, HiOutlineStar } from 'react-icons/hi';

export default function WorkerDashboard() {
  const { t } = useTranslation();
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
      <h2 className="text-xl font-bold text-gray-900">{t('dashW.title')}</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title={t('dashW.totalEarnings')} value={`₹${(stats.totalEarnings || 0).toLocaleString()}`} icon={HiOutlineCurrencyRupee} color="success" />
        <StatsCard title={t('dashW.weeklyEarnings')} value={`₹${(stats.weeklyEarnings || 0).toLocaleString()}`} icon={HiOutlineClock} color="info" />
        <StatsCard title={t('dashW.completedJobs')} value={stats.completedJobs} icon={HiOutlineBriefcase} color="brand" />
        <StatsCard title={t('dashW.rating')} value={stats.rating?.toFixed(1) || 'N/A'} icon={HiOutlineStar} color="warning" suffix={`(${stats.ratingCount || 0})`} />
      </div>

      {/* AI Demand Assistant + Job Demand Heatmap */}
      <AIDemandAssistant />

      {/* ShramikSetu AI Assistant chatbot */}
      <WorkerAIAssistant />

      {/* Verification status */}
      {data?.profile?.verificationStatus !== 'VERIFIED' && (
        <div className="card bg-yellow-50 border border-yellow-200">
          <p className="text-yellow-700 font-medium">
            ⚠️ {t('dashW.verifyNotice')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Requests */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{t('jobs.title')}</h3>
            {pendingRequests.length > 0 && (
              <span className="badge bg-red-100 text-red-700">{pendingRequests.length} {t('dashW.newLabel')}</span>
            )}
          </div>
          {pendingRequests.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('jobs.noJobRequests')}</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.slice(0, 3).map((job) => (
                <div key={job._id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{job.serviceSnapshot?.name}</p>
                    {job.isEmergency && <span className="badge bg-orange-100 text-orange-700">⚡ {t('jobs.urgent')}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t('jobs.matchScore', { score: job.matchScore })}</p>
                  <Link to="/worker/jobs" className="text-xs text-brand-600 hover:underline mt-1 inline-block">{t('jobs.details')} →</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Jobs */}
        <div className="card">
          <h3 className="font-semibold mb-4">{t('dashW.activeJobs')}</h3>
          {activeJobs.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('active.noActiveJobs')}</p>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <div key={job._id} className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{job.serviceSnapshot?.name}</p>
                    <span className="badge badge-success">{t(`status.${job.status}`, job.status)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{t('jobs.customer')}: {job.customer?.name}</p>
                  <p className="text-xs text-gray-500">📞 {job.customer?.phone}</p>
                  <Link to="/worker/active" className="text-xs text-brand-600 hover:underline mt-1 inline-block">{t('dashW.manage')} →</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        {upcomingJobs.length > 0 && (
          <div className="card">
            <h3 className="font-semibold mb-4">{t('dashW.upcoming')}</h3>
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
          <h3 className="font-semibold mb-4">{t('hist.jobCompleted')}</h3>
          {recentCompleted.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('hist.noJobs')}</p>
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
