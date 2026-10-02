import { useMemo, useState } from 'react';
import { BIOME, BIOMES, BYID, FRANCE, MOIS, Biome } from '../game/species';
import { api, Shot } from '../lib/api';
import { useGame } from '../lib/store';
import { buzz } from '../lib/fx';
import { Print } from '../components/ui';
import { Reveal } from '../components/Reveal';
import { Fiche } from './Fiche';
import { InstallBanner, InstallHelp } from '../components/Install';
import { NotifPrompt } from '../components/Notifications';
import { Sheet } from '../components/ui';

const actW = (a: string, ph: string) => a === 'D' ? (ph === 'jour' ? 1 : ph === 'nuit' ? .05 : .5) : a === 'N' ? (ph === 'nuit' ? 1 : ph === 'jour' ? .05 : .5) : (ph === 'jour' ? .3 : ph === 'nuit' ? .6 : 1);
const QTXT: Record<string, (q: { b?: string; c?: string; goal: number }) => string> = {
  biome: q => `Prends ${q.goal} photos en ${BIOME[q.b as Biome]?.n.toLowerCase()}`, new: q => `Découvre ${q.goal} nouvelles espèces`,
  cls: q => `Photographie ${q.goal} ${({ O: 'oiseaux', I: 'insectes', M: 'mammifères', A: 'amphibiens' } as Record<string, string>)[q.c || 'O']}`,
  rare: () => 'Photographie un animal rare ou mieux', win: q => `Gagne ${q.goal} combats`, fuse: () => 'Réussis une fusion',
  night: q => `Photographie ${q.goal} animaux nocturnes`, shot5: q => `Prends ${q.goal} photos (défi premium)`,
};

export function Safari() {
  const { state, bySpecies, refresh, refreshCards, run, toast } = useGame();
  const [biome, setBiome] = useState<Biome | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Shot[] | null>(null);
  const [last, setLast] = useState<Shot[] | null>(null);
  const [fiche, setFiche] = useState<string | null>(null);
  const [inst, setInst] = useState(false);
  const ph = state?.phase || 'jour', m = state?.month || new Date().getMonth() + 1;
  const counts = useMemo(() => Object.fromEntries(BIOMES.map(b => {
    const av = FRANCE.filter(s => s.biomes.includes(b) && (!s.months || s.months.includes(m)) && actW(s.act, ph) >= .3);
    return [b, { n: av.length, miss: av.filter(s => !bySpecies[s.id]).length }];
  })), [ph, m, bySpecies]);
  const mig = useMemo(() => FRANCE.filter(s => s.months && s.months.length <= 7 && s.months.includes(m) && s.classe === 'O').slice(0, 40), [m]);
  const pick = mig.length ? [mig[(new Date().getDate() * 7) % mig.length], mig[(new Date().getDate() * 13 + 3) % mig.length]].filter((x, i, a) => a.indexOf(x) === i) : [];
  if (!state) return <section className="view"><p className="note">Chargement…</p></section>;
  const left = state.next_film_at ? Math.max(0, Math.ceil((new Date(state.next_film_at).getTime() - Date.now()) / 60000)) : 0;
  const shoot = async () => {
    if (!biome || busy) return; setBusy(true);
    const r = await run(api.shoot(biome)); setBusy(false);
    if (r) { setReveal(r); setLast(r); refresh(); refreshCards() }
  };
  const claim = async (i: number) => { const r = await run(api.claimQuest(i)); if (r) { buzz(25); toast('Récompense récupérée !'); refresh() } };
  return (
    <section className="view">
      <InstallBanner onOpen={() => setInst(true)} />
      {state.onboarded && <NotifPrompt />}
      {inst && <Sheet onClose={() => setInst(false)} label="Installer Bestiaire"><h2>Installer Bestiaire</h2><InstallHelp /><button className="btn" onClick={() => setInst(false)}>Fermer</button></Sheet>}
      <div className="cond"><div><span>Pays</span><b>France</b></div><div><span>Moment</span><b>{ph[0].toUpperCase() + ph.slice(1)}</b></div><div><span>Saison</span><b>{MOIS[m - 1]}</b></div></div>
      <div className="events">
        <div className="evt" style={{ ['--bc' as string]: BIOME[state.daily_biome as Biome].c }}><b>Biome du jour : {BIOME[state.daily_biome as Biome].n}</b><span>Chances d'espèces rares doublées aujourd'hui.</span></div>
        {pick.length > 0 && <div className="evt mig"><b>De passage en {MOIS[m - 1]}</b><span>{pick.map(s => s.nom).join(' et ')} {pick.length > 1 ? 'sont' : 'est'} là en ce moment.</span></div>}
      </div>
      <div className="row spread"><h2>Où partir en safari ?</h2><span className="note">{state.films} pellicule{state.films > 1 ? 's' : ''}{left ? ` · +1 dans ${left} min` : ''}</span></div>
      <div className="biomes">
        {BIOMES.map(b => <button key={b} className="biome" style={{ ['--bc' as string]: BIOME[b].c }} aria-pressed={biome === b} onClick={() => setBiome(b)}>
          {b === state.daily_biome && <span className="bday">Biome du jour</span>}<b>{BIOME[b].n}</b><small>{counts[b].n} actives · {counts[b].miss} à découvrir</small></button>)}
      </div>
      <div className="shootbar"><button className="btn primary big" disabled={!biome || state.films < 1 || busy} onClick={shoot}>
        {busy ? 'Développement…' : !biome ? 'Choisis un milieu' : state.films < 1 ? 'Plus de pellicule, reviens bientôt' : `Partir en ${BIOME[biome].n.toLowerCase()} · 5 photos`}</button></div>
      {last && <div className="view-sub"><div className="row spread"><h2>Ta pellicule</h2><span className="note">{last.filter(x => x.is_new).length} nouvelle(s) espèce(s)</span></div>
        <div className="roll">{last.map(sh => <button key={sh.id} className="cell" onClick={() => setFiche(sh.species_id)}><Print s={BYID[sh.species_id]} q={sh.q} lvl={sh.lvl} phase={sh.phase} isNew={sh.is_new} /></button>)}</div></div>}
      <div className="panel" id="quests">
        <div className="row spread"><p className="eyebrow">Défis du jour</p><span className="note">nouveaux demain</span></div>
        {state.quests.map((q, i) => { const done = q.prog >= q.goal; return (
          <div key={i} className={`quest ${q.claimed ? 'claimed' : ''}`}><div style={{ minWidth: 0 }}><b>{(QTXT[q.t] || (() => q.t))(q)}</b><div className="qbar"><i style={{ width: `${Math.min(100, 100 * q.prog / q.goal)}%` }} /></div></div>
            {q.claimed ? <span className="note">Récupéré</span> : done ? <button className="btn primary" onClick={() => claim(i)}>{q.rw.films ? '+1 pellicule' : `+${q.rw.plumes} plumes`}</button> : <span className="qrw">{Math.min(q.prog, q.goal)}/{q.goal}</span>}</div>) })}
      </div>
      {reveal && <Reveal shots={reveal} onDone={() => setReveal(null)} />}
      {fiche && <Fiche id={fiche} onClose={() => setFiche(null)} />}
    </section>
  );
}
