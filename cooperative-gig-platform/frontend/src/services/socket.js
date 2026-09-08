import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => socket;

export const connectSocket = (user, profile) => {
  if (!user) return null;

  disconnectSocket();

  socket = io(import.meta.env.VITE_API_URL || '', {
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    socket.emit('identity', user.id);
    if (user.role === 'customer') {
      socket.emit('customer_join', user.id);
    }
    if (user.role === 'worker') {
      const workerId = profile && profile.workerId ? profile.workerId : null;
      if (workerId) socket.emit('worker_join', workerId);
    }
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};