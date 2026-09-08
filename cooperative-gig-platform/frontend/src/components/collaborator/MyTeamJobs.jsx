import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { getMyTeamJobs, checkInToTeam } from '../../services/collaboratorService';

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const BOOKING_COLORS = {
  ASSIGNED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  ON_THE_WAY: 'bg-green-100 text-green-700',
  STARTED: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-gray-200 text-gray-700',
};

export default function MyTeamJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingId, setCheckingId] = useState(null);

  const load = async () => {
    try {
      const res = await getMyTeamJobs();
      setJobs(res.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Live location: once checked in, share GPS every 10s so the lead worker can
  // track the helper (same behaviour as the worker's Active Jobs tracking).
  const trackingJob = jobs.some((j) => !j.completed && j.joinedAt);
  useEffect(() => {
    if (!trackingJob) return undefined;
    const send = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api.put('/workers/location', { coordinates: [pos.coords.longitude, pos.coords.latitude] }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    };
    send();
    const t = setInterval(send, 10000);
    return () => clearInterval(t);
  }, [trackingJob]);

  const handleCheckIn = async (job) => {
    setCheckingId(job.teamId);
    try {
      const res = await checkInToTeam(job.teamId);
      toast.success(res.message || 'Checked in!');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to check in');
    }
    setCheckingId(null);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-9 w-9 border-b-2 border-brand-600"></div></div>;

  if (jobs.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">✅ My team jobs</h3>
      {jobs.map((job) => (
        <div key={job.teamId} className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold text-gray-900">{job.booking?.service}</h4>
              <p className="text-sm text-gray-500">{job.booking?.bookingNumber}</p>
            </div>
            {job.completed ? (
              <span className="badge bg-gray-200 text-gray-700">Completed</span>
            ) : job.joinedAt ? (
              <span className="badge bg-green-100 text-green-700">✓ Checked in</span>
            ) : (
              <span className={`badge px-3 py-1 ${BOOKING_COLORS[job.booking?.status]}`}>{job.booking?.status}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
            <div>
              <p className="font-medium">Lead: {job.lead?.name}</p>
              <p>📞 {job.lead?.phone}</p>
            </div>
            <div>
              <p className="font-medium">Customer: {job.booking?.customer?.name}</p>
              <p>📞 {job.booking?.customer?.phone}</p>
            </div>
            <div className="col-span-2">📍 {job.booking?.address}, {job.booking?.city}</div>
            <div>🧰 Your role: {job.myRole}</div>
            <div>💰 Your pay: ₹{job.paymentEstimate}</div>
            {job.schedule && (
              <>
                <div>📅 {fmtDate(job.schedule.date)}</div>
                <div>⏰ {job.schedule.startTime} · {job.schedule.durationHours}h</div>
                {job.schedule.instructions && (
                  <div className="col-span-2 italic text-gray-500">"{job.schedule.instructions}"</div>
                )}
              </>
            )}
          </div>

          {!job.completed && !job.joinedAt && (
            <button
              onClick={() => handleCheckIn(job)}
              disabled={checkingId === job.teamId}
              className="btn-primary w-full"
            >
              {checkingId === job.teamId ? 'Checking in…' : '🚗 On my way — Check in'}
            </button>
          )}
          {job.joinedAt && (
            <p className="text-xs text-gray-400">Checked in {fmtTime(job.joinedAt)} — reach on time and stay safe.</p>
          )}
        </div>
      ))}
    </div>
  );
}