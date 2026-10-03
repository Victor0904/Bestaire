// Mode Aventure : carte routière par chapitres, préparation d'étape, combat, étoiles et récompenses.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BIOME, photoRond } from '../game/species';
import { newBattle, Battle as B } from '../game/combat';
import { CHAPITRES, ETAPES_PAR_CHAPITRE, Etape, NB_ETAPES, BONUS_3_ETOILES, etape, etoilesGagnees, nomEtape } from '../game/adventure';
import { api } from '../lib/api';
import { useGame } from '../lib/store';
import { sfx } from '../lib/sfx';
import { Sheet } from '../components/ui';
import { GI } from '../components/GI';
import { TeamPicker, enMembres, useEquipe, useEquipeInitiale } from '../components/TeamPicker';
import { Arena, BIOME_GI, Fin } from './Arena';
import { Decor } from '../components/Decor';

export function Adventure({ onFight }: { onFight: (on: boolean) => void }) {
  const { refresh, refreshCards, run, go, bySpecies } = useGame();
  const [adv, setAdv] = useState<Record<string, number> | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [team, setTeam] = useEquipeInitiale();
  const [fight, setFight] = useState<{ e: Etape; b: B; id: number } | null>(null);
  const cur = useRef<HTMLButtonElement>(null);
  const equipe = useEquipe(team);
  useEffect(() => { api.adventureState().then(r => setAdv(r.adv || {})).catch(() => setAdv({})) }, []);
  useEffect(() => { onFight(!!fight) }, [fight, onFight]);
  const prochaine = adv ? Math.min(NB_ETAPES - 1, Object.keys(adv).length) : 0;
  useEffect(() => { if (adv && !fight) setTimeout(() => cur.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120) }, [adv, fight]);
  const etapes = useMemo(() => Array.from({ length: NB_ETAPES }, (_, g) => etape(g)), []);

  if (!Object.keys(bySpecies).length) return <div className="panel"><h2>Il te faut des animaux</h2><p className="note">Pars en safari pour photographier tes premiers combattants, puis reviens commencer l'aventure.</p><button className="btn primary" onClick={() => go('safari')}>Partir en safari</button></div>;
  if (!adv) return <div className="panel"><p className="note">Chargement de la carte…</p></div>;

  const lancer = (e: Etape) => {
    if (!equipe.length) return;
    const b = newBattle(enMembres(equipe), e.foes, e.biome, e.ph);
    b.log.push({ t: 'sys', m: `${e.chap.nom} · ${nomEtape(e)} · ${BIOME[e.biome].n.toLowerCase()} · ${e.ph}` });
    setSel(null); setFight({ e, b, id: Date.now() }); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (fight) {
    const { e, b } = fight;
    const onFin = async (bt: B, st: { koEquipe: number; turns: number }): Promise<Fin> => {
      const stars = etoilesGagnees(!!bt.won, st.koEquipe, st.turns, e.toursMax);
      const r = await run(api.adventureWin(e.g, !!bt.won, stars, equipe.map(x => x.c.id)));
      refresh(); refreshCards();
      if (!r) return { lignes: ['Résultat non enregistré.'] };
      setAdv(r.adv);
      const l: string[] = [];
      if (bt.won) {
        if (r.first) l.push(`Étape terminée : +${r.plumes} plumes${r.film ? ' et 1 pellicule' : ''} !`);
        else l.push(r.plumes ? `3 étoiles : +${r.plumes} plumes de bonus` : 'Étape déjà terminée : seulement de l’expérience.');
        if (stars < 3) l.push(stars < 2 ? 'Objectif ★★ : finis sans perdre aucun animal.' : `Objectif ★★★ : gagne en ${e.toursMax} tours maximum.`);
      } else l.push('Entraîne ton équipe (combats, fusions) ou change de stratégie, puis reviens !');
      const suiv = e.g + 1 < NB_ETAPES && bt.won ? e.g + 1 : null;
      return {
        titre: bt.won ? (e.genre === 'boss' ? 'Boss vaincu !' : 'Victoire') : 'Défaite', etoiles: bt.won ? stars : undefined, lignes: l, xp: r.xp,
        equipe: equipe.map(x => ({ id: x.c.id, s: x.s, rang: x.c.lvl, xp: x.c.xp || 0 })),
        suite: suiv !== null ? { label: 'Étape suivante', go: () => { setFight(null); setSel(suiv) } } : { label: 'Rejouer', go: () => lancer(e) },
      };
    };
    return <Arena key={fight.id} b={b} titre={nomEtape(e)} toursMax={e.toursMax} onFin={onFin} onQuit={() => setFight(null)} />;
  }

  const totalEt = Object.values(adv).reduce((a, x) => a + x, 0);
  return (
    <div className="adv">
      <div className="adv-head">
        <div><p className="eyebrow">Ta progression</p><h2>Étape {Math.min(NB_ETAPES, prochaine + 1)} / {NB_ETAPES}</h2></div>
        <span className="adv-tot"><GI n="etoile" />{totalEt}<small>/{NB_ETAPES * 3}</small></span>
      </div>
      {CHAPITRES.map((ch, ci) => {
        const g0 = ci * ETAPES_PAR_CHAPITRE, ouvert = g0 <= prochaine;
        const et = etapes.slice(g0, g0 + ETAPES_PAR_CHAPITRE).reduce((a, e) => a + (adv[e.g] || 0), 0);
        return (
          <section key={ch.n} className={`chap b-${ch.biome} ${ouvert ? '' : 'ferme'}`}>
            <div className="chap-bg"><Decor biome={ch.biome} ph={ch.biome === 'V' ? 'nuit' : ch.ph[9]} /></div>
            <header className="chap-h"><GI n={BIOME_GI[ch.biome]} className="chap-ic" /><div><small>Chapitre {ch.n} · {BIOME[ch.biome].n}</small><b>{ch.nom}</b></div><span className="chap-et"><GI n="etoile" />{et}/30</span></header>
            {ouvert ? <p className="chap-intro">{ch.intro}</p> : <p className="chap-intro"><GI n="cadenas" /> Bats le boss du chapitre {ch.n - 1} pour ouvrir ce chapitre.</p>}
            {ouvert && <div className="route">
              <svg className="chemin" viewBox="0 0 100 1000" preserveAspectRatio="none" aria-hidden="true"><path d={chemin()} /></svg>
              {etapes.slice(g0, g0 + ETAPES_PAR_CHAPITRE).map((e, k) => {
                const fait = adv[e.g] || 0, dispo = e.g <= prochaine, ici = e.g === prochaine && !fait;
                const x = 50 + 30 * Math.sin((k + 0.5) * 1.1);
                return <button key={e.g} ref={ici ? cur : undefined} className={`node ${e.genre} ${fait ? 'fait' : ''} ${ici ? 'ici' : ''}`} disabled={!dispo} style={{ left: `${x}%`, top: `${k * 10 + 5}%` }}
                  onClick={() => { sfx.tap(); setSel(e.g) }} aria-label={`${nomEtape(e)}${fait ? `, ${fait} étoile(s)` : dispo ? ', disponible' : ', verrouillée'}`}>
                  {e.genre === 'boss' ? <span className="nb-spr" style={photoRond(e.foes[e.foes.length - 1].s) || undefined} /> : null}
                  <span className="nb">{!dispo ? <GI n="cadenas" /> : e.genre === 'boss' ? <GI n="boss" /> : e.genre === 'elite' ? <GI n="elite" /> : e.k}</span>
                  {fait > 0 && <span className="nst">{[1, 2, 3].map(i => <GI key={i} n="etoile" className={i <= fait ? 'on' : ''} />)}</span>}
                  {ici && equipe[0] && <span className="moi" style={photoRond(equipe[0].s) || undefined} />}
                </button>;
              })}
            </div>}
          </section>
        );
      })}
      {sel !== null && <Prep e={etapes[sel]} etoiles={adv[sel] || 0} team={team} setTeam={setTeam} onGo={lancer} onClose={() => setSel(null)} />}
    </div>
  );
}

function chemin() {
  let d = ''; for (let k = 0; k < 10; k++) { const x = 50 + 30 * Math.sin((k + 0.5) * 1.1), y = k * 100 + 50; d += k ? ` S${(x + (50 + 30 * Math.sin((k - 0.5) * 1.1))) / 2} ${y - 50} ${x} ${y}` : `M${x} ${y}` }
  return d;
}

function Prep({ e, etoiles, team, setTeam, onGo, onClose }: { e: Etape; etoiles: number; team: string[]; setTeam: (t: string[]) => void; onGo: (e: Etape) => void; onClose: () => void }) {
  const equipe = useEquipe(team);
  const obj = [['Gagner le combat', 1], ['Aucun animal K.O. dans ton équipe', 2], [`Gagner en ${e.toursMax} tours maximum`, 3]] as const;
  return (
    <Sheet onClose={onClose} label={nomEtape(e)}>
      <div className={`prep b-${e.biome}`}>
        <p className="eyebrow">Chapitre {e.chap.n} · {BIOME[e.biome].n} · {e.ph}</p>
        <h2>{nomEtape(e)}</h2>
        <div className="foes">{e.foes.map((f, i) => <div key={i} className={`foe t${f.s.tier} ${f.boss ? 'boss' : ''}`}><span className="spr" style={photoRond(f.s) || undefined} />{f.boss && <GI n="couronne" className="crown" />}<b>{f.s.nom}</b><small>Niv. {f.niv}{f.boss ? ' · Boss' : ''}</small></div>)}</div>
        <div className="objs">{obj.map(([t, n]) => <div key={n} className={etoiles >= n ? 'ok' : ''}><span className="ost">{Array.from({ length: n }, (_, i) => <GI key={i} n="etoile" />)}</span>{t}</div>)}</div>
        <div className="rew">
          <span><GI n="xp" />+{e.xp} XP par animal</span>
          {!etoiles ? <span><GI n="plume" />+{e.plumes} plumes</span> : etoiles < 3 ? <span><GI n="plume" />+{BONUS_3_ETOILES} plumes avec ★★★</span> : <span className="done"><GI n="trophee" />Étape parfaite</span>}
          {e.pellicule && !etoiles && <span><GI n="pellicule" />+1 pellicule</span>}
        </div>
        <TeamPicker team={team} setTeam={setTeam} compact />
        <button className="btn primary big" disabled={!equipe.length} onClick={() => onGo(e)}><GI n="combat" /> {equipe.length ? 'Combattre' : 'Choisis au moins un animal'}</button>
      </div>
    </Sheet>
  );
}
