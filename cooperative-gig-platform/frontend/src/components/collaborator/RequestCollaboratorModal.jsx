import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../services/api';
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
  const { t } = useTranslation();
  const [form, setForm] = useState({
    role: 'Helper',
    numberOfCollaborators: 1,
    date: '',
    startTime: '09:00',
    durationHours: 4,
    estimatedPayment: 300,
    instructions: '',
  });
  const [allSkills, setAllSkills] = useState([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedSkillIds([]);
      api.get('/services/skills/list')
        .then((res) => setAllSkills(res.data || []))
        .catch(() => setAllSkills([]));
    }
  }, [open]);

  if (!open || !booking) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const toggleSkill = (id) =>
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submit = async () => {
    if (!form.date) return toast.error(t('toast.selectCollabDate', 'Please select a collaboration date'));
    setLoading(true);
    try {
      const selectedNames = allSkills
        .filter((s) => selectedSkillIds.includes(s._id))
        .map((s) => s.name);
      const res = await createCollaborationRequest({
        bookingId: booking._id,
        role: form.role,
        requiredSkills: selectedNames,
        requiredSkillIds: selectedSkillIds,
        numberOfCollaborators: Number(form.numberOfCollaborators),
        date: form.date,
        startTime: form.startTime,
        durationHours: Number(form.durationHours),
        estimatedPayment: Number(form.estimatedPayment),
        instructions: form.instructions,
      });
      toast.success(res.message || t('toast.collabRequestCreated', 'Collaboration request created!'));
      onCreated && onCreated(res.data);
      onClose();
    } catch (err) {
      toast.error(err.message || t('toast.failedCreateRequest', 'Failed to create request'));
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">👥 {t('collab.buildTeam', 'Build your Team')}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {booking.serviceSnapshot?.name} · <span className={`badge px-2 py-0.5 ${STATUS_COLORS[booking.status]}`}>{booking.status}</span>
          </p>

          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="col-span-2">
              <label className="label">{t('collab.collabRole', 'Collaborator role')}</label>
              <select className="input-field" value={form.role} onChange={set('role')}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">{t('collab.requiredSkills', 'Required skills (tap to select, optional)')}</label>
              <div className="flex flex-wrap gap-1.5">
                {allSkills.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => toggleSkill(s._id)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${selectedSkillIds.includes(s._id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-400'}`}
                  >
                    {s.name} {selectedSkillIds.includes(s._id) ? '✓' : ''}
                  </button>
                ))}
              </div>
              {selectedSkillIds.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1">{t('collab.noSkillsChosen', 'No skills chosen → matched by collaborator role only.')}</p>
              )}
            </div>
            <div>
              <label className="label">{t('collab.teamSize', 'Team size')}</label>
              <input type="number" min="1" max="10" className="input-field" value={form.numberOfCollaborators} onChange={set('numberOfCollaborators')} />
            </div>
            <div>
              <label className="label">{t('collab.date', 'Date')}</label>
              <input type="date" className="input-field" value={form.date} onChange={set('date')} />
            </div>
            <div>
              <label className="label">{t('collab.startTime', 'Start time')}</label>
              <input type="time" className="input-field" value={form.startTime} onChange={set('startTime')} />
            </div>
            <div>
              <label className="label">{t('collab.durationHours', 'Duration (hours)')}</label>
              <input type="number" min="1" className="input-field" value={form.durationHours} onChange={set('durationHours')} />
            </div>
            <div className="col-span-2">
              <label className="label">{t('collab.estPayment', 'Estimated payment (₹)')}</label>
              <input type="number" min="0" className="input-field" value={form.estimatedPayment} onChange={set('estimatedPayment')} />
            </div>
            <div className="col-span-2">
              <label className="label">{t('collab.instructionsToCollabs', 'Instructions to collaborators')}</label>
              <textarea className="input-field" rows="2" placeholder={t('collab.instructionsPlaceholder', 'What should the team bring / prepare?')} value={form.instructions} onChange={set('instructions')} />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={onClose} type="button" className="btn-secondary flex-1">{t('collab.cancel', 'Cancel')}</button>
            <button onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? t('collab.matching', 'Matching...') : t('collab.findCollabs', 'Find Collaborators')}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            {t('collab.fairWorkNote', 'Fair-work matching: only verified workers with a matching verified skill near the job are invited.')}
          </p>
        </div>
      </div>
    </div>
  );
}
