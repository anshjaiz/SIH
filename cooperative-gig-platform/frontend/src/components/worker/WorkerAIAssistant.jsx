import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  { label: '📍 Demand', q: 'Where is demand high near me today?' },
  { label: '💰 Earnings', q: 'How can I increase my earnings?' },
  { label: '🎯 Skills', q: 'Which skill should I learn to get more jobs?' },
  { label: '📊 Performance', q: 'How am I performing this month?' },
  { label: '🧭 Find Jobs', q: 'What jobs are available near me?' },
  { label: '📚 Learn', q: 'Teach me the basics of plumbing.' },
];

// Safe inline Markdown renderer: **bold**, *italic*, bullet lists, numbered lists, headers.
function renderInline(text) {
  if (!text) return null;
  const parts = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) {
      parts.push(
        <strong key={parts.length} className="font-semibold text-gray-900 text-inherit">{m[2]}</strong>
      );
    } else if (m[3]) {
      parts.push(
        <em key={parts.length} className="italic text-inherit">{m[3]}</em>
      );
    } else if (m[4]) {
      parts.push(
        <code key={parts.length} className="bg-gray-100 px-1 rounded text-xs font-mono">{m[4]}</code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderReply(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const nodes = [];
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      nodes.push(<div key={i} className="h-1" />);
    } else if (/^#{1,3}\s/.test(line)) {
      const clean = line.replace(/^#{1,3}\s*/, '');
      nodes.push(
        <p key={i} className="font-semibold text-gray-900 text-sm mt-2 mb-0.5">
          {renderInline(clean)}
        </p>
      );
    } else if (/^[•\-]\s/.test(line)) {
      nodes.push(
        <div key={i} className="flex gap-1.5 ml-1">
          <span className="text-brand-500 shrink-0 mt-0.5">•</span>
          <span className="min-w-0" style={{ wordBreak: 'break-word' }}>
            {renderInline(line.replace(/^[\-•]\s*/, ''))}
          </span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const dotIdx = line.indexOf('.');
      const num = line.slice(0, dotIdx);
      const rest = line.slice(dotIdx + 1).trim();
      nodes.push(
        <div key={i} className="flex gap-1.5 ml-1">
          <span className="text-brand-500 shrink-0 font-semibold min-w-[1.25rem]">{num}.</span>
          <span className="min-w-0" style={{ wordBreak: 'break-word' }}>
            {renderInline(rest)}
          </span>
        </div>
      );
    } else if (/^_/.test(line) && /_$/.test(line.trim())) {
      nodes.push(
        <p key={i} className="text-xs text-gray-400 italic">
          {renderInline(line.replace(/^_\s*/, '').replace(/\s*_$/, ''))}
        </p>
      );
    } else {
      nodes.push(
        <p key={i} className="min-w-0" style={{ wordBreak: 'break-word' }}>
          {renderInline(line)}
        </p>
      );
    }
  });
  return nodes;
}

export default function WorkerAIAssistant() {
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      text: "Hello! I'm your **ShramikSetu AI Assistant** — powered by AI and connected to your real platform data.\n\nI can help with jobs, earnings, skills, demand, or any general question. Ask me anything — in English, Hindi, or Hinglish.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text || '').trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setShowQuick(false);
    setLoading(true);

    // Build conversation history for the backend (last N messages)
    const history = messages.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      text: m.text,
    }));

    try {
      const res = await api.post('/workers/ai-assistant/chat', {
        message: q,
        conversationHistory: history,
      });
      const { reply, dataUsed, actions } = res.data || {};
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: reply || 'I could not generate a response.',
          dataUsed,
          actions: actions || [],
        },
      ]);
    } catch (e) {
      console.error(e);
      const errMsg = e.response?.data?.message || e.message || 'The assistant could not answer.';
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: "Sorry, I couldn't process that right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        text: "Chat cleared. I'm ready to help! Ask me anything about jobs, skills, earnings, or any general question.",
      },
    ]);
    setShowQuick(true);
  };

  const handleAction = (action) => {
    if (action?.type === 'VIEW_HEATMAP') {
      document.getElementById('shramiksetu-demand-heatmap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.dispatchEvent(new CustomEvent('shramiksetu:focus-demand'));
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">ShramikSetu AI</h3>
            <p className="text-xs text-gray-500">Your intelligent assistant for jobs, earnings &amp; skill growth</p>
          </div>
          <span className="badge badge-info">GEMINI AI</span>
        </div>
        {messages.length > 1 && (
          <button
            onClick={clearChat}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="h-96 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 p-3 space-y-3"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white rounded-br-none'
                  : 'bg-white text-gray-700 border border-gray-200 rounded-bl-none'
              }`}
            >
              {renderReply(m.text)}
              {m.role === 'assistant' && (m.dataUsed?.length > 0 || m.actions?.length > 0) && (
                <div className="mt-2 pt-1.5 border-t border-gray-100 space-y-1.5">
                  {m.dataUsed?.length > 0 && (
                    <span className="text-[10px] text-gray-400">
                      Used platform data: {m.dataUsed.join(', ')}
                    </span>
                  )}
                  {m.actions?.map((a, ai) => (
                    <button
                      key={ai}
                      onClick={() => handleAction(a)}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-full px-2.5 py-1 transition-colors"
                    >
                      <span>🗺️</span>
                      {a.label || 'View on Heatmap'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 bg-white border border-gray-200 rounded-bl-none shadow-sm flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-400">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts — shown initially and after clear */}
      {showQuick && (
        <div className="flex gap-2 flex-wrap mt-3">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => send(p.q)}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100 disabled:opacity-50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        className="flex items-center gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me anything…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary !py-2 text-sm">
          Send
        </button>
      </form>

      <p className="text-[11px] text-gray-400 mt-2">
        Powered by Gemini AI. Uses your real ShramikSetu data when relevant.
        For general questions, answers come from AI knowledge. Data is never shared externally.
      </p>
    </div>
  );
}