import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api, Card, GameState, errMsg } from './api';

interface Ctx {
  session: Session; uid: string; state: GameState | null; cards: Card[];
  bySpecies: Record<string, Card[]>; refresh: () => Promise<void>; refreshCards: () => Promise<void>;
  toast: (m: string) => void; toastMsg: string | null; run: <T>(p: Promise<T>) => Promise<T | undefined>;
  tab: string; go: (t: string) => void;
}
const GameCtx = createContext<Ctx | null>(null);
export const useGame = () => { const c = useContext(GameCtx); if (!c) throw new Error('hors contexte'); return c };

export function GameProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState('safari');
  const tRef = useRef<number>();
  const toast = useCallback((m: string) => { setToast(m); clearTimeout(tRef.current); tRef.current = window.setTimeout(() => setToast(null), 2800) }, []);
  const refresh = useCallback(async () => { try { setState(await api.state()) } catch (e) { toast(errMsg(e)) } }, [toast]);
  const refreshCards = useCallback(async () => { try { setCards(await api.cards()) } catch (e) { toast(errMsg(e)) } }, [toast]);
  const run = useCallback(async <T,>(p: Promise<T>) => { try { return await p } catch (e) { toast(errMsg(e)); return undefined } }, [toast]);
  useEffect(() => {
    // get_state clôture les enchères terminées : on charge les cartes APRÈS, pour voir les animaux gagnés
    const sync = async () => { await refresh(); if (!document.hidden) await refreshCards() };
    sync();
    // fuseau horaire du téléphone (pour le jour/nuit et les saisons)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) api.setProfile(session.user.id, { tz }).catch(() => {});
    const t = setInterval(sync, 60_000);
    return () => clearInterval(t);
  }, [refresh, refreshCards, session.user.id]);
  const bySpecies = useMemo(() => { const m: Record<string, Card[]> = {}; for (const c of cards) if (c.status === 'owned') (m[c.species_id] ||= []).push(c); return m }, [cards]);
  const go = useCallback((t: string) => { setTab(t); window.scrollTo(0, 0) }, []);
  return <GameCtx.Provider value={{ session, uid: session.user.id, state, cards, bySpecies, refresh, refreshCards, toast, toastMsg, run, tab, go }}>{children}</GameCtx.Provider>;
}

export const bestCard = (c: Card[]) => c.reduce((a, b) => (b.lvl > a.lvl || (b.lvl === a.lvl && b.q > a.q) ? b : a), c[0]);
export { supabase };
