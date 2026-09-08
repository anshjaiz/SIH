const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function CollaborationInviteCard({ invite, onRespond, responding }) {
  const lead = invite.lead;
  const leadName = invite.leadWorker?.user?.name || lead?.user?.name || 'Another worker';
  const myScore = invite.myScore;
  const reasons = invite.myReasons || [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
            {leadName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">🤝 Collaboration Opportunity</h3>
            <p className="text-sm text-gray-500">
              {leadName} needs a <span className="font-medium text-gray-700">{invite.role}</span>
            </p>
          </div>
        </div>
        {myScore != null && (
          <span className="badge bg-green-100 text-green-700">Match {Math.round(myScore)}%</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-4">
        <div>📅 {fmtDate(invite.date)}</div>
        <div>⏰ {invite.startTime} · {invite.durationHours}h</div>
        <div className="col-span-2">📍 {invite.city || 'Hyderabad'} · {invite.address}</div>
        <div className="col-span-2 font-medium text-brand-700">💰 Estimated earning ₹{invite.estimatedPayment}</div>
      </div>

      {invite.instructions && (
        <p className="text-sm text-gray-500 mb-3 italic">"{invite.instructions}"</p>
      )}

      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {reasons.map((r, i) => (
            <span key={i} className="text-[11px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{r}</span>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onRespond(invite._id, 'ACCEPT')}
          disabled={responding}
          className="btn-success flex-1"
        >
          ✓ Accept
        </button>
        <button
          onClick={() => onRespond(invite._id, 'DECLINE')}
          disabled={responding}
          className="btn-secondary flex-1"
        >
          Decline
        </button>
      </div>
    </div>
  );
}