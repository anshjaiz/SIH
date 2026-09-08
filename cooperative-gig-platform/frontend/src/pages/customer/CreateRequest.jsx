import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import LocationPicker from '../../components/LocationPicker';

export default function CreateRequest() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [form, setForm] = useState({
    description: '',
    address: '',
    city: 'Hyderabad',
    requestedDate: '',
    timeSlot: 'Morning',
    isEmergency: false,
    emergencyType: '',
    materialsEstimate: 0,
    lat: '17.385',
    lng: '78.487',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serviceId) return;
    const load = async () => {
      try {
        const res = await api.get(`/services/${serviceId}`);
        setService(res.data);
      } catch (e) {
        toast.error('Service not found');
      }
    };
    load();
  }, [serviceId]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get('/customers/profile');
        const p = res.data;
        if (p) {
          setForm((f) => ({
            ...f,
            address: f.address || p.address || '',
            city: f.city || p.city || 'Hyderabad',
            lat: p.location?.coordinates?.[1] ?? '17.385',
            lng: p.location?.coordinates?.[0] ?? '78.487',
          }));
        }
      } catch {
        /* ignore */
      }
    };
    loadProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!serviceId) { toast.error('Please select a service first'); return; }
    setLoading(true);
    try {
      const payload = {
        serviceId,
        description: form.description,
        address: form.address,
        location: {
          type: 'Point',
          coordinates: [parseFloat(form.lng) || 78.487, parseFloat(form.lat) || 17.385],
        },
        area: '',
        city: form.city,
        requestedDate: form.requestedDate || new Date(),
        timeSlot: form.timeSlot,
        isEmergency: form.isEmergency,
        emergencyType: form.emergencyType,
        materialsEstimate: parseFloat(form.materialsEstimate) || 0,
      };

      const res = await api.post('/customers/bookings', payload);

      if (form.address && form.city) {
        await api.put('/customers/profile', {
          address: form.address,
          city: form.city,
          location: payload.location,
        }).catch(() => {});
      }

      toast.success('Service request created!');
      navigate(`/customer/bookings/${res.data.booking._id}`);
    } catch (err) {
      toast.error(err.message || 'Failed to create request');
    }
    setLoading(false);
  };

  const locationValue = { address: form.address, city: form.city, lat: form.lat, lng: form.lng };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Create Service Request</h2>

      {service && (
        <div className="card mb-6">
          <h3 className="font-semibold">{service.name}</h3>
          <p className="text-sm text-gray-500">{service.category} • ₹{service.basePrice} base</p>
        </div>
      )}

      {!serviceId && (
        <div className="card mb-6">
          <p className="text-gray-500">Please select a service first</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <label className="label-text">Describe the problem</label>
          <textarea
            name="description"
            className="input-field"
            rows={4}
            placeholder="e.g., My kitchen pipe is leaking. The water is coming from under the sink..."
            value={form.description}
            onChange={handleChange}
          />
        </div>

        {/* Emergency toggle */}
        <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
          <input
            type="checkbox"
            name="isEmergency"
            checked={form.isEmergency}
            onChange={handleChange}
            className="w-4 h-4 text-orange-600 rounded"
          />
          <div>
            <p className="font-medium text-orange-800 text-sm">⚡ This is an emergency</p>
            <p className="text-xs text-orange-600">Emergency requests get priority matching</p>
          </div>
        </div>

        {form.isEmergency && (
          <div>
            <label className="label-text">Emergency type</label>
            <select name="emergencyType" className="input-field" value={form.emergencyType} onChange={handleChange}>
              <option value="">Select type</option>
              <option value="Electrical emergency">Electrical emergency</option>
              <option value="Water leakage">Water leakage</option>
              <option value="Pipe burst">Pipe burst</option>
              <option value="Lockout">Lockout</option>
              <option value="Urgent caregiving">Urgent caregiving</option>
              <option value="Other">Other urgent household problem</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label className="label-text">Address / Location</label>
          <LocationPicker
            value={locationValue}
            onChange={(v) => setForm({ ...form, address: v.address || '', city: v.city || '', lat: String(v.lat), lng: String(v.lng) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-text">Preferred Date</label>
            <input
              type="date"
              name="requestedDate"
              className="input-field"
              value={form.requestedDate}
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label className="label-text">Time Slot</label>
            <select name="timeSlot" className="input-field" value={form.timeSlot} onChange={handleChange}>
              <option>Morning (9AM-12PM)</option>
              <option>Afternoon (12PM-4PM)</option>
              <option>Evening (4PM-8PM)</option>
              <option>Flexible</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label-text">Estimated materials cost (₹)</label>
          <input
            type="number"
            name="materialsEstimate"
            className="input-field"
            value={form.materialsEstimate}
            onChange={handleChange}
            min={0}
          />
        </div>

        <button type="submit" disabled={loading || !serviceId} className="btn-primary w-full">
          {loading ? 'Creating...' : 'Submit Request'}
        </button>
      </form>
    </div>
  );
}