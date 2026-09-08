import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import MapComponent from '../../components/MapComponent';
import { getSocket } from '../../services/socket';
import toast from 'react-hot-toast';

const TRACKING_STATUSES = ['ACCEPTED', 'ON_THE_WAY', 'STARTED'];

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

  const load = async () => {
    try {
      const res = await api.get(`/customers/bookings/${id}`);
      setBooking(res.data);
      if (res.data.workerLocation?.coordinates) {
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
        if (res.data.workerLocation?.coordinates) {
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
      if (d.bookingId === id && d.coordinates) {
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

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div></div>;
  }

  if (!booking) {
    return <div className="text-center py-20 text-gray-400">Booking not found</div>;
  }

  const statusColors = {
    REQUESTED: 'bg-gray-100 text-gray-700', MATCHING: 'bg-blue-100 text-blue-700',
    ASSIGNED: 'bg-blue-100 text-blue-700', ACCEPTED: 'bg-green-100 text-green-700',
    ON_THE_WAY: 'bg-green-100 text-green-700', STARTED: 'bg-green-100 text-green-700',
    COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
    DISPUTED: 'bg-yellow-100 text-yellow-700',
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

      {/* Candidate workers (during matching) */}
      {booking.status === 'MATCHING' && booking.candidateWorkers?.length > 0 && (
        <div className="card">
          <h4 className="font-semibold mb-2">Matched Workers (awaiting acceptance)</h4>
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
    </div>
  );
}
