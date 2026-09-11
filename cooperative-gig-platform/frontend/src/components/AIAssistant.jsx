import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const WORKER_QUICK_PROMPTS = [
  { labelKey: 'bot.quickPrompts.demand.label', qKey: 'bot.quickPrompts.demand.q' },
  { labelKey: 'bot.quickPrompts.earnings.label', qKey: 'bot.quickPrompts.earnings.q' },
  { labelKey: 'bot.quickPrompts.skills.label', qKey: 'bot.quickPrompts.skills.q' },
  { labelKey: 'bot.quickPrompts.performance.label', qKey: 'bot.quickPrompts.performance.q' },
  { labelKey: 'bot.quickPrompts.findJobs.label', qKey: 'bot.quickPrompts.findJobs.q' },
  { labelKey: 'bot.quickPrompts.learn.label', qKey: 'bot.quickPrompts.learn.q' },
];

const CUSTOMER_QUICK_PROMPTS = [
  { labelKey: 'home.prompts.leak.label', qKey: 'home.prompts.leak.q' },
  { labelKey: 'home.prompts.power.label', qKey: 'home.prompts.power.q' },
  { labelKey: 'home.prompts.ac.label', qKey: 'home.prompts.ac.q' },
  { labelKey: 'home.prompts.help.label', qKey: 'home.prompts.help.q' },
];

// Safe inline Markdown renderer: **bold**, *italic*, `code`.
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

const URGENCY_STYLES = {
  emergency: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  normal: 'bg-green-100 text-green-700 border-green-200',
};

function DiagnosisCard({ d, t, customer }) {
  const navigate = useNavigate();
  const urgencyKey = ['emergency', 'high', 'normal'].includes(d.urgency) ? d.urgency : 'normal';

  const handleBook = () => {
    if (d.serviceId) {
      navigate(`/customer/services/request/${d.serviceId}`);
    } else {
      navigate('/customer/services');
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 rounded-lg space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
          {t('asst.diagnosis')}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            URGENCY_STYLES[urgencyKey] || URGENCY_STYLES.normal
          }`}
        >
          {t('asst.urgency')}: {t(`asst.${urgencyKey}`)}
        </span>
      </div>

      {d.safetyWarning && (
        <div className="flex gap-1.5 p-2 rounded-md bg-red-50 border border-red-200">
          <span className="shrink-0">⚠️</span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-red-700">{t('asst.safety')}</p>
            <p className="text-xs text-red-600" style={{ wordBreak: 'break-word' }}>{d.safetyWarning}</p>
          </div>
        </div>
      )}

      {Array.isArray(d.possibleCauses) && d.possibleCauses.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-500">{t('asst.causes')}</p>
          {d.possibleCauses.map((cause, i) => (
            <p key={i} className="text-xs text-gray-600 flex gap-1.5">
              <span className="text-brand-500 shrink-0">•</span>
              <span className="min-w-0" style={{ wordBreak: 'break-word' }}>{cause}</span>
            </p>
          ))}
        </div>
      )}

      {d.diyPossible && Array.isArray(d.diySteps) && d.diySteps.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-500">{t('asst.diy')}</p>
          {d.diySteps.map((step, i) => (
            <p key={i} className="text-xs text-gray-600 flex gap-1.5">
              <span className="text-green-600 shrink-0 font-semibold">{i + 1}.</span>
              <span className="min-w-0" style={{ wordBreak: 'break-word' }}>{step}</span>
            </p>
          ))}
          {d.diyRiskNote && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
              ⚠️ {t('asst.diyRisk')}: {d.diyRiskNote}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
          ⛔ {t('asst.noDiy')}
        </p>
      )}

      {d.professionalHelpRecommended && (
        <p className="text-xs text-brand-700 bg-brand-50 border border-brand-100 rounded px-2 py-1">
          🧰 {t('asst.proRecommended')}
        </p>
      )}

      {d.recommendedService && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-md bg-gray-50 border border-gray-200">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-500">{t('asst.expert')}</p>
            <p className="text-sm font-semibold text-gray-800">
              {d.serviceName || d.recommendedService}
              {typeof d.basePrice === 'number' && <span className="text-brand-600"> · ₹{d.basePrice}</span>}
            </p>
          </div>
          {customer && (
            <button onClick={handleBook} className="btn-primary !py-1.5 !px-3 text-xs">
              {d.serviceId ? t('asst.bookCta') : t('asst.browseCta')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIAssistant() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isCustomer = user?.role === 'customer';
  const endpoint = isCustomer ? '/customers/ai-assistant/chat' : '/workers/ai-assistant/chat';
  const quickPrompts = isCustomer ? CUSTOMER_QUICK_PROMPTS : WORKER_QUICK_PROMPTS;

  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      text: t(isCustomer ? 'home.welcome' : 'bot.welcome'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [imageData, setImageData] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const handleAttach = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(t('asst.badImage'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t('asst.bigImage'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageData(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const send = async (text) => {
    const q = (text || '').trim();
    if ((!q && !imageData) || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: q || t('asst.photoMessage') },
    ]);
    setInput('');
    setImageData(null);
    setShowQuick(false);
    setLoading(true);

    const history = messages.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      text: m.text,
    }));

    try {
      const res = await api.post(endpoint, {
        message: q || 'Analyse the attached photo and help me with this home/service problem.',
        conversationHistory: history,
        language: i18n.language || 'en',
        imageData: imageData || undefined,
      });

      const { reply, dataUsed, actions, diagnosis, errorCode } = res?.data || {};

      let text = reply;
      if (errorCode === 'NO_PROVIDER') text = t('asst.errConfigured');
      else if (errorCode === 'ALL_PROVIDERS_FAILED') text = t('asst.errUnavailable');

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: text || (!errorCode && t('bot.couldNotAnswer')),
          dataUsed,
          actions: actions || [],
          diagnosis: diagnosis || null,
        },
      ]);
    } catch (e) {
      console.error(e);
      const errMsg = e.response?.data?.message || e.message || t('bot.couldNotAnswer');
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: t('bot.errorReply'),
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
        text: t(isCustomer ? 'home.welcome' : 'bot.cleared'),
      },
    ]);
    setShowQuick(true);
    setImageData(null);
  };

  const handleAction = (action) => {
    const type = action?.type;
    if (type === 'VIEW_HEATMAP') {
      document.getElementById('shramiksetu-demand-heatmap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.dispatchEvent(new CustomEvent('shramiksetu:focus-demand'));
    } else if (type === 'BROWSE_SERVICES') {
      window.location.href = '/customer/services';
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">
              {t(isCustomer ? 'home.title' : 'bot.title')}
            </h3>
            <p className="text-xs text-gray-500">{t(isCustomer ? 'home.subtitle' : 'bot.subtitle')}</p>
          </div>
          {!isCustomer && <span className="badge badge-info">{t('bot.badge')}</span>}
        </div>
        {messages.length > 1 && (
          <button
            onClick={clearChat}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {t('bot.clearChat')}
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
              {m.role === 'assistant' && m.diagnosis && (
                <DiagnosisCard d={m.diagnosis} t={t} customer={isCustomer} />
              )}
              {m.role === 'assistant' && (m.dataUsed?.length > 0 || m.actions?.length > 0) && (
                <div className="mt-2 pt-1.5 border-t border-gray-100 space-y-1.5">
                  {m.dataUsed?.length > 0 && (
                    <span className="text-[10px] text-gray-400">
                      {t('bot.usedData', { list: m.dataUsed.join(', ') })}
                    </span>
                  )}
                  {m.actions?.map((a, ai) => (
                    <button
                      key={ai}
                      onClick={() => handleAction(a)}
                      className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded-full px-2.5 py-1 transition-colors"
                    >
                      <span>{a.type === 'BROWSE_SERVICES' ? '🧭' : '🗺️'}</span>
                      {a.type === 'BROWSE_SERVICES' ? t('asst.browseCta') : a.label || t('bot.viewHeatmap')}
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
              <span className="text-xs text-gray-400">{t('bot.thinking')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts — shown initially and after clear */}
      {showQuick && (
        <div className="flex gap-2 flex-wrap mt-3">
          {quickPrompts.map((p) => (
            <button
              key={p.labelKey}
              onClick={() => send(t(p.qKey))}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100 disabled:opacity-50 transition-colors"
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      )}

      {/* Image preview */}
      {imageData && (
        <div className="flex items-center gap-2 mt-3">
          <img src={imageData} alt="" className="h-12 w-12 object-cover rounded-lg border border-gray-200" />
          <button
            type="button"
            onClick={() => setImageData(null)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            ✕ {t('asst.removePhoto')}
          </button>
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
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleAttach}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          title={t('asst.attachPhoto')}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          📎
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('bot.placeholder')}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          disabled={loading}
        />
        <button type="submit" disabled={loading || (!input.trim() && !imageData)} className="btn-primary !py-2 text-sm">
          {t('bot.send')}
        </button>
      </form>

      <p className="text-[11px] text-gray-400 mt-2">
        {t(isCustomer ? 'home.footer' : 'bot.footer')}
      </p>
    </div>
  );
}