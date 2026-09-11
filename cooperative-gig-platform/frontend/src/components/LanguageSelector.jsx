import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LANG_OPTIONS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिंदी', flag: '🇮🇳' },
  { code: 'hinglish', label: 'Hinglish', flag: '🇮🇳' },
  { code: 'bn', label: 'বাংলা', flag: '🇧🇩' },
];

export default function LanguageSelector({ compact = false }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANG_OPTIONS.find((l) => l.code === i18n.language) || LANG_OPTIONS[0];

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const switchLang = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors ${
          compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
        }`}
        title={t('lang.switchTo')}
      >
        <span className="text-base leading-none">🌐</span>
        <span className="font-medium text-gray-700 hidden sm:inline">{current.label}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-2">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{t('lang.label')}</p>
          {LANG_OPTIONS.map((lang) => (
            <button
              key={lang.code}
              onClick={() => switchLang(lang.code)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                lang.code === i18n.language
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-base leading-none">{lang.flag}</span>
              <span className="flex-1 text-left">{lang.label}</span>
              {lang.code === i18n.language && (
                <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}