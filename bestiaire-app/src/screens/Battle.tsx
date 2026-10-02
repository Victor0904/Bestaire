import { useEffect, useMemo, useRef, useState } from 'react';
import { ACT, BIOME, BIOMES, BYID, FRANCE, Species, TIERS, photoStyle } from '../game/species';
import { ARCH, Ability, Battle as B, EFF, Effet, Ev, Fighter, abilities, active, ai, newBattle, playTurn, prey, statsAt, wildFoes } from '../game/combat';
import { api, Defense } from '../lib/api';
import { bestCard, useGame } from '../lib/store';
import { buzz, confetti, reduceMotion } from '../lib/fx';
import { Print } from '../components/ui';

type Side = 'P' | 'E';
type Anim = 'lunge' | 'shake' | 'heal' | 'shield' | 'dodge' | 'ko' | 'enter' | 'status' | '';
interface Float { id: number; side: Side; txt: string; cls: string }
interface View { hp: { P: number[]; E: number[] }; pi: number; ei: number; anim: { P: Anim; E: Anim }; caption: string; capCls: string; floats: Float[] }
interface Stats { dealt: number; taken: number; ko: number; best: { nom: string; dmg: number } | null; turns: number }

const OFFENSIVE: Effet[] = ['frappe', 'nuee', 'poison', 'etourdir', 'embuscade'];
const EFF_ICON: Record<Effet | 'base', string> = { base: '✦', frappe: '⚔', nuee: '✸', poison: '☠', bouclier: '⛨', esquive: '↯', soin: '✚', intimidation: '▼', etourdir: '✷', vitesse: '»', embuscade: '◎' };
const EFF_CLS: Record<Effet | 'base', string> = { base: 'k-atk', frappe: 'k-atk', nuee: 'k-atk', embuscade: 'k-atk', etourdir: 'k-atk', poison: 'k-poi', bouclier: 'k-def', esquive: 'k-def', soin: 'k-heal', intimidation: 'k-ctl', vitesse: 'k-ctl' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const power = (s: Species, lvl: number) => { const t = statsAt(s, lvl); return Math.round(t.pv * 0.6 + t.att * 2.2 + t.def * 1.6 + t.vit * 1.2) };
const snapshot = (b: B): View => ({ hp: { P: b.P.map(f => f.hp), E: b.E.map(f => f.hp) }, pi: b.pi, ei: b.ei, anim: { P: '', E: '' }, caption: '', capCls: '', floats: [] });

export function Battle() {
  const { bySpecies, state, refresh, run, toast, uid, go, challenge, setChallenge } = useGame();
  const [mode, setMode] = useState<'wild' | 'pvp'>('wild');
  const [team, setTeam] = useState<string[]>([]);
  const [b, setB] = useState<B | null>(null); const [, force] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false); const [fast, setFast] = useState(false);
  const [result, setResult] = useState<string>('');
  const [defs, setDefs] = useState<Defense[]>([]);
  const [stats, setStats] = useState<Stats>({ dealt: 0, taken: 0, ko: 0, best: null, turns: 0 });
  const [showLog, setShowLog] = useState(false);
  const [sort, setSort] = useState<'force' | 'niveau' | 'rarete'>('force');
  const arena = useRef<HTMLDivElement>(null); const alive = useRef(true); const fid = useRef(0);
  const speed = useRef(1); speed.current = fast || reduceMotion ? 0.45 : 1;
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, []);
  useEffect(() => { if (mode === 'pvp') api.defenses().then(setDefs).catch(() => {}) }, [mode]);
  useEffect(() => { if (challenge) setMode('pvp') }, [challenge]);

  const owned = useMemo(() => Object.keys(bySpecies).map(id => ({ s: BYID[id], c: bestCard(bySpecies[id]) })).filter(x => x.s)
    .map(x => ({ ...x, pw: power(x.s, x.c.lvl) }))
    .sort((a, c) => sort === 'force' ? c.pw - a.pw : sort === 'niveau' ? c.c.lvl - a.c.lvl || c.pw - a.pw : c.s.tier - a.s.tier || c.pw - a.pw), [bySpecies, sort]);
  const myTeam = () => team.filter(id => bySpecies[id]).map(id => ({ s: BYID[id], lvl: bestCard(bySpecies[id]).lvl }));
  const toggle = (id: string) => setTeam(team.includes(id) ? team.filter(x => x !== id) : team.length < 3 ? [...team, id] : team);
  const autoTeam = () => setTeam(owned.slice(0, 3).map(x => x.s.id));

  const begin = (nb: B) => { setResult(''); setAuto(false); setShowLog(false); setStats({ dealt: 0, taken: 0, ko: 0, best: null, turns: 0 }); setB(nb); setView(snapshot(nb)); window.scrollTo({ top: 0, behavior: 'smooth' }) };
  const startWild = () => {
    const t = myTeam(); if (!t.length) return; const avg = Math.round(t.reduce((a, x) => a + x.lvl, 0) / t.length);
    const bio = BIOMES[Math.floor(Math.random() * 6)];
    const nb = newBattle(t, wildFoes(FRANCE.filter(s => s.biomes.includes(bio)), t.length, avg, team), bio, state?.phase || 'jour');
    nb.log.push({ t: 'sys', m: `Terrain : ${BIOME[bio].n.toLowerCase()} · ${nb.ph}` }, { m: `Des animaux sauvages surgissent : ${nb.E.map(f => f.s.nom).join(', ')} !` });
    begin(nb);
  };
  const startDuel = (d: Defense) => {
    const t = myTeam(); if (!t.length) return; const bio = BIOMES[Math.floor(Math.random() * 6)];
    const nb = newBattle(t, d.team.filter(x => BYID[x.species_id]).map(x => ({ s: BYID[x.species_id], lvl: x.lvl })), bio, state?.phase || 'jour');
    nb.pvp = d.owner; nb.defRating = d.rating; nb.log.push({ t: 'sys', m: `Duel contre ${d.pseudo || 'un joueur'} · ${BIOME[bio].n.toLowerCase()} · ${nb.ph}` });
    begin(nb);
  };

  // Rejoue les événements du tour un par un : élan, impact, chiffres flottants, barres de vie
  const animate = async (bt: B, v0: View) => {
    let v = v0; const put = (p: Partial<View>) => { v = { ...v, ...p }; if (alive.current) setView(v) };
    const float = (side: Side, txt: string, cls: string) => { const f = { id: ++fid.current, side, txt, cls }; put({ floats: [...v.floats.slice(-5), f] }) };
    const anim = (side: Side, a: Anim) => put({ anim: { ...v.anim, [side]: a } });
    const name = (side: Side) => (side === 'P' ? bt.P[v.pi] : bt.E[v.ei]).s.nom;
    const setHp = (side: Side, i: number, hp: number) => put({ hp: { ...v.hp, [side]: v.hp[side].map((x, j) => (j === i ? hp : x)) } });
    const st = { dealt: 0, taken: 0, ko: 0, best: null as Stats['best'] };
    for (const e of bt.ev || []) {
      if (!alive.current) return st;
      const idx = e.side === 'P' ? v.pi : v.ei; let wait = 420;
      switch (e.k) {
        case 'act': put({ caption: `${name(e.side)} · ${e.nom}`, capCls: `${EFF_CLS[e.eff || 'base']} ${e.side === 'P' ? 'mine' : 'theirs'}` }); anim(e.side, 'lunge'); wait = 380; break;
        case 'hit': {
          setHp(e.side, idx, e.hp!); anim(e.side, 'shake'); float(e.side, `−${e.amt}`, e.adv ? 'crit' : 'dmg');
          if (e.side === 'E') { st.dealt += e.amt!; const n = bt.P[v.pi].s.nom; if (!st.best || e.amt! > st.best.dmg) st.best = { nom: n, dmg: e.amt! } } else { st.taken += e.amt!; buzz(25) }
          wait = 520; break;
        }
        case 'dodge': anim(e.side, 'dodge'); float(e.side, 'Esquive !', 'info'); break;
        case 'heal': setHp(e.side, idx, e.hp!); anim(e.side, 'heal'); float(e.side, `+${e.amt}`, 'heal'); break;
        case 'shield': anim(e.side, 'shield'); float(e.side, e.amt! < 0 ? `${-e.amt!} absorbés` : `Protection ${e.amt}`, 'shield'); break;
        case 'poison': anim(e.side, 'status'); float(e.side, 'Empoisonné', 'poison'); break;
        case 'tick': setHp(e.side, e.i!, e.hp!); float(e.side, `☠ −${e.amt}`, 'poison'); if (e.side === 'E') st.dealt += e.amt!; else st.taken += e.amt!; break;
        case 'stun': anim(e.side, 'status'); float(e.side, 'Étourdi !', 'info'); break;
        case 'buff': case 'debuff': anim(e.side, 'status'); float(e.side, e.nom!, e.k === 'buff' ? 'info' : 'poison'); break;
        case 'skip': put({ caption: `${name(e.side)} est étourdi…`, capCls: 'k-ctl' }); break;
        case 'ko': anim(e.side, 'ko'); put({ caption: `${name(e.side)} est K.O. !`, capCls: e.side === 'E' ? 'k-good' : 'k-bad' }); if (e.side === 'E') st.ko++; buzz(e.side === 'E' ? [20, 30, 40] : 60); wait = 700; break;
        case 'switch': put(e.side === 'P' ? { pi: e.i! } : { ei: e.i! }); anim(e.side, 'enter'); put({ caption: `${e.side === 'P' ? 'Tu envoies' : 'En face :'} ${(e.side === 'P' ? bt.P : bt.E)[e.i!].s.nom}`, capCls: '' }); wait = 520; break;
        case 'fatigue': put({ caption: 'Les animaux fatiguent : les coups font plus mal', capCls: 'k-bad' }); wait = 700; break;
      }
      await sleep(wait * speed.current);
      put({ anim: { P: '', E: '' } });
    }
    put({ ...snapshot(bt), caption: v.caption, capCls: v.capCls, floats: [] });
    return st;
  };

  const turn = async (choice: Parameters<typeof playTurn>[1]) => {
    if (!b || busy || b.over) return; setBusy(true);
    const v0 = view ? { ...snapshot(b), caption: view.caption, capCls: view.capCls } : snapshot(b);
    playTurn(b, choice); force(x => x + 1);
    const st = await animate(b, v0);
    if (!alive.current) return;
    setStats(s => ({ dealt: s.dealt + st.dealt, taken: s.taken + st.taken, ko: s.ko + st.ko, best: !s.best || (st.best && st.best.dmg > s.best.dmg) ? st.best || s.best : s.best, turns: b.round - 1 }));
    setBusy(false);
    if (b.over) {
      setAuto(false);
      if (b.won) { buzz([30, 40, 60]); confetti(arena.current, ['#f0b54a', '#8fbf7f', '#ffffff'], 110, 150) }
      if (b.pvp) { const r = await run(api.recordDuel(b.pvp, !!b.won)); if (r) setResult(`${r.delta >= 0 ? '+' : ''}${r.delta} points de classement${r.gain ? ` · +${r.gain} plumes` : ''}`) }
      else { const r = await run(api.battleReward(!!b.won, b.E.map(f => f.s.id), b.E.map(f => f.lvl))); if (r) setResult(b.won ? (r.gain ? `+${r.gain} plumes${r.bonus ? ' · pellicule bonus !' : ''}` : 'Limite de récompenses du jour atteinte') : 'Fusionne tes doublons pour renforcer ton équipe.') }
      refresh();
    }
  };
  // Combat automatique : l'IA joue pour toi
  useEffect(() => {
    if (!auto || busy || !b || b.over) return;
    const t = setTimeout(() => turn(ai(active(b, 'P'), Math.random)), 350 * speed.current);
    return () => clearTimeout(t);
  });
  const save = async () => { const ids = team.filter(id => bySpecies[id]).map(id => bestCard(bySpecies[id]).id); await run(api.saveDefense(ids)); toast('Équipe de défense enregistrée'); api.defenses().then(setDefs) };

  if (b && view) {
    const P = b.P[view.pi], E = b.E[view.ei], adv = prey(P, E), dis = prey(E, P), ab = abilities(P.s, P.lvl);
    const bio = BIOME[b.biome as keyof typeof BIOME];
    const perks = (f: Fighter) => [f.s.biomes.includes(b.biome as never) && 'Chez lui +15 %', f.s.act === 'N' && b.ph === 'nuit' && 'Nocturne : plus vif', f.s.act === 'D' && b.ph === 'jour' && 'Diurne : plus vif', f.s.act === 'C' && (b.ph === 'aube' || b.ph === 'crépuscule') && 'Crépusculaire : plus vif'].filter(Boolean) as string[];
    return (
      <section className="view battle">
        <div className={`arena2 ph-${b.ph} ${b.over ? 'over' : ''}`} ref={arena} style={{ ['--bio' as string]: bio.c }}>
          <div className="a-top">
            <span className="chip">Tour <b>{b.round}</b></span><span className="chip">{bio.n}</span><span className="chip">{b.ph}</span>
          </div>
          <Combatant f={E} side="E" hp={view.hp.E[view.ei]} anim={view.anim.E} floats={view.floats.filter(x => x.side === 'E')} team={b.E} hps={view.hp.E} cur={view.ei} />
          <div className={`caption ${view.capCls}`} key={view.caption}>{view.caption || (b.pvp ? 'Duel !' : 'À toi de jouer')}</div>
          <Combatant f={P} side="P" hp={view.hp.P[view.pi]} anim={view.anim.P} floats={view.floats.filter(x => x.side === 'P')} team={b.P} hps={view.hp.P} cur={view.pi} />
          {b.over && !busy && <div className="a-end" role="dialog" aria-label="Fin du combat">
            <h2 className={b.won ? 'win' : 'lose'}>{b.won ? 'Victoire' : 'Défaite'}</h2>
            <p className="note">{result || '…'}</p>
            <div className="a-stats">
              <span><b>{stats.dealt}</b>dégâts infligés</span><span><b>{stats.ko}</b>K.O.</span><span><b>{stats.turns}</b>tours</span>
            </div>
            {stats.best && <p className="note">Meilleur coup : <b>{stats.best.nom}</b> ({stats.best.dmg})</p>}
            <div className="row">{!b.pvp && <button className="btn primary" onClick={startWild}>Rejouer</button>}<button className="btn ghost" onClick={() => { setB(null); setView(null) }}>Changer d'équipe</button></div>
          </div>}
        </div>

        {!b.over && <>
          <div className="tags">
            {adv && <span className="tag good">Chaîne alimentaire : ×1,5 pour toi</span>}
            {dis && <span className="tag bad">{E.s.nom} chasse ton animal : ×1,5 contre toi</span>}
            {perks(P).map(x => <span key={x} className="tag">{x}</span>)}
          </div>
          <div className="actions2">
            <button disabled={busy} className="k-atk" onClick={() => turn(null)}>
              <span className="ic">{EFF_ICON.base}</span><b>Attaque</b><small>Gratuite · dégâts simples</small><span className="cost free">0</span></button>
            {ab.map((a: Ability, i) => <button key={i} disabled={busy || a.puissance > P.energy} className={`${EFF_CLS[a.effet]} ${adv && OFFENSIVE.includes(a.effet) ? 'adv' : ''}`} onClick={() => turn(a)}>
              <span className="ic">{EFF_ICON[a.effet]}</span><b>{a.nom}</b><small>{EFF[a.effet]}</small>
              <span className="cost">{Array.from({ length: a.puissance }, (_, k) => <i key={k} className={k < P.energy ? 'on' : ''} />)}</span></button>)}
          </div>
          <div className="row spread ctrl">
            <div className="row">
              <button className={`btn small ${auto ? 'primary' : 'ghost'}`} onClick={() => setAuto(!auto)} aria-pressed={auto}>{auto ? '■ Auto' : '▶ Auto'}</button>
              <button className={`btn small ${fast ? 'primary' : 'ghost'}`} onClick={() => setFast(!fast)} aria-pressed={fast} title="Animations plus rapides">×2</button>
              <button className="btn ghost small" onClick={() => setShowLog(!showLog)} aria-expanded={showLog}>{showLog ? 'Masquer' : 'Journal'}</button>
            </div>
            <button className="btn ghost small" disabled={busy} onClick={() => { setB(null); setView(null); toast('Tu as pris la fuite.') }}>Fuir</button>
          </div>
        </>}
        <p className="note hint">{!b.over && b.P.some((f, i) => f.hp > 0 && i !== view.pi) ? 'Touche un animal de ton équipe pour le faire entrer (coûte ton tour).' : ''}</p>
        {(showLog || b.over) && <div className="log" aria-live="polite">{b.log.slice(-60).map((l, i) => <p key={i} className={`${l.t === 'sys' ? 'sys' : ''}${l.adv ? ' eff' : ''}`}>{l.m}</p>)}</div>}
        <BenchSwitch b={b} hps={view.hp.P} cur={view.pi} disabled={busy || b.over} onPick={i => turn({ sw: i })} />
      </section>
    );
  }

  const myDef = defs.find(d => d.owner === uid); const r = state?.rating || 1000;
  const opp = defs.filter(d => d.owner !== uid).sort((a, c) => Math.abs(a.rating - r) - Math.abs(c.rating - r));
  const chosen = team.filter(id => bySpecies[id]);
  return (
    <section className="view">
      <div className="filters" role="tablist"><button aria-pressed={mode === 'wild'} onClick={() => setMode('wild')}>Animaux sauvages</button><button aria-pressed={mode === 'pvp'} onClick={() => setMode('pvp')}>Autres joueurs</button></div>
      {mode === 'pvp' && challenge && <div className="panel challenge"><p className="eyebrow">Défi</p><h2>Duel contre {challenge.pseudo || 'ton ami'}</h2>
        <p className="note">Son équipe : {challenge.team.map(x => `${BYID[x.species_id]?.nom} niv. ${x.lvl}`).join(', ')}. Choisis tes animaux ci-dessous, puis lance le duel.</p>
        <div className="row"><button className="btn primary" disabled={!team.length} onClick={() => { const d = challenge; setChallenge(null); startDuel(d) }}>{team.length ? 'Lancer le duel' : 'Choisis au moins un animal'}</button><button className="btn ghost" onClick={() => setChallenge(null)}>Annuler</button></div></div>}
      {mode === 'pvp' && <>
        <div className="panel"><div className="row spread"><p className="eyebrow">Ton classement</p><b>{r} points</b></div>
          <p className="note">{state?.duel_w || 0} victoire(s), {state?.duel_l || 0} défaite(s) en attaque.</p>
          <p className="note">Ta défense : {myDef ? myDef.team.map(x => `${BYID[x.species_id]?.nom} niv. ${x.lvl}`).join(', ') : "aucune. Choisis 1 à 3 animaux ci-dessous puis enregistre-les : les autres joueurs pourront les affronter, même quand tu n'es pas là."}</p>
          <button className="btn" disabled={!team.length} onClick={save}>Enregistrer la sélection comme défense</button></div>
        <div className="panel"><p className="eyebrow">Adversaires</p>{opp.length ? opp.map(d => <div key={d.owner} className="row spread line"><span><b>{d.pseudo || 'Joueur anonyme'}</b> · {d.rating} pts<br /><span className="note">{d.team.map(x => `${BYID[x.species_id]?.nom} niv. ${x.lvl}`).join(', ')}</span></span><button className="btn primary" disabled={!team.length} onClick={() => startDuel(d)}>Défier</button></div>) : <p className="note">Aucun autre joueur n'a encore enregistré de défense.</p>}</div>
      </>}

      {owned.length ? <>
        <div className="row spread"><h2>{mode === 'pvp' ? 'Ton équipe' : 'Préparer un combat'}</h2><span className="note">{chosen.length}/3 choisis</span></div>
        <div className="slots">
          {[0, 1, 2].map(i => { const id = chosen[i]; const s = id && BYID[id]; const c = id && bestCard(bySpecies[id]);
            if (!s || !c) return <div key={i} className="slot empty"><span>+</span><small>Choisis un animal</small></div>;
            const t = statsAt(s, c.lvl);
            return <button key={i} className={`slot t${s.tier}`} onClick={() => toggle(id)} aria-label={`Retirer ${s.nom}`}>
              <div className="spr" style={photoStyle(s) || undefined} />
              <div className="slot-b"><b>{s.nom}</b><small>Niv. {c.lvl} · {ARCH[s.arch].n}</small>
                <Bars t={t} /></div><span className="x">×</span></button> })}
        </div>
        <div className="row spread wrap">
          <div className="filters small">{(['force', 'niveau', 'rarete'] as const).map(k => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{k === 'rarete' ? 'Rareté' : k === 'force' ? 'Force' : 'Niveau'}</button>)}</div>
          <button className="btn ghost small" onClick={autoTeam}>Équipe conseillée</button>
        </div>
        <p className="note">Le combat se déroule à l'heure réelle : <b>{state?.phase}</b>. Le milieu est tiré au hasard.</p>
        <div className="grid">{owned.map(({ s, c, pw }) => <button key={s.id} className="cell pick" aria-pressed={team.includes(s.id)} onClick={() => toggle(s.id)}><Print s={s} q={c.q} lvl={c.lvl} phase={c.phase} foot={<span className="copies">{ARCH[s.arch].n} · {pw}</span>} /></button>)}</div>
        {mode === 'wild' && <div className="shootbar"><button className="btn primary big" disabled={!team.length} onClick={startWild}>Lancer le combat</button></div>}
      </> : <div className="panel"><h2>Il te faut des animaux</h2><p className="note">Pars en safari pour photographier tes premiers combattants.</p><button className="btn primary" onClick={() => go('safari')}>Partir en safari</button></div>}
      <details className="panel rules"><summary>Règles du combat</summary>
        <p><b>Énergie.</b> +1 par tour (max 5). L'attaque de base est gratuite, les capacités coûtent de l'énergie (points orange).</p>
        <p><b>Vitesse.</b> Le plus rapide agit en premier. Une embuscade est terrible en premier, faible en second.</p>
        <p><b>Terrain.</b> Un animal dans son milieu gagne +15 % en attaque et défense.</p>
        <p><b>Heure réelle.</b> La nuit, les nocturnes gagnent +30 % de vitesse et +10 % d'attaque, les diurnes ralentissent. Le jour, l'inverse.</p>
        <p><b>Chaîne alimentaire.</b> Un prédateur ou un opportuniste inflige ×1,5 à ses proies naturelles.</p>
        <p><b>Niveaux.</b> +10 % de stats par niveau. 3ᵉ capacité au niveau 3, capacité spéciale au niveau 5.</p>
        <p><b>Fatigue.</b> Après 15 tours, les coups font de plus en plus mal. Au 40ᵉ tour, victoire aux points.</p>
        <p><b>Auto.</b> Le bouton « Auto » laisse l'IA jouer pour toi ; « ×2 » accélère les animations.</p></details>
    </section>
  );
}

function Bars({ t }: { t: { pv: number; att: number; def: number; vit: number } }) {
  const row = (k: string, v: number, max: number) => <span className="sb"><i>{k}</i><em><u style={{ width: `${Math.min(100, (100 * v) / max)}%` }} /></em></span>;
  return <span className="sbars">{row('PV', t.pv, 160)}{row('ATT', t.att, 40)}{row('DEF', t.def, 40)}{row('VIT', t.vit, 28)}</span>;
}

function Combatant({ f, side, hp, anim, floats, team, hps, cur }: { f: Fighter; side: Side; hp: number; anim: Anim; floats: Float[]; team: Fighter[]; hps: number[]; cur: number }) {
  const pct = Math.max(0, Math.round((100 * hp) / f.maxHp)); const s = f.s;
  const st: [string, string][] = []; if (f.poison) st.push(['☠', 'Poison']); if (f.shield) st.push(['⛨', String(f.shield)]); if (f.dodge) st.push(['↯', 'Esquive']); if (f.stun) st.push(['✷', 'Étourdi']); if (f.attMod < 1) st.push(['▼', 'Att.']); if (f.vitMod > 1) st.push(['»', 'Vit.']);
  return (
    <div className={`cmb ${side} ${hp <= 0 ? 'ko' : ''}`}>
      <div className={`portrait t${s.tier} a-${anim}`} key={s.id}>
        <div className="spr" role="img" aria-label={s.nom} style={photoStyle(s) || undefined} />
        {floats.map(x => <span key={x.id} className={`float ${x.cls}`}>{x.txt}</span>)}
      </div>
      <div className="plate">
        <div className="pn"><b>{s.nom}</b><span className="lvl">Niv. {f.lvl}</span></div>
        <div className="hp2"><i className={pct < 30 ? 'low' : pct < 60 ? 'mid' : ''} style={{ width: `${pct}%` }} /></div>
        <div className="pm"><span>{hp}/{f.maxHp}</span><span className="pips">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= f.energy ? 'on' : ''} />)}</span></div>
        <div className="pm"><span className={`tierdot t${s.tier}`}>{TIERS[s.tier]}</span><span>{ARCH[s.arch].n}</span><span>{ACT[s.act]}</span></div>
        {st.length > 0 && <div className="status">{st.map(([i, t]) => <span key={t}>{i} {t}</span>)}</div>}
        {team.length > 1 && <div className="dots" aria-label="Équipe">{team.map((x, i) => <i key={i} className={hps[i] <= 0 ? 'ko' : i === cur ? 'cur' : ''} />)}</div>}
      </div>
    </div>
  );
}

function BenchSwitch({ b, hps, cur, disabled, onPick }: { b: B; hps: number[]; cur: number; disabled: boolean; onPick: (i: number) => void }) {
  if (b.P.length < 2) return null;
  return (
    <div className="bench2" role="group" aria-label="Ton équipe">
      {b.P.map((f, i) => { const pct = Math.max(0, Math.round((100 * hps[i]) / f.maxHp)); const can = !disabled && hps[i] > 0 && i !== cur;
        return <button key={i} className={`bm ${i === cur ? 'cur' : ''} ${hps[i] <= 0 ? 'ko' : ''}`} disabled={!can} onClick={() => onPick(i)} aria-label={`${f.s.nom}, ${hps[i]} PV${can ? ', faire entrer' : ''}`}>
          <span className="spr" style={photoStyle(f.s) || undefined} /><span className="bn">{f.s.nom.split(' ')[0]}</span><span className="bh"><u style={{ width: `${pct}%` }} /></span>
        </button> })}
    </div>
  );
}
