import { useEffect, useRef, useState } from 'react';
import { BYID, TIERS, TIER_COL } from '../game/species';
import { Shot } from '../lib/api';
import { buzz, confetti } from '../lib/fx';
import { Print } from './ui';

/** Développement plein écran d'une pellicule, photo par photo */
export function Reveal({ shots, onDone }: { shots: Shot[]; onDone: () => void }) {
  const [i, setI] = useState(0); const [flipped, setFlipped] = useState(false);
  const ov = useRef<HTMLDivElement>(null);
  const sh = shots[i], s = BYID[sh.species_id], t = s.tier;
  useEffect(() => { document.body.classList.add('noscroll'); return () => document.body.classList.remove('noscroll') }, []);
  useEffect(() => {
    if (!flipped) return;
    if (t >= 3) { buzz(t === 4 ? [40, 60, 40, 60, 120] : [30, 40, 60]); confetti(ov.current, t === 4 ? ['#f0b54a', '#fff2c4', '#e2b33c', '#ffffff'] : ['#a46be0', '#d9c2f5', '#ffffff'], t === 4 ? 220 : 110) }
    else { confetti(ov.current, [TIER_COL[t], '#ffffff', t === 2 ? '#9fc0f0' : '#e6dcc0'], t === 2 ? 60 : 26); if (sh.is_new) buzz(20) }
  }, [flipped, i, t, sh.is_new]);
  const step = () => { if (!flipped) { setFlipped(true); return } if (i < shots.length - 1) { setI(i + 1); setFlipped(false) } else onDone() };
  return (
    <div ref={ov} className={`reveal ${flipped ? 'fx-t' + t : ''} ${flipped && t >= 3 ? 'shake' : ''}`} role="dialog" aria-label="Développement de la pellicule">
      <div className="rv-top"><span>{i + 1} / {shots.length}</span><button className="rv-skip" onClick={onDone}>Tout révéler</button></div>
      <div className="rv-rays" aria-hidden="true" />
      <div className="rv-stage" onClick={step}>
        <div key={i + (flipped ? 'f' : 'b')} className={`flip ${flipped ? 'on' : ''}`}>
          <div className={`face back ${t >= 2 ? 'hint t' + t : ''}`}><div className="neg"><span>{t >= 3 ? 'Quelque chose de rare bouge…' : t === 2 ? 'Une silhouette inhabituelle…' : 'Toucher pour développer'}</span></div></div>
          <div className="face front"><Print s={s} q={sh.q} lvl={sh.lvl} phase={sh.phase} isNew={sh.is_new} />{flipped && <div className="glint" />}</div>
        </div>
      </div>
      <div className="rv-msg">{flipped && <>
        {t >= 2 && <b className="rv-tier" style={{ color: TIER_COL[t] }}>{TIERS[t].toUpperCase()}{t === 4 ? ' !' : ''}</b>}
        {sh.is_new ? <span className="stamp">Nouvelle espèce</span> : <span className="rv-dup">+1 exemplaire · prêt pour la fusion</span>}
      </>}</div>
      <div className="rv-bottom"><button className="btn primary big" onClick={step}>{!flipped ? 'Développer' : i < shots.length - 1 ? 'Photo suivante' : 'Voir ma pellicule'}</button></div>
    </div>
  );
}
