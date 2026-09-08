import { useState } from 'react';
import useCollaborator from '../../../hooks/useCollaborator';
import CollaborationInviteCard from '../../../components/collaborator/CollaborationInviteCard';
import CollaboratorProfileCard from '../../../components/collaborator/CollaboratorProfileCard';

export default function Collaborations() {
  const { invites, loading, refresh, respond } = useCollaborator();
  const [respondingId, setRespondingId] = useState(null);

  const handleRespond = async (requestId, action) => {
    setRespondingId(requestId);
    await respond(requestId, action);
    setRespondingId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Collaborations</h2>
        <p className="text-sm text-gray-500">
          Team up with other verified workers on nearby jobs and earn more.
        </p>
      </div>

      <CollaboratorProfileCard />

      <div>
        <h3 className="font-semibold text-gray-900 mb-3">Incoming opportunities</h3>

        {loading ? (
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
        )}
      </div>

      {invites.length > 0 && (
        <button onClick={refresh} className="text-sm text-brand-600 hover:underline">
          ↻ Refresh invites
        </button>
      )}
    </div>
  );
}