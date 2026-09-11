import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import toast from 'react-hot-toast';
import MapComponent from '../../components/MapComponent';

export default function JobRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/workers/jobs/requests');
      setRequests(res.data || []);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(load, 5000);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onNewJob = () => load();
    if (socket) socket.on('new_job', onNewJob);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (socket) socket.off('new_job', onNewJob);
    };
  }, [load]);

  const handleAccept = async (id) => {
    try {
      await api.post(`/workers/jobs/${id}/accept`);
      toast.success(t('toast.jobAccepted'));
      load();
    } catch (err) {
      toast.error(err.message || t('toast.unknownError'));
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm(t('jobs.rejectConfirm'))) return;
    try {
      await api.post(`/workers/jobs/${id}/reject`);
      toast.success(t('toast.jobRejected'));
      load();
    } catch (err) {
      toast.error(err.message || t('toast.unknownError'));
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">{t('jobs.title')}</h2>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-gray-400">{t('jobs.noJobRequests')}</div>
      ) : (
        <div className="space-y-4">
          {requests.map((job) => (
            <div key={job._id} className={`card ${job.isEmergency ? 'border-l-4 border-orange-500' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{job.serviceSnapshot?.name}</h3>
                  <p className="text-sm text-gray-500">{job.bookingNumber} • {job.serviceSnapshot?.category}</p>
                  {job.isEmergency && <span className="badge bg-orange-100 text-orange-700 mt-1">⚡ {t('jobs.urgent')}</span>}
                  {job.status === 'REASSIGNED' && <span className="badge bg-purple-100 text-purple-700 mt-1">🔄 {t('jobs.replacementBadge')}</span>}
                  {job.priceIncreaseCount > 0 && <span className="badge bg-orange-100 text-orange-700 mt-1">🔥 {t('jobs.priceIncreased')}</span>}
                  {job.requiredSkillNames?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-xs text-gray-400">{t('jobs.required')}:</span>
                      {job.requiredSkillNames.map((s, i) => (
                        <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">🎯 {s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-brand-600">💰 ₹{job.priceBreakdown?.total}</p>
                  <p className="text-xs font-medium text-gray-600">{t('jobs.youEarn', { amount: job.workerPayout })}</p>
                  <p className="text-xs text-gray-500">{t('jobs.matchScore', { score: job.matchScore })}</p>
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-600 space-y-1">
                <p>📍 {job.address}</p>
                <p>📅 {new Date(job.requestedDate).toLocaleString()}</p>
                <p>⏰ {job.timeSlot}</p>
                {job.description && <p className="text-gray-500 italic">"{job.description}"</p>}
              </div>

              {job.matchReasons?.length > 0 && (
                <div className="mt-3 bg-gray-50 p-3 rounded-lg text-xs text-gray-600">
                  <p className="font-medium mb-1">{t('jobs.matchedWhy')}:</p>
                  {job.matchReasons.map((r, i) => <p key={i}>• {r}</p>)}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button onClick={() => handleAccept(job._id)} className="btn-success flex-1">{t('jobs.accept')}</button>
                <button onClick={() => handleReject(job._id)} className="btn-danger flex-1">{t('jobs.reject')}</button>
              </div>

              {job.location?.coordinates && (
                <div className="mt-4">
                  <MapComponent
                    center={[job.location.coordinates[1], job.location.coordinates[0]]}
                    markers={[{ lat: job.location.coordinates[1], lng: job.location.coordinates[0], label: job.serviceSnapshot?.name }]}
                    height="150px"
                    zoom={14}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}