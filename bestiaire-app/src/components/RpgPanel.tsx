// Fiche RPG d'un animal : niveau, expérience, rang, radar de stats, capacités et instinct.
import { CLASS, Classe, Species } from '../game/species';
import { ARCH, EFF, PREY, ULTIMES, abilities, puissance, statsAt } from '../game/combat';
import { NIV_CAPA3, NIV_INSTINCT, NIV_SPECIALE, RANG_CAPA3, RANG_SPECIALE, etoiles, progression } from '../game/rpg';
import { Card } from '../lib/api';
import { GI } from './GI';
import { EFF_GI, ULT_GI } from '../screens/Arena';
import { GIName } from '../game/icons';

const PLUR: Record<string, string> = { M: 'mammifères', O: 'oiseaux', R: 'reptiles', A: 'amphibiens', P: 'poissons', I: 'insectes', K: 'arachnides', X: 'invertébrés' };
const MAXS = { pv: 260, att: 70, def: 60, vit: 40 };
const AX: { k: keyof typeof MAXS; n: string; ic: GIName }[] = [{ k: 'pv', n: 'PV', ic: 'pv' }, { k: 'att', n: 'Attaque', ic: 'att' }, { k: 'vit', n: 'Vitesse', ic: 'vitStat' }, { k: 'def', n: 'Défense', ic: 'def' }];

export function RpgPanel({ s, c }: { s: Species; c: Card | null }) {
  const rang = c?.lvl || 1, p = progression(c?.xp || 0, rang);
  const now = statsAt(s, rang, p.niv), top = statsAt(s, rang, p.max);
  const ab = abilities(s, 7, 40), mine = abilities(s, rang, p.niv).length;
  const r = 34, C = 2 * Math.PI * r;
  const pt = (t: typeof now, i: number) => { const a = (i / 4) * Math.PI * 2 - Math.PI / 2, v = Math.min(1, t[AX[i].k] / MAXS[AX[i].k]) * 0.9 + 0.1; return `${50 + Math.cos(a) * 42 * v},${50 + Math.sin(a) * 42 * v}` };
  const poly = (t: typeof now) => AX.map((_, i) => pt(t, i)).join(' ');
  const proies = (s.arch === 'p' || s.arch === 'o') ? (PREY[s.classe] || []) : [];
  const u = ULTIMES[s.classe as Classe];
  return (
    <div className="rpg">
      <div className="rpg-top">
        <svg className="ring" viewBox="0 0 80 80" aria-label={`Niveau ${p.niv}`}>
          <circle cx="40" cy="40" r={r} className="ring-bg" /><circle cx="40" cy="40" r={r} className="ring-fg" strokeDasharray={`${(C * p.pct) / 100} ${C}`} transform="rotate(-90 40 40)" />
          <text x="40" y="36" className="ring-s">NIV.</text><text x="40" y="54" className="ring-n">{p.niv}</text>
        </svg>
        <div className="rpg-id">
          <span className="rg-st" title={`Rang ${rang}`}>{etoiles(rang)}<small>{'★'.repeat(7 - rang)}</small></span>
          <b>{p.plafond ? `Niveau max du rang (${p.max})` : `${p.xp - p.debut} / ${p.fin - p.debut} XP`}</b>
          <div className="xpbar"><i style={{ width: `${p.pct}%` }} /></div>
          <small className="note">{p.plafond ? (rang < 7 ? 'Fusionne deux exemplaires de ce rang pour monter le plafond.' : 'Rang maximum atteint !') : `Niveau max ${p.max} à ce rang · gagne de l'XP en combattant`}</small>
        </div>
        <span className="powr big" title="Force"><GI n="att" />{puissance(s, rang, p.niv)}</span>
      </div>
      <div className="rpg-mid">
        <svg className="radar" viewBox="0 0 100 100" aria-hidden="true">
          {[0.33, 0.66, 1].map(k => <polygon key={k} points={AX.map((_, i) => { const a = (i / 4) * Math.PI * 2 - Math.PI / 2; return `${50 + Math.cos(a) * 42 * k},${50 + Math.sin(a) * 42 * k}` }).join(' ')} className="grid-r" />)}
          <polygon points={poly(top)} className="r-top" /><polygon points={poly(now)} className="r-now" />
        </svg>
        <div className="rstats">{AX.map(a => <div key={a.k}><GI n={a.ic} /><span>{a.n}</span><b>{now[a.k]}</b>{top[a.k] > now[a.k] && <small>→ {top[a.k]}</small>}</div>)}
          <p className="note">{ARCH[s.arch].n} · {CLASS[s.classe]}{proies.length ? ` · chasse : ${proies.map(x => PLUR[x]).join(', ')}` : ''}</p></div>
      </div>
      <div className="skills">
        <div className={`skill ult ${p.niv >= NIV_INSTINCT || rang >= RANG_CAPA3 ? '' : 'lock'}`}><GI n={ULT_GI[s.classe]} className="sk-ic" /><span><b>Instinct : {u.nom}</b><small>{u.desc}</small></span><em>{p.niv >= NIV_INSTINCT || rang >= RANG_CAPA3 ? 'Ultime' : `Niv. ${NIV_INSTINCT}`}</em></div>
        {ab.map((a, i) => { const ok = i < mine, lab = i === 2 ? `Niv. ${NIV_CAPA3} ou ★${RANG_CAPA3}` : i === 3 ? `Niv. ${NIV_SPECIALE} ou ★${RANG_SPECIALE}` : '';
          return <div key={i} className={`skill ${ok ? '' : 'lock'}`}><GI n={EFF_GI[a.effet]} className="sk-ic" /><span><b>{a.nom}</b><small>{EFF[a.effet]}</small></span><em>{ok ? <span className="cost">{Array.from({ length: a.puissance }, (_, k) => <i key={k} className="on" />)}</span> : lab}</em></div> })}
      </div>
    </div>
  );
}
