import { ReactNode, useEffect, useRef } from 'react';
import { Species, TIERS, QUAL, qIndex, FRAME, photoStyle } from '../game/species';

export function Print({ s, q, lvl, phase, isNew, foot, dev }: { s: Species; q: number; lvl: number; phase?: string | null; isNew?: boolean; foot?: ReactNode; dev?: boolean }) {
  const qi = qIndex(q), fr = FRAME(lvl), st = photoStyle(s);
  const ph = (phase || 'jour').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (
    <div className={`print t${s.tier} ${fr ? 'fr-' + fr : ''} ${dev ? 'dev' : ''}`}>
      {lvl > 1 && <span className="lvlb">Niv. {lvl}</span>}
      {isNew && <span className="new">Nouveau</span>}
      <div className={`scene q${qi} ph-${ph}`}>
        {st ? <div className="spr" role="img" aria-label={s.nom} style={st} /> : <div className="nophoto"><span>{s.nom.split(/[\s'-]+/).filter(w => w.length > 2).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span></div>}
        <div className="vf" />
      </div>
      <div className="cap"><b>{s.nom}</b><span>{QUAL[qi]}</span></div>
      <div className="sci">{s.sci}{s.pays && <> · <b className="pays">{s.pays}</b></>}</div>
      <div className="row spread" style={{ gap: 6 }}><span className="rbadge">{TIERS[s.tier]}</span>{foot}</div>
    </div>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); ref.current?.focus(); return () => removeEventListener('keydown', k) }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet" ref={ref} tabIndex={-1}>{children}</div>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) { return msg ? <div className="toast" role="status">{msg}</div> : null }

const P = (d: string) => <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
export const Icon = {
  cam: P('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  book: P('<path d="M4 5.5C6.5 4.5 9 4.5 12 6c3-1.5 5.5-1.5 8-.5V19c-2.5-1-5-1-8 .5-3-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>'),
  fight: P('<path d="M5 19 15.5 8.5M14 4h6v6M19 19 8.5 8.5M10 4H4v6"/>'),
  coin: P('<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5"/>'),
  user: P('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.5 4-5 7-5s5.8 1.5 7 5"/>'),
  film: P('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4"/>'),
  feather: P('<path d="M20 4c-7 0-12 5-12 12v4M8 16h6c3 0 6-4 6-12M8 12h7"/>'),
  paw: P('<circle cx="7" cy="10" r="1.8"/><circle cx="17" cy="10" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 1.5-1.5 2-4 2s-4-.5-4-2z"/>'),
  star: P('<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8z"/>'),
};
