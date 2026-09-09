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
  const [helperLocs, setHelperLocs] = useState({});
  const [requestingFor, setRequestingFor] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/workers/jobs/active');
      setJobs(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Store team [+ seed helper's last-known location from the team record]
  const applyTeam = (bookingId, team) => {
    setTeams((prev) => ({ ...prev, [bookingId]: team }));
    if (team && Array.isArray(team.members)) {
      const seed = {};
      team.members.forEach((m) => {
        if (m.worker && m.location && Array.isArray(m.location.coordinates)) {
          seed[m.worker] = m.location.coordinates;
        }
      });
      if (Object.keys(seed).length) setHelperLocs((prev) => ({ ...prev, ...seed }));
    }
  };

  // Load collaboration team + sent invites for each active job (once per booking)
  useEffect(() => {
    jobs.forEach((job) => {
      if (teams[job._id] === undefined) {
        getJobTeam(job._id)
          .then((res) => applyTeam(job._id, res.data))
          .catch(() => setTeams((prev) => ({ ...prev, [job._id]: null })));
      }
      if (requests[job._id] === undefined) {
        getRequestsForBooking(job._id)
          .then((res) => setRequests((prev) => ({ ...prev, [job._id]: res.data || [] })))
          .catch(() => setRequests((prev) => ({ ...prev, [job._id]: [] })));
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
        Promise.all([
          getJobTeam(bookingId).then((res) => res.data).catch(() => null),
          getRequestsForBooking(bookingId).then((res) => res.data || []).catch(() => []),
        ]).then(([team, reqs]) => {
          applyTeam(bookingId, team);
          setRequests((prev) => ({ ...prev, [bookingId]: reqs }));
        });
      }
    };
    socket.on('collaboration_update', onUpdate);
    const onHelperLoc = (payload) => {
      if (payload?.helperId && Array.isArray(payload?.coordinates)) {
        setHelperLocs((prev) => ({ ...prev, [payload.helperId]: payload.coordinates }));
      }
    };
    socket.on('worker_location', onHelperLoc);
    return () => {
      socket.off('collaboration_update', onUpdate);
      socket.off('worker_location', onHelperLoc);
    };
  }, []);

  // Live location sharing: while an active job is ON_THE_WAY or STARTED,
  // send the worker's location every 10s so the customer can track them.
  const trackingJob = jobs.some((j) => ['ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(j.status));
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

  const handleArrive = async (id) => {
    try {
      await api.post(`/workers/jobs/${id}/arrive`);
      toast.success('Arrival recorded');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const statusFlow = {
    ASSIGNED: 'ACCEPTED',
    ACCEPTED: 'ON_THE_WAY',
    ON_THE_WAY: 'STARTED',
    WORKER_ARRIVED: 'STARTED',
  };

  const statusColors = {
    ASSIGNED: 'bg-blue-100 text-blue-700',
    ACCEPTED: 'bg-green-100 text-green-700',
    ON_THE_WAY: 'bg-green-100 text-green-700',
    WORKER_ARRIVED: 'bg-green-100 text-green-700',
    STARTED: 'bg-green-100 text-green-700',
    IN_PROGRESS: 'bg-green-100 text-green-700',
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
                {['ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(job.status) && (
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
                  {job.status === 'ASSIGNED' && (
                    <button onClick={() => handleStatus(job._id, 'ACCEPTED')} className="btn-primary flex-1">✅ Accept</button>
                  )}
                  {job.status === 'ACCEPTED' && (
                    <>
                      <button onClick={() => handleStatus(job._id, 'ON_THE_WAY')} className="btn-primary flex-1">🚗 Start Navigation (On The Way)</button>
                      <button onClick={() => handleArrive(job._id)} className="btn-accent flex-1">📍 I've Arrived</button>
                    </>
                  )}
                  {job.status === 'ON_THE_WAY' && (
                    <>
                      <button onClick={() => handleArrive(job._id)} className="btn-accent flex-1">📍 I've Arrived</button>
                      <button onClick={() => handleStatus(job._id, 'STARTED')} className="btn-primary flex-1">🔧 Start Work</button>
                    </>
                  )}
                  {job.status === 'WORKER_ARRIVED' && (
                    <button onClick={() => handleStatus(job._id, 'STARTED')} className="btn-primary flex-1">🔧 Start Work</button>
                  )}
                  {['STARTED', 'IN_PROGRESS'].includes(job.status) && (
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

              {/* Collaboration */}
              {(teams[job._id] !== undefined || ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(job.status)) && (
                <div className="mt-4">
                  {teams[job._id] ? (
                    <JobTeamCard team={teams[job._id]} helperLocs={helperLocs} bookingLocation={job.location?.coordinates} />
                  ) : (requests[job._id] || []).length > 0 ? (
                    <div className="p-4 bg-brand-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-700">📨 Invitations sent to your team</p>
                        <button onClick={() => setRequestingFor(job)} className="text-xs text-brand-600 hover:underline">
                          + Add more
                        </button>
                      </div>
                      <div className="space-y-2">
                        {requests[job._id].map((req) =>
                          (req.candidates || []).map((c) => (
                            <div key={req._id + c.worker?._id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                              <div>
                                <span className="text-sm font-medium text-gray-800">{c.worker?.user?.name || 'Worker'}</span>
                                <span className="text-xs text-gray-400 ml-1">· {req.role}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {c.score != null && (
                                  <span className="text-xs text-gray-500">Match {Math.round(c.score)}%</span>
                                )}
                                <span className={`badge px-2 py-0.5 ${
                                  c.status === 'ACCEPTED' ? 'bg-green-100 text-green-700'
                                  : c.status === 'DECLINED' ? 'bg-red-100 text-red-600'
                                  : c.status === 'NO_SHOW' ? 'bg-red-100 text-red-600'
                                  : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {c.status}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-2">
                        The worker sees this invite under their <span className="font-medium">Collaborations</span> page.
                      </p>
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
        onCreated={() => {
          if (requestingFor) {
            Promise.all([
              getJobTeam(requestingFor._id).then((res) => res.data).catch(() => null),
              getRequestsForBooking(requestingFor._id).then((res) => res.data || []).catch(() => []),
            ]).then(([team, reqs]) => {
              applyTeam(requestingFor._id, team);
              setRequests((prev) => ({ ...prev, [requestingFor._id]: reqs }));
            });
          }
        }}
      />
    </div>
  );
}
