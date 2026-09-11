import { useTranslation } from 'react-i18next';

const MEMBER_STATUS_COLORS = {
  INVITED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-600',
  COMPLETED: 'bg-gray-200 text-gray-700',
  NO_SHOW: 'bg-red-100 text-red-600',
};

const toRad = (n) => (n * Math.PI) / 180;
const haversineKm = (a, b) => {
  if (!a || !b) return null;
  const coords = Array.isArray(b) ? b : b.coordinates;
  const [lng1, lat1] = a;
  const [lng2, lat2] = coords || [];
  if ([lng1, lat1, lng2, lat2].some((v) => v == null)) return null;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const fmtAgo = (d) => {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const s = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

export default function JobTeamCard({ team, helperLocs = {}, bookingLocation }) {
  const { t } = useTranslation();
  if (!team) return null;

  const accepted = team.members.filter((m) => m.status === 'ACCEPTED' || m.status === 'COMPLETED');
  const filled = accepted.length;

  return (
    <div className="p-4 bg-brand-50 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-900 text-sm">👥 {t('collab.jobTeam', 'Job Team')}</h4>
          <p className="text-xs text-gray-500">
            {team.lead?.user?.name || 'You'} ({t('collab.leadLabel', 'lead')}) · {t('collab.filledOf', '{{filled}}/{{total}} filled', { filled, total: team.members.length })}
          </p>
        </div>
        <span className={`badge px-2 py-0.5 ${team.completed ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
          {team.completed ? t('collab.completed', 'Completed') : t('collab.active', 'Active')}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
          <div className="text-sm">
            <span className="font-medium text-gray-800">⭐ {team.lead?.user?.name || t('collab.leadFallback', 'Lead')}</span>
            <span className="badge bg-brand-100 text-brand-700 ml-2">{t('collab.leadBadge', 'Lead')}</span>
          </div>
          <span className="text-xs text-gray-400">{t('collab.ratingLabel', 'Rating {{rating}}', { rating: team.lead?.rating || '—' })}</span>
        </div>
        {team.members.map((m, i) => {
          const loc = helperLocs[m.worker] || m.location?.coordinates;
          const km = loc ? haversineKm(bookingLocation, loc) : null;
          const tracked = m.status === 'ACCEPTED' && km != null && !team.completed;
          const lastSeen = m.lastLocationUpdate ? fmtAgo(m.lastLocationUpdate) : null;
          return (
            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
              <div className="text-sm">
                <span className="font-medium text-gray-800">{m.workerProfile?.user?.name || t('collab.workerFallback', 'Worker')}</span>
                <span className="text-gray-400"> · {m.role}</span>
              </div>
              <div className="flex items-center gap-2">
                {tracked && (
                  <span className="badge bg-red-100 text-red-700">🟢 {km.toFixed(1)} km{lastSeen ? ` · ${lastSeen}` : ''}</span>
                )}
                {m.paymentEstimate > 0 && (
                  <span className="text-xs text-brand-700 font-medium">₹{m.paymentEstimate}</span>
                )}
                <span className={`badge px-2 py-0.5 ${MEMBER_STATUS_COLORS[m.status]}`}>{m.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {helperLocs && Object.keys(helperLocs).length > 0 && (
        <p className="text-[11px] text-gray-400 mt-2">🟢 {t('collab.liveLocationNote', 'Live location updates arrive every 10s from collaborating helpers.')}</p>
      )}
    </div>
  );
}
