import { useState } from 'react';
import { ACT, BIOME, BYID, CLASS, FRAME, FRAMEN, MAXLVL, QUAL, cote, massText, qIndex, seasonText } from '../game/species';
import { ARCH, EFF, abilities, statsAt } from '../game/combat';
import { api, Card, FuseResult } from '../lib/api';
import { bestCard, useGame } from '../lib/store';
import { Print, Sheet } from '../components/ui';
import { FusionFX } from '../components/FusionFX';

export function Fiche({ id, onClose }: { id: string; onClose: () => void }) {
  const { bySpecies, refreshCards, refresh, run, toast, state, uid } = useGame();
  const s = BYID[id]; const c = bySpecies[id] || [];
  const [fx, setFx] = useState<FuseResult | null>(null);
  const [sell, setSell] = useState(false);
  if (fx) return <FusionFX s={s} r={fx} onClose={() => setFx(null)} />;
  if (sell && c.length) return <SellSheet id={id} onClose={() => setSell(false)} />;
  const best = c.length ? bestCard(c) : null; const lvl = best?.lvl || 1; const t = statsAt(s, lvl);
  const byLvl: Record<number, Card[]> = {}; c.forEach(x => (byLvl[x.lvl] ||= []).push(x));
  const counts = [0, 0, 0, 0]; c.forEach(x => counts[qIndex(x.q)]++);
  const wished = state?.wishes?.includes(id);
  const doFuse = async (l: number) => { const r = await run(api.fuse(id, l)); if (r) { setFx(r); refreshCards(); refresh() } };
  const toggleWish = async () => { const w = new Set(state?.wishes || []); wished ? w.delete(id) : w.add(id); await run(api.setProfile(uid, { wishes: [...w] })); refresh(); toast(wished ? 'Espèce retirée de ta liste' : 'Tu seras prévenu au marché') };
  return (
    <Sheet onClose={onClose} label={s.nom}>
      {best ? <Print s={s} q={best.q} lvl={best.lvl} phase={best.phase} /> : <Print s={s} q={50} lvl={1} />}
      <div className="facts"><dl>
        <dt>Classe</dt><dd>{CLASS[s.classe]}</dd>
        <dt>{s.pays ? 'Pays' : 'Milieux'}</dt><dd>{s.pays || s.biomes.map(b => BIOME[b].n).join(', ')}</dd>
        <dt>Activité</dt><dd>{ACT[s.act]}</dd>
        {!s.pays && <><dt>Présence</dt><dd>{seasonText(s)}</dd></>}
        {s.g > 0 && <><dt>Masse</dt><dd>environ {massText(s.g)}</dd></>}
        {s.uicn && <><dt>UICN</dt><dd style={{ color: 'var(--danger)' }}>{({ NT: 'quasi menacée', VU: 'vulnérable', EN: 'en danger', CR: 'en danger critique' } as Record<string, string>)[s.uicn]} ({s.uicn})</dd></>}
        <dt>Profil</dt><dd>{ARCH[s.arch].n}</dd>
        <dt>Photos</dt><dd>{c.length} exemplaire{c.length > 1 ? 's' : ''}</dd>
      </dl></div>
      <div className="stats">{(['pv', 'att', 'def', 'vit'] as const).map(k => <div key={k} className="stat"><span>{k.toUpperCase().replace('DEF', 'DÉF')}</span><b>{t[k]}</b></div>)}</div>
      <div className="abil">{abilities(s, lvl).map((a, i) => <div key={i}><b>{a.nom} <span className="cost">{a.puissance} énergie</span></b><small>{EFF[a.effet]}</small></div>)}</div>
      {c.length > 0 && <div className="panel fusion"><p className="eyebrow">Fusion</p>
        {Object.keys(byLvl).map(Number).sort((a, b) => a - b).map(l => <div key={l} className="row spread line"><span><b>Niveau {l}</b> · {byLvl[l].length} exemplaire{byLvl[l].length > 1 ? 's' : ''}{FRAME(l) ? ` · ${FRAMEN[FRAME(l)].toLowerCase()}` : ''}</span>
          {l < MAXLVL && byLvl[l].length >= 2 ? <button className="btn" onClick={() => doFuse(l)}>Fusionner 2 → niv. {l + 1}</button> : <span className="note">{l >= MAXLVL ? 'niveau max' : 'il en faut 2'}</span>}</div>)}
        <p className="note">Deux exemplaires du même niveau donnent un niveau de plus. La meilleure photo est gardée ; si les deux ont la même qualité, 25 % de chances qu'elle s'améliore (jamais « parfaite »).</p></div>}
      {c.length > 0 && <div className="qlist">{QUAL.map((q, i) => counts[i] ? <span key={q}>{q} ×{counts[i]}</span> : null)}</div>}
      {s.credit && <p className="credit">Photo : {s.credit} · <a href={s.src || '#'} target="_blank" rel="noopener">voir sur iNaturalist</a></p>}
      <div className="row">{c.length > 0 && <button className="btn ghost" onClick={() => setSell(true)}>Vendre</button>}<button className="btn ghost" onClick={toggleWish}>{wished ? 'Ne plus suivre' : 'Suivre au marché'}</button><button className="btn" onClick={onClose}>Fermer</button></div>
    </Sheet>
  );
}

const DURS: [number, string][] = [[10, '10 minutes'], [60, '1 heure'], [360, '6 heures'], [1440, '24 heures']];
function SellSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { bySpecies, refreshCards, refresh, run, toast } = useGame();
  const s = BYID[id]; const opts = [...(bySpecies[id] || [])].sort((a, b) => b.lvl - a.lvl || b.q - a.q);
  const [sel, setSel] = useState(0); const x = opts[Math.min(sel, opts.length - 1)]; const ref = x ? cote(s, x.lvl, x.q) : 0;
  const [start, setStart] = useState(String(ref)); const [now, setNow] = useState(''); const [dur, setDur] = useState(60);
  if (!x) { onClose(); return null }
  const quick = async () => { const p = await run(api.quickSell(x.id)); if (p !== undefined) { toast(`Vendu ${p} plumes`); refreshCards(); refresh(); onClose() } };
  const auction = async () => {
    const st = Math.max(1, Math.floor(+start || ref)), bn = Math.floor(+now || 0) || null;
    const r = await run(api.listAuction(x.id, st, bn, dur)); if (r) { toast('Mis aux enchères'); refreshCards(); onClose() }
  };
  return (
    <Sheet onClose={onClose} label={`Vendre ${s.nom}`}>
      <h2>Vendre : {s.nom}</h2>
      <div className="filters">{opts.map((y, i) => <button key={y.id} aria-pressed={i === sel} onClick={() => { setSel(i); setStart(String(cote(s, y.lvl, y.q))) }}>Niv. {y.lvl} · {QUAL[qIndex(y.q)]}</button>)}</div>
      <p className="note">Cote {ref} plumes</p>
      <div className="panel"><p className="eyebrow">Mettre aux enchères</p>
        <label className="field">Mise de départ<input type="number" min={1} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="field">Achat immédiat (facultatif)<input type="number" min={0} placeholder="aucun" value={now} onChange={e => setNow(e.target.value)} /></label>
        <label className="field">Durée<select value={dur} onChange={e => setDur(+e.target.value)}>{DURS.map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select></label>
        <button className="btn primary" onClick={auction}>Mettre en vente</button></div>
      <div className="panel"><p className="eyebrow">Vente rapide</p><p className="note">Un collectionneur rachète tout de suite à 60 % de la cote.</p><button className="btn" onClick={quick}>Vendre {Math.round(ref * .6)} plumes</button></div>
      <button className="btn ghost" onClick={onClose}>Fermer</button>
    </Sheet>
  );
}
