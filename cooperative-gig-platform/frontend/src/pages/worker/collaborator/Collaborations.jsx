import { useState } from 'react';
import useCollaborator from '../../../hooks/useCollaborator';
import CollaborationInviteCard from '../../../components/collaborator/CollaborationInviteCard';
import CollaboratorProfileCard from '../../../components/collaborator/CollaboratorProfileCard';
import MyTeamJobs from '../../../components/collaborator/MyTeamJobs';
import MySentRequests from '../../../components/collaborator/MySentRequests';

export default function Collaborations() {
  const { invites, loading, refresh, respond } = useCollaborator();
  const [tab, setTab] = useState('jobs');
  const [respondingId, setRespondingId] = useState(null);

  const handleRespond = async (requestId, action) => {
    setRespondingId(requestId);
    await respond(requestId, action);
    setRespondingId(null);
  };

  const tabs = [
    { id: 'jobs', label: `✅ My Team Jobs` },
    { id: 'sent', label: `📨 My Requests` },
    { id: 'invites', label: `🤝 Opportunities${invites.length ? ` (${invites.length})` : ''}` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Collaborations</h2>
        <p className="text-sm text-gray-500">
          Team up with other verified workers on nearby jobs and earn more.
        </p>
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`badge px-4 py-2 ${tab === t.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <CollaboratorProfileCard />

      {tab === 'sent' ? (
        <MySentRequests />
      ) : tab === 'invites' ? (
        loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
          </div>
        ) : invites.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">🤝</div>
            No collaboration invitations yet.
            When a lead worker needs a teammate, it will show up here in real time.
          </div>
        ) : (
          <div className="space-y-4">
            {invites.map((invite) => (
              <CollaborationInviteCard
                key={invite._id}
                invite={invite}
                responding={respondingId === invite._id}
                onRespond={handleRespond}
              />
            ))}
          </div>
        )
      ) : (
        <MyTeamJobs />
      )}
    </div>
  );
}