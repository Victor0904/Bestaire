import { useEffect, useState } from 'react';
import { api, NotifKind, NotifPrefs } from '../lib/api';
import { useGame } from '../lib/store';
import { disablePush, enablePush, pushState, PushState } from '../lib/push';
import { Sheet } from './ui';

const KINDS: [NotifKind, string, string][] = [
  ['pellicules', 'Pellicules rechargées', 'Quand ta réserve est pleine'],
  ['encheres', 'Marché', 'Enchère dépassée, vente, achat'],
  ['amis', 'Amis', "Demandes d'ami et acceptations"],
  ['guilde', 'Guilde', 'Nouveaux messages de ta guilde'],
  ['duels', 'Duels', 'Quand ta défense est attaquée'],
];
const ICON: Record<string, string> = { pellicules: '◉', encheres: '¤', amis: '♥', guilde: '⚑', duels: '⚔' };
const when = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('fr-FR') };

const BellIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></svg>;

/** Cloche de l'en-tête + boîte de réception */
export function Bell() {
  const { notifs, refreshNotifs, openTab } = useGame();
  const [open, setOpen] = useState(false);
  const show = async () => { setOpen(true); if (notifs.unread) { await api.markRead().catch(() => {}); refreshNotifs() } };
  return <>
    <button className="hchip bell" onClick={show} aria-label={`Notifications${notifs.unread ? ` : ${notifs.unread} non lue${notifs.unread > 1 ? 's' : ''}` : ''}`}>
      <BellIcon />{notifs.unread > 0 && <b className="bcount">{notifs.unread > 9 ? '9+' : notifs.unread}</b>}
    </button>
    {open && <Sheet onClose={() => setOpen(false)} label="Notifications">
      <h2>Notifications</h2>
      {notifs.list.length ? <div className="nlist">{notifs.list.map(n => <button key={n.id} className={`nitem ${n.read_at ? '' : 'new'}`} onClick={() => { setOpen(false); openTab(n.tab, n.kind) }}>
        <span className="ni">{ICON[n.kind] || '•'}</span><span className="nb"><b>{n.title}</b><span>{n.body}</span><small>{when(n.created_at)}</small></span></button>)}</div>
        : <p className="note">Rien de neuf pour l'instant. Tu seras prévenu ici des enchères, des amis, de ta guilde et des duels.</p>}
      <button className="btn ghost" onClick={() => { setOpen(false); openTab('profile', 'profil'); setTimeout(() => document.getElementById('reglages-notifs')?.scrollIntoView({ behavior: 'smooth' }), 150) }}>Réglages des notifications</button>
      <button className="btn" onClick={() => setOpen(false)}>Fermer</button>
    </Sheet>}
  </>;
}

const DISMISS = 'notif.prompt.later';
/** Carte d'invitation (avant la fenêtre système du téléphone, qui ne s'affiche qu'une fois) */
export function NotifPrompt() {
  const { toast } = useGame();
  const [st, setSt] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(() => { try { const t = +(localStorage.getItem(DISMISS) || 0); return Date.now() - t < 3 * 86400_000 } catch { return false } });
  useEffect(() => { pushState().then(setSt).catch(() => setSt('indisponible')) }, []);
  if (hidden || st !== 'a-demander') return null;
  const later = () => { try { localStorage.setItem(DISMISS, String(Date.now())) } catch { /* stockage indisponible */ } setHidden(true) };
  const yes = async () => { try { const r = await enablePush(); setSt(r); toast(r === 'actif' ? 'Notifications activées' : 'Notifications refusées : tu pourras les activer dans ton profil') } catch { toast("Impossible d'activer les notifications sur ce navigateur") } };
  return (
    <div className="panel nprompt" role="region" aria-label="Activer les notifications">
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="np-ic"><BellIcon /></span>
        <div><b>Ne rate rien</b><p className="note">Sois prévenu quand tes pellicules sont rechargées, quand on surenchérit sur ta carte ou quand ta guilde t'écrit. Tu choisis quoi recevoir dans ton profil.</p></div></div>
      <div className="row"><button className="btn primary" onClick={yes}>Activer les notifications</button><button className="btn ghost" onClick={later}>Plus tard</button></div>
    </div>
  );
}

/** Réglages dans le profil */
export function NotifSettings() {
  const { run, toast } = useGame();
  const [st, setSt] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  useEffect(() => { pushState().then(setSt).catch(() => setSt('indisponible')); api.notifications().then(n => setPrefs(n.prefs)).catch(() => {}) }, []);
  const toggle = async (k: NotifKind) => { if (!prefs) return; const p = { ...prefs, [k]: !prefs[k] }; setPrefs(p); await run(api.setNotifPrefs(p)) };
  const on = async () => { try { setSt(await enablePush()) } catch { toast("Impossible d'activer les notifications sur ce navigateur") } };
  const off = async () => { await disablePush(); setSt('a-demander'); toast('Notifications coupées sur ce téléphone') };
  return (
    <div className="panel" id="reglages-notifs"><p className="eyebrow">Notifications</p>
      {st === 'actif' && <div className="row spread"><span><b>✓ Activées sur ce téléphone</b></span><button className="btn ghost small" onClick={off}>Couper</button></div>}
      {st === 'a-demander' && <button className="btn primary" onClick={on}>Activer les notifications sur ce téléphone</button>}
      {st === 'bloque' && <p className="note">Les notifications sont <b>bloquées</b> pour ce site. Pour les autoriser : réglages du navigateur (ou du téléphone) → Notifications → Bestiaire.</p>}
      {st === 'installer-iphone' && <p className="note">Sur iPhone, les notifications ne fonctionnent qu'une fois Bestiaire <b>installé sur l'écran d'accueil</b> (voir « Installer l'appli » ci-dessus), puis ouvert depuis son icône.</p>}
      {st === 'indisponible' && <p className="note">Ce navigateur ne gère pas les notifications push. Elles restent visibles dans la cloche, en haut de l'écran.</p>}
      {prefs && <div className="nprefs">{KINDS.map(([k, t, d]) => <label key={k} className="switch"><span><b>{t}</b><small>{d}</small></span><input type="checkbox" role="switch" checked={prefs[k] !== false} onChange={() => toggle(k)} /><i aria-hidden="true" /></label>)}</div>}
    </div>
  );
}
