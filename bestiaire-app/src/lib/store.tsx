import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { api, Card, Defense, GameState, Notif, errMsg } from './api';

interface Ctx {
  session: Session; uid: string; state: GameState | null; cards: Card[];
  bySpecies: Record<string, Card[]>; refresh: () => Promise<void>; refreshCards: () => Promise<void>;
  toast: (m: string) => void; toastMsg: string | null; run: <T>(p: Promise<T>) => Promise<T | undefined>;
  tab: string; go: (t: string) => void;
  /** Duel lancé depuis la liste d'amis ou la guilde */
  challenge: Defense | null; setChallenge: (d: Defense | null) => void;
  /** Pastilles de notification : succès à récupérer, demandes d'amis, récompense de guilde */
  badges: { ach: number; friends: number; guild: boolean }; refreshSocial: () => Promise<void>;
  sub: string; setSub: (s: string) => void;
  notifs: { unread: number; list: Notif[] }; refreshNotifs: () => Promise<void>; openTab: (tab: string | null, kind?: string) => void;
}
const GameCtx = createContext<Ctx | null>(null);
export const useGame = () => { const c = useContext(GameCtx); if (!c) throw new Error('hors contexte'); return c };

export function GameProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState('safari');
  const tRef = useRef<number>();
  const [challenge, setChallenge] = useState<Defense | null>(null);
  const [badges, setBadges] = useState({ ach: 0, friends: 0, guild: false });
  const [sub, setSub] = useState('profil');
  const [notifs, setNotifs] = useState<{ unread: number; list: Notif[] }>({ unread: 0, list: [] });
  const seen = useRef<number>(0);
  const refreshNotifs = useCallback(async () => {
    try {
      const n = await api.notifications(); setNotifs({ unread: n.unread, list: n.list });
      // nouvelle notification pendant que l'appli est ouverte : petit message en bas de l'écran
      const top = n.list[0]; if (top && seen.current && top.id > seen.current && !top.read_at) setToastLater(`${top.title} · ${top.body}`);
      if (top) seen.current = Math.max(seen.current, top.id); else if (!seen.current) seen.current = -1;
    } catch { /* notifications pas encore installées */ }
  }, []);
  const toastLater = useRef<(m: string) => void>(() => {}); const setToastLater = (m: string) => toastLater.current(m);
  const refreshSocial = useCallback(async () => {
    try {
      const [a, f, g] = await Promise.all([api.achievements(), api.friends(), api.guildGet()]);
      setBadges({ ach: (a || []).filter(x => !x.claimed && x.prog >= x.goal).length, friends: f.list.filter(x => x.incoming).length, guild: !!g && !g.claimed && g.week.photos >= g.week.goal });
    } catch { /* fonctions sociales pas encore installées : pas de pastilles */ }
  }, []);
  const toast = useCallback((m: string) => { setToast(m); clearTimeout(tRef.current); tRef.current = window.setTimeout(() => setToast(null), 2800) }, []);
  toastLater.current = toast;
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
    refreshSocial(); const t2 = setInterval(refreshSocial, 180_000);
    refreshNotifs(); const t3 = setInterval(() => { if (!document.hidden) refreshNotifs() }, 45_000);
    // temps réel : nouvelle notification dès son arrivée (si disponible)
    const ch = supabase.channel('notifs-' + session.user.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => { refreshNotifs(); refreshSocial() }).subscribe();
    return () => { clearInterval(t); clearInterval(t2); clearInterval(t3); supabase.removeChannel(ch) };
  }, [refresh, refreshCards, refreshSocial, refreshNotifs, session.user.id]);
  const bySpecies = useMemo(() => { const m: Record<string, Card[]> = {}; for (const c of cards) if (c.status === 'owned') (m[c.species_id] ||= []).push(c); return m }, [cards]);
  const go = useCallback((t: string) => { setTab(t); window.scrollTo(0, 0) }, []);
  const openTab = useCallback((t: string | null, kind?: string) => {
    if (!t) return; if (t === 'profile') setSub(kind === 'guilde' ? 'guilde' : kind === 'amis' ? 'amis' : 'profil'); go(t);
  }, [go]);
  // ouverture depuis une notification push (?onglet=… ou message du service worker)
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('onglet'); if (q) { openTab(q); history.replaceState(null, '', location.pathname) }
    const f = (e: MessageEvent) => { if (e.data?.type === 'open-tab') { openTab(e.data.tab); refreshNotifs() } };
    navigator.serviceWorker?.addEventListener('message', f); return () => navigator.serviceWorker?.removeEventListener('message', f);
  }, [openTab, refreshNotifs]);
  return <GameCtx.Provider value={{ session, uid: session.user.id, state, cards, bySpecies, refresh, refreshCards, toast, toastMsg, run, tab, go, challenge, setChallenge, badges, refreshSocial, sub, setSub, notifs, refreshNotifs, openTab }}>{children}</GameCtx.Provider>;
}

export const bestCard = (c: Card[]) => c.reduce((a, b) => (b.lvl > a.lvl || (b.lvl === a.lvl && b.q > a.q) ? b : a), c[0]);
export { supabase };
