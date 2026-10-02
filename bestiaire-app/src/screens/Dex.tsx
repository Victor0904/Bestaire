import { useEffect, useMemo, useState } from 'react';
import { ACT, ALL, BYID, BIOME, BIOMES, Biome, CLASS, Classe, FOREIGN, FRANCE, MOIS, QUAL, Species, TIERS, Act, cote, photoStyle, qIndex, seasonText } from '../game/species';
import { bestCard, useGame } from '../lib/store';
import { normalize } from '../lib/fx';
import { Print, Sheet } from '../components/ui';
import { Fiche } from './Fiche';
import type { Card } from '../lib/api';

type Show = 'mine' | 'missing' | 'all';
type Sort = 'rarete' | 'nom' | 'niveau' | 'recent' | 'cote' | 'copies';
type ViewMode = 'grille' | 'liste';
interface F { classes: Classe[]; tiers: number[]; biomes: Biome[]; acts: Act[]; month: boolean; now: boolean; fusion: boolean; world: boolean; minQ: number }
const EMPTY: F = { classes: [], tiers: [], biomes: [], acts: [], month: false, now: false, fusion: false, world: false, minQ: 0 };
const SORTS: Record<Sort, string> = { rarete: 'Rareté', nom: 'Nom A→Z', niveau: 'Niveau', recent: 'Récentes', cote: 'Cote', copies: 'Exemplaires' };
const ACT_ICON: Record<Act, string> = { D: '☀', N: '☾', C: '✦' };
const store = { get: (k: string) => { try { return localStorage.getItem('dex.' + k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem('dex.' + k, v) } catch { /* stockage indisponible */ } } };
/** L'espèce est-elle dans sa période d'activité maximale à cette heure ? */
const activeNow = (s: Species, ph: string) => (s.act === 'D' && ph === 'jour') || (s.act === 'N' && ph === 'nuit') || (s.act === 'C' && (ph === 'aube' || ph === 'crépuscule'));
const inMonth = (s: Species, m: number) => !s.months || s.months.includes(m);
const toggle = <T,>(a: T[], x: T) => (a.includes(x) ? a.filter(y => y !== x) : [...a, x]);
const fusable = (c: Card[]) => { const n: Record<number, number> = {}; for (const x of c) n[x.lvl] = (n[x.lvl] || 0) + 1; return Object.entries(n).some(([l, k]) => k >= 2 && +l < 7) };

export function Dex() {
  const { bySpecies, cards, state } = useGame();
  const [show, setShow] = useState<Show>((store.get('show') as Show) || 'mine');
  const [sort, setSort] = useState<Sort>((store.get('sort') as Sort) || 'rarete');
  const [mode, setMode] = useState<ViewMode>((store.get('mode') as ViewMode) || 'grille');
  const [f, setF] = useState<F>(EMPTY); const [panel, setPanel] = useState(false);
  const [q, setQ] = useState(''); const [limit, setLimit] = useState(60);
  const [fiche, setFiche] = useState<string | null>(null);
  useEffect(() => { store.set('show', show); store.set('sort', sort); store.set('mode', mode) }, [show, sort, mode]);
  useEffect(() => setLimit(60), [show, sort, f, q]);
  const month = state?.month || new Date().getMonth() + 1, ph = state?.phase || 'jour';

  const stats = useMemo(() => {
    const owned = FRANCE.filter(s => bySpecies[s.id]);
    const tiers = [0, 1, 2, 3, 4].map(t => ({ t, have: owned.filter(s => s.tier === t).length, all: FRANCE.filter(s => s.tier === t).length }));
    const value = cards.filter(c => c.status === 'owned').reduce((a, c) => { const s = BYID[c.species_id]; return a + (s ? cote(s, c.lvl, c.q) : 0) }, 0);
    const fus = Object.values(bySpecies).filter(fusable).length;
    const maxLvl = Object.values(bySpecies).reduce((a, c) => Math.max(a, bestCard(c).lvl), 0);
    const visibleNow = FRANCE.filter(s => !bySpecies[s.id] && inMonth(s, month) && activeNow(s, ph)).length;
    return { owned: owned.length, world: FOREIGN.filter(s => bySpecies[s.id]).length, tiers, value, fus, maxLvl, visibleNow };
  }, [bySpecies, cards, month, ph]);

  const nq = normalize(q.trim());
  const list = useMemo(() => {
    const pool = f.world ? FOREIGN : FRANCE;
    const r = pool.filter(s => {
      const have = !!bySpecies[s.id];
      if (show === 'mine' && !have) return false; if (show === 'missing' && have) return false;
      if (nq && !(have ? normalize(s.nom + ' ' + s.sci) : normalize(CLASS[s.classe])).includes(nq)) return false;
      if (f.classes.length && !f.classes.includes(s.classe)) return false;
      if (f.tiers.length && !f.tiers.includes(s.tier)) return false;
      if (f.biomes.length && !s.biomes.some(b => f.biomes.includes(b))) return false;
      if (f.acts.length && !f.acts.includes(s.act)) return false;
      if (f.month && !inMonth(s, month)) return false;
      if (f.now && !(inMonth(s, month) && activeNow(s, ph))) return false;
      if (f.fusion && !(have && fusable(bySpecies[s.id]))) return false;
      if (f.minQ && !(have && qIndex(bestCard(bySpecies[s.id]).q) >= f.minQ)) return false;
      return true;
    });
    const best = (s: Species) => (bySpecies[s.id] ? bestCard(bySpecies[s.id]) : null);
    const recent = (s: Species) => (bySpecies[s.id] || []).reduce((a, c) => Math.max(a, c.created_at ? Date.parse(c.created_at) : c.id), 0);
    const val = (s: Species) => { const b = best(s); return b ? cote(s, b.lvl, b.q) : -1 };
    const cmp: Record<Sort, (a: Species, b: Species) => number> = {
      rarete: (a, b) => b.tier - a.tier || a.nom.localeCompare(b.nom),
      nom: (a, b) => a.nom.localeCompare(b.nom),
      niveau: (a, b) => (best(b)?.lvl || 0) - (best(a)?.lvl || 0) || b.tier - a.tier,
      recent: (a, b) => recent(b) - recent(a),
      cote: (a, b) => val(b) - val(a),
      copies: (a, b) => (bySpecies[b.id]?.length || 0) - (bySpecies[a.id]?.length || 0) || b.tier - a.tier,
    };
    // les espèces possédées d'abord, puis les fantômes (rareté croissante : les plus faciles à trouver en premier)
    return r.sort((a, b) => { const ha = !!bySpecies[a.id], hb = !!bySpecies[b.id]; if (ha !== hb) return ha ? -1 : 1; if (!ha) return a.tier - b.tier || (activeNow(b, ph) ? 1 : 0) - (activeNow(a, ph) ? 1 : 0); return cmp[sort](a, b) });
  }, [bySpecies, show, sort, f, nq, month, ph]);

  const nActive = f.classes.length + f.tiers.length + f.biomes.length + f.acts.length + +f.month + +f.now + +f.fusion + +f.world + +(f.minQ > 0);
  const chips: [string, () => void][] = [
    ...f.classes.map(c => [CLASS[c], () => setF({ ...f, classes: toggle(f.classes, c) })] as [string, () => void]),
    ...f.tiers.map(t => [TIERS[t], () => setF({ ...f, tiers: toggle(f.tiers, t) })] as [string, () => void]),
    ...f.biomes.map(b => [BIOME[b].n, () => setF({ ...f, biomes: toggle(f.biomes, b) })] as [string, () => void]),
    ...f.acts.map(a => [ACT[a], () => setF({ ...f, acts: toggle(f.acts, a) })] as [string, () => void]),
    ...(f.month ? [[`Visibles en ${MOIS[month - 1]}`, () => setF({ ...f, month: false })] as [string, () => void]] : []),
    ...(f.now ? [['Actives maintenant', () => setF({ ...f, now: false })] as [string, () => void]] : []),
    ...(f.fusion ? [['Fusion possible', () => setF({ ...f, fusion: false })] as [string, () => void]] : []),
    ...(f.world ? [['Monde', () => setF({ ...f, world: false })] as [string, () => void]] : []),
    ...(f.minQ ? [[`${QUAL[f.minQ]} ou mieux`, () => setF({ ...f, minQ: 0 })] as [string, () => void]] : []),
  ];
  const pct = Math.round((1000 * stats.owned) / FRANCE.length) / 10;
  const shown = list.slice(0, limit);

  return (
    <section className="view dex">
      <div className="dex-head">
        <Ring pct={stats.owned / FRANCE.length} />
        <div className="dh-b">
          <h2>Ton bestiaire</h2>
          <p className="note"><b>{stats.owned}</b> espèces sur {FRANCE.length} ({pct.toString().replace('.', ',')} %){stats.world ? ` · ${stats.world} du monde` : ''}</p>
          <div className="tierbars">{stats.tiers.map(x => <button key={x.t} className={`tb t${x.t} ${f.tiers.includes(x.t) ? 'on' : ''}`} onClick={() => setF({ ...f, tiers: toggle(f.tiers, x.t) })} title={`${TIERS[x.t]} : ${x.have}/${x.all}`}>
            <em><u style={{ width: `${(100 * x.have) / x.all}%` }} /></em><span>{x.have}</span></button>)}</div>
        </div>
      </div>
      <div className="dex-kpis">
        <span><b>{cards.filter(c => c.status === 'owned').length}</b>photos</span>
        <span><b>{stats.value.toLocaleString('fr-FR')}</b>plumes de cote</span>
        <button onClick={() => { setShow('mine'); setF({ ...EMPTY, fusion: true }) }} disabled={!stats.fus}><b>{stats.fus}</b>fusion{stats.fus > 1 ? 's' : ''} possible{stats.fus > 1 ? 's' : ''}</button>
        <button onClick={() => { setShow('missing'); setF({ ...EMPTY, now: true }) }}><b>{stats.visibleNow}</b>à trouver maintenant</button>
      </div>

      <label className="search"><input type="search" placeholder={show === 'missing' ? 'Chercher (classe : oiseau, insecte…)' : 'Chercher un nom, un nom latin…'} value={q} onChange={e => setQ(e.target.value)} aria-label="Chercher" /></label>
      <div className="dex-bar">
        <div className="seg" role="tablist" aria-label="Espèces affichées">
          {([['mine', 'Miennes'], ['missing', 'À découvrir'], ['all', 'Toutes']] as [Show, string][]).map(([k, n]) => <button key={k} role="tab" aria-selected={show === k} onClick={() => setShow(k)}>{n}</button>)}
        </div>
        <button className={`btn small ${nActive ? 'primary' : 'ghost'}`} onClick={() => setPanel(true)}>Filtres{nActive ? ` · ${nActive}` : ''}</button>
      </div>
      <div className="dex-bar">
        <label className="sortsel"><span>Trier</span><select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Trier par">{Object.entries(SORTS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <div className="seg small" role="group" aria-label="Affichage">
          <button aria-pressed={mode === 'grille'} onClick={() => setMode('grille')} title="Grille" aria-label="Grille">▦</button>
          <button aria-pressed={mode === 'liste'} onClick={() => setMode('liste')} title="Liste" aria-label="Liste">☰</button>
        </div>
      </div>
      <div className="filters classbar" role="toolbar" aria-label="Classes">
        {(Object.keys(CLASS) as Classe[]).map(k => { const pool = FRANCE.filter(s => s.classe === k); const have = pool.filter(s => bySpecies[s.id]).length;
          return <button key={k} aria-pressed={f.classes.includes(k)} onClick={() => setF({ ...f, classes: toggle(f.classes, k) })}>{CLASS[k]} <small>{have}/{pool.length}</small></button> })}
      </div>
      {chips.length > 0 && <div className="activechips">{chips.map(([n, fn]) => <button key={n} onClick={fn}>{n} ✕</button>)}<button className="clear" onClick={() => setF(EMPTY)}>Tout effacer</button></div>}
      <p className="note count">{list.length} espèce{list.length > 1 ? 's' : ''}</p>

      {mode === 'grille' ? <div className="grid">
        {shown.map(s => bySpecies[s.id] ? <OwnedCell key={s.id} s={s} c={bySpecies[s.id]} onOpen={() => setFiche(s.id)} />
          : <Ghost key={s.id} s={s} month={month} ph={ph} />)}
      </div> : <div className="dexlist">
        {shown.map(s => { const c = bySpecies[s.id]; const b = c && bestCard(c);
          return b ? <button key={s.id} className={`dl t${s.tier}`} onClick={() => setFiche(s.id)}>
            <span className="spr th" style={photoStyle(s) || undefined} />
            <span className="dl-b"><b>{s.nom}</b><i>{s.sci}</i><small><span className="tierdot">{TIERS[s.tier]}</span> · {QUAL[qIndex(b.q)]} · niv. {b.lvl}{c.length > 1 ? ` · ×${c.length}` : ''}{fusable(c) ? ' · fusion !' : ''}</small></span>
            <span className="dl-v">{cote(s, b.lvl, b.q)}<small>plumes</small></span></button>
            : <div key={s.id} className={`dl ghost t${s.tier}`}><span className="th q">?</span><span className="dl-b"><b>???</b><small><span className="tierdot">{TIERS[s.tier]}</span> · {CLASS[s.classe]} · {ACT_ICON[s.act]} {ACT[s.act]}</small><small>{s.biomes.map(x => BIOME[x].n).join(', ')} · {seasonText(s)}</small></span>{inMonth(s, month) && activeNow(s, ph) && <span className="nowdot" title="Active maintenant" />}</div> })}
      </div>}
      {!list.length && <div className="panel"><b>{show === 'mine' && !nActive && !nq ? "Rien ici pour l'instant" : 'Aucune espèce ne correspond'}</b><p className="note">{show === 'mine' && !nActive && !nq ? 'Pars en safari pour remplir ton bestiaire.' : 'Essaie de retirer un filtre.'}</p>{nActive > 0 && <button className="btn ghost small" onClick={() => setF(EMPTY)}>Effacer les filtres</button>}</div>}
      {list.length > shown.length && <button className="btn ghost" onClick={() => setLimit(limit + 90)}>Afficher plus ({list.length - shown.length})</button>}

      {panel && <Sheet onClose={() => setPanel(false)} label="Filtres">
        <div className="row spread"><h2>Filtres</h2><button className="btn ghost small" onClick={() => setF(EMPTY)}>Réinitialiser</button></div>
        <FGroup title="Rareté">{TIERS.map((t, i) => <button key={t} className={`fchip t${i}`} aria-pressed={f.tiers.includes(i)} onClick={() => setF({ ...f, tiers: toggle(f.tiers, i) })}>{t}</button>)}</FGroup>
        <FGroup title="Classe">{(Object.keys(CLASS) as Classe[]).map(k => <button key={k} className="fchip" aria-pressed={f.classes.includes(k)} onClick={() => setF({ ...f, classes: toggle(f.classes, k) })}>{CLASS[k]}</button>)}</FGroup>
        <FGroup title="Milieu">{BIOMES.map(b => <button key={b} className="fchip" aria-pressed={f.biomes.includes(b)} style={{ ['--bc' as string]: BIOME[b].c }} onClick={() => setF({ ...f, biomes: toggle(f.biomes, b) })}>{BIOME[b].n}</button>)}</FGroup>
        <FGroup title="Activité">{(['D', 'N', 'C'] as Act[]).map(a => <button key={a} className="fchip" aria-pressed={f.acts.includes(a)} onClick={() => setF({ ...f, acts: toggle(f.acts, a) })}>{ACT_ICON[a]} {ACT[a]}</button>)}</FGroup>
        <FGroup title="En ce moment">
          <button className="fchip" aria-pressed={f.month} onClick={() => setF({ ...f, month: !f.month })}>Visibles en {MOIS[month - 1]}</button>
          <button className="fchip" aria-pressed={f.now} onClick={() => setF({ ...f, now: !f.now })}>Actives maintenant ({ph})</button>
        </FGroup>
        <FGroup title="Ma collection">
          <button className="fchip" aria-pressed={f.fusion} onClick={() => setF({ ...f, fusion: !f.fusion })}>Fusion possible</button>
          {[1, 2, 3].map(i => <button key={i} className="fchip" aria-pressed={f.minQ === i} onClick={() => setF({ ...f, minQ: f.minQ === i ? 0 : i })}>{QUAL[i]} ou mieux</button>)}
          <button className="fchip" aria-pressed={f.world} onClick={() => setF({ ...f, world: !f.world })}>Espèces du monde</button>
        </FGroup>
        <button className="btn primary big" onClick={() => setPanel(false)}>Voir {list.length} espèce{list.length > 1 ? 's' : ''}</button>
      </Sheet>}
      {fiche && <Fiche id={fiche} onClose={() => setFiche(null)} />}
    </section>
  );
}

function OwnedCell({ s, c, onOpen }: { s: Species; c: Card[]; onOpen: () => void }) {
  const b = bestCard(c); const fu = fusable(c);
  return <button className="cell" onClick={onOpen}><Print s={s} q={b.q} lvl={b.lvl} phase={b.phase} foot={<span className="copies">{fu && <span className="fusedot" title="Fusion possible">⇪</span>}×{c.length}</span>} /></button>;
}

function Ghost({ s, month, ph }: { s: Species; month: number; ph: string }) {
  const now = inMonth(s, month) && activeNow(s, ph), season = inMonth(s, month);
  return (
    <div className={`ghost-card g2 t${s.tier} ${now ? 'now' : ''}`}>
      <div className="row spread" style={{ gap: 4 }}><span className="rbadge">{TIERS[s.tier]}</span><span className="gact" title={ACT[s.act]}>{ACT_ICON[s.act]}</span></div>
      <b>???</b>
      <span className="note">{CLASS[s.classe]}</span>
      <span className="gbio">{s.biomes.map(b => <i key={b} style={{ background: BIOME[b].c }} title={BIOME[b].n} />)}<small>{s.biomes.map(b => BIOME[b].n).join(' · ')}</small></span>
      <span className={`gseason ${season ? 'ok' : ''}`}>{now ? 'Active maintenant' : season ? 'Visible ce mois-ci' : `Visible ${seasonText(s)}`}</span>
    </div>
  );
}

function FGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="fgroup"><p className="eyebrow">{title}</p><div className="fchips">{children}</div></div>;
}

function Ring({ pct }: { pct: number }) {
  const r = 30, c = 2 * Math.PI * r;
  return <svg className="ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r={r} className="rb" /><circle cx="36" cy="36" r={r} className="rf" strokeDasharray={`${c * Math.max(pct, 0.004)} ${c}`} transform="rotate(-90 36 36)" /><text x="36" y="41" textAnchor="middle">{pct < 0.1 ? (Math.round(pct * 1000) / 10).toString().replace('.', ',') : Math.round(pct * 100)}%</text></svg>;
}
export { ALL };
