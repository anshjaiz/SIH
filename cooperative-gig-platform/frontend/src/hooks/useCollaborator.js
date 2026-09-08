import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socket';
import {
  getMyCollaborationRequests,
  respondCollaborationRequest,
} from '../services/collaboratorService';

export default function useCollaborator() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'worker') {
      setLoading(false);
      return;
    }
    try {
      const res = await getMyCollaborationRequests();
      setInvites(res.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: new invites / team updates arrive over socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onInvite = () => refresh();
    const onUpdate = () => refresh();
    socket.on('collaboration_invite', onInvite);
    socket.on('collaboration_update', onUpdate);
    return () => {
      socket.off('collaboration_invite', onInvite);
      socket.off('collaboration_update', onUpdate);
    };
  }, [refresh]);

  const respond = async (requestId, action) => {
    try {
      await respondCollaborationRequest(requestId, action);
      toast.success(action === 'ACCEPT' ? 'Collaboration accepted. See you on the job!' : 'Invitation declined');
      refresh();
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to respond');
      return false;
    }
  };

  return { invites, loading, refresh, respond };
}