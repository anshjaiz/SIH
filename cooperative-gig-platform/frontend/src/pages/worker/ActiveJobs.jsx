import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { getSocket } from '../../services/socket';
import { getJobTeam, getRequestsForBooking } from '../../services/collaboratorService';
import RequestCollaboratorModal from '../../components/collaborator/RequestCollaboratorModal';
import JobTeamCard from '../../components/collaborator/JobTeamCard';

export default function ActiveJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState({});
  const [requests, setRequests] = useState({});
  const [requestingFor, setRequestingFor] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/workers/jobs/active');
      setJobs(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Load collaboration team for each active job (once per booking)
  useEffect(() => {
    jobs.forEach((job) => {
      if (teams[job._id] === undefined) {
        getJobTeam(job._id)
          .then((res) => setTeams((prev) => ({ ...prev, [job._id]: res.data })))
          .catch(() => setTeams((prev) => ({ ...prev, [job._id]: null })));
      }
    });
  }, [jobs]);

  // Live updates: collaborator accepted/declined on one of my bookings
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onUpdate = (payload) => {
      const bookingId = payload?.bookingId || payload?.request?.booking;
      if (bookingId) {
        getJobTeam(bookingId)
          .then((res) => setTeams((prev) => ({ ...prev, [bookingId]: res.data })))
          .catch(() => {});
      }
    };
    socket.on('collaboration_update', onUpdate);
    return () => socket.off('collaboration_update', onUpdate);
  }, []);

  // Live location sharing: while an active job is ON_THE_WAY or STARTED,
  // send the worker's location every 10s so the customer can track them.
  const trackingJob = jobs.some((j) => ['ON_THE_WAY', 'STARTED'].includes(j.status));
  useEffect(() => {
    if (!trackingJob) return;
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

  const handleStatus = async (id, status) => {
    try {
      await api.post(`/workers/jobs/${id}/status`, { status });
      toast.success(`Status updated to ${status}`);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleComplete = async (id) => {
    try {
      await api.post(`/workers/jobs/${id}/complete`);
      toast.success('Job completed!');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const statusFlow = {
    ASSIGNED: 'ACCEPTED',
    ACCEPTED: 'ON_THE_WAY',
    ON_THE_WAY: 'STARTED',
  };

  const statusColors = {
    ASSIGNED: 'bg-blue-100 text-blue-700',
    ACCEPTED: 'bg-green-100 text-green-700',
    ON_THE_WAY: 'bg-green-100 text-green-700',
    STARTED: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Active Jobs</h2>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No active jobs</div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job._id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{job.serviceSnapshot?.name}</h3>
                  <p className="text-sm text-gray-500">{job.bookingNumber}</p>
                </div>
                <span className={`badge px-3 py-1 ${statusColors[job.status]}`}>{job.status}</span>
                {['ON_THE_WAY', 'STARTED'].includes(job.status) && (
                  <span className="badge px-3 py-1 bg-red-100 text-red-700">● Live location ON</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                <div>
                  <p className="font-medium">Customer: {job.customer?.name}</p>
                  <p>📞 {job.customer?.phone}</p>
                </div>
                <div>
                  <p>📍 {job.address}</p>
                  <p>⏰ {job.timeSlot}</p>
                </div>
              </div>

              {job.description && (
                <p className="text-sm text-gray-500 mb-3 italic">"{job.description}"</p>
              )}

              <div className="flex gap-3">
                {statusFlow[job.status] && (
                  <button
                    onClick={() => handleStatus(job._id, statusFlow[job.status])}
                    className="btn-primary flex-1"
                  >
                    {job.status === 'ACCEPTED' ? '🚗 Start Navigation (On The Way)' :
                     job.status === 'ON_THE_WAY' ? '🔧 Start Work' :
                     '✅ Accept'}
                  </button>
                )}
                {job.status === 'STARTED' && (
                  <button onClick={() => handleComplete(job._id)} className="btn-success flex-1">✓ Complete Job</button>
                )}
              </div>

              {/* Price */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex justify-between"><span>Labour</span><span>₹{job.priceBreakdown?.labour}</span></div>
                <div className="flex justify-between"><span>Materials</span><span>₹{job.priceBreakdown?.materials}</span></div>
                <div className="flex justify-between font-bold border-t mt-1 pt-1">
                  <span>Total</span><span className="text-brand-600">₹{job.priceBreakdown?.total}</span>
                </div>
              </div>

              {/* Collaboration team */}
              {(teams[job._id] !== undefined || ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'STARTED'].includes(job.status)) && (
                <div className="mt-4">
                  {teams[job._id] ? (
                    <JobTeamCard team={teams[job._id]} />
                  ) : requests[job._id] ? (
                    <div className="flex items-center justify-between p-3 bg-brand-50 rounded-xl">
                      <p className="text-sm text-gray-600">
                        📨 Collab invite sent · waiting for <span className="font-medium">{requests[job._id].role}</span> to accept…
                      </p>
                      <button onClick={() => setRequestingFor(job)} className="text-sm text-brand-600 hover:underline">
                        View / Edit
                      </button>
                    </div>
                  ) : teams[job._id] === null ? (
                    <div className="flex items-center justify-between p-3 bg-brand-50 rounded-xl">
                      <p className="text-sm text-gray-600">👥 No team yet for this job.</p>
                      <button
                        onClick={() => setRequestingFor(job)}
                        className="btn-primary text-sm px-3 py-2"
                      >
                        + Request Collaborator
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <RequestCollaboratorModal
        open={requestingFor !== null}
        booking={requestingFor}
        onClose={() => setRequestingFor(null)}
        onCreated={(created) => {
          if (requestingFor) {
            setRequests((prev) => ({ ...prev, [requestingFor._id]: created.request }));
            getJobTeam(requestingFor._id)
              .then((res) => setTeams((prev) => ({ ...prev, [requestingFor._id]: res.data })))
              .catch(() => setTeams((prev) => ({ ...prev, [requestingFor._id]: null })));
            getRequestsForBooking(requestingFor._id).catch(() => {});
          }
        }}
      />
    </div>
  );
}
