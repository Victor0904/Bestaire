// Mode Aventure : 6 chapitres (un par milieu) de 10 étapes, avec une étape « élite » et un boss par chapitre.
// Les adversaires de chaque étape sont tirés de façon reproductible (même étape = mêmes animaux pour tout le monde).
// Les récompenses sont calculées côté serveur (public.adventure_win) avec les mêmes formules.
import { Biome, FRANCE, Species } from './species';
import { Membre, puissance } from './combat';

export interface Chapitre { n: number; biome: Biome; nom: string; intro: string; ph: string[] }
export const CHAPITRES: Chapitre[] = [
  { n: 1, biome: 'P', nom: "Les prés de l'aube", intro: 'Les hautes herbes bruissent. Tes premiers adversaires guettent entre les fleurs.', ph: ['aube', 'jour', 'jour', 'jour', 'jour', 'jour', 'crépuscule', 'jour', 'jour', 'crépuscule'] },
  { n: 2, biome: 'F', nom: 'La forêt profonde', intro: "Sous les grands arbres, la lumière baisse. Les chasseurs de l'ombre sortent.", ph: ['jour', 'jour', 'crépuscule', 'crépuscule', 'nuit', 'jour', 'crépuscule', 'nuit', 'nuit', 'nuit'] },
  { n: 3, biome: 'H', nom: 'Les marais brumeux', intro: "La brume couvre l'eau. Chaque roseau peut cacher un piège.", ph: ['aube', 'aube', 'jour', 'jour', 'crépuscule', 'jour', 'nuit', 'aube', 'jour', 'crépuscule'] },
  { n: 4, biome: 'L', nom: 'La côte sauvage', intro: 'Le vent du large, les rochers, les vagues : la côte appartient aux plus robustes.', ph: ['jour', 'jour', 'jour', 'crépuscule', 'jour', 'aube', 'jour', 'jour', 'crépuscule', 'jour'] },
  { n: 5, biome: 'M', nom: 'Les cimes', intro: "L'air se raréfie. Là-haut, seuls les plus forts survivent.", ph: ['aube', 'jour', 'jour', 'jour', 'jour', 'crépuscule', 'jour', 'aube', 'jour', 'jour'] },
  { n: 6, biome: 'V', nom: 'La ville endormie', intro: 'Les rues se vident. La nuit, la ville appartient aux animaux.', ph: ['crépuscule', 'nuit', 'nuit', 'nuit', 'nuit', 'crépuscule', 'nuit', 'nuit', 'nuit', 'nuit'] },
];
export const ETAPES_PAR_CHAPITRE = 10;
export const NB_ETAPES = CHAPITRES.length * ETAPES_PAR_CHAPITRE;

export type Genre = 'normal' | 'elite' | 'boss';
export interface Etape {
  g: number;               // index global 0..59
  chap: Chapitre; k: number;   // numéro dans le chapitre (1..10)
  genre: Genre; biome: Biome; ph: string;
  foes: Membre[];
  toursMax: number;        // objectif 3 étoiles
  xp: number;              // expérience par animal en cas de victoire
  plumes: number;          // première victoire
  pellicule: boolean;      // première victoire d'un boss
}

const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
const POIDS: Record<string, number> = { M: 3, O: 3, R: 2.2, A: 2, P: 1.2, I: 2, K: 1.4, X: 1 };
const tirer = (l: Species[], r: () => number) => {
  const tot = l.reduce((a, s) => a + (POIDS[s.classe] || 1), 0); let x = r() * tot;
  for (const s of l) { x -= POIDS[s.classe] || 1; if (x <= 0) return s }
  return l[l.length - 1];
};

/** Formules partagées avec le serveur */
export const xpEtape = (g: number) => 15 + 3 * g;
export const plumesEtape = (g: number) => 20 + 4 * g + (g % 10 === 9 ? 100 : 0);
export const BONUS_3_ETOILES = 15;

export function etape(g: number, pool: Species[] = FRANCE): Etape {
  const chap = CHAPITRES[Math.floor(g / ETAPES_PAR_CHAPITRE)], k = (g % ETAPES_PAR_CHAPITRE) + 1;
  const genre: Genre = k === 10 ? 'boss' : k === 5 ? 'elite' : 'normal';
  const r = mulberry(9973 * (g + 1));
  const ici = pool.filter(s => s.biomes.includes(chap.biome) && s.photo);
  const niv = 1 + Math.round(g * 0.62), rang = 1 + Math.floor(g / 12);
  const tierMax = Math.min(4, 1 + Math.floor(g / 12));
  const base = ici.filter(s => s.tier <= tierMax);
  const pris = new Set<string>(); const foes: Membre[] = [];
  const ajoute = (s: Species | undefined, m: Partial<Membre> = {}) => { if (!s || pris.has(s.id)) return; pris.add(s.id); foes.push({ s, lvl: rang, niv, ...m }) };
  const n = chap.n === 1 ? [1, 1, 2, 2, 2, 2, 3, 3, 3, 1][k - 1] : [2, 2, 2, 3, 2, 3, 3, 3, 3, 2][k - 1];
  if (genre === 'boss') {
    // le boss : un grand animal remarquable du milieu (le plus rare et le plus lourd parmi les vertébrés)
    const cands = ici.filter(s => ['M', 'O', 'R'].includes(s.classe) && s.tier >= Math.min(3, tierMax)).sort((a, b) => b.tier - a.tier || b.g - a.g);
    ajoute(cands[Math.floor(r() * Math.min(3, cands.length))] || ici[0], { boss: true, niv: niv + 1 });
  }
  if (genre === 'elite') { const el = ici.filter(s => s.tier >= Math.min(2, tierMax) && s.tier <= tierMax + 1); ajoute(tirer(el.length ? el : base, r), { niv: niv + 4, lvl: rang + 1 }) }
  for (let essai = 0; foes.length < n + (genre === 'boss' ? 1 : 0) && essai < 50; essai++) ajoute(tirer(base.length ? base : ici, r));
  // équilibrage : la force de chaque adversaire est rapprochée d'une force de référence (sans l'effacer),
  // pour qu'un ours ne soit pas imbattable ni un moineau inoffensif ; la difficulté monte doucement avec les chapitres.
  const refPool = pool.filter(s => s.photo && s.tier <= tierMax && ['M', 'O', 'R', 'A'].includes(s.classe));
  const ref = refPool.reduce((a, s) => a + puissance(s, rang, niv), 0) / Math.max(1, refPool.length);
  for (const f of foes) {
    const cible = ref * (f.boss ? 1.0 : genre === 'elite' && f === foes[0] ? 1.3 : 1) * (1 + 0.04 * (chap.n - 1));
    const m = Math.pow(cible / puissance(f.s, f.lvl, f.niv), 0.6);
    f.mult = Math.round(100 * Math.max(0.7, Math.min(1.6, m))) / 100;
  }
  // le boss entre en dernier, l'élite en premier
  if (genre === 'boss') foes.push(foes.shift()!);
  return {
    g, chap, k, genre, biome: chap.biome, ph: chap.ph[k - 1], foes,
    toursMax: 3 + 3 * foes.length + (genre === 'boss' ? 4 : 0),
    xp: xpEtape(g), plumes: plumesEtape(g), pellicule: genre === 'boss',
  };
}

/** Étoiles gagnées : 1 victoire, 2 sans K.O. dans ton équipe, 3 en peu de tours */
export function etoilesGagnees(won: boolean, koEquipe: number, tours: number, toursMax: number) {
  if (!won) return 0;
  return 1 + (koEquipe === 0 ? 1 : 0) + (tours <= toursMax ? 1 : 0);
}

export const nomEtape = (e: Etape) => (e.genre === 'boss' ? `Boss : ${e.foes[e.foes.length - 1].s.nom}` : e.genre === 'elite' ? `Élite : ${e.foes[0].s.nom}` : `Étape ${e.k}`);
