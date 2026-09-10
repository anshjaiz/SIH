import { useEffect, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { getSocket } from '../../services/socket';
import { getJobTeam, getRequestsForBooking } from '../../services/collaboratorService';
import RequestCollaboratorModal from '../../components/collaborator/RequestCollaboratorModal';
import JobTeamCard from '../../components/collaborator/JobTeamCard';
import ChatPanel from '../../components/ChatPanel';
import NavigationPanel from '../../components/worker/NavigationPanel';

export default function ActiveJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState({});
  const [requests, setRequests] = useState({});
  const [helperLocs, setHelperLocs] = useState({});
  const [requestingFor, setRequestingFor] = useState(null);
  const [chatJob, setChatJob] = useState(null);
  const [navJob, setNavJob] = useState(null);
  const [materialJob, setMaterialJob] = useState(null);
  const [materialForm, setMaterialForm] = useState({ description: '', amount: '', note: '' });
  const [materialSubmitting, setMaterialSubmitting] = useState(false);

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
    socket.on('material_request_update', onUpdate);
    socket.on('booking_update', onUpdate);
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

  const handleStartNav = (id) => {
    console.log('START NAVIGATION BUTTON CLICKED', id);
    handleStatus(id, 'ON_THE_WAY');
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

  const openMaterialModal = (job) => {
    setMaterialForm({ description: '', amount: '', note: '' });
    setMaterialJob(job);
  };

  const handleSubmitMaterial = async (e) => {
    e.preventDefault();
    const amount = parseFloat(materialForm.amount);
    if (!materialForm.description.trim() || !amount || amount <= 0) {
      toast.error('Material name and a positive amount are required');
      return;
    }
    setMaterialSubmitting(true);
    try {
      await api.post(`/workers/jobs/${materialJob._id}/material-request`, {
        description: materialForm.description.trim(),
        amount,
        note: materialForm.note.trim(),
      });
      toast.success('Material cost request sent — awaiting customer approval');
      setMaterialJob(null);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to submit material request');
    } finally {
      setMaterialSubmitting(false);
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
                      <button onClick={() => handleStartNav(job._id)} className="btn-primary flex-1">🚗 Start Navigation (On The Way)</button>
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

                {['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(job.status) && (
                  <button onClick={() => setChatJob(job)} className="btn-secondary text-sm mt-3 w-full">
                    💬 Message {job.customer?.name?.split(' ')[0] || 'customer'}
                  </button>
                )}

                {['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(job.status) &&
                  Array.isArray(job.location?.coordinates) && job.location.coordinates.length >= 2 && (
                  <button onClick={() => setNavJob(job)} className="btn-secondary text-sm mt-2 w-full border-brand-200 text-brand-700">
                    🧭 Navigate to Job
                  </button>
                )}

              {/* Price */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                <div className="flex justify-between"><span>Service Charge</span><span>₹{job.priceBreakdown?.labour || 0}</span></div>
                <div className="flex justify-between"><span>Materials (approved)</span><span>₹{job.priceBreakdown?.materials || 0}</span></div>
                <div className="flex justify-between"><span>Platform Fee</span><span>Included</span></div>
                <div className="flex justify-between font-bold border-t mt-1 pt-1">
                  <span>Total</span><span className="text-brand-600">₹{job.priceBreakdown?.total || 0}</span>
                </div>
              </div>

              {/* Material requests */}
              {Array.isArray(job.materialRequests) && job.materialRequests.length > 0 && (
                <div className="mt-3 space-y-2">
                  {job.materialRequests.map((mr) => (
                    <div
                      key={mr._id}
                      className={`p-2 rounded-lg border text-sm ${
                        mr.status === 'pending'
                          ? 'border-yellow-300 bg-yellow-50'
                          : mr.status === 'approved'
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{mr.description}</p>
                        <span className={`badge ${mr.status === 'pending' ? 'badge-warning' : mr.status === 'approved' ? 'badge-success' : 'badge-gray'}`}>
                          {mr.status === 'pending' ? 'Pending Customer Approval' : mr.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">₹{mr.amount}{mr.note ? ` • ${mr.note}` : ''}</p>
                    </div>
                  ))}
                </div>
              )}

              {['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'].includes(job.status) &&
                !(job.materialRequests || []).some((mr) => mr.status === 'pending') && (
                  <button onClick={() => openMaterialModal(job)} className="btn-secondary text-sm mt-3 w-full border-brand-200 text-brand-700">
                    + Add Material Cost
                  </button>
                )}

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

      <ChatPanel
        bookingId={chatJob?._id}
        open={chatJob !== null}
        onClose={() => setChatJob(null)}
        bookingNumber={chatJob?.bookingNumber}
      />
      <NavigationPanel
        job={navJob}
        open={navJob !== null}
        onClose={() => setNavJob(null)}
        onExpired={() => {
          setNavJob(null);
          load();
        }}
      />
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

      {/* Add Material Cost modal */}
      {materialJob && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">+ Add Material Cost</h3>
              <button onClick={() => setMaterialJob(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmitMaterial} className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                {materialJob.serviceSnapshot?.name} • Current service charge ₹{materialJob.priceBreakdown?.labour || 0}. The customer must approve any material cost before it is added to your total.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600">Material name / description *</label>
                <input
                  type="text"
                  className="input-field mt-1"
                  placeholder="e.g., PVC pipe and connector"
                  value={materialForm.description}
                  onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Amount (₹) *</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input-field mt-1"
                  placeholder="e.g., 180"
                  value={materialForm.amount}
                  onChange={(e) => setMaterialForm({ ...materialForm, amount: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Note (optional)</label>
                <textarea
                  rows={2}
                  className="input-field mt-1"
                  placeholder="e.g., Needed to replace the old joint as well"
                  value={materialForm.note}
                  onChange={(e) => setMaterialForm({ ...materialForm, note: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setMaterialJob(null)} className="btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={materialSubmitting} className="btn-primary text-sm">
                  {materialSubmitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
