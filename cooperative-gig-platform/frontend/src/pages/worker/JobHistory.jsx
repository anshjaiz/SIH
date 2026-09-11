import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

const FAILED_REASON_KEYS = {
  WORKER_NO_SHOW: 'hist.reasonWorkerNoShow',
  EXPIRED: 'hist.reasonExpired',
  REASSIGNED: 'hist.reasonReassigned',
  CANCELLED: 'hist.reasonCancelled',
};

const FAILED_REASON_DEFAULTS = {
  WORKER_NO_SHOW: 'Marked as no-show — worker did not check in on time',
  EXPIRED: 'Job expired — no worker was confirmed in time',
  REASSIGNED: 'Replaced — booking was reassigned to another worker',
  CANCELLED: 'Cancelled by customer or admin',
};

const statusColors = {
  COMPLETED: 'badge-success',
  WORKER_NO_SHOW: 'badge-danger',
  EXPIRED: 'badge-danger',
  REASSIGNED: 'badge-warning',
  CANCELLED: 'badge-gray',
};

export default function JobHistory() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('all');
  const [data, setData] = useState({ jobs: [], meta: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get(`/workers/jobs/history${tab !== 'all' ? `?tab=${tab}` : ''}`);
        if (!cancelled) setData(res.data || { jobs: [], meta: {} });
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">{t('hist.title', 'Job History')}</h2>

      <div className="flex flex-wrap gap-2">
        {[
          ['all', t('hist.tabAll', 'All')],
          ['completed', t('hist.tabCompleted', 'Completed')],
          ['failed', t('hist.tabFailed', 'Failed / No-Show')],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === key ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : data.jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">{t('hist.noJobs', 'No jobs found')}</div>
      ) : (
        <div className="space-y-4">
          {data.jobs.map((job) => (
            <div key={job._id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-semibold">{job.serviceSnapshot?.name || job.service?.name}</h3>
                  <p className="text-sm text-gray-500">
                    {job.bookingNumber} • {new Date(job.requestedDate).toLocaleDateString()}
                  </p>
                </div>
                <span className={`badge ${statusColors[job.status]}`}>{job.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <p>{t('hist.customer', 'Customer:')} {job.customer?.name || '—'}</p>
                  <p>📍 {job.address}</p>
                </div>
                <div>
                  {job.scheduledStartTime && (
                    <p>⏰ {job.timeSlot} ({new Date(job.scheduledStartTime).toLocaleString()})</p>
                  )}
                </div>
              </div>

              {FAILED_REASON_KEYS[job.status] && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  job.status === 'WORKER_NO_SHOW' ? 'bg-red-50 text-red-700'
                  : job.status === 'CANCELLED' ? 'bg-gray-100 text-gray-600'
                  : 'bg-yellow-50 text-yellow-700'
                }`}>
                  <span className="font-medium">{t(FAILED_REASON_KEYS[job.status], FAILED_REASON_DEFAULTS[job.status])}</span>
                  {job.noShowDetectedAt && (
                    <span className="block text-xs mt-1 opacity-80">
                      {t('hist.detected', 'Detected:')} {new Date(job.noShowDetectedAt).toLocaleString()}
                    </span>
                  )}
                  {job.cancellationReason && (
                    <span className="block text-xs mt-1 opacity-80">{t('hist.reason', 'Reason:')} {job.cancellationReason}</span>
                  )}
                </div>
              )}

              {job.status === 'COMPLETED' && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg text-sm text-green-700">
                  ✓ {t('hist.completed', 'Completed')} {job.completedAt ? new Date(job.completedAt).toLocaleString() : ''}
                </div>
              )}
            </div>
          ))}

          {data.meta.pages > 1 && (
            <p className="text-center text-sm text-gray-400">
              {t('hist.pageOf', 'Page {{page}} of {{total}}', { page: data.meta.page, total: data.meta.pages })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
