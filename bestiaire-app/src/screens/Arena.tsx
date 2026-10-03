// Arène de combat : décor du milieu, effets visuels, sons, jauge d'instinct et écran de fin avec expérience.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ACT, BIOME, Species, TIERS, photoRond } from '../game/species';
import { ARCH, Ability, Battle as B, Choix, EFF, Effet, Fighter, INST_MAX, ULTIMES, aInstinct, abilities, active, ai, playTurn, prey, ultPret } from '../game/combat';
import { NIV_INSTINCT, progression } from '../game/rpg';
import { XpResult } from '../lib/api';
import { buzz, confetti, reduceMotion } from '../lib/fx';
import { sfx, sonActif, setSon } from '../lib/sfx';
import { Decor } from '../components/Decor';
import { FxHandle, FxKind, FxLayer } from '../components/FxLayer';
import { GI } from '../components/GI';
import { GIName } from '../game/icons';

type Side = 'P' | 'E';
type Anim = 'lunge' | 'shake' | 'heal' | 'shield' | 'dodge' | 'ko' | 'enter' | 'status' | 'charge' | '';
interface Float { id: number; side: Side; txt: string; cls: string }
interface View { hp: { P: number[]; E: number[] }; pi: number; ei: number; anim: { P: Anim; E: Anim }; caption: string; capCls: string; floats: Float[] }
export interface CombatStats { dealt: number; taken: number; ko: number; best: { nom: string; dmg: number } | null; turns: number; koEquipe: number }
export interface Fin { titre?: string; lignes: ReactNode[]; etoiles?: number; xp?: XpResult | null; equipe?: { id: number; s: Species; rang: number; xp: number }[]; suite?: { label: string; go: () => void } }

export const EFF_GI: Record<Effet | 'base', GIName> = { base: 'base', frappe: 'frappe', nuee: 'nuee', poison: 'poison', bouclier: 'bouclier', esquive: 'esquive', soin: 'soin', intimidation: 'intimidation', etourdir: 'etourdir', vitesse: 'vitesse', embuscade: 'embuscade' };
export const ULT_GI: Record<string, GIName> = { M: 'uM', O: 'uO', R: 'uR', A: 'uA', P: 'uP', I: 'uI', K: 'uK', X: 'uX' };
const EFF_CLS: Record<Effet | 'base', string> = { base: 'k-atk', frappe: 'k-atk', nuee: 'k-atk', embuscade: 'k-atk', etourdir: 'k-atk', poison: 'k-poi', bouclier: 'k-def', esquive: 'k-def', soin: 'k-heal', intimidation: 'k-ctl', vitesse: 'k-ctl' };
const PH_GI: Record<string, GIName> = { jour: 'jour', nuit: 'nuit', aube: 'aube', 'crépuscule': 'crepuscule' };
export const BIOME_GI: Record<string, GIName> = { P: 'bP', F: 'bF', H: 'bH', L: 'bL', M: 'bM', V: 'bV' };
const ULT_COL: Record<string, string> = { M: '#ff8a4a', O: '#7fd0ff', R: '#8fe08a', A: '#b6f26a', P: '#5ac8ff', I: '#ffd34a', K: '#c08bff', X: '#9aa8ff' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const snapshot = (b: B): View => ({ hp: { P: b.P.map(f => f.hp), E: b.E.map(f => f.hp) }, pi: b.pi, ei: b.ei, anim: { P: '', E: '' }, caption: '', capCls: '', floats: [] });

export function Arena({ b, titre, toursMax, onFin, onQuit }: { b: B; titre?: string; toursMax?: number; onFin: (b: B, st: CombatStats) => Promise<Fin>; onQuit: () => void }) {
  const [, force] = useState(0);
  const [view, setView] = useState<View>(() => snapshot(b));
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false); const [fast, setFast] = useState(false);
  const [son, setSonV] = useState(sonActif());
  const [fin, setFin] = useState<Fin | null>(null);
  const [ult, setUlt] = useState<{ nom: string; s: Species; side: Side } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const stats = useRef<CombatStats>({ dealt: 0, taken: 0, ko: 0, best: null, turns: 0, koEquipe: 0 });
  const arena = useRef<HTMLDivElement>(null); const fx = useRef<FxHandle>(null);
  const port = { P: useRef<HTMLDivElement>(null), E: useRef<HTMLDivElement>(null) };
  const alive = useRef(true); const fid = useRef(0);
  const speed = useRef(1); speed.current = fast || reduceMotion ? 0.45 : 1;
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, []);

  const centre = (side: Side) => {
    const a = arena.current?.getBoundingClientRect(), p = port[side].current?.getBoundingClientRect();
    if (!a || !p) return { x: 0, y: 0 };
    return { x: p.left - a.left + p.width / 2, y: p.top - a.top + p.height / 2 };
  };
  const burst = (k: FxKind, side: Side, col?: string) => { const c = centre(side); fx.current?.burst(k, c.x, c.y, col) };

  // Rejoue les événements du tour : élan, effets, chiffres flottants, barres de vie, sons
  const animate = async (bt: B, v0: View) => {
    let v = v0; const put = (p: Partial<View>) => { v = { ...v, ...p }; if (alive.current) setView(v) };
    const float = (side: Side, txt: string, cls: string) => { const f = { id: ++fid.current, side, txt, cls }; put({ floats: [...v.floats.slice(-5), f] }) };
    const anim = (side: Side, a: Anim) => put({ anim: { ...v.anim, [side]: a } });
    const fighter = (side: Side) => (side === 'P' ? bt.P[v.pi] : bt.E[v.ei]);
    const setHp = (side: Side, i: number, hp: number) => put({ hp: { ...v.hp, [side]: v.hp[side].map((x, j) => (j === i ? hp : x)) } });
    const st = stats.current; let effet: Effet | 'base' | 'ult' = 'base'; let auteur: Side = 'P';
    for (const e of bt.ev || []) {
      if (!alive.current) return;
      const idx = e.side === 'P' ? v.pi : v.ei; let wait = 420;
      switch (e.k) {
        case 'ult': {
          effet = 'ult'; auteur = e.side; const f = fighter(e.side);
          setUlt({ nom: e.nom!, s: f.s, side: e.side }); sfx.ultime(); buzz([40, 30, 80]); anim(e.side, 'charge'); burst('charge', e.side, ULT_COL[f.s.classe]);
          await sleep(1150 * speed.current); setUlt(null); wait = 120; break;
        }
        case 'act': effet = e.eff || 'base'; auteur = e.side; put({ caption: `${fighter(e.side).s.nom} · ${e.nom}`, capCls: `${EFF_CLS[e.eff || 'base']} ${e.side === 'P' ? 'mine' : 'theirs'}` }); anim(e.side, 'lunge'); sfx.tap(); wait = 340; break;
        case 'hit': {
          setHp(e.side, idx, e.hp!); anim(e.side, 'shake');
          const crit = !!e.adv, att = fighter(auteur).s;
          if (effet === 'ult') { burst('ultime', e.side, ULT_COL[att.classe]); sfx.critique() }
          else if (crit) { burst('critique', e.side); sfx.critique() }
          else if (effet === 'nuee') { burst('nuee', e.side); burst('impact', e.side); sfx.coup() }
          else if (['M', 'K', 'R', 'I'].includes(att.classe) && effet !== 'base') { burst('griffes', e.side); sfx.griffe() }
          else { burst('impact', e.side); sfx.coup() }
          float(e.side, `−${e.amt}`, crit ? 'crit' : effet === 'ult' ? 'ult' : 'dmg');
          if (e.side === 'E') { st.dealt += e.amt!; const n = bt.P[v.pi].s.nom; if (!st.best || e.amt! > st.best.dmg) st.best = { nom: n, dmg: e.amt! } } else { st.taken += e.amt!; buzz(25) }
          wait = 480; break;
        }
        case 'dodge': anim(e.side, 'dodge'); burst('esquive', e.side); sfx.esquive(); float(e.side, 'Esquive !', 'info'); break;
        case 'heal': setHp(e.side, idx, e.hp!); anim(e.side, 'heal'); burst('soin', e.side); sfx.soin(); float(e.side, `+${e.amt}`, 'heal'); break;
        case 'shield': anim(e.side, 'shield'); if (e.amt! > 0) { burst('bouclier', e.side); sfx.bouclier() } float(e.side, e.amt! < 0 ? `${-e.amt!} absorbés` : `Protection ${e.amt}`, 'shield'); break;
        case 'poison': anim(e.side, 'status'); burst('poison', e.side); sfx.poison(); float(e.side, 'Empoisonné', 'poison'); break;
        case 'tick': setHp(e.side, e.i!, e.hp!); burst('poison', e.side); float(e.side, `−${e.amt}`, 'poison'); if (e.side === 'E') st.dealt += e.amt!; else st.taken += e.amt!; wait = 360; break;
        case 'stun': anim(e.side, 'status'); burst('etoiles', e.side); sfx.etourdi(); float(e.side, 'Étourdi !', 'info'); break;
        case 'buff': case 'debuff': anim(e.side, 'status'); burst(e.k, e.side); sfx.buff(); float(e.side, e.nom!, e.k === 'buff' ? 'info' : 'poison'); break;
        case 'skip': put({ caption: `${fighter(e.side).s.nom} est étourdi…`, capCls: 'k-ctl' }); burst('etoiles', e.side); break;
        case 'ko': anim(e.side, 'ko'); burst('ko', e.side); sfx.ko(); put({ caption: `${fighter(e.side).s.nom} est K.O. !`, capCls: e.side === 'E' ? 'k-good' : 'k-bad' }); if (e.side === 'E') st.ko++; else st.koEquipe++; buzz(e.side === 'E' ? [20, 30, 40] : 60); wait = 700; break;
        case 'switch': put(e.side === 'P' ? { pi: e.i! } : { ei: e.i! }); anim(e.side, 'enter'); put({ caption: `${e.side === 'P' ? 'Tu envoies' : 'En face :'} ${(e.side === 'P' ? bt.P : bt.E)[e.i!].s.nom}`, capCls: '' }); wait = 520; break;
        case 'fatigue': put({ caption: 'Les animaux fatiguent : les coups font plus mal', capCls: 'k-bad' }); wait = 700; break;
      }
      await sleep(wait * speed.current);
      put({ anim: { P: '', E: '' } });
    }
    put({ ...snapshot(bt), caption: v.caption, capCls: v.capCls, floats: [] });
  };

  const turn = async (choice: Choix) => {
    if (busy || b.over) return; setBusy(true);
    const v0 = { ...snapshot(b), caption: view.caption, capCls: view.capCls };
    playTurn(b, choice); force(x => x + 1);
    await animate(b, v0);
    if (!alive.current) return;
    stats.current.turns = b.round - 1;
    if (b.over) {
      setAuto(false);
      if (b.won) { sfx.victoire(); buzz([30, 40, 60]); confetti(arena.current, ['#f0b54a', '#8fbf7f', '#ffffff'], 110, 150) } else sfx.defaite();
      stats.current.koEquipe = b.P.filter(f => f.hp <= 0).length;
      const r = await onFin(b, stats.current).catch(() => ({ lignes: ['Résultat non enregistré (connexion ?)'] } as Fin));
      if (alive.current) setFin(r);
    }
    setBusy(false);
  };
  useEffect(() => {
    if (!auto || busy || b.over) return;
    const t = setTimeout(() => turn(ai(active(b, 'P'), Math.random)), 350 * speed.current);
    return () => clearTimeout(t);
  });

  const P = b.P[view.pi], E = b.E[view.ei], adv = prey(P, E), dis = prey(E, P), ab = abilities(P.s, P.lvl, P.niv);
  const bio = BIOME[b.biome as keyof typeof BIOME];
  const perks = (f: Fighter) => [f.s.biomes.includes(b.biome as never) && 'Chez lui +15 %', f.s.act === 'N' && b.ph === 'nuit' && 'Nocturne : plus vif', f.s.act === 'D' && b.ph === 'jour' && 'Diurne : plus vif', f.s.act === 'C' && (b.ph === 'aube' || b.ph === 'crépuscule') && 'Crépusculaire : plus vif'].filter(Boolean) as string[];
  const tours = b.round - (b.over ? 1 : 0);
  return (
    <section className="view combat3">
      <div className={`arena3 ph-${b.ph}`} ref={arena}>
        <Decor biome={b.biome} ph={b.ph} />
        <FxLayer ref={fx} biome={b.biome} ph={b.ph} />
        <div className="hud">
          {titre && <span className="chip strong">{titre}</span>}
          <span className="chip"><GI n="combat" /> Tour {tours}{toursMax ? <small> / {toursMax} ★</small> : null}</span>
          <span className="chip"><GI n={BIOME_GI[b.biome] || 'bP'} />{bio?.n}</span>
          <span className="chip"><GI n={PH_GI[b.ph] || 'jour'} />{b.ph}</span>
          <button className="chip btnc" aria-pressed={son} aria-label={son ? 'Couper le son' : 'Activer le son'} onClick={() => { setSon(!son); setSonV(!son) }}><GI n={son ? 'son' : 'muet'} /></button>
        </div>
        <Combatant f={E} side="E" hp={view.hp.E[view.ei]} anim={view.anim.E} floats={view.floats.filter(x => x.side === 'E')} team={b.E} hps={view.hp.E} cur={view.ei} pref={port.E} />
        <div className={`caption ${view.capCls}`} key={view.caption}>{view.caption || 'À toi de jouer'}</div>
        <Combatant f={P} side="P" hp={view.hp.P[view.pi]} anim={view.anim.P} floats={view.floats.filter(x => x.side === 'P')} team={b.P} hps={view.hp.P} cur={view.pi} pref={port.P} />
        {ult && <div className={`ult-cine ${ult.side}`} style={{ ['--uc' as string]: ULT_COL[ult.s.classe] }}>
          <div className="uc-band"><span className="uc-spr" style={photoRond(ult.s) || undefined} /><div><small>Instinct sauvage</small><b>{ult.nom}</b></div><GI n={ULT_GI[ult.s.classe]} className="uc-ic" /></div>
        </div>}
        {fin && <EndScreen b={b} fin={fin} st={stats.current} onQuit={onQuit} />}
      </div>

      {!fin && <>
        <div className="tags">
          {adv && <span className="tag good">Chaîne alimentaire : ×1,5 pour toi</span>}
          {dis && <span className="tag bad">{E.s.nom} chasse ton animal : ×1,5 contre toi</span>}
          {perks(P).map(x => <span key={x} className="tag">{x}</span>)}
        </div>
        <UltButton f={P} disabled={busy || b.over} onUse={() => turn({ ult: true })} />
        <div className="actions3">
          <button disabled={busy || b.over} className="k-atk" onClick={() => turn(null)}>
            <GI n="base" className="ic" /><b>Attaque</b><small>Gratuite · dégâts simples</small><span className="cost free">0</span></button>
          {ab.map((a: Ability, i) => <button key={i} disabled={busy || b.over || a.puissance > P.energy} className={`${EFF_CLS[a.effet]} ${adv && ['frappe', 'nuee', 'poison', 'etourdir', 'embuscade'].includes(a.effet) ? 'adv' : ''}`} onClick={() => turn(a)}>
            <GI n={EFF_GI[a.effet]} className="ic" /><b>{a.nom}</b><small>{EFF[a.effet]}</small>
            <span className="cost">{Array.from({ length: a.puissance }, (_, k) => <i key={k} className={k < P.energy ? 'on' : ''} />)}</span></button>)}
        </div>
        <Bench b={b} hps={view.hp.P} cur={view.pi} disabled={busy || b.over} onPick={i => turn({ sw: i })} />
        <div className="row spread ctrl">
          <div className="row">
            <button className={`btn small ${auto ? 'primary' : 'ghost'}`} onClick={() => setAuto(!auto)} aria-pressed={auto}><GI n="auto" /> Auto</button>
            <button className={`btn small ${fast ? 'primary' : 'ghost'}`} onClick={() => setFast(!fast)} aria-pressed={fast} title="Animations plus rapides"><GI n="rapide" /> ×2</button>
            <button className="btn ghost small" onClick={() => setShowLog(!showLog)} aria-expanded={showLog}>{showLog ? 'Masquer' : 'Journal'}</button>
          </div>
          <button className="btn ghost small" disabled={busy || b.over} onClick={onQuit}><GI n="fuir" /> Fuir</button>
        </div>
      </>}
      {(showLog || fin) && <div className="log" aria-live="polite">{b.log.slice(-60).map((l, i) => <p key={i} className={`${l.t === 'sys' ? 'sys' : ''}${l.adv ? ' eff' : ''}`}>{l.m}</p>)}</div>}
    </section>
  );
}

function UltButton({ f, disabled, onUse }: { f: Fighter; disabled: boolean; onUse: () => void }) {
  const u = ULTIMES[f.s.classe];
  if (!aInstinct(f)) return <div className="ult-btn locked"><GI n="cadenas" className="ic" /><span><b>Instinct sauvage</b><small>Se débloque au niveau {NIV_INSTINCT}</small></span></div>;
  const pret = ultPret(f), pct = Math.round((100 * f.inst) / INST_MAX);
  return (
    <button className={`ult-btn ${pret ? 'ready' : ''}`} disabled={disabled || !pret} onClick={onUse} style={{ ['--uc' as string]: ULT_COL[f.s.classe], ['--p' as string]: `${pct}%` }}>
      <GI n={ULT_GI[f.s.classe]} className="ic" />
      <span><b>{u.nom}</b><small>{pret ? u.desc : `Instinct ${pct} % · se remplit en frappant et en encaissant`}</small></span>
      <i className="ult-gauge" />
    </button>
  );
}

function Combatant({ f, side, hp, anim, floats, team, hps, cur, pref }: { f: Fighter; side: Side; hp: number; anim: Anim; floats: Float[]; team: Fighter[]; hps: number[]; cur: number; pref: React.RefObject<HTMLDivElement> }) {
  const pct = Math.max(0, Math.round((100 * hp) / f.maxHp)); const s = f.s;
  const [trail, setTrail] = useState(pct);
  useEffect(() => { const t = setTimeout(() => setTrail(pct), 450); return () => clearTimeout(t) }, [pct]);
  const st: [GIName, string][] = []; if (f.poison) st.push(['etatPoison', 'Poison']); if (f.shield) st.push(['etatBouclier', String(f.shield)]); if (f.dodge) st.push(['esquive', 'Esquive']); if (f.stun) st.push(['etatEtourdi', 'Étourdi']); if (f.attMod < 1) st.push(['intimidation', 'Att. ↓']); if (f.vitMod > 1) st.push(['vitesse', 'Vit. ↑']);
  return (
    <div className={`cmb3 ${side} ${hp <= 0 ? 'ko' : ''} ${f.boss ? 'boss' : ''}`}>
      <div className="podium" />
      <div className={`portrait3 t${s.tier} a-${anim}`} key={s.id} ref={pref}>
        {f.boss && <GI n="couronne" className="crown" />}
        <div className="spr" role="img" aria-label={s.nom} style={photoRond(s) || undefined} />
        {floats.map(x => <span key={x.id} className={`float ${x.cls}`}>{x.txt}</span>)}
      </div>
      <div className="plate3">
        <div className="pn"><b>{s.nom}</b><span className="lvl">Niv. {f.niv}</span></div>
        <div className="hp3"><i className="trail" style={{ width: `${trail}%` }} /><i className={`now ${pct < 30 ? 'low' : pct < 60 ? 'mid' : ''}`} style={{ width: `${pct}%` }} /></div>
        <div className="pm"><span>{hp}/{f.maxHp} PV</span><span className="pips" aria-label={`${f.energy} énergie`}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= f.energy ? 'on' : ''} />)}</span></div>
        {aInstinct(f) && <div className={`inst3 ${f.inst >= INST_MAX ? 'full' : ''}`} title="Instinct"><i style={{ width: `${(100 * f.inst) / INST_MAX}%` }} /></div>}
        <div className="pm sm"><span className={`tierdot t${s.tier}`}>{TIERS[s.tier]}</span><span>{ARCH[s.arch].n}</span><span>{ACT[s.act]}</span></div>
        {st.length > 0 && <div className="status3">{st.map(([i, t]) => <span key={t}><GI n={i} />{t}</span>)}</div>}
        {team.length > 1 && <div className="dots" aria-label="Équipe">{team.map((x, i) => <i key={i} className={hps[i] <= 0 ? 'ko' : i === cur ? 'cur' : ''} />)}</div>}
      </div>
    </div>
  );
}

function Bench({ b, hps, cur, disabled, onPick }: { b: B; hps: number[]; cur: number; disabled: boolean; onPick: (i: number) => void }) {
  if (b.P.length < 2) return null;
  return (
    <div className="bench3" role="group" aria-label="Ton équipe : touche un animal pour le faire entrer (coûte ton tour)">
      {b.P.map((f, i) => { const pct = Math.max(0, Math.round((100 * hps[i]) / f.maxHp)); const can = !disabled && hps[i] > 0 && i !== cur;
        return <button key={i} className={`bm ${i === cur ? 'cur' : ''} ${hps[i] <= 0 ? 'ko' : ''}`} disabled={!can} onClick={() => onPick(i)} aria-label={`${f.s.nom}, ${hps[i]} PV${can ? ', faire entrer' : ''}`}>
          <span className="spr" style={photoRond(f.s) || undefined} /><span className="bn">{f.s.nom.split(' ')[0]}<small>Niv. {f.niv}</small></span><span className="bh"><u style={{ width: `${pct}%` }} /></span>
        </button> })}
    </div>
  );
}

function EndScreen({ b, fin, st, onQuit }: { b: B; fin: Fin; st: CombatStats; onQuit: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!fin.etoiles) return; let i = 0;
    const t = setInterval(() => { i++; setShown(i); sfx.etoile(i - 1); if (i >= fin.etoiles!) clearInterval(t) }, 380);
    return () => clearInterval(t);
  }, [fin.etoiles]);
  return (
    <div className="a-end3" role="dialog" aria-label="Fin du combat">
      <h2 className={b.won ? 'win' : 'lose'}>{fin.titre || (b.won ? 'Victoire' : 'Défaite')}</h2>
      {fin.etoiles !== undefined && <div className="stars3" aria-label={`${fin.etoiles} étoile(s) sur 3`}>{[1, 2, 3].map(i => <GI key={i} n="etoile" className={i <= shown ? 'on' : ''} />)}</div>}
      {fin.lignes.map((l, i) => <p key={i} className="note">{l}</p>)}
      <div className="a-stats"><span><b>{st.dealt}</b>dégâts</span><span><b>{st.ko}</b>K.O.</span><span><b>{st.turns}</b>tours</span></div>
      {fin.xp && fin.equipe && <XpGains xp={fin.xp} equipe={fin.equipe} />}
      <div className="row center">{fin.suite && <button className="btn primary" onClick={fin.suite.go}>{fin.suite.label}</button>}<button className="btn ghost" onClick={onQuit}>Retour</button></div>
    </div>
  );
}

function XpGains({ xp, equipe }: { xp: XpResult; equipe: { id: number; s: Species; rang: number; xp: number }[] }) {
  useEffect(() => { if (xp.cards.some(c => c.niv > c.avant)) setTimeout(() => sfx.niveau(), 700) }, [xp]);
  if (xp.cap) return <p className="note">Limite d'expérience du jour atteinte : tes animaux en regagneront demain.</p>;
  return (
    <div className="xpg">
      {xp.cards.map(c => { const e = equipe.find(x => x.id === c.id); if (!e) return null; const up = c.niv > c.avant;
        return <div key={c.id} className={`xpg-l ${up ? 'up' : ''}`}><span className="spr" style={photoRond(e.s) || undefined} />
          <span className="xpg-b"><b>{e.s.nom} <em className="xpp">+{c.xp - e.xp} XP</em></b><small>{up ? <>Niveau {c.avant} → <b>{c.niv}</b> !</> : <>Niveau {c.niv}{progression(c.xp, e.rang).plafond ? ' · max du rang' : ''}</>}</small>
            <span className="xpbar"><i style={{ width: `${progression(c.xp, e.rang).pct}%` }} /></span></span>
          {up && <span className="lvlup">NIVEAU +{c.niv - c.avant}</span>}</div> })}
    </div>
  );
}
