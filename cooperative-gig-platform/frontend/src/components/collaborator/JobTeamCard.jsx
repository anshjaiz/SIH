const MEMBER_STATUS_COLORS = {
  INVITED: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-red-100 text-red-600',
  COMPLETED: 'bg-gray-200 text-gray-700',
};

export default function JobTeamCard({ team, onRefresh }) {
  if (!team) return null;

  const accepted = team.members.filter((m) => m.status === 'ACCEPTED' || m.status === 'COMPLETED');
  const filled = accepted.length;

  return (
    <div className="p-4 bg-brand-50 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-900 text-sm">👥 Job Team</h4>
          <p className="text-xs text-gray-500">
            {team.lead?.user?.name || 'You'} (lead) · {filled}/{team.members.length} filled
          </p>
        </div>
        <span className={`badge px-2 py-0.5 ${team.completed ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'}`}>
          {team.completed ? 'Completed' : 'Active'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
          <div className="text-sm">
            <span className="font-medium text-gray-800">⭐ {team.lead?.user?.name || 'Lead'}</span>
            <span className="badge bg-brand-100 text-brand-700 ml-2">Lead</span>
          </div>
          <span className="text-xs text-gray-400">Rating {team.lead?.rating || '—'}</span>
        </div>
        {team.members.map((m, i) => (
          <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
            <div className="text-sm">
              <span className="font-medium text-gray-800">{m.workerProfile?.user?.name || 'Worker'}</span>
              <span className="text-gray-400"> · {m.role}</span>
            </div>
            <div className="flex items-center gap-2">
              {m.paymentEstimate > 0 && (
                <span className="text-xs text-brand-700 font-medium">₹{m.paymentEstimate}</span>
              )}
              <span className={`badge px-2 py-0.5 ${MEMBER_STATUS_COLORS[m.status]}`}>{m.status}</span>
            </div>
          </div>
        ))}
      </div>

      {onRefresh && (
        <button onClick={onRefresh} className="mt-3 text-xs text-brand-600 hover:underline">
          ↻ Refresh
        </button>
      )}
    </div>
  );
}