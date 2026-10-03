// Progression RPG : niveau (gagné par l'expérience) plafonné par le rang (étoiles obtenues par fusion).
// Les mêmes formules existent côté serveur (public.g_niv, public.g_niv_max) — garder les deux identiques.

/** Rang (1 à 7 étoiles, obtenues par fusion) → niveau maximum */
export const nivMax = (rang: number) => 5 + 5 * Math.max(1, Math.min(7, rang || 1));
/** Expérience cumulée nécessaire pour atteindre le niveau n */
export const xpPour = (n: number) => 5 * n * n + 25 * n - 30;
/** Niveau atteint avec cette expérience (sans plafond) */
export const nivBrut = (xp: number) => Math.max(1, Math.floor((-25 + Math.sqrt(625 + 20 * (Math.max(0, xp || 0) + 30))) / 10 + 1e-9));
/** Niveau réel d'une carte */
export const niveau = (xp: number, rang: number) => Math.min(nivMax(rang), nivBrut(xp));

export interface Progression { niv: number; max: number; xp: number; debut: number; fin: number; pct: number; plafond: boolean }
export function progression(xp: number, rang: number): Progression {
  const max = nivMax(rang), niv = niveau(xp, rang), plafond = niv >= max;
  const debut = xpPour(niv), fin = xpPour(niv + 1);
  return { niv, max, xp: xp || 0, debut, fin, plafond, pct: plafond ? 100 : Math.round((100 * ((xp || 0) - debut)) / (fin - debut)) };
}

/** Paliers de capacités (le rang les débloque aussi, pour les cartes déjà fusionnées) */
export const NIV_INSTINCT = 3, NIV_CAPA3 = 5, NIV_SPECIALE = 12;
export const RANG_CAPA3 = 3, RANG_SPECIALE = 5;

/** Étoiles affichées */
export const etoiles = (rang: number) => '★'.repeat(Math.max(1, rang || 1));
