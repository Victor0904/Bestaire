// Notifications push : abonnement du téléphone (clé publique VAPID fournie au moment de la construction)
import { api } from './api';
import { supabase } from './supabase';
import { b64u } from '../../supabase/functions/_shared/webpush';

// Clé publique VAPID : fournie à la construction (VITE_VAPID_PUBLIC_KEY) ou, à défaut, lue sur le serveur
let vapid: Promise<string> | null = null;
export const getVapid = () => (vapid ||= (async () => {
  const env = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined; if (env) return env;
  try { const { data } = await supabase.functions.invoke('send-push', { method: 'GET' }); return (data as { publicKey?: string })?.publicKey || '' } catch { return '' }
})());
export type PushState = 'actif' | 'bloque' | 'a-demander' | 'installer-iphone' | 'indisponible';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (isIOS() && !standalone()) return 'installer-iphone';           // sur iPhone, le push n'existe que pour l'appli installée
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window) || !(await getVapid())) return 'indisponible';
  if (Notification.permission === 'denied') return 'bloque';
  if (Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'actif' : 'a-demander';
  }
  return 'a-demander';
}

/** Demande l'autorisation puis abonne ce téléphone. Renvoie le nouvel état. */
export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'bloque' : 'a-demander';
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u.dec(await getVapid()) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.pushSubscribe(j.endpoint, j.keys.p256dh, j.keys.auth);
  return 'actif';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe() }
}
