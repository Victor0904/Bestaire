// Panneaux « idle » du mode Compagnon : territoire (chasse automatique), récolte, coffres, missions, héritage, retour d'absence.
import { useEffect, useRef, useState } from 'react';
import { BYID, photoRond } from '../game/species';
import { Compagnon as C, MissionId, Objet, Slot, TalentId, niveauC } from '../game/compagnon';
import {
  AMELIORATIONS, Absence, BIOME_PALIER, BOOSTS_JOUR, CAMP_MAX, INTERVALLE, MISSIONS, NIV_COFFRE_MAX, PALIER_RENAISSANCE, RARETES, RAR_COL, SLOTS, STAT_NOM, TALENTS, TALENT_MAX,
  acheterCoffre, ameliorer, ameliorerCoffre, apprendreTalent, boostActif, booster, boosterRestant, campDe, chance, chancesRarete, chasser, dureeTexte, enAttente, equiperObjet,
  gardien, meilleur, missionsDuJour, nomObjet, ouvrir, ouvrirTout, peutRenaitre, pointsRenaissance, prendreBonusMissions, prendreMission, prixAchatCoffre, prixAmelioration,
  prixCoffre, prixRecyclage, prixTalent, puissanceC, recolter, recycler, requis,
} from '../game/idle';
import { useGame } from '../lib/store';
import { sfx } from '../lib/sfx';
import { buzz, confetti } from '../lib/fx';
import { Decor } from '../components/Decor';
import { GI } from '../components/GI';
import { Sheet } from '../components/ui';

type Save = (c: C) => void;
const fmt = (x: number) => Math.round(x).toLocaleString('fr-FR');
const fmt1 = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
function useTick(ms: number) { const [, t] = useState(0); useEffect(() => { const i = setInterval(() => t(x => x + 1), ms); return () => clearInterval(i) }, [ms]) }

// ---------------------------------------------------------------------
// Territoire : chasse automatique, palier après palier
// ---------------------------------------------------------------------
export function Territoire({ c, save }: { c: C; save: Save }) {
  useTick(1000);
  const p = c.palier || 1, g = gardien(p), pow = puissanceC(c), req = requis(p), ch = chance(pow, p), boss = p % 10 === 0;
  const [anim, setAnim] = useState<{ ok: boolean; k: number } | null>(null);
  const [manuel, setManuel] = useState(0);
  const derniere = useRef(c.chasseA || Date.now());
  // la chasse continue pendant que l'écran est ouvert
  const ref = useRef({ c, save }); ref.current = { c, save };
  useEffect(() => {
    const i = setInterval(() => {
      const r = chasser(ref.current.c);
      if (r.res.length) { ref.current.save(r.c); const last = r.res[r.res.length - 1]; montrer(last.ok) }
    }, 5000);
    return () => clearInterval(i);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  derniere.current = c.chasseA || Date.now();
  const montrer = (ok: boolean) => { setAnim({ ok, k: Date.now() }); if (ok) { sfx.etoile(2); buzz(20) } else sfx.coup() };
  const forcer = () => {
    if (Date.now() - manuel < 8000) return; setManuel(Date.now());
    const r = chasser(c, Date.now(), Math.random, true); save(r.c); montrer(r.res[0]?.ok);
  };
  const reste = Math.max(0, INTERVALLE - (Date.now() - derniere.current)), pctAttente = 100 - (100 * reste) / INTERVALLE;
  const ratio = Math.min(1.5, pow / req);
  return (
    <div className="terr">
      <div className="terr-scene">
        <Decor biome={BIOME_PALIER(p)} ph={boss ? 'crépuscule' : 'jour'} />
        <div className="terr-top"><span className="chip"><GI n="carte" /> Territoire</span><span className="chip strong">Palier {p}{boss ? ' · Boss' : ''}</span><span className="chip">Record {c.palierMax || p}</span></div>
        <div className="terr-vs">
          <div className={`tv-p ${anim ? (anim.ok ? 'gagne' : 'perd') : ''}`} key={'p' + (anim?.k || 0)}><span className="spr" style={photoRond(BYID[c.espece]) || undefined} /><b>{c.surnom}</b></div>
          <span className="vs">VS</span>
          <div className={`tv-e ${boss ? 'boss' : ''} ${anim ? (anim.ok ? 'perd' : 'gagne') : ''}`} key={'e' + (anim?.k || 0)}>{boss && <GI n="couronne" className="crown" />}<span className="spr" style={photoRond(g) || undefined} /><b>{g.nom}</b></div>
        </div>
        {anim && <div className={`terr-res ${anim.ok ? 'ok' : 'ko'}`} key={anim.k}>{anim.ok ? `Palier ${p - 1} franchi !` : 'Raté… il s’entraîne'}</div>}
      </div>
      <div className="terr-info">
        <div className="pw"><span><GI n="att" /> Puissance <b>{fmt(pow)}</b></span><span>Conseillée <b>{fmt(req)}</b></span></div>
        <div className={`pwbar ${ratio >= 1 ? 'ok' : ratio > 0.8 ? 'mid' : 'low'}`}><i style={{ width: `${(100 * ratio) / 1.5}%` }} /><u style={{ left: `${100 / 1.5}%` }} /></div>
        <div className="row spread"><small className="note">Chance de victoire : <b>{Math.round(100 * ch)} %</b>{ch < 0.2 ? ' · trop fort pour l’instant : améliore ton animal' : ''}</small>
          <small className="note">Prochain essai <i className="mini-ring" style={{ ['--p' as string]: `${pctAttente}%` }} /> {Math.ceil(reste / 1000)} s</small></div>
        <button className="btn primary" disabled={Date.now() - manuel < 8000} onClick={forcer}><GI n="combat" /> Défier maintenant</button>
        {!!c.journal?.length && <div className="tj">{c.journal.slice(0, 4).map((r, i) => <span key={i} className={r.ok ? 'ok' : 'ko'}>{r.ok ? '✓' : '✗'} P{r.p}</span>)}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Récolte : XP, écus et coffres accumulés + boost ×2
// ---------------------------------------------------------------------
export function Recolte({ c, save }: { c: C; save: Save }) {
  const { toast } = useGame(); useTick(3000);
  const [ouvert, setOuvert] = useState(false);
  const a = enAttente(c), cp = campDe(c), b = boostActif(c), restant = boosterRestant(c);
  const recolte = () => {
    if (!a.xp && !a.ecus && !a.coffres) return toast('Rien à récolter pour l’instant');
    const n = recolter(c); save(n); sfx.etoile(1); toast(`+${fmt(a.xp)} XP · +${fmt(a.ecus)} écus${a.coffres ? ` · +${a.coffres} coffre${a.coffres > 1 ? 's' : ''}` : ''}`);
    if (niveauC(n.xp) > niveauC(c.xp)) setTimeout(() => sfx.niveau(), 300);
  };
  return (
    <div className={`camp ${a.plein ? 'plein' : ''}`}>
      <div className="camp-h"><span className="em">🏕️</span><div><b>Camp d'entraînement</b><small>{fmt1(a.xpH)} XP/h · {fmt1(a.ecusH)} écus/h · {fmt1(a.coffresH)} coffre/h{b ? ' · ×2 actif' : ''}</small></div></div>
      <div className="loot"><span><GI n="xp" />{fmt(a.xp)}<small>XP</small></span><span><GI n="coffre" />{fmt(a.ecus)}<small>écus</small></span><span>🎁{a.coffres}<small>coffres</small></span></div>
      <div className="camp-g"><div className="gbar"><i style={{ width: `${Math.round((100 * a.h) / a.stockH)}%` }} /></div><small>{a.plein ? 'Plein ! Récolte vite' : `${fmt1(a.h)} h / ${a.stockH} h`}</small></div>
      {a.faible && <p className="note warn">Il a trop faim : il s'entraîne deux fois moins bien.</p>}
      <div className="row wrap">
        <button className="btn primary" onClick={recolte}>Récolter</button>
        <button className={`btn small ${b ? 'primary' : ''}`} disabled={b || restant <= 0} onClick={() => { const n = booster(c); if (n) { save(n); sfx.ultime(); toast('Boost ×2 pendant 30 minutes !') } }}>
          ⚡ {b ? `×2 · ${Math.ceil(((c.boost?.jusqua || 0) - Date.now()) / 60000)} min` : `Boost ×2 (${restant}/${BOOSTS_JOUR})`}</button>
        <button className="btn ghost small" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert}>Améliorer</button>
      </div>
      {ouvert && <div className="upg">{AMELIORATIONS.map(u => { const lvl = cp[u.k], prix = prixAmelioration(u.k, lvl), max = lvl >= CAMP_MAX;
        return <div key={u.k} className="upg-l"><span><b>{u.nom} <small>niv. {lvl}/{CAMP_MAX}</small></b><small>{u.desc}</small></span>
          <button className="btn small" disabled={max || c.ecus + a.ecus < prix} onClick={() => { const n = ameliorer(c, u.k); if (n) { save(n); sfx.buff(); toast(`${u.nom} amélioré !`) } }}>{max ? 'Max' : `${fmt(prix)} écus`}</button></div> })}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Coffres et équipement
// ---------------------------------------------------------------------
export function Coffres({ c, save }: { c: C; save: Save }) {
  const { toast } = useGame();
  const [obj, setObj] = useState<Objet | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const un = () => { const r = ouvrir(c); if (!r) return; save(r.c); setObj(r.o); sfx.buff(); buzz(30); if (r.o.rar >= 3) setTimeout(() => confetti(host.current, [RAR_COL[r.o.rar], '#fff'], 90, 0), 300) };
  const tout = () => { const r = ouvrirTout(c); save(r.c); sfx.niveau(); setResume(`${r.gardes.length} objet${r.gardes.length > 1 ? 's' : ''} équipé${r.gardes.length > 1 ? 's' : ''} (meilleurs que les tiens), ${r.recycles} recyclé${r.recycles > 1 ? 's' : ''} : +${r.gain} écus`) };
  const L = c.niveauCoffre || 1, ch = chancesRarete(c);
  return (
    <div className="coffres" ref={host}>
      <h2>Coffres</h2>
      <div className="cf-head"><span className="cf-ic">🎁<b>{c.coffres || 0}</b></span>
        <div className="row wrap"><button className="btn primary" disabled={!c.coffres} onClick={un}>Ouvrir</button><button className="btn" disabled={(c.coffres || 0) < 2} onClick={tout}>Tout ouvrir (auto)</button>
          <button className="btn ghost small" disabled={c.ecus < prixAchatCoffre(c)} onClick={() => { const n = acheterCoffre(c); if (n) { save(n); sfx.tap() } }}>Acheter · {prixAchatCoffre(c)} écus</button></div></div>
      {resume && <p className="note ok-note">{resume}</p>}
      <div className="panel"><p className="eyebrow">Équipement de {c.surnom}</p>
        <div className="slots4">{(Object.keys(SLOTS) as Slot[]).map(k => { const o = c.equip?.[k];
          return <div key={k} className="eq" style={{ ['--rc' as string]: o ? RAR_COL[o.rar] : 'var(--line)' }}><span className="eq-ic">{SLOTS[k].ic}</span><b>{SLOTS[k].nom}</b><small>{o ? `${RARETES[o.rar]} · +${o.pct} % ${STAT_NOM[o.stat]}` : 'vide'}</small></div> })}</div></div>
      <div className="panel"><p className="eyebrow">Niveau du coffre : {L}/{NIV_COFFRE_MAX}</p>
        <div className="odds">{RARETES.map((r, i) => <span key={r} style={{ color: RAR_COL[i] }}><b>{fmt1(100 * ch[i])} %</b>{r}</span>)}</div>
        <button className="btn small" disabled={L >= NIV_COFFRE_MAX || c.ecus < prixCoffre(L)} onClick={() => { const n = ameliorerCoffre(c); if (n) { save(n); sfx.buff(); toast('Coffres améliorés : meilleures raretés !') } }}>{L >= NIV_COFFRE_MAX ? 'Niveau max' : `Améliorer · ${fmt(prixCoffre(L))} écus`}</button>
        <p className="note">Les objets sont plus puissants quand ton territoire est plus avancé (niveau d'objet = palier).</p></div>
      {obj && <Sheet onClose={() => setObj(null)} label="Objet trouvé">
        <div className="obj-rev" style={{ ['--rc' as string]: RAR_COL[obj.rar] }}>
          <div className="obj-glow"><span>{SLOTS[obj.slot].ic}</span></div>
          <p className="eyebrow" style={{ color: RAR_COL[obj.rar] }}>{RARETES[obj.rar]} · niveau {obj.ilvl}</p>
          <h2>{nomObjet(obj)}</h2>
          <p className="big-stat">+{obj.pct} % {STAT_NOM[obj.stat]}</p>
          <p className="note">Actuel : {c.equip?.[obj.slot] ? `+${c.equip[obj.slot]!.pct} % (${RARETES[c.equip[obj.slot]!.rar].toLowerCase()})` : 'rien'} {meilleur(c, obj) ? <b className="up">▲ meilleur</b> : <b className="down">▼ moins bon</b>}</p>
          <div className="row center"><button className="btn primary" onClick={() => { save(equiperObjet(c, obj)); setObj(null); sfx.bouclier() }}>Équiper</button>
            <button className="btn" onClick={() => { save(recycler(c, obj)); setObj(null); sfx.tap() }}>Recycler +{prixRecyclage(obj)} écus</button></div>
        </div>
      </Sheet>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Missions du jour
// ---------------------------------------------------------------------
export function Missions({ c, save }: { c: C; save: Save }) {
  const { toast } = useGame(); const m = missionsDuJour(c), ids = Object.keys(MISSIONS) as MissionId[];
  const toutes = m.pris.length === ids.length;
  return (
    <div className="missions">
      <h2>Missions du jour</h2>
      <p className="note">Série de connexion : <b>{c.serie?.n || 0} jour{(c.serie?.n || 0) > 1 ? 's' : ''}</b> (bonus du jour plus gros chaque jour, 2 coffres tous les 7 jours).</p>
      {ids.map(id => { const M = MISSIONS[id], v = Math.min(M.but, m.c[id] || 0), pris = m.pris.includes(id);
        return <div key={id} className={`mis ${pris ? 'pris' : ''}`}><span className="mis-b"><b>{M.nom}</b><div className="gbar"><i style={{ width: `${(100 * v) / M.but}%` }} /></div><small>{v}/{M.but} · {M.ecus ? `${M.ecus} écus` : `${M.coffres} coffre${(M.coffres || 0) > 1 ? 's' : ''}`}</small></span>
          {pris ? <span className="tag good">Reçu</span> : <button className="btn small primary" disabled={v < M.but} onClick={() => { const n = prendreMission(c, id); if (n) { save(n); sfx.etoile(1) } }}>Récupérer</button>}</div> })}
      <div className={`mis bonus ${m.bonus ? 'pris' : ''}`}><span className="mis-b"><b>🏆 Coffre doré</b><small>Termine les 5 missions : +3 coffres</small></span>
        {m.bonus ? <span className="tag good">Reçu</span> : <button className="btn small primary" disabled={!toutes} onClick={() => { const n = prendreBonusMissions(c); if (n) { save(n); sfx.niveau(); toast('+3 coffres !') } }}>Récupérer</button>}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Héritage et renaissance
// ---------------------------------------------------------------------
export function Heritage({ c, save, renaitre }: { c: C; save: Save; renaitre: () => void }) {
  const h = c.heritage || { points: 0, total: 0, talents: {}, renaissances: 0 }, ok = peutRenaitre(c), pts = pointsRenaissance(c);
  return (
    <div className="heritage">
      <h2>Héritage</h2>
      <div className="panel her-top"><span className="her-pts">✨<b>{h.points}</b><small>points</small></span>
        <p className="note">Une <b>renaissance</b> fait repartir ton aventure de zéro avec un nouvel animal (niveau 1, palier 1, compétences remises à zéro) mais te donne des <b>points d'héritage</b> qui renforcent pour toujours tous tes futurs animaux. Tu gardes l'équipement, le camp et les écus. {h.renaissances ? `Renaissances : ${h.renaissances}.` : ''}</p></div>
      <div className="talents">{(Object.keys(TALENTS) as TalentId[]).map(t => { const lvl = h.talents[t] || 0, prix = prixTalent(lvl);
        return <div key={t} className="tal"><span className="tal-b"><b>{TALENTS[t].nom} <small>{lvl}/{TALENT_MAX}</small></b><small>{TALENTS[t].desc}</small><span className="tal-pips">{Array.from({ length: TALENT_MAX }, (_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</span></span>
          <button className="btn small" disabled={lvl >= TALENT_MAX || h.points < prix} onClick={() => { const n = apprendreTalent(c, t); if (n) { save(n); sfx.buff() } }}>{lvl >= TALENT_MAX ? 'Max' : `${prix} pt${prix > 1 ? 's' : ''}`}</button></div> })}</div>
      <div className={`panel reborn ${ok ? 'ready' : ''}`}>
        <p className="eyebrow">Renaissance</p>
        {ok ? <><p>Si tu renais maintenant, tu gagnes <b>{pts} point{pts > 1 ? 's' : ''} d'héritage</b> (record palier {c.palierMax}, niveau {niveauC(c.xp)}).</p>
          <button className="btn primary big" disabled={pts <= 0} onClick={renaitre}>✨ Renaître avec un nouvel animal</button></>
          : <p className="note">Disponible quand ton territoire atteint le palier {PALIER_RENAISSANCE} (record actuel : {c.palierMax || 1}). Plus tu vas loin, plus tu gagnes de points.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// « Pendant ton absence… »
// ---------------------------------------------------------------------
export function AbsenceModal({ c, a, onClose }: { c: C; a: Absence; onClose: () => void }) {
  useEffect(() => { sfx.niveau() }, []);
  return (
    <Sheet onClose={onClose} label="Pendant ton absence">
      <div className="absence">
        <span className="spr" style={photoRond(BYID[c.espece]) || undefined} />
        <h2>Pendant ton absence</h2>
        <p className="note">{dureeTexte(a.duree)} · {c.surnom} a chassé sans toi</p>
        <div className="abs-grid">
          <span><b>{a.paliers > 0 ? `+${a.paliers}` : '0'}</b>palier{a.paliers > 1 ? 's' : ''} (maintenant {c.palier})</span>
          <span><b>{a.victoires}</b>victoire{a.victoires > 1 ? 's' : ''}</span>
          <span><b>{fmt(a.attente.xp)}</b>XP à récolter</span>
          <span><b>{fmt(a.attente.ecus)}</b>écus à récolter</span>
          <span><b>{a.attente.coffres}</b>coffre{a.attente.coffres > 1 ? 's' : ''} à récolter</span>
        </div>
        {a.attente.plein && <p className="note warn">Ton camp était plein : reviens plus souvent ou agrandis l'enclos pour ne rien perdre.</p>}
        {c.faim < 25 && <p className="note warn">{c.surnom} a faim : nourris-le pour qu'il chasse mieux.</p>}
        <button className="btn primary big" onClick={onClose}>Super !</button>
      </div>
    </Sheet>
  );
}
