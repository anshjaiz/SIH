import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import MapComponent from '../../components/MapComponent';
import ChatPanel from '../../components/ChatPanel';
import { getSocket } from '../../services/socket';
import toast from 'react-hot-toast';
import { COMPLAINT_CATEGORIES, PREFERRED_RESOLUTIONS } from '../../utils/complaints';

const TRACKING_STATUSES = ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS'];

// A valid [lng, lat] pair — empty arrays (worker hasn't shared a location) are NOT a location.
const isValidCoords = (c) =>
  Array.isArray(c) &&
  c.length === 2 &&
  typeof c[0] === 'number' &&
  typeof c[1] === 'number' &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]);

const haversineKm = (coords, coords2) => {
  const [lng1, lat1] = coords;
  const [lng2, lat2] = coords2;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function BookingDetails() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workerLocation, setWorkerLocation] = useState(null);
  const [syncedAt, setSyncedAt] = useState(null);
  const [showComplaint, setShowComplaint] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ category: '', description: '', preferredResolution: 'FULL_REFUND' });
  const [complaintFiles, setComplaintFiles] = useState([]);
  const [filingComplaint, setFilingComplaint] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const chatEnabled = !!booking && !!booking.worker &&
    ['ACCEPTED', 'ON_THE_WAY', 'WORKER_ARRIVED', 'STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status);

  const load = async () => {
    try {
      const res = await api.get(`/customers/bookings/${id}`);
      setBooking(res.data);
      if (isValidCoords(res.data.workerLocation?.coordinates)) {
        setWorkerLocation(res.data.workerLocation.coordinates);
        setSyncedAt(new Date());
      }
    } catch (e) {
      toast.error('Booking not found');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Live tracking: poll for the worker's last-known location + listen to socket updates
  const trackingActive = !!booking && booking.worker && TRACKING_STATUSES.includes(booking.status);
  useEffect(() => {
    if (!trackingActive) return;
    const poll = async () => {
      try {
        const res = await api.get(`/customers/bookings/${id}`);
        if (isValidCoords(res.data.workerLocation?.coordinates)) {
          setWorkerLocation(res.data.workerLocation.coordinates);
          setSyncedAt(new Date());
        }
        if (res.data.status !== booking.status) load();
      } catch { /* ignore */ }
    };
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [trackingActive, id]);

  useEffect(() => {
    if (!trackingActive) return;
    const socket = getSocket();
    if (!socket) return;
    const handler = (d) => {
      if (d.bookingId === id && isValidCoords(d.coordinates)) {
        setWorkerLocation(d.coordinates);
        setSyncedAt(new Date());
      }
    };
    socket.on('worker_location', handler);
    return () => socket.off('worker_location', handler);
  }, [trackingActive, id]);

  const handleConfirm = async () => {
    try {
      await api.post(`/customers/bookings/${id}/confirm`);
      toast.success('Job confirmed!');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handlePay = async () => {
    try {
      const res = await api.post('/customers/payments', { bookingId: id, method: 'MOCK_REDIRECT' });
      if (res.success) {
        toast.success('Payment successful!');
        load();
      } else {
        toast.error('Payment failed');
      }
    } catch (err) {
      toast.error(err.message || 'Payment failed');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel?')) return;
    try {
      await api.put(`/customers/bookings/${id}/cancel`, { reason: 'Cancelled by customer' });
      toast.success('Booking cancelled');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleReassign = async () => {
    try {
      const res = await api.post(`/customers/bookings/${id}/reassign`);
      if (res.success) {
        toast.success('Looking for a replacement worker…');
      } else {
        toast.error(res.message || 'No replacement worker available right now');
      }
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const handleReview = async (quality) => {
    try {
      await api.post('/reviews', {
        bookingId: id,
        reviewType: 'CUSTOMER_TO_WORKER',
        overallQuality: quality,
        punctuality: quality,
        behaviour: quality,
        pricing: quality,
        comment: 'Great service!',
      });
      toast.success('Review submitted!');
      load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    }
  };

  const submitComplaint = async (e) => {
    e.preventDefault();
    if (!complaintForm.category || !complaintForm.description.trim()) {
      toast.error('Category and description are required');
      return;
    }
    try {
      setFilingComplaint(true);
      const fd = new FormData();
      fd.append('bookingId', id);
      fd.append('category', complaintForm.category);
      fd.append('description', complaintForm.description.trim());
      fd.append('preferredResolution', complaintForm.preferredResolution);
      complaintFiles.forEach((f, i) => fd.append('evidence', f));
      await api.post('/complaints', fd);
      toast.success('Complaint filed! Our team will review it.');
      setShowComplaint(false);
      setComplaintForm({ category: '', description: '', preferredResolution: 'FULL_REFUND' });
      setComplaintFiles([]);
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to file complaint');
    } finally {
      setFilingComplaint(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  if (!booking) {
    return <div className="text-center py-20 text-gray-400">Booking not found</div>;
  }

  const statusColors = {
    REQUESTED: 'bg-gray-100 text-gray-700', MATCHING: 'bg-blue-100 text-blue-700',
    ASSIGNED: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-green-100 text-green-700',
    ON_THE_WAY: 'bg-green-100 text-green-700', WORKER_ARRIVED: 'bg-green-100 text-green-700',
    STARTED: 'bg-green-100 text-green-700', IN_PROGRESS: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
    DISPUTED: 'bg-yellow-100 text-yellow-700',
    WORKER_NO_SHOW: 'bg-red-100 text-red-700', EXPIRED: 'bg-red-100 text-red-700',
    REASSIGNED: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Booking Details</h2>

      {/* Header card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">{booking.serviceSnapshot?.name}</h3>
            <p className="text-sm text-gray-500">{booking.bookingNumber} • {booking.serviceSnapshot?.category}</p>
          </div>
          <span className={`badge px-3 py-1 ${statusColors[booking.status]}`}>{booking.status}</span>
        </div>

        {booking.isEmergency && (
          <div className="p-2 bg-orange-50 rounded-lg mb-4 text-sm text-orange-700 font-medium">
            ⚡ Emergency: {booking.emergencyType || 'Not specified'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <p className="font-medium">Date/Time:</p>
            <p>{new Date(booking.requestedDate).toLocaleString()}</p>
            <p>{booking.timeSlot}</p>
          </div>
          <div>
            <p className="font-medium">Location:</p>
            <p>{booking.address || 'Not provided'}</p>
          </div>
        </div>

        {booking.description && (
          <div className="mt-4">
            <p className="font-medium text-sm text-gray-600 mb-1">Description:</p>
            <p className="text-sm text-gray-500">{booking.description}</p>
          </div>
        )}
      </div>

      {/* No-show / reassignment / expiry banner */}
      {['WORKER_NO_SHOW', 'REASSIGNED', 'EXPIRED'].includes(booking.status) && (
        <div className="card border-red-200 bg-red-50/50">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🙁</span>
            <div className="flex-1">
              <h4 className="font-semibold text-red-700">
                {booking.status === 'WORKER_NO_SHOW'
                  ? 'The assigned worker did not arrive'
                  : booking.status === 'REASSIGNED'
                  ? 'The assigned worker did not arrive — finding a replacement'
                  : 'This booking expired'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                Unfortunately, the assigned worker did not arrive for your job. Please choose how you&apos;d like to proceed:
              </p>
              <div className="flex flex-wrap gap-3 mt-4">
                <button onClick={handleReassign} className="btn-primary text-sm">
                  🔄 Find Another Worker
                </button>
                <button onClick={handleCancel} className="btn-danger text-sm">
                  ✕ Cancel &amp; Request Refund
                </button>
                <button onClick={() => setShowComplaint(true)} className="btn-secondary text-sm">
                  📞 Contact Support
                </button>
                {(booking.failedJobReason || booking.noShowDetectedAt) && (
                  <span className="text-xs text-gray-400 self-center">
                    {booking.noShowDetectedAt
                      ? `No-show detected ${new Date(booking.noShowDetectedAt).toLocaleString()}`
                      : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Worker */}
      {booking.worker && (
        <div className="card">
          <h4 className="font-semibold mb-2">Assigned Worker</h4>
          <p className="text-sm text-gray-600">Worker ID: {booking.worker._id}</p>
          <p className="text-sm text-gray-600">Verification: {booking.worker.verificationStatus}</p>
          {booking.worker.rating > 0 && (
            <p className="text-sm text-gray-600">Rating: ⭐ {booking.worker.rating?.toFixed(1)} ({booking.worker.ratingCount} reviews)</p>
          )}
          {booking.matchScore && (
            <p className="text-sm text-gray-600">Match score: {booking.matchScore}/100</p>
          )}
        </div>
      )}

      {/* Live Tracking */}
      {booking.worker && TRACKING_STATUSES.includes(booking.status) && booking.location?.coordinates && (
        <div className="card border-green-200">
          <h4 className="font-semibold mb-1">📍 Live Tracking</h4>
          <p className="text-xs text-gray-500 mb-3">
            Your worker's live location while they are on the way / working (updates every ~10 sec).
          </p>
          <MapComponent
            center={
              workerLocation
                ? [workerLocation[1], workerLocation[0]]
                : [booking.location.coordinates[1], booking.location.coordinates[0]]
            }
            markers={[
              { lat: booking.location.coordinates[1], lng: booking.location.coordinates[0], label: 'Service location' },
              ...(workerLocation
                ? [{ lat: workerLocation[1], lng: workerLocation[0], type: 'worker', label: 'Worker' }]
                : []),
            ]}
            height="240px"
            zoom={14}
          />
          <div className="mt-2">
            {workerLocation ? (
              <p className="text-xs text-gray-500">
                Last update: {syncedAt?.toLocaleTimeString()}
                {workerLocation && booking.location?.coordinates
                  ? ` • ~${haversineKm(booking.location.coordinates, workerLocation).toFixed(1)} km from the job site`
                  : ''}
              </p>
            ) : (
              <p className="text-xs text-gray-400">Waiting for worker's location…</p>
            )}
          </div>
        </div>
      )}

      {/* Candidate workers (during matching / reassignment) */}
      {['MATCHING', 'REASSIGNED'].includes(booking.status) && booking.candidateWorkers?.length > 0 && (
        <div className="card">
          <h4 className="font-semibold mb-2">
            {booking.status === 'REASSIGNED' ? 'Replacement Workers (awaiting acceptance)' : 'Matched Workers (awaiting acceptance)'}
          </h4>
          <div className="space-y-2">
            {booking.candidateWorkers.map((c, i) => (
              <div key={i} className="p-2 bg-gray-50 rounded-lg text-sm">
                <p>Score: {c.score}/100</p>
                <p className="text-xs text-gray-500">{c.reasons?.join(' • ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price breakdown */}
      {booking.priceBreakdown && (
        <div className="card">
          <h4 className="font-semibold mb-3">Price Breakdown</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Labour</span><span>₹{booking.priceBreakdown.labour}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Materials</span><span>₹{booking.priceBreakdown.materials}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Cooperative contribution</span><span>₹{booking.priceBreakdown.cooperativeContribution}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Platform fee</span><span>₹{booking.priceBreakdown.platformFee}</span></div>
            <hr className="border-gray-200" />
            <div className="flex justify-between font-bold"><span>Total</span><span className="text-brand-600">₹{booking.priceBreakdown.total}</span></div>
          </div>
        </div>
      )}

      {/* Map */}
      {booking.location?.coordinates && (
        <div className="card">
          <h4 className="font-semibold mb-3">Location</h4>
          <MapComponent
            center={[booking.location.coordinates[1], booking.location.coordinates[0]]}
            markers={[{
              lat: booking.location.coordinates[1],
              lng: booking.location.coordinates[0],
              label: 'Service location',
            }]}
            height="200px"
            zoom={15}
          />
        </div>
      )}

      {/* Actions */}
      <div className="card">
        <h4 className="font-semibold mb-3">Actions</h4>
        <div className="flex flex-wrap gap-3">
          {booking.status === 'COMPLETED' && (
            <>
              <button onClick={handleConfirm} className="btn-success text-sm">Confirm Completion</button>
            </>
          )}
          {booking.status === 'ACCEPTED' && (
            <button onClick={handlePay} className="btn-primary text-sm">Pay Now</button>
          )}
          {['REQUESTED', 'MATCHING'].includes(booking.status) && (
            <button onClick={handleCancel} className="btn-danger text-sm">Cancel</button>
          )}
          {booking.status === 'COMPLETED' && (
            <button onClick={() => handleReview(5)} className="btn-accent text-sm">⭐ Rate (5 stars)</button>
          )}
          {booking.status === 'COMPLETED' && (
            <button onClick={() => setShowComplaint(true)} className="btn-secondary text-sm">⚠ Raise a Complaint</button>
          )}
        </div>
      </div>

      {/* Status timeline */}
      {booking.statusHistory?.length > 0 && (
        <div className="card">
          <h4 className="font-semibold mb-3">Status History</h4>
          <div className="space-y-3">
            {booking.statusHistory.map((sh, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2 h-2 bg-brand-600 rounded-full mt-1"></div>
                <div>
                  <p className="text-sm font-medium">{sh.status}</p>
                  <p className="text-xs text-gray-500">{new Date(sh.updatedAt).toLocaleString()}</p>
                  {sh.note && <p className="text-xs text-gray-400">{sh.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raise Complaint modal */}
      {showComplaint && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Raise a Complaint</h3>
              <button onClick={() => setShowComplaint(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={submitComplaint} className="p-6 space-y-4">
              <p className="text-sm text-gray-500">
                Booking {booking.bookingNumber} — your complaint and evidence will only be visible to you and our support team.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-600">Category *</label>
                <select
                  value={complaintForm.category}
                  onChange={(e) => setComplaintForm({ ...complaintForm, category: e.target.value })}
                  className="input-field mt-1"
                >
                  <option value="">Select a category</option>
                  {COMPLAINT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Describe the issue *</label>
                <textarea
                  value={complaintForm.description}
                  onChange={(e) => setComplaintForm({ ...complaintForm, description: e.target.value })}
                  rows={4}
                  maxLength={2000}
                  className="input-field mt-1"
                  placeholder="What went wrong? Please share as much detail as possible."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">What would resolve this?</label>
                <select
                  value={complaintForm.preferredResolution}
                  onChange={(e) => setComplaintForm({ ...complaintForm, preferredResolution: e.target.value })}
                  className="input-field mt-1"
                >
                  {PREFERRED_RESOLUTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Supporting evidence (photos, docs, short video)</label>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,video/mp4,video/quicktime"
                  onChange={(e) => setComplaintFiles([...e.target.files])}
                  className="mt-1 w-full text-sm text-gray-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium"
                />
                {complaintFiles.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{complaintFiles.length} file(s) selected</p>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowComplaint(false)} className="btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={filingComplaint} className="btn-primary text-sm">
                  {filingComplaint ? 'Filing…' : 'Submit Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {chatEnabled && (
        <>
          <button
            onClick={() => setChatOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-white shadow-lg hover:bg-brand-700 transition"
          >
            <span>💬</span> Message worker
          </button>
          <ChatPanel bookingId={id} open={chatOpen} onClose={() => setChatOpen(false)} bookingNumber={booking.bookingNumber} />
        </>
      )}
    </div>
  );
}
