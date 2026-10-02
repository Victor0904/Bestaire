import { useMemo, useState } from 'react';
import { ALL, BIOME, CLASS, FOREIGN, FRANCE, TIERS, Classe } from '../game/species';
import { bestCard, useGame } from '../lib/store';
import { normalize } from '../lib/fx';
import { Print } from '../components/ui';
import { Fiche } from './Fiche';

export function Dex() {
  const { bySpecies, cards } = useGame();
  const [filter, setFilter] = useState<string>('Toutes'); const [q, setQ] = useState(''); const [more, setMore] = useState(0);
  const [fiche, setFiche] = useState<string | null>(null);
  const owned = FRANCE.filter(s => bySpecies[s.id]).length, ownedX = FOREIGN.filter(s => bySpecies[s.id]).length;
  const keys = ['Toutes', ...Object.keys(CLASS), 'Monde'];
  const base = filter === 'Monde' ? FOREIGN : FRANCE.filter(s => filter === 'Toutes' || s.classe === filter);
  const nq = normalize(q.trim());
  const mine = useMemo(() => base.filter(s => bySpecies[s.id] && (!nq || normalize(s.nom + ' ' + s.sci).includes(nq))).sort((a, b) => b.tier - a.tier || a.nom.localeCompare(b.nom)), [base, bySpecies, nq]);
  const ghosts = nq ? [] : base.filter(s => !bySpecies[s.id]).sort((a, b) => a.tier - b.tier);
  const shown = ghosts.slice(0, 12 + more);
  return (
    <section className="view">
      <div className="row spread"><h2>Ton bestiaire</h2><span className="note">{owned}/{FRANCE.length}{ownedX ? ` · ${ownedX} du monde` : ''} · {cards.length} photos</span></div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${100 * owned / FRANCE.length}%` }} /></div>
      <label className="search"><input type="search" placeholder="Chercher dans ta collection…" value={q} onChange={e => setQ(e.target.value)} aria-label="Chercher" /></label>
      <div className="filters" role="toolbar">{keys.map(k => { const pool = k === 'Monde' ? FOREIGN : FRANCE.filter(s => k === 'Toutes' || s.classe === k);
        return <button key={k} aria-pressed={k === filter} onClick={() => { setFilter(k); setMore(0) }}>{k === 'Toutes' || k === 'Monde' ? k : CLASS[k as Classe]} {pool.filter(s => bySpecies[s.id]).length}/{pool.length}</button> })}</div>
      <div className="grid">
        {mine.map(s => { const c = bySpecies[s.id]; const b = bestCard(c); return <button key={s.id} className="cell" onClick={() => setFiche(s.id)}><Print s={s} q={b.q} lvl={b.lvl} phase={b.phase} foot={<span className="copies">×{c.length}</span>} /></button> })}
        {!mine.length && !nq && <div className="panel" style={{ gridColumn: '1/-1' }}><b>{filter === 'Monde' ? "Aucune espèce étrangère pour l'instant" : "Rien ici pour l'instant"}</b><p className="note">{filter === 'Monde' ? "Les animaux d'autres pays s'achètent au marché." : 'Pars en safari pour remplir ton bestiaire.'}</p></div>}
        {shown.map(s => <div key={s.id} className="ghost-card"><span className={`rbadge t${s.tier}`} style={{ alignSelf: 'flex-start' }}>{TIERS[s.tier]}</span><b>???</b><span className="note">{CLASS[s.classe]} · {s.pays || s.biomes.map(b => BIOME[b].n).join(', ')}</span></div>)}
        {ghosts.length > shown.length && <button className="btn ghost" style={{ gridColumn: '1/-1' }} onClick={() => setMore(more + 48)}>Voir plus d'espèces à découvrir ({ghosts.length - shown.length})</button>}
      </div>
      {fiche && <Fiche id={fiche} onClose={() => setFiche(null)} />}
    </section>
  );
}
export { ALL };
