// Choix de l'équipe (3 animaux) : niveau, rang, force, profil de combat — présentation RPG.
import { useEffect, useMemo, useState } from 'react';
import { BYID, Species, photoRond } from '../game/species';
import { ARCH, Membre, puissance, statsAt } from '../game/combat';
import { etoiles, nivMax } from '../game/rpg';
import { Card } from '../lib/api';
import { bestCard, nivCarte, useGame } from '../lib/store';
import { Print } from './ui';
import { GI } from './GI';

const KEY = 'bestiaire.equipe';
export function equipeSauvee(): string[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
export function sauverEquipe(ids: string[]) { try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* indisponible */ } }

export interface Pris { s: Species; c: Card; niv: number; pw: number }
/** Les cartes réellement possédées pour une liste d'espèces */
export function useEquipe(team: string[]) {
  const { bySpecies } = useGame();
  return team.filter(id => bySpecies[id]?.length && BYID[id]).map(id => { const c = bestCard(bySpecies[id]), s = BYID[id], niv = nivCarte(c); return { s, c, niv, pw: puissance(s, c.lvl, niv) } as Pris });
}
/** Équipe sauvegardée, ou à défaut les 3 animaux les plus forts */
export function useEquipeInitiale(): [string[], (t: string[]) => void] {
  const { bySpecies } = useGame();
  const [team, setTeam] = useState<string[]>(equipeSauvee);
  useEffect(() => {
    if (team.some(id => bySpecies[id]?.length)) return;
    const best = Object.keys(bySpecies).filter(id => BYID[id] && bySpecies[id].length)
      .map(id => { const c = bestCard(bySpecies[id]); return { id, pw: puissance(BYID[id], c.lvl, nivCarte(c)) } }).sort((a, b) => b.pw - a.pw).slice(0, 3).map(x => x.id);
    if (best.length) setTeam(best);
  }, [bySpecies]); // eslint-disable-line react-hooks/exhaustive-deps
  return [team, setTeam];
}
export const enMembres = (l: Pris[]): Membre[] => l.map(x => ({ s: x.s, lvl: x.c.lvl, niv: x.niv }));

export function TeamPicker({ team, setTeam, compact }: { team: string[]; setTeam: (t: string[]) => void; compact?: boolean }) {
  const { bySpecies } = useGame();
  const [sort, setSort] = useState<'force' | 'niveau' | 'rarete'>('force');
  const [open, setOpen] = useState(!compact);
  const owned = useMemo(() => Object.keys(bySpecies).filter(id => BYID[id] && bySpecies[id].length).map(id => { const c = bestCard(bySpecies[id]), s = BYID[id], niv = nivCarte(c); return { s, c, niv, pw: puissance(s, c.lvl, niv) } })
    .sort((a, b) => sort === 'force' ? b.pw - a.pw : sort === 'niveau' ? b.niv - a.niv || b.pw - a.pw : b.s.tier - a.s.tier || b.pw - a.pw), [bySpecies, sort]);
  const chosen = useEquipe(team);
  const set = (t: string[]) => { setTeam(t); sauverEquipe(t) };
  const toggle = (id: string) => set(team.includes(id) ? team.filter(x => x !== id) : chosen.length < 3 ? [...team.filter(x => bySpecies[x]), id] : team);
  const force = chosen.reduce((a, x) => a + x.pw, 0);
  return (
    <div className="picker">
      <div className="row spread"><h3 className="ptitle"><GI n="equipe" /> Ton équipe <small>{chosen.length}/3</small></h3><span className="powr" title="Force totale"><GI n="att" />{force}</span></div>
      <div className="slots3">
        {[0, 1, 2].map(i => { const x = chosen[i];
          if (!x) return <button key={i} className="slot3 empty" onClick={() => setOpen(true)}><span>+</span><small>Ajouter</small></button>;
          const t = statsAt(x.s, x.c.lvl, x.niv);
          return <button key={i} className={`slot3 t${x.s.tier}`} onClick={() => toggle(x.s.id)} aria-label={`Retirer ${x.s.nom}`}>
            <span className="spr" style={photoRond(x.s) || undefined} />
            <span className="lv">Niv. {x.niv}</span>
            <b>{x.s.nom}</b>
            <small className="rg" title={`Rang ${x.c.lvl} : niveau max ${nivMax(x.c.lvl)}`}>{etoiles(x.c.lvl)}</small>
            <span className="mini"><span><GI n="pv" />{t.pv}</span><span><GI n="att" />{t.att}</span><span><GI n="def" />{t.def}</span><span><GI n="vitStat" />{t.vit}</span></span>
            <span className="x">×</span></button> })}
      </div>
      <div className="row spread wrap">
        <button className="btn ghost small" onClick={() => set(owned.slice(0, 3).map(x => x.s.id))}><GI n="xp" /> Équipe conseillée</button>
        {compact && <button className="btn ghost small" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Masquer mes animaux' : 'Changer'}</button>}
      </div>
      {open && <>
        <div className="filters small">{(['force', 'niveau', 'rarete'] as const).map(k => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{k === 'rarete' ? 'Rareté' : k === 'force' ? 'Force' : 'Niveau'}</button>)}</div>
        <div className="grid">{owned.map(({ s, c, niv, pw }) => <button key={s.id} className="cell pick" aria-pressed={team.includes(s.id)} onClick={() => toggle(s.id)}>
          <Print s={s} q={c.q} lvl={c.lvl} phase={c.phase} niv={niv} foot={<span className="copies"><GI n="att" />{pw} · {ARCH[s.arch].n}</span>} /></button>)}</div>
      </>}
    </div>
  );
}
