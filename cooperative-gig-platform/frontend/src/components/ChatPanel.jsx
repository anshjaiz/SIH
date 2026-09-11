import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

export default function ChatPanel({ bookingId, open, onClose, bookingNumber }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [otherName, setOtherName] = useState('Worker');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const lastIdRef = useRef(null);

  const load = async () => {
    if (!bookingId) return;
    try {
      const res = await api.get(`/chat/${bookingId}/messages`);
      setMessages(res.data.messages || []);
      setOtherName(res.data.otherName || 'Worker');
    } catch (e) {
      if (e.status !== 401) toast.error(e.message || t('chatp.couldNotLoad'));
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open, bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Live delivery: the server emits to both sides of the conversation.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !open) return undefined;
    const onMessage = (msg) => {
      if (!bookingId || String(msg.booking) !== String(bookingId)) return;
      if (lastIdRef.current === msg._id) return;
      lastIdRef.current = msg._id;
      setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
      if (msg.sender !== String(user?.id)) {
        api.post(`/chat/${bookingId}/read`).catch(() => {});
      }
    };
    socket.on('chat_message', onMessage);
    return () => socket.off('chat_message', onMessage);
  }, [open, bookingId, user?.id]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/chat/${bookingId}/messages`, { text: body });
      const msg = res.data;
      if (msg && !messages.some((m) => m._id === msg._id)) {
        setMessages((prev) => [...prev, msg]);
      }
      setText('');
    } catch (e) {
      toast.error(e.message || t('chatp.couldNotSend'));
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-[400px] h-[82vh] sm:h-[560px] flex flex-col pointer-events-auto sm:mr-6 sm:mb-6">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">💬 {otherName}</h3>
            {bookingNumber && (
              <p className="text-[11px] text-gray-400">{t('chatp.jobNumber', { number: bookingNumber })}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 bg-gray-50">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-400 mt-10">
              {t('chatp.noMessages')}
            </p>
          )}
          {messages.map((m) => {
            const mine = String(m.sender) === String(user?.id);
            return (
              <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  mine ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                }`}>
                  <p className="break-words whitespace-pre-wrap">{m.text}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-gray-400'}`}>{fmtTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-gray-100 flex items-center gap-2 shrink-0">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={t('chatp.placeholder')}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="btn-primary shrink-0 px-4 py-2 rounded-xl"
          >
            {sending ? '…' : t('chatp.send')}
          </button>
        </div>
      </div>
    </div>
  );
}