import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { GameProvider, useGame } from './lib/store';
import { FRANCE } from './game/species';
import { Icon, Toast } from './components/ui';
import { Login } from './screens/Login';
import { Safari } from './screens/Safari';
import { Dex } from './screens/Dex';
import { Battle } from './screens/Battle';
import { Market } from './screens/Market';
import { Profile } from './screens/Profile';

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
  const { state, bySpecies, tab, go, toastMsg } = useGame();
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
          </div>
        </header>
        {tab === 'safari' && <Safari />}{tab === 'dex' && <Dex />}{tab === 'battle' && <Battle />}{tab === 'market' && <Market />}{tab === 'profile' && <Profile />}
      </div>
      <nav className="tabs" aria-label="Sections"><div>{TABS.map(([k, label, ic]) => <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{ic}<span>{label}</span></button>)}</div></nav>
      <Toast msg={toastMsg} />
    </>
  );
}
