import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { getCollaboratorProfile } from '../../services/collaboratorService';

export default function CollaboratorProfileCard({ workerId }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getCollaboratorProfile(workerId);
        if (active) setProfile(res.data);
      } catch (e) {
        if (active) toast.error(e.message || t('toast.failedLoadProfile', 'Failed to load profile'));
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [workerId]);

  if (loading) return <div className="card animate-pulse h-40"></div>;
  if (!profile) return null;

  const stats = [
    { label: t('collab.rating', 'Rating'), value: profile.rating ? `${profile.rating.toFixed(1)} ★` : '—' },
    { label: t('collab.collaborations', 'Collaborations'), value: profile.collaborationsCount || 0 },
    { label: t('collab.jobsDone', 'Jobs Done'), value: profile.completedJobs || 0 },
    { label: t('collab.activeJobs', 'Active Jobs'), value: profile.currentWorkload || 0 },
    { label: t('collab.punctuality', 'Punctuality'), value: profile.punctuality ? `${Math.round(profile.punctuality * 100)}%` : '—' },
    { label: t('collab.reliability', 'Reliability'), value: profile.reliability ? `${Math.round(profile.reliability * 100)}%` : '—' },
  ];

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-12 w-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-lg">
          {(profile.user?.name || 'W').charAt(0).toUpperCase()}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{profile.user?.name}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{profile.skills?.map((s) => s.name).join(', ') || t('collab.general', 'General')}</span>
            {profile.verificationStatus === 'VERIFIED' && (
              <span className="badge bg-green-100 text-green-700">✓ {t('collab.verified', 'Verified')}</span>
            )}
          </div>
        </div>
      </div>

      {profile.address && <p className="text-sm text-gray-500 mb-4">📍 {profile.address}, {profile.city}</p>}

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
