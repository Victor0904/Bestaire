import { lazy, Suspense, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { GameProvider, useGame } from './lib/store';
import { FRANCE } from './game/species';
import { Icon, Toast } from './components/ui';
import { Login } from './screens/Login';
import { Safari } from './screens/Safari';
// Écrans chargés à la demande : le premier affichage (Safari) arrive plus vite
const load = { dex: () => import('./screens/Dex'), battle: () => import('./screens/Battle'), market: () => import('./screens/Market'), profile: () => import('./screens/Profile'), onb: () => import('./components/Onboarding') };
const Dex = lazy(() => load.dex().then(m => ({ default: m.Dex })));
const Battle = lazy(() => load.battle().then(m => ({ default: m.Battle })));
const Market = lazy(() => load.market().then(m => ({ default: m.Market })));
const Profile = lazy(() => load.profile().then(m => ({ default: m.Profile })));
const Onboarding = lazy(() => load.onb().then(m => ({ default: m.Onboarding })));
// puis tout le reste en arrière-plan, dès que le téléphone est disponible
const idle = (f: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(f) : setTimeout(f, 1500));
import { Bell } from './components/Notifications';
import { api } from './lib/api';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="app"><p className="note" style={{ paddingTop: 40 }}>Chargement…</p></div>;
  if (!session) return <div className="app"><Login /></div>;
  return <GameProvider session={session}><Shell /></GameProvider>;
}

const TABS = [['safari', 'Safari', Icon.cam], ['dex', 'Bestiaire', Icon.book], ['battle', 'Combat', Icon.fight], ['market', 'Marché', Icon.coin], ['profile', 'Profil', Icon.user]] as const;
function Shell() {
  const { state, bySpecies, tab, go, toastMsg, badges, uid, refresh } = useGame();
  const [tutoDone, setTutoDone] = useState(false);
  const showTuto = !!state && state.onboarded === false && !tutoDone;
  const finishTuto = () => { setTutoDone(true); api.setProfile(uid, { onboarded: true }).then(refresh).catch(() => {}) };
  const dot = badges.ach + badges.friends + (badges.guild ? 1 : 0) > 0;
  useEffect(() => { idle(() => Object.values(load).forEach(f => f().catch(() => {}))) }, []);
  const left = state?.next_film_at ? Math.max(0, Math.ceil((new Date(state.next_film_at).getTime() - Date.now()) / 60000)) : 0;
  const owned = FRANCE.filter(s => bySpecies[s.id]).length;
  return (
    <>
      <div className="app">
        <header className="top">
          <h1 className="brand">Bestiaire<small>France{state?.premium && <i className="plus" title="Bestiaire+">+</i>}</small></h1>
          <div className="chips-top">
            <button className="hchip" title="Pellicules" onClick={() => go('safari')}>{Icon.film}<b>{state?.films ?? '–'}</b>{left > 0 && <small>{left}′</small>}</button>
            <span className="hchip" title="Plumes">{Icon.feather}<b>{state?.plumes ?? '–'}</b></span>
            <span className="hchip" title="Espèces découvertes">{Icon.paw}<b>{owned}</b><small>/{FRANCE.length}</small></span>
            <Bell />
          </div>
        </header>
        <Suspense fallback={<p className="note loading">Chargement…</p>}>
          {tab === 'safari' && <Safari />}{tab === 'dex' && <Dex />}{tab === 'battle' && <Battle />}{tab === 'market' && <Market />}{tab === 'profile' && <Profile />}
        </Suspense>
      </div>
      <nav className="tabs" aria-label="Sections"><div>{TABS.map(([k, label, ic]) => <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{ic}<span>{label}</span>{k === 'profile' && dot && <i className="bdot" aria-label="nouveau" />}</button>)}</div></nav>
      {showTuto && <Suspense fallback={null}><Onboarding onDone={finishTuto} /></Suspense>}
      <Toast msg={toastMsg} />
    </>
  );
}
