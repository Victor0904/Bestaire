// Onglet TEST — mode Compagnon : une box, un animal célèbre à élever, nourrir, entraîner et faire combattre.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BYID, photoRond } from '../game/species';
import { Battle as B, mkFighter, newBattle } from '../game/combat';
import { CHAPITRES, ETAPES_PAR_CHAPITRE, NB_ETAPES, etape, nomEtape } from '../game/adventure';
import {
  ALIMENTS, Aliment, COMPETENCES, COMP, Compagnon as C, MAX_ACTIVES, MAX_ADVERSAIRES, STARS, TRAITS, Star,
  adequation, adversaires, apprendre, changer, diffOuverte, gainsEtape, DIFFS, equiper, jouer, jour, membre, niveauC, nourrir, nouveau, peutChanger, points, star, vieillir, xpNiv, XP_REPAS,
} from '../game/compagnon';
import { api, CompagnonRow } from '../lib/api';
import { useGame } from '../lib/store';
import { sfx } from '../lib/sfx';
import { buzz, confetti } from '../lib/fx';
import { GI } from '../components/GI';
import { Arena, BIOME_GI, Fin } from './Arena';
import { Absence, bonusConnexion, mission, missionsDuJour, MISSIONS, peutRenaitre, puissanceC, renaitre, retour } from '../game/idle';
import { AbsenceModal, Coffres, Heritage, Missions, Recolte, Territoire } from './CompagnonIdle';

const KEY = (uid: string) => `bestiaire.compagnon.${uid}`;
const REGIME: Record<string, string> = { carnivore: 'Carnivore', herbivore: 'Herbivore', omnivore: 'Omnivore', piscivore: 'Mange du poisson' };

/** Anciennes sauvegardes : on ajoute le camp d'entraînement (sans compter le temps passé avant) */
const norm = (c: C): C => ({ ...c, camp: c.camp || { xp: 0, ecus: 0, stock: 0 }, recolte: c.recolte ?? c.maj });

/** Chargement / sauvegarde : téléphone d'abord, puis copie en ligne (pour les autres appareils et l'arène) */
function useCompagnon() {
  const { uid } = useGame();
  const [c, setC] = useState<C | null | undefined>(undefined);
  const [enLigne, setEnLigne] = useState<boolean | null>(null);
  const [absence, setAbsence] = useState<Absence | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const charger = (x: C) => { const r = retour(vieillir(norm(x))); if (r.absence) setAbsence(r.absence); return r.c };
  useEffect(() => {
    let loc: C | null = null; try { loc = JSON.parse(localStorage.getItem(KEY(uid)) || 'null') } catch { /* rien */ }
    setC(loc ? charger(loc) : null);
    api.compagnonMien(uid).then(r => { setEnLigne(true); const d = r?.data as C | undefined; if (d && (!loc || d.maj > loc.maj)) setC(charger(d)) }).catch(() => setEnLigne(false));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useCallback((n0: C | null) => {
    const n = n0 ? { ...n0, vu: Date.now() } : n0;
    setC(n); if (!n) return;
    try { localStorage.setItem(KEY(uid), JSON.stringify(n)) } catch { /* rien */ }
    clearTimeout(t.current);
    t.current = setTimeout(() => { api.compagnonSave(n.espece, n.surnom, niveauC(n.xp), n).then(() => setEnLigne(true)).catch(() => setEnLigne(false)) }, 1200);
  }, [uid]);
  // le temps passe aussi quand l'écran reste ouvert
  useEffect(() => { const i = setInterval(() => setC(x => (x ? vieillir(x) : x)), 60000); return () => clearInterval(i) }, []);
  return { c, save, enLigne, absence, setAbsence };
}

type Vue = 'maison' | 'manger' | 'competences' | 'aventure' | 'arene' | 'changer' | 'coffres' | 'missions' | 'heritage' | 'renaitre';

export function Compagnon() {
  const { toast } = useGame();
  const { c, save, enLigne, absence, setAbsence } = useCompagnon();
  const [vue, setVue] = useState<Vue>('maison');
  const [combat, setCombat] = useState<{ b: B; id: number; onFin: (b: B) => Promise<Fin> } | null>(null);
  if (c === undefined) return <p className="note loading">Chargement…</p>;
  if (!c) return <BoxScreen titre="Ta première box" sous="Un animal célèbre t'attend à l'intérieur. Tu vas l'élever, le nourrir et le faire combattre." choix={1} onPick={(st, nom) => { save(nouveau(st.id, nom)); toast(`${nom} rejoint ta famille !`) }} />;

  if (combat) return <Arena key={combat.id} b={combat.b} titre={c.surnom} onFin={combat.onFin} onQuit={() => { setCombat(null) }} />;
  const lancer = (b: B, onFin: (b: B) => Promise<Fin>) => { setCombat({ b, id: Date.now(), onFin }); window.scrollTo({ top: 0, behavior: 'smooth' }) };

  return (
    <section className="view cmp">
      <div className="test-band"><GI n="xp" /> Mode test · Compagnon {enLigne === false && <small>(sauvegarde sur ce téléphone seulement)</small>}</div>
      {vue !== 'maison' && <button className="btn ghost small back" onClick={() => setVue('maison')}>← {c.surnom}</button>}
      {vue === 'maison' && <Maison c={c} save={save} go={setVue} />}
      {vue === 'manger' && <Manger c={c} save={save} />}
      {vue === 'competences' && <Competences c={c} save={save} />}
      {vue === 'aventure' && <AventureC c={c} save={save} lancer={lancer} />}
      {vue === 'arene' && <AreneC c={c} save={save} lancer={lancer} enLigne={enLigne} />}
      {vue === 'coffres' && <Coffres c={c} save={save} />}
      {vue === 'missions' && <Missions c={c} save={save} />}
      {vue === 'heritage' && <Heritage c={c} save={save} renaitre={() => setVue('renaitre')} />}
      {vue === 'renaitre' && <BoxScreen titre="Renaissance" sous={`${c.surnom} transmet son héritage. Choisis l'animal qui repart de zéro… plus fort que jamais.`} choix={3} exclure={c.espece}
        onPick={(st, nom) => { save(renaitre(c, st.id, nom)); setVue('heritage'); toast(`${nom} renaît avec l'héritage de ses ancêtres !`) }} />}
      {absence && vue === 'maison' && <AbsenceModal c={c} a={absence} onClose={() => setAbsence(null)} />}
      {vue === 'changer' && <BoxScreen titre="Nouvelle box" sous={`Choisis ton nouvel animal. ${c.surnom} part en retraite : tu gardes ton niveau, tes écus et ta progression, mais tes compétences et tes traits repartent de zéro.`} choix={3} exclure={c.espece}
        onPick={(st, nom) => { save(changer(c, st.id, nom)); setVue('maison'); toast(`${nom} prend la relève !`) }} />}
    </section>
  );
}

// ---------------------------------------------------------------------
// Box : ouverture et révélation
// ---------------------------------------------------------------------
function BoxScreen({ titre, sous, choix, exclure, onPick }: { titre: string; sous: string; choix: number; exclure?: string; onPick: (s: Star, nom: string) => void }) {
  const [etat, setEtat] = useState<'ferme' | 'ouverture' | 'ouvert'>('ferme');
  const tirage = useMemo(() => [...STARS].filter(s => s.id !== exclure).sort(() => Math.random() - 0.5).slice(0, choix), [choix, exclure]);
  const [sel, setSel] = useState(0); const [nom, setNom] = useState('');
  const host = useRef<HTMLDivElement>(null);
  const ouvrir = () => { setEtat('ouverture'); sfx.buff(); buzz([30, 60, 30]); setTimeout(() => { setEtat('ouvert'); sfx.niveau(); confetti(host.current, ['#f0b54a', '#ffffff', '#8fbf7f'], 120, 0) }, 1400) };
  const st = tirage[sel], sp = BYID[st.id];
  return (
    <section className="view boxv" ref={host}>
      <h2>{titre}</h2><p className="note">{sous}</p>
      {etat !== 'ouvert' ? <button className={`box ${etat}`} onClick={ouvrir} disabled={etat !== 'ferme'} aria-label="Ouvrir la box">
        <span className="box-glow" /><span className="box-lid"><i /></span><span className="box-body"><i /></span><span className="box-q">?</span>
        <b className="box-tap">{etat === 'ferme' ? 'Touche pour ouvrir' : 'Ouverture…'}</b>
      </button> : <div className="reveal-c">
        <div className="rv-rays2" />
        {choix > 1 && <div className="choix">{tirage.map((t, i) => <button key={t.id} aria-pressed={i === sel} onClick={() => { setSel(i); sfx.tap() }}><span className="spr" style={photoRond(BYID[t.id]) || undefined} /><small>{t.nom}</small></button>)}</div>}
        <div className="rc-portrait" key={st.id}><span className="spr" style={photoRond(sp) || undefined} /></div>
        <h3>{st.nom}</h3>
        <p className="note"><i>{sp.sci}</i> · {REGIME[st.regime]}{st.fav ? ` · adore : ${ALIMENTS[st.fav as Aliment]?.nom.toLowerCase()}` : ''}</p>
        <label className="field">Donne-lui un surnom<input value={nom} maxLength={20} placeholder={st.nom} onChange={e => setNom(e.target.value)} /></label>
        <button className="btn primary big" onClick={() => onPick(st, (nom.trim() || st.nom).slice(0, 20))}>Adopter {nom.trim() || st.nom}</button>
      </div>}
    </section>
  );
}

// ---------------------------------------------------------------------
// Maison : l'animal, ses jauges, ses actions
// ---------------------------------------------------------------------
function Maison({ c, save, go }: { c: C; save: (c: C) => void; go: (v: Vue) => void }) {
  const { toast } = useGame();
  const st = star(c.espece), sp = BYID[c.espece], niv = niveauC(c.xp), deb = xpNiv(niv), fin = xpNiv(niv + 1);
  const m = membre(c), f = mkFighter(m.s, 1, 'P', m.niv, false, 1, m.abil, m.mods);
  const humeur = c.faim < 25 ? ['faim', 'A faim !'] : c.bonheur < 30 ? ['triste', "S'ennuie"] : c.bonheur > 70 ? ['joie', 'Heureux'] : ['ok', 'Tranquille'];
  const pts = points(c), bonus = c.bonusJour !== jour(), jeuOk = Date.now() - c.jeuA >= 30 * 60000;
  const [anim, setAnim] = useState('');
  const play = () => { const n = jouer(c); if (!n) return toast('Il se repose, réessaie dans un moment.'); save(n); setAnim('saut'); sfx.soin(); setTimeout(() => setAnim(''), 900) };
  return (
    <>
      <div className={`pet b-${sp.biomes[0] || 'P'}`}>
        <div className={`pet-portrait ${humeur[0]} ${anim}`}><span className="spr" style={photoRond(sp) || undefined} /><span className="mood">{humeur[1]}</span></div>
        <div className="pet-id">
          <h2>{c.surnom}</h2><p className="note">{st.nom} · {REGIME[st.regime]}</p>
          <div className="lvl-line"><b>Niv. {niv}</b><div className="xpbar"><i style={{ width: `${niv >= 50 ? 100 : Math.round((100 * (c.xp - deb)) / (fin - deb))}%` }} /></div><small>{niv >= 50 ? 'max' : `${c.xp - deb}/${fin - deb} XP`}</small></div>
          <span className="ecus"><GI n="coffre" /> {c.ecus} écus</span>
        </div>
      </div>
      <div className="gauges">
        <Gauge ic="🍖" nom="Faim" v={c.faim} warn={c.faim < 25 ? 'Affamé : −20 % en combat' : ''} />
        <Gauge ic="💛" nom="Bonheur" v={c.bonheur} warn={c.bonheur > 70 ? 'Heureux : +5 % en combat' : ''} />
      </div>
      {bonus && <button className="btn primary daily" onClick={() => { const r = bonusConnexion(c); if (r) { save(r.c); sfx.etoile(2); toast(`+${r.gain} écus · série de ${r.serie} jour${r.serie > 1 ? 's' : ''}`) } }}><GI n="coffreOuvert" /> Bonus du jour (série {(c.serie?.n || 0) + 1})</button>}
      <Territoire c={c} save={save} />
      <Recolte c={c} save={save} />
      <div className="pet-actions">
        <button onClick={() => go('manger')}><span className="em">🍽️</span><b>Nourrir</b><small>{c.faim < 50 ? 'Il a faim' : 'Repas adapté = plus d’XP'}</small></button>
        <button onClick={play} disabled={!jeuOk}><span className="em">🎾</span><b>Jouer</b><small>{jeuOk ? '+25 bonheur' : 'Il se repose'}</small></button>
        <button onClick={() => go('coffres')}><span className="em">🎁</span><b>Coffres</b><small>{c.coffres || 0} à ouvrir · équipement</small>{(c.coffres || 0) > 0 && <i className="bdot" />}</button>
        <button onClick={() => go('missions')}><span className="em">📜</span><b>Missions</b><small>{missionsDuJour(c).pris.length}/{Object.keys(MISSIONS).length} du jour</small>{missionPrete(c) && <i className="bdot" />}</button>
        <button onClick={() => go('competences')}><GI n="niveau" className="ic" /><b>Compétences</b><small>{pts > 0 ? `${pts} point${pts > 1 ? 's' : ''} à dépenser` : `${c.actives.length}/${MAX_ACTIVES} équipées`}</small>{pts > 0 && <i className="bdot" />}</button>
        <button onClick={() => go('aventure')}><GI n="aventure" className="ic" /><b>Aventure</b><small>{Object.keys(c.aventure).length}/{NB_ETAPES} étapes</small></button>
        <button onClick={() => go('arene')}><GI n="arene" className="ic" /><b>Arène</b><small>{c.rating} pts · {c.victoires} V / {c.defaites} D</small></button>
        <button onClick={() => go('heritage')}><span className="em">✨</span><b>Héritage</b><small>{peutRenaitre(c) ? 'Renaissance possible !' : `${c.heritage?.points || 0} point${(c.heritage?.points || 0) > 1 ? 's' : ''}`}</small>{peutRenaitre(c) && <i className="bdot" />}</button>
        <button onClick={() => go('changer')} disabled={!peutChanger(c)}><GI n="auto" className="ic" /><b>Changer d'animal</b><small>{peutChanger(c) ? 'Disponible !' : `Au niveau ${c.dernierChangement + 10}`}</small></button>
      </div>
      <div className="panel">
        <p className="eyebrow">En combat · puissance {puissanceC(c).toLocaleString('fr-FR')}</p>
        <div className="cstats"><span><GI n="pv" />{f.maxHp}<small>PV</small></span><span><GI n="att" />{f.att}<small>Attaque</small></span><span><GI n="def" />{f.def}<small>Défense</small></span><span><GI n="vitStat" />{f.vit}<small>Vitesse</small></span></div>
        <p className="note">Compétences : {c.actives.map(id => COMP[id]?.nom).join(', ')}</p>
        {c.traits.length > 0 && <div className="traits">{c.traits.map(id => { const t = TRAITS.find(x => x.id === id)!; return <span key={id} className="trait"><b>{t.nom}</b>{t.desc}</span> })}</div>}
      </div>
      <details className="panel rules"><summary>Comment ça marche ?</summary>
        <p><b>Nourriture.</b> Chaque repas coûte des écus. Le repas adapté au régime de ton animal donne le plus d'expérience ({XP_REPAS.ideal} XP), un repas inadapté très peu ({XP_REPAS.inadapte} XP)… mais à force, ton animal se transforme et gagne un <b>trait</b> avec une compétence spéciale (un lion nourri d'herbe devient « Brouteur »).</p>
        <p><b>Faim et bonheur.</b> Ils baissent avec le temps, même quand tu n'es pas là. Affamé, ton animal perd 20 % de sa force ; heureux, il gagne 5 %.</p>
        <p><b>Territoire.</b> Toutes les 2 minutes, même appli fermée, ton animal affronte le gardien du palier suivant. Plus il est puissant (niveau, équipement, héritage), plus il monte haut — et plus le camp rapporte.</p>
        <p><b>Camp.</b> XP, écus et coffres s'accumulent selon ton palier, dans la limite du stockage : reviens récolter. Boost ×2 trois fois par jour.</p>
        <p><b>Coffres.</b> Ils contiennent de l'équipement (crocs, pelage, cuirasse, amulette) de 5 raretés. « Tout ouvrir » garde automatiquement les meilleurs objets.</p>
        <p><b>Renaissance.</b> Dès le palier 25, recommence avec un nouvel animal contre des points d'héritage permanents.</p>
        <p><b>Écus.</b> Camp, aventure, arène, missions, bonus du jour.</p>
        <p><b>Compétences.</b> 1 point par niveau. 4 compétences actives au maximum, plus des passifs.</p>
        <p><b>Changer d'animal.</b> Tous les 10 niveaux, une nouvelle box : tu gardes ton niveau, tes compétences repartent de zéro.</p>
      </details>
    </>
  );
}
const missionPrete = (c: C) => { const m = missionsDuJour(c); return (Object.keys(MISSIONS) as (keyof typeof MISSIONS)[]).some(id => !m.pris.includes(id) && (m.c[id] || 0) >= MISSIONS[id].but) };
function Gauge({ ic, nom, v, warn }: { ic: string; nom: string; v: number; warn: string }) {
  const p = Math.round(v);
  return <div className="gauge"><span className="gi-em">{ic}</span><div><div className="row spread"><b>{nom}</b><small>{p} %</small></div><div className={`gbar ${p < 25 ? 'low' : p < 55 ? 'mid' : ''}`}><i style={{ width: `${p}%` }} /></div>{warn && <small className="note">{warn}</small>}</div></div>;
}

// ---------------------------------------------------------------------
// Nourrir
// ---------------------------------------------------------------------
function Manger({ c, save }: { c: C; save: (c: C) => void }) {
  const { toast } = useGame(); const st = star(c.espece);
  const [miam, setMiam] = useState<{ ic: string; xp: number; k: number } | null>(null);
  const donner = (a: Aliment) => {
    const r = nourrir(c, a); if (r.refus) return toast(r.refus);
    save(r.adeq === 'ideal' ? mission(r.c, 'repas') : r.c); setMiam({ ic: ALIMENTS[a].ic, xp: r.xp, k: Date.now() }); sfx[r.adeq === 'inadapte' ? 'poison' : 'soin']();
    if (niveauC(r.c.xp) > niveauC(c.xp)) { setTimeout(() => sfx.niveau(), 400); toast(`Niveau ${niveauC(r.c.xp)} ! +1 point de compétence`) }
    if (r.trait) { setTimeout(() => sfx.ultime(), 300); toast(`Nouveau trait : ${r.trait.nom} !`) }
  };
  return (
    <div className="manger">
      <div className="mg-head"><div className="pet-portrait small"><span className="spr" style={photoRond(BYID[c.espece]) || undefined} />{miam && <span key={miam.k} className="miam">{miam.ic}<b>+{miam.xp} XP</b></span>}</div>
        <div><h2>Nourrir {c.surnom}</h2><p className="note">{REGIME[st.regime]} · faim {Math.round(c.faim)} % · <b>{c.ecus} écus</b></p></div></div>
      <div className="foods">{(Object.keys(ALIMENTS) as Aliment[]).map(a => { const al = ALIMENTS[a], q = adequation(st, a);
        return <button key={a} className={`food ${q}`} disabled={c.ecus < al.prix || c.faim >= 95} onClick={() => donner(a)}>
          <span className="em">{al.ic}</span><span className="fb"><b>{al.nom}</b><small>{q === 'ideal' ? `Idéal · +${Math.round(XP_REPAS.ideal * (a === 'festin' ? 2.5 : 1))} XP` : q === 'correct' ? `Correct · +${XP_REPAS.correct} XP` : `Inadapté · +${XP_REPAS.inadapte} XP · peut le transformer`}</small><small>+{al.faim} faim</small></span>
          <span className="prix">{al.prix}<small>écus</small></span></button> })}</div>
      <div className="panel"><p className="eyebrow">Transformations possibles</p>
        {TRAITS.map(t => { const n = Object.entries(c.repas).filter(([k]) => t.quand(st, k as Aliment)).reduce((s, [, v]) => s + v, 0), ok = c.traits.includes(t.id), possible = (Object.keys(ALIMENTS) as Aliment[]).some(a => t.quand(st, a));
          if (!possible) return null;
          return <div key={t.id} className={`trait-l ${ok ? 'ok' : ''}`}><b>{t.nom}</b><small>{t.desc}</small><div className="gbar"><i style={{ width: `${Math.min(100, (100 * n) / t.seuil)}%` }} /></div><small>{ok ? 'Obtenu !' : `${n}/${t.seuil} repas`}</small></div> })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Compétences
// ---------------------------------------------------------------------
function Competences({ c, save }: { c: C; save: (c: C) => void }) {
  const { toast } = useGame(); const niv = niveauC(c.xp), pts = points(c);
  const visibles = COMPETENCES.filter(k => !k.trait || c.appris.includes(k.id));
  return (
    <div className="comp">
      <h2>Compétences</h2>
      <p className="note"><b>{pts}</b> point{pts > 1 ? 's' : ''} à dépenser · {c.actives.length}/{MAX_ACTIVES} compétences actives. Touche une compétence apprise pour l'équiper ou la retirer.</p>
      <div className="comp-list">{visibles.map(k => {
        const appris = c.appris.includes(k.id), active = c.actives.includes(k.id), dispo = niv >= k.niv;
        return <div key={k.id} className={`cpt ${appris ? 'appris' : ''} ${active ? 'active' : ''} ${!dispo ? 'lock' : ''}`}>
          <span className="cpt-b"><b>{k.nom}{k.trait && <em> · trait</em>}</b><small>{k.desc}{k.p ? ` · ${k.p} énergie` : ''}</small></span>
          {appris ? (k.effet ? <button className={`btn small ${active ? 'primary' : 'ghost'}`} onClick={() => { const n = equiper(c, k.id); if (n === c) toast(active ? 'Il faut garder au moins une compétence' : `${MAX_ACTIVES} compétences actives au maximum`); save(n) }}>{active ? 'Équipée' : 'Équiper'}</button> : <span className="tag good">Acquis</span>)
            : dispo ? <button className="btn small" disabled={pts <= 0} onClick={() => { const n = apprendre(c, k.id); if (n) { save(n); sfx.buff() } }}>Apprendre</button> : <span className="note">Niv. {k.niv}</span>}
        </div> })}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Aventure du compagnon (mêmes étapes que l'Aventure, 2 adversaires au plus)
// ---------------------------------------------------------------------
function AventureC({ c, save, lancer }: { c: C; save: (c: C) => void; lancer: (b: B, onFin: (b: B) => Promise<Fin>) => void }) {
  const prochaine = Math.min(NB_ETAPES - 1, Object.keys(c.aventure).length);
  const [sel, setSel] = useState<number>(prochaine);
  const [diff, setDiff] = useState(1);
  const e = etape(sel), d = diffOuverte(c, sel, diff) ? diff : 1, foes = adversaires(e.genre === 'boss' ? e.foes.slice(-MAX_ADVERSAIRES) : e.foes, d), g0 = gainsEtape(c, sel, d, true);
  // lance l'étape g en difficulté dd avec l'état cc (utilisé aussi par « Étape suivante » pour enchaîner directement)
  const jouerEtape = (g: number, dd: number, cc: C) => {
    const et = etape(g), fs = adversaires(et.genre === 'boss' ? et.foes.slice(-MAX_ADVERSAIRES) : et.foes, dd);
    const b = newBattle([membre(cc)], fs, et.biome, et.ph);
    b.log.push({ t: 'sys', m: `${et.chap.nom} · ${nomEtape(et)} · ${DIFFS[dd - 1].nom}` });
    setSel(g); setDiff(dd);
    lancer(b, async (bt) => {
      const r = gainsEtape(cc, g, dd, !!bt.won), avant = niveauC(cc.xp);
      const n: C = { ...cc, xp: cc.xp + r.xp, ecus: cc.ecus + r.ecus, faim: Math.max(0, cc.faim - 6), bonheur: Math.min(100, cc.bonheur + (bt.won ? 4 : -4)),
        aventure: bt.won ? { ...cc.aventure, [g]: Math.max(dd, cc.aventure[g] || 0) } : cc.aventure, victoires: cc.victoires + (bt.won ? 1 : 0), defaites: cc.defaites + (bt.won ? 0 : 1) };
      save(bt.won ? mission(n, 'victoire') : n);
      const apres = niveauC(n.xp);
      return { titre: bt.won ? (et.genre === 'boss' ? 'Boss vaincu !' : `Victoire · ${DIFFS[dd - 1].nom}`) : 'Défaite', etoiles: bt.won ? dd : undefined,
        lignes: [`+${r.xp} XP · +${r.ecus} écus${r.premiere ? ' (première victoire)' : ''}`, apres > avant ? `${cc.surnom} passe au niveau ${apres} ! +1 point de compétence` : `Niveau ${apres}`,
          ...(bt.won && dd < 3 ? [`La difficulté ${'★'.repeat(dd + 1)} ${DIFFS[dd].nom.toLowerCase()} est ouverte sur cette étape.`] : []), ...(cc.faim < 25 ? ['Il avait faim : nourris-le pour être plus fort.'] : [])],
        suite: bt.won && g + 1 < NB_ETAPES ? { label: 'Étape suivante', go: () => jouerEtape(g + 1, 1, n) } : { label: 'Réessayer', go: () => jouerEtape(g, dd, n) } };
    });
  };
  return (
    <div className="advc">
      <h2>Aventure de {c.surnom}</h2>
      {CHAPITRES.map((ch, ci) => { const g0 = ci * ETAPES_PAR_CHAPITRE; if (g0 > prochaine) return <div key={ch.n} className="chapc ferme"><GI n="cadenas" /> Chapitre {ch.n} · {ch.nom}</div>;
        return <div key={ch.n} className={`chapc b-${ch.biome}`}><div className="chapc-h"><GI n={BIOME_GI[ch.biome]} /> <b>{ch.nom}</b></div>
          <div className="stg">{Array.from({ length: ETAPES_PAR_CHAPITRE }, (_, k) => { const g = g0 + k, et = c.aventure[g] || 0, ok = g <= prochaine;
            return <button key={g} disabled={!ok} aria-pressed={g === sel} className={`${k === 9 ? 'boss' : k === 4 ? 'elite' : ''} ${et ? 'fait' : ''}`} onClick={() => { setSel(g); setDiff(Math.min(3, (c.aventure[g] || 0) + 1)) }}>
              {!ok ? <GI n="cadenas" /> : k === 9 ? <GI n="boss" /> : k === 4 ? <GI n="elite" /> : k + 1}{et > 0 && <small>{'★'.repeat(et)}</small>}</button> })}</div></div> })}
      <div className="panel prepc"><p className="eyebrow">{e.chap.nom} · {e.ph}</p><h3>{nomEtape(e)}</h3>
        <div className="diffs" role="radiogroup" aria-label="Difficulté">{DIFFS.map(D => { const ok = diffOuverte(c, sel, D.n), fait = (c.aventure[sel] || 0) >= D.n;
          return <button key={D.n} role="radio" aria-checked={d === D.n} disabled={!ok} className={`d${D.n} ${fait ? 'fait' : ''}`} onClick={() => setDiff(D.n)}>
            <span>{'★'.repeat(D.n)}</span><b>{D.nom}</b><small>{!ok ? <><GI n="cadenas" /> gagne {'★'.repeat(D.n - 1)}</> : fait ? 'Réussie' : `gains ×${D.gain.toLocaleString('fr-FR')}`}</small></button> })}</div>
        <div className="foes">{foes.map((f, i) => <div key={i} className={`foe t${f.s.tier} ${f.boss ? 'boss' : ''}`}><span className="spr" style={photoRond(f.s) || undefined} />{f.boss && <GI n="couronne" className="crown" />}<b>{f.s.nom}</b><small>Niv. {f.niv}</small></div>)}</div>
        <p className="note">Récompense : +{g0.xp} XP, +{g0.ecus} écus{g0.premiere ? ' (première victoire à cette difficulté)' : ''}.</p>
        <button className="btn primary big" onClick={() => jouerEtape(sel, d, c)}><GI n="combat" /> Combattre · {'★'.repeat(d)} {DIFFS[d - 1].nom}</button></div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Arène : les compagnons des autres joueurs
// ---------------------------------------------------------------------
function AreneC({ c, save, lancer, enLigne }: { c: C; save: (c: C) => void; lancer: (b: B, onFin: (b: B) => Promise<Fin>) => void; enLigne: boolean | null }) {
  const { uid, run } = useGame();
  const [liste, setListe] = useState<CompagnonRow[] | null>(null);
  useEffect(() => { api.compagnons().then(setListe).catch(() => setListe([])) }, []);
  if (enLigne === false) return <div className="panel"><h2>Arène</h2><p className="note">L'arène des compagnons a besoin de la mise à jour de la base (fichier 005). En attendant, entraîne-toi dans l'aventure !</p></div>;
  const autres = (liste || []).filter(r => r.owner !== uid && (r.data as C)?.espece && BYID[(r.data as C).espece]).sort((a, b) => Math.abs(a.niveau - niveauC(c.xp)) - Math.abs(b.niveau - niveauC(c.xp)));
  const defier = (r: CompagnonRow) => {
    const adv = membre(vieillir(r.data as C)); const bio = BYID[c.espece].biomes[0] || 'P';
    const b = newBattle([membre(c)], [adv], bio, 'jour'); b.pvp = r.owner;
    b.log.push({ t: 'sys', m: `Duel contre ${r.surnom} (${r.pseudo || 'joueur'})` });
    lancer(b, async (bt) => {
      const res = await run(api.compagnonDuel(r.owner, !!bt.won));
      const n: C = { ...c, rating: res?.rating ?? c.rating, xp: c.xp + (bt.won ? 25 : 8), ecus: c.ecus + (bt.won ? 15 : 3), faim: Math.max(0, c.faim - 6), victoires: c.victoires + (bt.won ? 1 : 0), defaites: c.defaites + (bt.won ? 0 : 1) };
      save(bt.won ? mission(n, 'victoire') : n);
      return { lignes: [`${res ? `${res.delta >= 0 ? '+' : ''}${res.delta} points · ` : ''}+${bt.won ? 25 : 8} XP · +${bt.won ? 15 : 3} écus`] };
    });
  };
  return (
    <div className="arenec">
      <h2>Arène des compagnons</h2><p className="note">Affronte les compagnons des autres joueurs (ils se battent tout seuls quand leur maître n'est pas là). {c.rating} points.</p>
      {liste === null ? <p className="note">Chargement…</p> : autres.length ? autres.slice(0, 20).map(r => { const d = r.data as C;
        return <div key={r.owner} className="opp-c"><span className="spr" style={photoRond(BYID[d.espece]) || undefined} /><span className="oc-b"><b>{r.surnom}</b><small>{star(d.espece)?.nom} · niv. {r.niveau} · {r.pseudo || 'joueur'} · {r.rating} pts</small></span><button className="btn primary small" onClick={() => defier(r)}>Défier</button></div> })
        : <p className="note">Aucun autre compagnon pour l'instant : invite un ami à essayer le mode test !</p>}
    </div>
  );
}
