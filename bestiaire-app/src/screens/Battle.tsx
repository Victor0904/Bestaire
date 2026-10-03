// Onglet Combat : Aventure (carte), combats sauvages, Arène contre les défenses des autres joueurs.
import { useCallback, useEffect, useState } from 'react';
import { BIOME, BIOMES, BYID, FRANCE } from '../game/species';
import { Battle as B, newBattle, wildFoes } from '../game/combat';
import { api, Defense } from '../lib/api';
import { useGame } from '../lib/store';
import { GI } from '../components/GI';
import { TeamPicker, enMembres, useEquipe, useEquipeInitiale } from '../components/TeamPicker';
import { Adventure } from './Adventure';
import { Arena, Fin } from './Arena';

type Mode = 'aventure' | 'sauvage' | 'arene';
const RANGS: [number, string][] = [[1400, 'Légende'], [1250, 'Diamant'], [1150, 'Or'], [1050, 'Argent'], [0, 'Bronze']];
export const rangArene = (r: number) => RANGS.find(([m]) => r >= m)![1];

export function Battle() {
  const { state, refresh, refreshCards, run, toast, uid, go, bySpecies, challenge, setChallenge } = useGame();
  const [mode, setMode] = useState<Mode>(() => (challenge ? 'arene' : 'aventure'));
  const [team, setTeam] = useEquipeInitiale();
  const [fight, setFight] = useState<{ b: B; id: number } | null>(null);
  const [advFight, setAdvFight] = useState(false);
  const [defs, setDefs] = useState<Defense[]>([]);
  const equipe = useEquipe(team);
  useEffect(() => { if (mode === 'arene') api.defenses().then(setDefs).catch(() => {}) }, [mode]);
  useEffect(() => { if (challenge) setMode('arene') }, [challenge]);
  const onAdvFight = useCallback((on: boolean) => setAdvFight(on), []);

  const startWild = () => {
    if (!equipe.length) return;
    const lvl = Math.round(equipe.reduce((a, x) => a + x.c.lvl, 0) / equipe.length), niv = Math.round(equipe.reduce((a, x) => a + x.niv, 0) / equipe.length);
    const bio = BIOMES[Math.floor(Math.random() * 6)];
    const nb = newBattle(enMembres(equipe), wildFoes(FRANCE.filter(s => s.biomes.includes(bio)), equipe.length, lvl, team, Math.random, niv), bio, state?.phase || 'jour');
    nb.log.push({ t: 'sys', m: `Terrain : ${BIOME[bio].n.toLowerCase()} · ${nb.ph}` }, { m: `Des animaux sauvages surgissent : ${nb.E.map(f => f.s.nom).join(', ')} !` });
    setFight({ b: nb, id: Date.now() }); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const startDuel = (d: Defense) => {
    if (!equipe.length) return; const bio = BIOMES[Math.floor(Math.random() * 6)];
    const nb = newBattle(enMembres(equipe), d.team.filter(x => BYID[x.species_id]).map(x => ({ s: BYID[x.species_id], lvl: x.lvl, niv: x.niv || 1 })), bio, state?.phase || 'jour');
    nb.pvp = d.owner; nb.defRating = d.rating; nb.log.push({ t: 'sys', m: `Duel contre ${d.pseudo || 'un joueur'} · ${BIOME[bio].n.toLowerCase()} · ${nb.ph}` });
    setFight({ b: nb, id: Date.now() }); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (fight) {
    const { b } = fight;
    const onFin = async (bt: B): Promise<Fin> => {
      const ids = equipe.map(x => x.c.id); const l: string[] = [];
      const xp = await api.battleXp(ids, !!bt.won).catch(() => null);
      if (bt.pvp) { const r = await run(api.recordDuel(bt.pvp, !!bt.won)); if (r) l.push(`${r.delta >= 0 ? '+' : ''}${r.delta} points de classement${r.gain ? ` · +${r.gain} plumes` : ''} · ${rangArene(r.rating)}`) }
      else { const r = await run(api.battleReward(!!bt.won, bt.E.map(f => f.s.id), bt.E.map(f => f.lvl))); if (r) l.push(bt.won ? (r.gain ? `+${r.gain} plumes${r.bonus ? ' · pellicule bonus !' : ''}` : 'Limite de récompenses du jour atteinte') : 'Entraîne-toi dans l’Aventure pour gagner des niveaux.') }
      refresh(); refreshCards();
      return { lignes: l, xp, equipe: equipe.map(x => ({ id: x.c.id, s: x.s, rang: x.c.lvl, xp: x.c.xp || 0 })), suite: bt.pvp ? undefined : { label: 'Rejouer', go: startWild } };
    };
    return <Arena key={fight.id} b={b} titre={b.pvp ? 'Arène' : 'Sauvage'} onFin={onFin} onQuit={() => { if (!b.over) toast('Tu as pris la fuite.'); setFight(null) }} />;
  }

  const r = state?.rating || 1000; const myDef = defs.find(d => d.owner === uid);
  const opp = defs.filter(d => d.owner !== uid).sort((a, c) => Math.abs(a.rating - r) - Math.abs(c.rating - r));
  const save = async () => { const ids = equipe.map(x => x.c.id); await run(api.saveDefense(ids)); toast('Équipe de défense enregistrée'); api.defenses().then(setDefs) };
  const desc = (d: Defense) => d.team.map(x => `${BYID[x.species_id]?.nom || '?'} niv. ${x.niv || 1}`).join(', ');
  return (
    <section className="view">
      {!advFight && <div className="modes" role="tablist">
        {([['aventure', 'Aventure', 'aventure'], ['sauvage', 'Sauvage', 'sauvage'], ['arene', 'Arène', 'arene']] as const).map(([k, t, ic]) =>
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}><GI n={ic} /><span>{t}</span></button>)}
      </div>}
      {mode === 'aventure' && <Adventure onFight={onAdvFight} />}
      {mode === 'sauvage' && (Object.keys(bySpecies).length ? <>
        <div className="panel intro-mode"><GI n="sauvage" className="big-ic" /><div><h2>Combat sauvage</h2><p className="note">Des animaux du milieu tiré au sort, à ton niveau, à l'heure réelle (<b>{state?.phase}</b>). Plumes et expérience à la clé.</p></div></div>
        <TeamPicker team={team} setTeam={setTeam} />
        <div className="shootbar"><button className="btn primary big" disabled={!equipe.length} onClick={startWild}><GI n="combat" /> Lancer le combat</button></div>
      </> : <NeedAnimals go={() => go('safari')} />)}
      {mode === 'arene' && <>
        {challenge && <div className="panel challenge"><p className="eyebrow">Défi</p><h2>Duel contre {challenge.pseudo || 'ton ami'}</h2>
          <p className="note">Son équipe : {desc(challenge)}. Choisis tes animaux ci-dessous, puis lance le duel.</p>
          <div className="row"><button className="btn primary" disabled={!equipe.length} onClick={() => { const d = challenge; setChallenge(null); startDuel(d) }}>{equipe.length ? 'Lancer le duel' : 'Choisis au moins un animal'}</button><button className="btn ghost" onClick={() => setChallenge(null)}>Annuler</button></div></div>}
        <div className="panel rank"><GI n="arene" className="big-ic" /><div><p className="eyebrow">Ton rang</p><h2>{rangArene(r)} <small>{r} pts</small></h2>
          <p className="note">{state?.duel_w || 0} victoire(s), {state?.duel_l || 0} défaite(s) en attaque.</p></div></div>
        <div className="panel"><p className="eyebrow">Ta défense</p>
          <p className="note">{myDef ? desc(myDef) : "Aucune. Choisis 1 à 3 animaux ci-dessous puis enregistre-les : les autres joueurs pourront les affronter, même quand tu n'es pas là."}</p>
          <button className="btn" disabled={!equipe.length} onClick={save}>Enregistrer mon équipe comme défense</button></div>
        <div className="panel"><p className="eyebrow">Adversaires de ton niveau</p>{opp.length ? opp.slice(0, 20).map(d => <div key={d.owner} className="row spread line opp"><span><b>{d.pseudo || 'Joueur anonyme'}</b> · {rangArene(d.rating)} · {d.rating} pts<br /><span className="note">{desc(d)}</span></span><button className="btn primary" disabled={!equipe.length} onClick={() => startDuel(d)}>Défier</button></div>) : <p className="note">Aucun autre joueur n'a encore enregistré de défense.</p>}</div>
        {Object.keys(bySpecies).length ? <TeamPicker team={team} setTeam={setTeam} /> : <NeedAnimals go={() => go('safari')} />}
      </>}
      {!advFight && <details className="panel rules"><summary>Règles du combat</summary>
        <p><b>Énergie.</b> +1 par tour (max 5). L'attaque de base est gratuite, les capacités coûtent de l'énergie.</p>
        <p><b>Instinct sauvage.</b> Dès le niveau 3, la jauge dorée se remplit quand ton animal frappe ou encaisse. Pleine, elle libère un coup ultime propre à sa classe (mammifère, oiseau, reptile…).</p>
        <p><b>Niveaux et rang.</b> Les combats donnent de l'expérience : +3,5 % de stats par niveau, 3ᵉ capacité au niveau 5, capacité spéciale au niveau 12. Le rang (étoiles, par fusion) fixe le niveau maximum : 10 à ★, 15 à ★★… 40 à ★★★★★★★.</p>
        <p><b>Vitesse.</b> Le plus rapide agit en premier. Une embuscade est terrible en premier, faible en second.</p>
        <p><b>Terrain et heure.</b> Dans son milieu : +15 % en attaque et défense. La nuit, les nocturnes sont plus vifs ; le jour, les diurnes.</p>
        <p><b>Chaîne alimentaire.</b> Un prédateur ou un opportuniste inflige ×1,5 à ses proies naturelles.</p>
        <p><b>Fatigue.</b> Après 15 tours, les coups font de plus en plus mal. Au 40ᵉ tour, victoire aux points.</p>
        <p><b>Aventure.</b> ★ gagner, ★★ sans perdre d'animal, ★★★ en peu de tours. Chaque boss vaincu ouvre le chapitre suivant et donne une pellicule.</p></details>}
    </section>
  );
}

function NeedAnimals({ go }: { go: () => void }) {
  return <div className="panel"><h2>Il te faut des animaux</h2><p className="note">Pars en safari pour photographier tes premiers combattants.</p><button className="btn primary" onClick={go}>Partir en safari</button></div>;
}
