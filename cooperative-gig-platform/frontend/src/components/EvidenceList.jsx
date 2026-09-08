import { evidenceType, fullUrl } from '../utils/complaints';

export default function EvidenceList({ items = [], max = 99 }) {
  const list = items.slice(0, max);
  if (!list.length) return <p className="text-xs text-gray-400">No evidence attached</p>;

  return (
    <div className="flex flex-wrap gap-3">
      {list.map((ev, i) => {
        const t = evidenceType(ev);
        const src = fullUrl(ev.path || ev.url);
        return (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 ring-1 ring-gray-200">
            {t === 'IMAGE' ? (
              <img src={src} alt="evidence" className="w-full h-full object-cover" />
            ) : t === 'VIDEO' ? (
              <video src={src} className="w-full h-full object-cover" muted />
            ) : (
              <a href={src} target="_blank" rel="noreferrer" className="w-full h-full flex items-center justify-center text-lg text-brand-600">
                📄
              </a>
            )}
            {ev.caption && (
              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate">{ev.caption}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}