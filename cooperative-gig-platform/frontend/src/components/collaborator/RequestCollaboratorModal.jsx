import { useState } from 'react';
import toast from 'react-hot-toast';
import { createCollaborationRequest } from '../../services/collaboratorService';

const ROLES = [
  'Helper', 'Plumber', 'Electrician', 'Mason', 'Carpenter',
  'Painter', 'Technician', 'Driver', 'Photographer', 'Other',
];

const STATUS_COLORS = {
  ASSIGNED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  ON_THE_WAY: 'bg-green-100 text-green-700',
  STARTED: 'bg-green-100 text-green-700',
};

export default function RequestCollaboratorModal({ booking, open, onClose, onCreated }) {
  const [form, setForm] = useState({
    role: 'Helper',
    requiredSkills: '',
    numberOfCollaborators: 1,
    date: '',
    startTime: '09:00',
    durationHours: 4,
    estimatedPayment: 300,
    instructions: '',
  });
  const [loading, setLoading] = useState(false);

  if (!open || !booking) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.date) return toast.error('Please select a collaboration date');
    setLoading(true);
    try {
      const res = await createCollaborationRequest({
        bookingId: booking._id,
        role: form.role,
        requiredSkills: form.requiredSkills ? form.requiredSkills.split(',').map((s) => s.trim()).filter(Boolean) : [],
        numberOfCollaborators: Number(form.numberOfCollaborators),
        date: form.date,
        startTime: form.startTime,
        durationHours: Number(form.durationHours),
        estimatedPayment: Number(form.estimatedPayment),
        instructions: form.instructions,
      });
      toast.success(res.message || 'Collaboration request created!');
      onCreated && onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create request');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">👥 Build your Team</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {booking.serviceSnapshot?.name} · <span className={`badge px-2 py-0.5 ${STATUS_COLORS[booking.status]}`}>{booking.status}</span>
          </p>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="col-span-2">
              <label className="label">Collaborator role</label>
              <select className="input-field" value={form.role} onChange={set('role')}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Required skills (comma separated, optional)</label>
              <input className="input-field" placeholder="e.g. Plumbing, Pipe fitting" value={form.requiredSkills} onChange={set('requiredSkills')} />
            </div>
            <div>
              <label className="label">Team size</label>
              <input type="number" min="1" max="10" className="input-field" value={form.numberOfCollaborators} onChange={set('numberOfCollaborators')} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input-field" value={form.date} onChange={set('date')} />
            </div>
            <div>
              <label className="label">Start time</label>
              <input type="time" className="input-field" value={form.startTime} onChange={set('startTime')} />
            </div>
            <div>
              <label className="label">Duration (hours)</label>
              <input type="number" min="1" className="input-field" value={form.durationHours} onChange={set('durationHours')} />
            </div>
            <div className="col-span-2">
              <label className="label">Estimated payment (₹)</label>
              <input type="number" min="0" className="input-field" value={form.estimatedPayment} onChange={set('estimatedPayment')} />
            </div>
            <div className="col-span-2">
              <label className="label">Instructions to collaborators</label>
              <textarea className="input-field" rows="2" placeholder="What should the team bring / prepare?" value={form.instructions} onChange={set('instructions')} />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={onClose} type="button" className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Matching...' : 'Find Collaborators'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Fair-work matching: only verified workers with matching skills near the job are invited.
          </p>
        </div>
      </div>
    </div>
  );
}