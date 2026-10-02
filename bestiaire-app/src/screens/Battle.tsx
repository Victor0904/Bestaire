import { useEffect, useRef, useState } from 'react';
import { ACT, BIOME, BIOMES, BYID, FRANCE, Species } from '../game/species';
import { ARCH, Battle as B, EFF, Fighter, abilities, active, newBattle, playTurn, prey, wildFoes } from '../game/combat';
import { api, Defense } from '../lib/api';
import { bestCard, useGame } from '../lib/store';
import { buzz, confetti } from '../lib/fx';
import { Print, Sheet } from '../components/ui';

export function Battle() {
  const { bySpecies, state, refresh, run, toast, uid, go } = useGame();
  const [mode, setMode] = useState<'wild' | 'pvp'>('wild');
  const [team, setTeam] = useState<string[]>([]);
  const [b, setB] = useState<B | null>(null); const [, force] = useState(0);
  const [result, setResult] = useState<string>('');
  const [defs, setDefs] = useState<Defense[]>([]);
  const [sw, setSw] = useState(false);
  const arena = useRef<HTMLDivElement>(null); const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mode === 'pvp') api.defenses().then(setDefs).catch(() => {}) }, [mode]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight });
  const owned = Object.keys(bySpecies).map(id => ({ s: BYID[id], c: bestCard(bySpecies[id]) })).filter(x => x.s).sort((a, c) => c.c.lvl - a.c.lvl || c.s.tier - a.s.tier);
  const myTeam = () => team.filter(id => bySpecies[id]).map(id => ({ s: BYID[id], lvl: bestCard(bySpecies[id]).lvl }));
  const startWild = () => {
    const t = myTeam(); if (!t.length) return; const avg = Math.round(t.reduce((a, x) => a + x.lvl, 0) / t.length);
    const bio = BIOMES[Math.floor(Math.random() * 6)];
    const nb = newBattle(t, wildFoes(FRANCE.filter(s => s.biomes.includes(bio)), t.length, avg, team), bio, state?.phase || 'jour');
    nb.log.push({ t: 'sys', m: `Terrain : ${BIOME[bio].n.toLowerCase()} · ${nb.ph}` }, { m: `Des animaux sauvages surgissent : ${nb.E.map(f => f.s.nom).join(', ')} !` });
    setResult(''); setB(nb);
  };
  const startDuel = (d: Defense) => {
    const t = myTeam(); if (!t.length) return; const bio = BIOMES[Math.floor(Math.random() * 6)];
    const nb = newBattle(t, d.team.filter(x => BYID[x.species_id]).map(x => ({ s: BYID[x.species_id], lvl: x.lvl })), bio, state?.phase || 'jour');
    nb.pvp = d.owner; nb.defRating = d.rating; nb.log.push({ t: 'sys', m: `Duel contre ${d.pseudo || 'un joueur'} · ${BIOME[bio].n.toLowerCase()} · ${nb.ph}` });
    setResult(''); setB(nb);
  };
  const turn = async (choice: Parameters<typeof playTurn>[1]) => {
    if (!b) return; playTurn(b, choice); force(x => x + 1);
    if (b.over) {
      if (b.won) { buzz([30, 40, 60]); confetti(arena.current, ['#f0b54a', '#8fbf7f', '#ffffff'], 90) }
      if (b.pvp) { const r = await run(api.recordDuel(b.pvp, !!b.won)); if (r) setResult(`${r.delta >= 0 ? '+' : ''}${r.delta} points de classement${r.gain ? ` · +${r.gain} plumes` : ''}`) }
      else { const r = await run(api.battleReward(!!b.won, b.E.map(f => f.s.id), b.E.map(f => f.lvl))); if (r) setResult(b.won ? (r.gain ? `+${r.gain} plumes${r.bonus ? ' · pellicule bonus' : ''}` : 'Victoire ! (limite de récompenses du jour atteinte)') : 'Fusionne tes doublons pour renforcer ton équipe.') }
      refresh();
    }
  };
  const save = async () => { const ids = team.filter(id => bySpecies[id]).map(id => bestCard(bySpecies[id]).id); await run(api.saveDefense(ids)); toast('Équipe de défense enregistrée'); api.defenses().then(setDefs) };

  if (b) {
    const P = active(b, 'P'), E = active(b, 'E'), adv = prey(P, E), dis = prey(E, P), ab = abilities(P.s, P.lvl);
    return (
      <section className="view">
        <div className="arena" ref={arena} style={{ position: 'relative' }}>
          <div className="env"><span>Tour <b>{b.round}</b></span><span>Terrain <b>{BIOME[b.biome as keyof typeof BIOME].n}</b></span><span><b>{b.ph}</b></span></div>
          <FighterRow f={E} b={b} side="E" /><div className="vs">VS</div><FighterRow f={P} b={b} side="P" />
          {!b.over && <><div className="actions">
            <button onClick={() => turn(null)}><b>Attaque</b><small>Gratuite</small></button>
            {ab.map((a, i) => <button key={i} disabled={a.puissance > P.energy} className={adv && ['frappe', 'nuee', 'poison', 'etourdir', 'embuscade'].includes(a.effet) ? 'adv' : ''} onClick={() => turn(a)}><b>{a.nom}</b><small>{a.puissance} énergie · {EFF[a.effet]}</small></button>)}
            {b.P.some(f => f.hp > 0 && f !== P) && <button onClick={() => setSw(true)}><b>Changer</b><small>Coûte ton tour</small></button>}
          </div>
            {adv ? <p className="note">Ton {P.s.nom.toLowerCase()} chasse ce type de proie : ses attaques font ×1,5.</p> : dis ? <p className="note" style={{ color: 'var(--danger)' }}>Attention : {E.s.nom.toLowerCase()} est un prédateur pour ton animal.</p> : null}</>}
        </div>
        {b.over && <div className="panel"><h2>{b.won ? 'Victoire' : 'Défaite'}</h2><p className="note">{result || '…'}</p><div className="row">{!b.pvp && <button className="btn primary" onClick={startWild}>Rejouer</button>}<button className="btn ghost" onClick={() => setB(null)}>Changer d'équipe</button></div></div>}
        <div className="log" ref={logRef} aria-live="polite">{b.log.slice(-40).map((l, i) => <p key={i} className={`${l.t === 'sys' ? 'sys' : ''}${l.adv ? ' eff' : ''}`}>{l.m}</p>)}</div>
        {!b.over && <button className="btn ghost" onClick={() => { setB(null); toast('Tu as pris la fuite.') }}>Fuir</button>}
        {sw && <Sheet onClose={() => setSw(false)} label="Changer d'animal"><h2>Qui envoyer ?</h2>{b.P.map((f, i) => f.hp > 0 && i !== b.pi ? <button key={i} className="btn ghost" onClick={() => { setSw(false); turn({ sw: i }) }}>{f.s.nom} · {f.hp}/{f.maxHp} PV</button> : null)}<button className="btn" onClick={() => setSw(false)}>Annuler</button></Sheet>}
      </section>
    );
  }
  const myDef = defs.find(d => d.owner === uid); const r = state?.rating || 1000;
  const opp = defs.filter(d => d.owner !== uid).sort((a, c) => Math.abs(a.rating - r) - Math.abs(c.rating - r));
  return (
    <section className="view">
      <div className="filters" role="tablist"><button aria-pressed={mode === 'wild'} onClick={() => setMode('wild')}>Animaux sauvages</button><button aria-pressed={mode === 'pvp'} onClick={() => setMode('pvp')}>Autres joueurs</button></div>
      {mode === 'pvp' && <>
        <div className="panel"><div className="row spread"><p className="eyebrow">Ton classement</p><b>{r} points</b></div>
          <p className="note">{state?.duel_w || 0} victoire(s), {state?.duel_l || 0} défaite(s) en attaque.</p>
          <p className="note">Ta défense : {myDef ? myDef.team.map(x => `${BYID[x.species_id]?.nom} niv. ${x.lvl}`).join(', ') : "aucune. Choisis 1 à 3 animaux ci-dessous puis enregistre-les : les autres joueurs pourront les affronter, même quand tu n'es pas là."}</p>
          <button className="btn" disabled={!team.length} onClick={save}>Enregistrer la sélection comme défense</button></div>
        <div className="panel"><p className="eyebrow">Adversaires</p>{opp.length ? opp.map(d => <div key={d.owner} className="row spread line"><span><b>{d.pseudo || 'Joueur anonyme'}</b> · {d.rating} pts<br /><span className="note">{d.team.map(x => `${BYID[x.species_id]?.nom} niv. ${x.lvl}`).join(', ')}</span></span><button className="btn primary" disabled={!team.length} onClick={() => startDuel(d)}>Défier</button></div>) : <p className="note">Aucun autre joueur n'a encore enregistré de défense.</p>}</div>
      </>}
      <div className="row spread"><h2>{mode === 'pvp' ? 'Ton équipe' : 'Préparer un combat'}</h2><span className="note">{team.length}/3 choisis</span></div>
      {owned.length ? <>
        <p className="note">Choisis jusqu'à 3 animaux (ta meilleure photo de chaque espèce). Le combat se déroule à l'heure réelle : <b>{state?.phase}</b>.</p>
        <div className="grid">{owned.map(({ s, c }) => <button key={s.id} className="cell pick" aria-pressed={team.includes(s.id)} onClick={() => setTeam(team.includes(s.id) ? team.filter(x => x !== s.id) : team.length < 3 ? [...team, s.id] : team)}><Print s={s} q={c.q} lvl={c.lvl} phase={c.phase} foot={<span className="copies">{ARCH[s.arch].n}</span>} /></button>)}</div>
        {mode === 'wild' && <div className="shootbar"><button className="btn primary big" disabled={!team.length} onClick={startWild}>Lancer le combat</button></div>}
      </> : <div className="panel"><h2>Il te faut des animaux</h2><p className="note">Pars en safari pour photographier tes premiers combattants.</p><button className="btn primary" onClick={() => go('safari')}>Partir en safari</button></div>}
      <details className="panel rules"><summary>Règles du combat</summary>
        <p><b>Énergie.</b> +1 par tour (max 5). L'attaque de base est gratuite, les capacités coûtent leur puissance.</p>
        <p><b>Vitesse.</b> Le plus rapide agit en premier. Une embuscade est terrible en premier, faible en second.</p>
        <p><b>Terrain.</b> Un animal dans son milieu gagne +15 % en attaque et défense.</p>
        <p><b>Heure réelle.</b> La nuit, les nocturnes gagnent +30 % de vitesse et +10 % d'attaque, les diurnes ralentissent. Le jour, l'inverse.</p>
        <p><b>Chaîne alimentaire.</b> Un prédateur ou un opportuniste inflige ×1,5 à ses proies naturelles.</p>
        <p><b>Niveaux.</b> +10 % de stats par niveau. 3ᵉ capacité au niveau 3, capacité spéciale au niveau 5.</p></details>
    </section>
  );
}

function FighterRow({ f, b, side }: { f: Fighter; b: B; side: 'P' | 'E' }) {
  const pct = Math.round(100 * f.hp / f.maxHp); const fx = b.fx?.[side] || 0;
  const st: string[] = []; if (f.poison) st.push('empoisonné'); if (f.shield) st.push('protégé ' + f.shield); if (f.dodge) st.push('esquive'); if (f.stun) st.push('étourdi'); if (f.attMod < 1) st.push('att. affaiblie');
  const s: Species = f.s; const ph = s.photo;
  return (
    <div className={`fighter ${f.hp <= 0 ? 'ko' : ''} ${fx ? 'hit' : ''}`} key={b.round + side}>
      {fx > 0 && <span className="dmg">−{fx}</span>}
      <div className="fart">{ph && <div className="spr" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}planches/p${String(ph[0]).padStart(2, '0')}.webp)`, backgroundPosition: `${(ph[1] % 5) * 25}% ${(Math.floor(ph[1] / 5) * 100 / 7).toFixed(3)}%` }} />}</div>
      <div style={{ minWidth: 0 }}>
        <div className="fname"><span>{s.nom}</span><span className="lvl">Niv. {f.lvl}</span></div>
        <div className="hp"><i className={pct < 35 ? 'low' : ''} style={{ width: `${pct}%` }} /></div>
        <div className="meta"><span>{f.hp}/{f.maxHp} PV</span><span>{ARCH[s.arch].n}</span><span>{ACT[s.act]}</span>{s.biomes.includes(b.biome as never) && <span>chez lui</span>}<span className="pips">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= f.energy ? 'on' : ''} />)}</span>{st.map(x => <span key={x}>{x}</span>)}</div>
        {b[side].length > 1 && <div className="bench">{b[side].map((x, i) => <span key={i} className={x.hp <= 0 ? 'ko' : ''}>{x.s.nom.split(' ')[0]}</span>)}</div>}
      </div>
    </div>
  );
}
