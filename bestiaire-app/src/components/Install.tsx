import { useEffect, useState } from 'react';

// L'invitation d'installation d'Android/Chrome est capturée au démarrage (main.tsx)
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global { interface Window { __bip?: BIP | null } }

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const platform = (): 'ios' | 'android' | 'autre' => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(ua) ? 'android' : 'autre';
};

const ShareIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></svg>;

/** Explications pour ajouter Bestiaire à l'écran d'accueil (comme une vraie appli) */
export function InstallHelp({ compact }: { compact?: boolean }) {
  const [bip, setBip] = useState<BIP | null>(window.__bip || null);
  const [done, setDone] = useState(isStandalone());
  const [os, setOs] = useState(platform());
  useEffect(() => { const f = () => setBip(window.__bip || null); addEventListener('bip-ready', f); return () => removeEventListener('bip-ready', f) }, []);
  if (done) return <div className="install ok"><b>✓ Bestiaire est installé</b><p className="note">Tu l'ouvres depuis ton écran d'accueil, en plein écran, comme une appli.</p></div>;
  const install = async () => { if (!bip) return; await bip.prompt(); const c = await bip.userChoice; if (c.outcome === 'accepted') setDone(true); window.__bip = null; setBip(null) };
  return (
    <div className="install">
      {!compact && <p className="note">Ajoute Bestiaire à ton écran d'accueil : il s'ouvrira en plein écran, comme une vraie appli, sans passer par le navigateur.</p>}
      <div className="seg small" role="tablist" aria-label="Ton téléphone">
        <button role="tab" aria-selected={os === 'ios'} onClick={() => setOs('ios')}>iPhone</button>
        <button role="tab" aria-selected={os === 'android'} onClick={() => setOs('android')}>Android</button>
        <button role="tab" aria-selected={os === 'autre'} onClick={() => setOs('autre')}>Ordinateur</button>
      </div>
      {os === 'ios' && <ol className="steps">
        <li>Ouvre ce site dans <b>Safari</b> (pas dans Instagram, Messenger…).</li>
        <li>Touche le bouton <b>Partager</b> <span className="kbd"><ShareIcon /></span> en bas de l'écran.</li>
        <li>Fais défiler et choisis <b>« Sur l'écran d'accueil »</b>.</li>
        <li>Touche <b>Ajouter</b> : l'icône Bestiaire apparaît avec tes applis.</li>
      </ol>}
      {os === 'android' && <>{bip ? <button className="btn primary big" onClick={install}>Installer l'appli</button> : <ol className="steps">
        <li>Ouvre ce site dans <b>Chrome</b>.</li>
        <li>Touche le menu <span className="kbd">⋮</span> en haut à droite.</li>
        <li>Choisis <b>« Ajouter à l'écran d'accueil »</b> ou <b>« Installer l'application »</b>.</li>
        <li>Confirme : l'icône Bestiaire apparaît avec tes applis.</li>
      </ol>}</>}
      {os === 'autre' && <>{bip ? <button className="btn primary big" onClick={install}>Installer sur cet ordinateur</button> : <ol className="steps">
        <li>Dans Chrome ou Edge, clique sur l'icône d'installation <span className="kbd">⊕</span> dans la barre d'adresse.</li>
        <li>Le mieux reste le téléphone : ouvre <b>{location.host}{location.pathname}</b> sur ton mobile.</li>
      </ol>}</>}
    </div>
  );
}

/** Bandeau discret sur l'écran Safari tant que l'appli n'est pas installée */
export function InstallBanner({ onOpen }: { onOpen: () => void }) {
  const key = 'install.dismissed';
  const [hidden, setHidden] = useState(() => { try { return isStandalone() || platform() === 'autre' || localStorage.getItem(key) === '1' } catch { return isStandalone() } });
  if (hidden) return null;
  const close = () => { try { localStorage.setItem(key, '1') } catch { /* stockage indisponible */ } setHidden(true) };
  return <div className="ibanner"><button className="ib" onClick={onOpen}><b>Installe Bestiaire</b><small>Sur ton écran d'accueil, comme une appli</small></button><button className="ix" onClick={close} aria-label="Masquer">×</button></div>;
}
