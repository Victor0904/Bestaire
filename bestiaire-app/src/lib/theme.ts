// Thème : automatique (suit le téléphone), clair ou sombre. Mémorisé sur cet appareil.
export type Theme = 'auto' | 'clair' | 'sombre';
const KEY = 'bestiaire.theme';
export const getTheme = (): Theme => { try { return (localStorage.getItem(KEY) as Theme) || 'auto' } catch { return 'auto' } };
export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t === 'sombre' ? 'dark' : 'light';
  const dark = t === 'sombre' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141a13' : '#eef0e6');
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t) } catch { /* stockage indisponible */ } applyTheme(t) }
