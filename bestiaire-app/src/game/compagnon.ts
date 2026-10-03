// Mode Compagnon (TEST) : un seul animal célèbre, qu'on nourrit, qu'on soigne et qu'on fait progresser.
// Toutes les règles sont ici (fonctions pures) ; l'écran et la sauvegarde sont dans screens/Compagnon.tsx.
import { BYID, Species } from './species';
import { Ability, Effet, Membre, Mods } from './combat';

export type Regime = 'carnivore' | 'herbivore' | 'omnivore' | 'piscivore';
export interface Star { id: string; nom: string; regime: Regime; fav?: string }
/** Les animaux de la box (version test : peu d'animaux, tous très connus) */
export const STARS: Star[] = ([
  { id: 'x-panthera-leo', nom: 'Lion', regime: 'carnivore' },
  { id: 'x-panthera-tigris', nom: 'Tigre', regime: 'carnivore' },
  { id: 'x-loxodonta-africana', nom: 'Éléphant', regime: 'herbivore', fav: 'fruits' },
  { id: 'x-rhinoceros-unicornis', nom: 'Rhinocéros', regime: 'herbivore' },
  { id: 'x-gorilla-beringei', nom: 'Gorille', regime: 'herbivore', fav: 'fruits' },
  { id: 'x-ailuropoda-melanoleuca', nom: 'Panda', regime: 'herbivore', fav: 'bambou' },
  { id: 'ursus-arctos', nom: 'Ours brun', regime: 'omnivore', fav: 'poisson' },
  { id: 'canis-lupus', nom: 'Loup', regime: 'carnivore' },
  { id: 'felis-silvestris', nom: 'Chat', regime: 'carnivore', fav: 'poisson' },
  { id: 'x-giraffa-camelopardalis', nom: 'Girafe', regime: 'herbivore' },
  { id: 'x-hippopotamus-amphibius', nom: 'Hippopotame', regime: 'herbivore' },
  { id: 'x-macropus-giganteus', nom: 'Kangourou', regime: 'herbivore' },
  { id: 'aquila-chrysaetos', nom: 'Aigle royal', regime: 'carnivore' },
  { id: 'x-aptenodytes-forsteri', nom: 'Manchot empereur', regime: 'piscivore' },
] as Star[]).filter(x => BYID[x.id]?.photo);
export const star = (id: string) => STARS.find(x => x.id === id)!;

// ---------------------------------------------------------------------
// Nourriture
// ---------------------------------------------------------------------
export type Aliment = 'herbe' | 'fruits' | 'bambou' | 'insectes' | 'poisson' | 'viande' | 'festin';
export const ALIMENTS: Record<Aliment, { nom: string; prix: number; faim: number; ic: string }> = {
  herbe: { nom: 'Herbe fraîche', prix: 5, faim: 20, ic: '🌿' },
  fruits: { nom: 'Panier de fruits', prix: 9, faim: 25, ic: '🍎' },
  bambou: { nom: 'Pousses de bambou', prix: 10, faim: 25, ic: '🎋' },
  insectes: { nom: 'Insectes croquants', prix: 7, faim: 15, ic: '🐛' },
  poisson: { nom: 'Poisson frais', prix: 12, faim: 30, ic: '🐟' },
  viande: { nom: 'Viande', prix: 15, faim: 35, ic: '🥩' },
  festin: { nom: 'Festin adapté', prix: 45, faim: 60, ic: '🍽️' },
};
const IDEAL: Record<Regime, Aliment[]> = { carnivore: ['viande'], herbivore: ['herbe', 'fruits', 'bambou'], omnivore: ['fruits', 'poisson', 'viande', 'insectes'], piscivore: ['poisson'] };
const CORRECT: Record<Regime, Aliment[]> = { carnivore: ['poisson', 'insectes'], herbivore: [], omnivore: ['herbe', 'bambou'], piscivore: ['viande', 'insectes'] };
export type Adequation = 'ideal' | 'correct' | 'inadapte';
export function adequation(c: Star, a: Aliment): Adequation {
  if (a === 'festin' || a === c.fav || IDEAL[c.regime].includes(a)) return 'ideal';
  return CORRECT[c.regime].includes(a) ? 'correct' : 'inadapte';
}
export const XP_REPAS: Record<Adequation, number> = { ideal: 30, correct: 14, inadapte: 6 };

// ---------------------------------------------------------------------
// Traits : un régime inhabituel répété transforme l'animal
// ---------------------------------------------------------------------
export interface Trait { id: string; nom: string; desc: string; seuil: number; quand: (c: Star, a: Aliment) => boolean; mods: Mods; capa?: string }
export const TRAITS: Trait[] = [
  { id: 'brouteur', nom: 'Brouteur', desc: "Un carnassier nourri d'herbe : plus endurant, apprend à se régénérer.", seuil: 8, quand: (c, a) => (c.regime === 'carnivore' || c.regime === 'piscivore') && ['herbe', 'fruits', 'bambou'].includes(a), mods: { pv: 1.15, att: 0.92 }, capa: 'photosynthese' },
  { id: 'carnassier', nom: 'Carnassier', desc: 'Un herbivore nourri de viande : plus agressif, ses crocs poussent.', seuil: 8, quand: (c, a) => c.regime === 'herbivore' && (a === 'viande' || a === 'poisson'), mods: { att: 1.15, def: 0.92 }, capa: 'crocs' },
  { id: 'toxique', nom: 'Toxique', desc: "Beaucoup d'insectes : son corps devient venimeux.", seuil: 10, quand: (_c, a) => a === 'insectes', mods: { def: 1.05 }, capa: 'venin' },
  { id: 'pecheur', nom: 'Pêcheur', desc: 'Beaucoup de poisson : agile et rapide.', seuil: 10, quand: (c, a) => a === 'poisson' && c.regime !== 'piscivore', mods: { vit: 1.12 }, capa: 'plongeon' },
];

// ---------------------------------------------------------------------
// Compétences : 1 point par niveau, 4 compétences actives au maximum
// ---------------------------------------------------------------------
export interface Competence { id: string; nom: string; desc: string; niv: number; effet?: Effet; p?: number; mods?: Mods; trait?: string }
export const COMPETENCES: Competence[] = [
  { id: 'griffes', nom: 'Coup de griffes', desc: 'Dégâts directs', niv: 1, effet: 'frappe', p: 1 },
  { id: 'morsure', nom: 'Morsure puissante', desc: 'Gros dégâts directs', niv: 2, effet: 'frappe', p: 2 },
  { id: 'carapace', nom: 'Cuir épais', desc: 'Absorbe des dégâts', niv: 2, effet: 'bouclier', p: 2 },
  { id: 'esquive', nom: 'Bond de côté', desc: 'Peut éviter la prochaine attaque', niv: 3, effet: 'esquive', p: 1 },
  { id: 'rugissement', nom: 'Rugissement', desc: "Baisse l'attaque adverse", niv: 3, effet: 'intimidation', p: 1 },
  { id: 'charge', nom: 'Charge', desc: 'Dégâts, peut étourdir', niv: 4, effet: 'etourdir', p: 2 },
  { id: 'repos', nom: 'Repos', desc: 'Rend des PV', niv: 5, effet: 'soin', p: 2 },
  { id: 'affut', nom: 'Affût', desc: 'Très fort si tu agis en premier', niv: 6, effet: 'embuscade', p: 2 },
  { id: 'sprint', nom: 'Sprint', desc: 'Plus rapide, +1 énergie', niv: 6, effet: 'vitesse', p: 1 },
  { id: 'furie', nom: 'Furie', desc: '2 à 4 coups', niv: 8, effet: 'nuee', p: 2 },
  { id: 'assaut', nom: 'Assaut dévastateur', desc: 'Énormes dégâts', niv: 12, effet: 'frappe', p: 3 },
  { id: 'robuste', nom: 'Robuste (passif)', desc: '+15 % de PV', niv: 4, mods: { pv: 1.15 } },
  { id: 'puissant', nom: 'Puissant (passif)', desc: '+12 % d’attaque', niv: 7, mods: { att: 1.12 } },
  { id: 'agile', nom: 'Agile (passif)', desc: '+12 % de vitesse', niv: 9, mods: { vit: 1.12 } },
  { id: 'blinde', nom: 'Blindé (passif)', desc: '+12 % de défense', niv: 11, mods: { def: 1.12 } },
  // débloquées par un trait
  { id: 'photosynthese', nom: 'Régénération verte', desc: 'Rend beaucoup de PV', niv: 1, effet: 'soin', p: 3, trait: 'brouteur' },
  { id: 'crocs', nom: 'Crocs acérés', desc: 'Gros dégâts directs', niv: 1, effet: 'frappe', p: 2, trait: 'carnassier' },
  { id: 'venin', nom: 'Morsure venimeuse', desc: 'Poison 3 tours', niv: 1, effet: 'poison', p: 2, trait: 'toxique' },
  { id: 'plongeon', nom: 'Plongeon', desc: 'Esquive améliorée', niv: 1, effet: 'esquive', p: 2, trait: 'pecheur' },
];
export const COMP = Object.fromEntries(COMPETENCES.map(c => [c.id, c])) as Record<string, Competence>;
export const MAX_ACTIVES = 4;

// ---------------------------------------------------------------------
// État du compagnon
// ---------------------------------------------------------------------
export interface Camp { xp: number; ecus: number; stock: number }
export interface Compagnon {
  v: 1; espece: string; surnom: string; xp: number;
  faim: number; bonheur: number; maj: number;          // jauges 0..100, dernière mise à jour (ms)
  ecus: number; appris: string[]; actives: string[];  // compétences apprises / équipées (4 max)
  repas: Record<string, number>; traits: string[];     // compteurs de régime, traits obtenus
  aventure: Record<string, number>;                    // étoiles par étape
  dernierChangement: number; jeuA: number; bonusJour: string; victoires: number; defaites: number; rating: number;
  camp?: Camp; recolte?: number;                     // camp d'entraînement (idle)
  // --- idle avancé (voir idle.ts) ---
  palier?: number; palierMax?: number; chasseA?: number;   // territoire : chasse automatique
  journal?: { t: number; ok: boolean; p: number }[];        // derniers combats automatiques
  coffres?: number; coffreFrac?: number; niveauCoffre?: number; eclats?: number;
  equip?: Partial<Record<Slot, Objet>>;
  heritage?: { points: number; total: number; talents: Partial<Record<TalentId, number>>; renaissances: number };
  missions?: { jour: string; c: Partial<Record<MissionId, number>>; pris: MissionId[]; bonus?: boolean };
  serie?: { jour: string; n: number };
  boost?: { jusqua: number; jour: string; n: number };
  vu?: number;
}
export type Slot = 'crocs' | 'pelage' | 'cuirasse' | 'amulette';
export type TalentId = 'sagesse' | 'fortune' | 'force' | 'flair' | 'endurance';
export type MissionId = 'recolte' | 'repas' | 'victoire' | 'coffre' | 'palier';
export interface Objet { slot: Slot; rar: number; ilvl: number; stat: keyof Mods; pct: number }
export const NIV_MAX = 50;
// courbe d'expérience : plus douce que les cartes (un seul animal)
export const xpNiv = (n: number) => 20 * (n - 1) * (n - 1) + 40 * (n - 1);
export const niveauC = (xp: number) => { let n = 1; while (n < NIV_MAX && xp >= xpNiv(n + 1)) n++; return n };
export const points = (c: Compagnon) => niveauC(c.xp) - 1 - c.appris.filter(id => !COMP[id]?.trait).length + 1; // 1 point offert au départ
export const peutChanger = (c: Compagnon) => niveauC(c.xp) >= c.dernierChangement + 10;

export function nouveau(espece: string, surnom: string): Compagnon {
  const now = Date.now();
  return { v: 1, espece, surnom, xp: 0, faim: 45, bonheur: 70, maj: now, ecus: 60, appris: ['griffes'], actives: ['griffes'], repas: {}, traits: [], aventure: {}, dernierChangement: 1, jeuA: 0, bonusJour: '', victoires: 0, defaites: 0, rating: 1000, camp: { xp: 0, ecus: 0, stock: 0 }, recolte: now, palier: 1, palierMax: 1, chasseA: now, coffres: 1, vu: now };
}

/** Le temps passe : la faim et le bonheur baissent (faim −4/h, bonheur −2/h) */
export function vieillir(c: Compagnon, now = Date.now()): Compagnon {
  const h = Math.max(0, (now - c.maj) / 3.6e6);
  return { ...c, faim: Math.max(0, c.faim - 4 * h), bonheur: Math.max(0, c.bonheur - 2 * h), maj: now };
}

export interface ResultatRepas { c: Compagnon; adeq: Adequation; xp: number; trait?: Trait; refus?: string }
export function nourrir(c0: Compagnon, a: Aliment): ResultatRepas {
  const c = { ...c0, repas: { ...c0.repas }, traits: [...c0.traits], appris: [...c0.appris] }, st = star(c.espece), al = ALIMENTS[a];
  if (c.faim >= 95) return { c: c0, adeq: 'ideal', xp: 0, refus: `${c.surnom} n'a plus faim.` };
  if (c.ecus < al.prix) return { c: c0, adeq: 'ideal', xp: 0, refus: 'Pas assez d’écus : gagne des combats !' };
  const adeq = adequation(st, a);
  let xp = XP_REPAS[adeq] * (a === 'festin' ? 2.5 : 1);
  if (c.faim < 30) xp *= 1.2;                       // un animal affamé profite davantage d'un bon repas
  c.ecus -= al.prix; c.faim = Math.min(100, c.faim + al.faim); c.xp += Math.round(xp);
  c.bonheur = Math.min(100, c.bonheur + (adeq === 'ideal' ? 6 : adeq === 'correct' ? 2 : -3));
  c.repas[a] = (c.repas[a] || 0) + 1;
  let gagne: Trait | undefined;
  for (const t of TRAITS) {
    if (c.traits.includes(t.id) || !t.quand(st, a)) continue;
    const n = Object.entries(c.repas).filter(([k]) => t.quand(st, k as Aliment)).reduce((s, [, v]) => s + v, 0);
    if (n >= t.seuil) { c.traits.push(t.id); if (t.capa && !c.appris.includes(t.capa)) c.appris.push(t.capa); gagne = t }
  }
  return { c, adeq, xp: Math.round(xp), trait: gagne };
}

export function jouer(c: Compagnon, now = Date.now()): Compagnon | null {
  if (now - c.jeuA < 30 * 60000) return null;
  return { ...c, bonheur: Math.min(100, c.bonheur + 25), faim: Math.max(0, c.faim - 5), jeuA: now };
}

export function apprendre(c: Compagnon, id: string): Compagnon | null {
  const k = COMP[id]; if (!k || k.trait || c.appris.includes(id) || niveauC(c.xp) < k.niv || points(c) <= 0) return null;
  const actives = k.effet && c.actives.length < MAX_ACTIVES ? [...c.actives, id] : c.actives;
  return { ...c, appris: [...c.appris, id], actives };
}
export function equiper(c: Compagnon, id: string): Compagnon {
  const k = COMP[id]; if (!k?.effet || !c.appris.includes(id)) return c;
  if (c.actives.includes(id)) return c.actives.length > 1 ? { ...c, actives: c.actives.filter(x => x !== id) } : c;
  return c.actives.length < MAX_ACTIVES ? { ...c, actives: [...c.actives, id] } : c;
}

/** Changer d'animal (tous les 10 niveaux) : nouvelle espèce, compétences et traits réinitialisés, niveau conservé */
export function changer(c: Compagnon, espece: string, surnom: string): Compagnon {
  return { ...c, espece, surnom, appris: ['griffes'], actives: ['griffes'], repas: {}, traits: [], dernierChangement: niveauC(c.xp) };
}

/** Le compagnon en combat : stats de son espèce × bonus de héros × état (faim, bonheur) × passifs et traits */
export const BONUS_HEROS = 1.3;
export function membre(c: Compagnon): Membre {
  const sp = BYID[c.espece], st = star(c.espece);
  const s: Species = { ...sp, nom: c.surnom || st.nom };
  const mods: Required<Mods> = { pv: BONUS_HEROS, att: BONUS_HEROS, def: BONUS_HEROS, vit: 1.1 };
  const forme = c.faim < 25 ? 0.8 : c.bonheur > 70 ? 1.05 : 1;
  for (const k of ['pv', 'att', 'def'] as const) mods[k] *= forme;
  const add = (m?: Mods) => { if (m) for (const k of Object.keys(m) as (keyof Mods)[]) mods[k] *= m[k] || 1 };
  c.appris.forEach(id => add(COMP[id]?.mods)); c.traits.forEach(id => add(TRAITS.find(t => t.id === id)?.mods));
  // équipement et héritage (idle)
  for (const o of Object.values(c.equip || {})) if (o) mods[o.stat] *= 1 + o.pct / 100;
  const f = 1 + 0.04 * (c.heritage?.talents.force || 0); for (const k of ['pv', 'att', 'def'] as const) mods[k] *= f;
  const abil: Ability[] = c.actives.map(id => COMP[id]).filter(k => k?.effet).map(k => ({ effet: k.effet!, puissance: k.p || 1, nom: k.nom }));
  return { s, lvl: 1, niv: niveauC(c.xp), abil, mods };
}
/** Nombre d'adversaires en aventure pour un compagnon seul */
export const MAX_ADVERSAIRES = 2;
export const ecusEtape = (g: number, premiere: boolean) => (premiere ? 15 + 2 * g : 4 + Math.floor(g / 5));
export const jour = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// ---------------------------------------------------------------------
// Difficultés de l'aventure : ★ facile, ★★ normal, ★★★ difficile
// (★★ s'ouvre après avoir gagné ★ sur la même étape, ★★★ après ★★ ; l'étape suivante s'ouvre dès ★)
// ---------------------------------------------------------------------
export const DIFFS = [
  { n: 1, nom: 'Facile', niv: 0, mult: 1, gain: 1 },
  { n: 2, nom: 'Normal', niv: 4, mult: 1.3, gain: 1.7 },
  { n: 3, nom: 'Difficile', niv: 8, mult: 1.7, gain: 2.6 },
] as const;
export const diffOuverte = (c: Compagnon, g: number, d: number) => d === 1 || (c.aventure[g] || 0) >= d - 1;
export function adversaires(foes: Membre[], d: number): Membre[] {
  const D = DIFFS[d - 1];
  return foes.slice(0, MAX_ADVERSAIRES).map(f => ({ ...f, niv: Math.min(60, (f.niv || 1) + D.niv), mult: Math.round(100 * (f.mult || 1) * D.mult) / 100 }));
}
/** Récompenses : pleines la première fois à chaque difficulté, réduites ensuite */
export function gainsEtape(c: Compagnon, g: number, d: number, won: boolean) {
  const D = DIFFS[d - 1], premiere = won && (c.aventure[g] || 0) < d;
  if (!won) return { xp: 5, ecus: 2, premiere: false };
  return { xp: Math.round((15 + 3 * g) * D.gain), ecus: Math.round(ecusEtape(g, premiere) * D.gain), premiere };
}
