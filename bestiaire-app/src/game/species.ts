import raw from '../data/species.json';

export type Classe = 'M' | 'O' | 'R' | 'A' | 'P' | 'I' | 'K' | 'X';
export type Biome = 'F' | 'P' | 'H' | 'M' | 'V' | 'L';
export type Act = 'D' | 'N' | 'C';
export type Arch = 'p' | 'g' | 'f' | 'a' | 'v' | 'n' | 'o';
export interface Species {
  id: string; nom: string; sci: string; classe: Classe; tier: number; biomes: Biome[]; act: Act;
  months: number[] | null; uicn: string | null; g: number; arch: Arch; pays: string | null;
  photo: [number, number] | null; credit: string | null; src: string | null;
}
type Raw = { id: string; nom: string; sci: string; c: Classe; t: number; b: string; a: Act; m: number[] | null; u: string | null; g: number; r: Arch; pays: string | null; p: [number, number] | null; cr: string | null; src: string | null };

export const ALL: Species[] = (raw as Raw[]).map(x => ({
  id: x.id, nom: x.nom, sci: x.sci, classe: x.c, tier: x.t, biomes: x.b.split('') as Biome[], act: x.a,
  months: x.m, uicn: x.u, g: x.g, arch: x.r, pays: x.pays, photo: x.p, credit: x.cr,
  src: x.src ? 'https://www.inaturalist.org/photos/' + x.src : null,
}));
// espèces sans photo exacte : exclues du jeu (et du tirage serveur)
export const FRANCE = ALL.filter(s => !s.pays && s.photo);
export const FOREIGN = ALL.filter(s => s.pays && s.photo);
export const BYID: Record<string, Species> = Object.fromEntries(ALL.map(s => [s.id, s]));

export const CLASS: Record<Classe, string> = { M: 'Mammifère', O: 'Oiseau', R: 'Reptile', A: 'Amphibien', P: 'Poisson', I: 'Insecte', K: 'Arachnide', X: 'Autre invertébré' };
export const BIOME: Record<Biome, { n: string; c: string }> = {
  F: { n: 'Forêt', c: '#3f6b3a' }, P: { n: 'Prairie', c: '#a7a23a' }, H: { n: 'Zone humide', c: '#2f7f8f' },
  M: { n: 'Montagne', c: '#7d7f8c' }, V: { n: 'Ville', c: '#9a6a4a' }, L: { n: 'Littoral', c: '#3a76b5' },
};
export const BIOMES = Object.keys(BIOME) as Biome[];
export const ACT: Record<Act, string> = { D: 'diurne', N: 'nocturne', C: 'crépusculaire' };
export const TIERS = ['commun', 'peu commun', 'rare', 'épique', 'légendaire'];
export const ODDS = [60, 25, 10, 4, 1];
export const TIER_COL = ['#9aa38f', '#4fa58c', '#5b8fe0', '#a46be0', '#f0b54a'];
export const QUAL = ['Floue', 'Nette', 'Superbe', 'Parfaite'];
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const qIndex = (q: number) => (q >= 95 ? 3 : q >= 80 ? 2 : q >= 40 ? 1 : 0);
export const MAXLVL = 7;
export const FRAME = (l: number) => (l >= 7 ? 'parfait' : l >= 6 ? 'or' : l >= 5 ? 'argent' : l >= 3 ? 'bronze' : '');
export const FRAMEN: Record<string, string> = { bronze: 'Cadre bronze', argent: 'Cadre argent', or: 'Cadre or', parfait: 'Cadre parfait' };

/** Cote de référence (identique à public.g_cote côté serveur) */
export function cote(s: Species, lvl: number, q: number): number {
  const base = [5, 12, 30, 80, 250][s.tier];
  const qm = [0.8, 1, 1.3, 2][qIndex(q)];
  return Math.round(base * Math.pow(2, lvl - 1) * qm * (s.pays ? 1.5 : 1));
}

export function photoStyle(s: Species): React.CSSProperties | null {
  if (!s.photo) return null;
  const [sheet, i] = s.photo;
  return {
    backgroundImage: `url(${import.meta.env.BASE_URL}planches/p${String(sheet).padStart(2, '0')}.webp)`,
    backgroundPosition: `${(i % 5) * 25}% ${((Math.floor(i / 5) * 100) / 7).toFixed(3)}%`,
  };
}

/** Même photo, recadrée pour un conteneur carré (portrait rond) sans déformation */
export function photoRond(s: Species): React.CSSProperties | null {
  if (!s.photo) return null;
  const [sheet, i] = s.photo, c = i % 5, r = Math.floor(i / 5);
  return {
    backgroundImage: `url(${import.meta.env.BASE_URL}planches/p${String(sheet).padStart(2, '0')}.webp)`,
    backgroundSize: 'auto 800%',
    backgroundPosition: `${(((4 / 3) * c + 1 / 6) / (17 / 3)) * 100}% ${((r * 100) / 7).toFixed(3)}%`,
  };
}

export function seasonText(s: Species): string {
  if (!s.months) return "toute l'année";
  const has = new Set(s.months); const segs: string[] = [];
  for (const m of s.months) {
    const prev = ((m + 10) % 12) + 1; if (has.has(prev)) continue;
    let e = m; while (has.has((e % 12) + 1) && (e % 12) + 1 !== m) e = (e % 12) + 1;
    segs.push(m === e ? MOIS[m - 1] : `${MOIS[m - 1]} à ${MOIS[e - 1]}`);
  }
  return segs.length ? 'de ' + segs.join(', puis ') : "toute l'année";
}
export const massText = (g: number) => (!g ? '' : g >= 1000 ? `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg` : `${g} g`);
