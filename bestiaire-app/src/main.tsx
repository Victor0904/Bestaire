import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './app.css';
import { applyTheme } from './lib/theme';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

// Android / Chrome : on garde l'invitation d'installation pour un bouton « Installer »
addEventListener('beforeinstallprompt', e => { e.preventDefault(); (window as unknown as { __bip: Event }).__bip = e; dispatchEvent(new Event('bip-ready')) });

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
