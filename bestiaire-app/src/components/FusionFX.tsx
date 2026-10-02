import { useEffect, useRef } from 'react';
import { Species, FRAME, FRAMEN } from '../game/species';
import { FuseResult } from '../lib/api';
import { buzz, confetti, reduceMotion } from '../lib/fx';
import { Print } from './ui';

export function FusionFX({ s, r, onClose }: { s: Species; r: FuseResult; onClose: () => void }) {
  const ov = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.classList.add('noscroll');
    const t = setTimeout(() => { buzz([30, 50, 80]); if (r.lvl >= 5 || r.up) confetti(ov.current, ['#f0b54a', '#ffffff', '#a46be0'], 120, 0) }, reduceMotion ? 0 : 900);
    return () => { clearTimeout(t); document.body.classList.remove('noscroll') };
  }, [r]);
  const newFrame = FRAME(r.lvl) && FRAME(r.lvl) !== FRAME(r.lvl - 1);
  return (
    <div ref={ov} className="reveal fusionfx" role="dialog" aria-label="Fusion">
      <div className="fx-pair"><div className="fx-l"><Print s={s} q={r.a.q} lvl={r.a.lvl} /></div><div className="fx-r"><Print s={s} q={r.b.q} lvl={r.b.lvl} /></div></div>
      <div className="fx-flash" />
      <div className="fx-res">
        <Print s={s} q={r.q} lvl={r.lvl} />
        <div className="rv-msg"><b className="rv-tier lvlup">NIVEAU {r.lvl} !</b>
          {r.up && <span className="stamp">Photo améliorée</span>}
          {newFrame && <span className="rv-dup">{FRAMEN[FRAME(r.lvl)]} débloqué</span>}
          {r.lvl === 3 && <span className="rv-dup">3ᵉ capacité débloquée</span>}
          {r.lvl === 5 && <span className="rv-dup">Capacité spéciale débloquée</span>}
        </div>
        <button className="btn primary big" onClick={onClose}>Super !</button>
      </div>
    </div>
  );
}
