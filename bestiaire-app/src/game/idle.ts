// =====================================================================
// Idle du mode Compagnon — inspiré des jeux du moment (AFK Journey, Legend of Mushroom, Capybara Go…)
//   • Territoire : ton animal chasse tout seul, palier après palier, même appli fermée (mur de puissance)
//   • Récolte : XP, écus et coffres s'accumulent selon le palier atteint (stockage limité)
//   • Coffres → équipement (4 emplacements, 5 raretés), recyclage, amélioration du coffre
//   • Renaissance (prestige) : on repart du début contre des points d'héritage permanents
//   • Missions du jour, série de connexion, boost ×2
// Fonctions pures : tout est testé dans src/test/idle.test.ts
// =====================================================================
import { FRANCE, Species } from './species';
import { mkFighter, puissance } from './combat';
import { Camp, Compagnon as C, MissionId, Objet, Slot, TalentId, jour, membre, niveauC } from './compagnon';

// ---------------------------------------------------------------------
// Puissance du compagnon et territoire
// ---------------------------------------------------------------------
export function puissanceC(c: C) {
  const m = membre(c), f = mkFighter(m.s, 1, 'P', m.niv, false, 1, m.abil, m.mods);
  return Math.round(f.maxHp * 0.6 + f.att * 2.2 + f.def * 1.6 + f.vit * 1.2);
}
/** Puissance conseillée pour franchir un palier (boss tous les 10 paliers : +25 %) */
export const requis = (p: number) => Math.round((150 + 14 * (p - 1) + 0.12 * (p - 1) ** 2) * (p % 10 === 0 ? 1.25 : 1));
export const chance = (pow: number, p: number) => Math.max(0.05, Math.min(0.97, 0.5 + 1.4 * (pow / requis(p) - 1)));
export const INTERVALLE = 2 * 60000;                       // une tentative automatique toutes les 2 minutes
const VERTEBRES = FRANCE.filter(s => ['M', 'O', 'R', 'A'].includes(s.classe) && s.photo);
/** L'adversaire d'un palier (toujours le même pour tout le monde) */
export function gardien(p: number): Species {
  const pool = VERTEBRES.filter(s => p % 10 === 0 ? s.tier >= 2 : s.tier <= Math.min(4, 1 + Math.floor(p / 25)));
  return pool[(p * 7919) % pool.length];
}
export const BIOME_PALIER = (p: number) => (['P', 'F', 'H', 'L', 'M', 'V'] as const)[Math.floor((p - 1) / 10) % 6];

export interface Tentative { p: number; ok: boolean; t: number }
/** Fait avancer la chasse automatique jusqu'à maintenant (au plus la durée du stockage). */
export function chasser(c: C, now = Date.now(), rng: () => number = Math.random, forcer = false): { c: C; res: Tentative[] } {
  if (c.chasseA === undefined && !forcer) return { c: { ...c, chasseA: now, palier: c.palier || 1 }, res: [] };
  const depuis = c.chasseA ?? now, stockH = rendement(c).stockH;
  let n = forcer ? 1 : Math.floor(Math.min(now - depuis, stockH * 3.6e6) / INTERVALLE);
  if (n <= 0) return { c, res: [] };
  n = Math.min(n, 400);
  let p = c.palier || 1; const pow = puissanceC(c), res: Tentative[] = [];
  for (let i = 0; i < n; i++) {
    const ok = rng() < chance(pow, p);
    res.push({ p, ok, t: forcer ? now : depuis + (i + 1) * INTERVALLE });
    if (ok) p++;
    else if (chance(pow, p) < 0.2) break;           // mur de puissance : inutile d'insister
  }
  const gagnes = res.filter(r => r.ok).length;
  let n2: C = { ...c, palier: p, palierMax: Math.max(c.palierMax || 1, p), chasseA: forcer ? c.chasseA ?? now : now, journal: [...res.slice(-6).reverse(), ...(c.journal || [])].slice(0, 6) };
  if (gagnes) n2 = mission(n2, 'palier', gagnes);
  return { c: n2, res };
}

// ---------------------------------------------------------------------
// Récolte (camp d'entraînement) : dépend du palier atteint
// ---------------------------------------------------------------------
export const CAMP_MAX = 12;
export const AMELIORATIONS: { k: keyof Camp; nom: string; desc: string; base: number }[] = [
  { k: 'xp', nom: "Terrain d'entraînement", desc: "+25 % d'expérience par heure", base: 60 },
  { k: 'ecus', nom: 'Spectacles', desc: '+25 % d’écus par heure', base: 60 },
  { k: 'stock', nom: 'Grand enclos', desc: '+2 h de stockage (récolte et chasse)', base: 80 },
];
export const prixAmelioration = (k: keyof Camp, lvl: number) => AMELIORATIONS.find(a => a.k === k)!.base * 2 ** lvl;
export const campDe = (c: C): Camp => c.camp || { xp: 0, ecus: 0, stock: 0 };
const tal = (c: C, t: TalentId) => c.heritage?.talents[t] || 0;
export const boostActif = (c: C, now = Date.now()) => (c.boost?.jusqua || 0) > now;
export function rendement(c: C, now = Date.now()) {
  const cp = campDe(c), p = c.palier || 1, faible = c.faim < 10;
  const k = (faible ? 0.5 : 1) * (boostActif(c, now) ? 2 : 1);
  return {
    xpH: (10 + 3 * p) * (1 + 0.25 * cp.xp) * (1 + 0.1 * tal(c, 'sagesse')) * k,
    ecusH: (4 + p) * (1 + 0.25 * cp.ecus) * (1 + 0.1 * tal(c, 'fortune')) * k,
    coffresH: (0.5 + p / 40) * (1 + 0.1 * tal(c, 'flair')) * k,
    stockH: 4 + 2 * cp.stock + tal(c, 'endurance'), faible,
  };
}
export function enAttente(c: C, now = Date.now()) {
  const r = rendement(c, now), depuis = c.recolte ?? c.maj;
  const h = Math.max(0, Math.min(r.stockH, (now - depuis) / 3.6e6));
  const cf = h * r.coffresH + (c.coffreFrac || 0);
  return { h, xp: Math.floor(h * r.xpH), ecus: Math.floor(h * r.ecusH), coffres: Math.floor(cf), frac: cf - Math.floor(cf), plein: h >= r.stockH, ...r };
}
export function recolter(c: C, now = Date.now()): C {
  const a = enAttente(c, now);
  let n: C = { ...c, xp: c.xp + a.xp, ecus: c.ecus + a.ecus, coffres: (c.coffres || 0) + a.coffres, coffreFrac: a.frac, recolte: now };
  if (a.xp || a.ecus) n = mission(n, 'recolte');
  return n;
}
export function ameliorer(c: C, k: keyof Camp): C | null {
  const r = recolter(c), cp = campDe(c), lvl = cp[k], prix = prixAmelioration(k, lvl);
  if (lvl >= CAMP_MAX || r.ecus < prix) return null;
  return { ...r, ecus: r.ecus - prix, camp: { ...cp, [k]: lvl + 1 } };
}
/** Boost ×2 pendant 30 min, 3 fois par jour */
export const BOOSTS_JOUR = 3;
export function boosterRestant(c: C, now = Date.now()) { return c.boost?.jour === jour(now) ? BOOSTS_JOUR - c.boost.n : BOOSTS_JOUR }
export function booster(c: C, now = Date.now()): C | null {
  if (boosterRestant(c, now) <= 0 || boostActif(c, now)) return null;
  const r = recolter(c, now);   // on encaisse d'abord ce qui a été gagné sans boost
  return { ...r, boost: { jusqua: now + 30 * 60000, jour: jour(now), n: (c.boost?.jour === jour(now) ? c.boost.n : 0) + 1 } };
}

// ---------------------------------------------------------------------
// Coffres et équipement
// ---------------------------------------------------------------------
export const RARETES = ['Commun', 'Rare', 'Épique', 'Légendaire', 'Mythique'];
export const RAR_COL = ['#9aa38f', '#4f8fe0', '#a46be0', '#f0b54a', '#ff5a6a'];
const RAR_MULT = [1, 1.6, 2.4, 3.5, 5];
export const SLOTS: Record<Slot, { nom: string; stat: Objet['stat']; ic: string; k: number }> = {
  crocs: { nom: 'Crocs', stat: 'att', ic: '🦷', k: 1 },
  pelage: { nom: 'Pelage', stat: 'pv', ic: '🧥', k: 1.2 },
  cuirasse: { nom: 'Cuirasse', stat: 'def', ic: '🛡️', k: 1 },
  amulette: { nom: 'Amulette', stat: 'vit', ic: '📿', k: 0.6 },
};
export const STAT_NOM: Record<string, string> = { att: 'attaque', pv: 'PV', def: 'défense', vit: 'vitesse' };
export const NIV_COFFRE_MAX = 10;
export function chancesRarete(c: C) {
  const L = c.niveauCoffre || 1, f = tal(c, 'flair');
  const w = [Math.max(10, 70 - 5 * L - 2 * f), 22 + 2 * L, 6 + 2 * L + f, 1.8 + 0.8 * L + 0.5 * f, 0.2 + 0.2 * L + 0.2 * f];
  const t = w.reduce((a, b) => a + b, 0); return w.map(x => x / t);
}
export const pctObjet = (slot: Slot, rar: number, ilvl: number) => Math.round((3 + 0.25 * ilvl) * RAR_MULT[rar] * SLOTS[slot].k);
export function tirerObjet(c: C, rng: () => number = Math.random, rarMin = 0): Objet {
  const ch = chancesRarete(c); let x = rng(), rar = 0;
  for (let i = 0; i < ch.length; i++) { x -= ch[i]; if (x <= 0) { rar = i; break } rar = i }
  rar = Math.max(rar, rarMin);
  const slot = (Object.keys(SLOTS) as Slot[])[Math.floor(rng() * 4)], ilvl = c.palier || 1;
  return { slot, rar, ilvl, stat: SLOTS[slot].stat, pct: pctObjet(slot, rar, ilvl) };
}
const ACCORD: Record<Slot, (r: number) => string> = {
  crocs: r => ['communs', 'rares', 'épiques', 'légendaires', 'mythiques'][r],
  pelage: r => ['commun', 'rare', 'épique', 'légendaire', 'mythique'][r],
  cuirasse: r => ['commune', 'rare', 'épique', 'légendaire', 'mythique'][r],
  amulette: r => ['commune', 'rare', 'épique', 'légendaire', 'mythique'][r],
};
export const nomObjet = (o: Objet) => `${SLOTS[o.slot].nom} ${ACCORD[o.slot](o.rar)}`;
export const prixRecyclage = (o: Objet) => Math.round([3, 8, 20, 60, 200][o.rar] * (1 + o.ilvl / 20));
export const meilleur = (c: C, o: Objet) => o.pct > (c.equip?.[o.slot]?.pct || 0);
export function ouvrir(c: C, rng: () => number = Math.random): { c: C; o: Objet } | null {
  if ((c.coffres || 0) <= 0) return null;
  const o = tirerObjet(c, rng);
  return { c: mission({ ...c, coffres: (c.coffres || 0) - 1 }, 'coffre'), o };
}
export const equiperObjet = (c: C, o: Objet): C => {
  const ancien = c.equip?.[o.slot];
  return { ...c, equip: { ...(c.equip || {}), [o.slot]: o }, ecus: c.ecus + (ancien ? prixRecyclage(ancien) : 0) };
};
export const recycler = (c: C, o: Objet): C => ({ ...c, ecus: c.ecus + prixRecyclage(o) });
/** Ouvre tous les coffres : garde automatiquement les meilleurs objets, recycle le reste */
export function ouvrirTout(c: C, rng: () => number = Math.random) {
  let n = c; const gardes: Objet[] = []; let recycles = 0, gain = 0;
  while ((n.coffres || 0) > 0) {
    const r = ouvrir(n, rng)!; n = r.c;
    if (meilleur(n, r.o)) { n = equiperObjet(n, r.o); gardes.push(r.o) } else { gain += prixRecyclage(r.o); n = recycler(n, r.o); recycles++ }
  }
  return { c: n, gardes, recycles, gain };
}
/** Acheter un coffre au marchand (le prix suit le palier) */
export const prixAchatCoffre = (c: C) => 40 + 3 * (c.palier || 1);
export function acheterCoffre(c: C): C | null { const p = prixAchatCoffre(c); return c.ecus < p ? null : { ...c, ecus: c.ecus - p, coffres: (c.coffres || 0) + 1 } }
export const prixCoffre = (L: number) => 150 * 2 ** (L - 1);
export function ameliorerCoffre(c: C): C | null {
  const L = c.niveauCoffre || 1; if (L >= NIV_COFFRE_MAX || c.ecus < prixCoffre(L)) return null;
  return { ...c, ecus: c.ecus - prixCoffre(L), niveauCoffre: L + 1 };
}

// ---------------------------------------------------------------------
// Renaissance (prestige) et héritage
// ---------------------------------------------------------------------
export const PALIER_RENAISSANCE = 25;
export const TALENTS: Record<TalentId, { nom: string; desc: string }> = {
  sagesse: { nom: 'Sagesse', desc: "+10 % d'XP récoltée par niveau" },
  fortune: { nom: 'Fortune', desc: '+10 % d’écus récoltés par niveau' },
  force: { nom: 'Force ancestrale', desc: '+4 % de PV, attaque et défense par niveau' },
  flair: { nom: 'Flair', desc: '+10 % de coffres et meilleures raretés' },
  endurance: { nom: 'Endurance', desc: '+1 h de stockage par niveau' },
};
export const TALENT_MAX = 10;
export const pointsRenaissance = (c: C) => Math.max(0, Math.floor(((c.palierMax || 1) - 15) / 5) + Math.floor(niveauC(c.xp) / 10));
export const peutRenaitre = (c: C) => (c.palierMax || 1) >= PALIER_RENAISSANCE;
/** Recommencer avec un nouvel animal : niveau, palier et compétences repartent de zéro ; on garde l'équipement, le camp, les écus et l'héritage */
export function renaitre(c: C, espece: string, surnom: string, now = Date.now()): C {
  const pts = pointsRenaissance(c), h = c.heritage || { points: 0, total: 0, talents: {}, renaissances: 0 };
  return {
    ...c, espece, surnom, xp: 0, appris: ['griffes'], actives: ['griffes'], repas: {}, traits: [], dernierChangement: 1,
    palier: 1, chasseA: now, journal: [], faim: Math.max(c.faim, 60),
    heritage: { ...h, points: h.points + pts, total: h.total + pts, renaissances: h.renaissances + 1 },
  };
}
export const prixTalent = (lvl: number) => lvl + 1;
export function apprendreTalent(c: C, t: TalentId): C | null {
  const h = c.heritage; if (!h) return null; const lvl = h.talents[t] || 0, prix = prixTalent(lvl);
  if (lvl >= TALENT_MAX || h.points < prix) return null;
  return { ...c, heritage: { ...h, points: h.points - prix, talents: { ...h.talents, [t]: lvl + 1 } } };
}

// ---------------------------------------------------------------------
// Missions du jour et série de connexion
// ---------------------------------------------------------------------
export const MISSIONS: Record<MissionId, { nom: string; but: number; ecus?: number; coffres?: number }> = {
  recolte: { nom: 'Récolter le camp 3 fois', but: 3, ecus: 30 },
  repas: { nom: 'Donner 2 repas adaptés', but: 2, coffres: 1 },
  victoire: { nom: 'Gagner 3 combats', but: 3, ecus: 40 },
  coffre: { nom: 'Ouvrir 5 coffres', but: 5, coffres: 1 },
  palier: { nom: 'Franchir 3 paliers', but: 3, coffres: 2 },
};
export function missionsDuJour(c: C, now = Date.now()) {
  const j = jour(now);
  return c.missions?.jour === j ? c.missions : { jour: j, c: {}, pris: [] as MissionId[], bonus: false };
}
export function mission(c: C, id: MissionId, n = 1, now = Date.now()): C {
  const m = missionsDuJour(c, now);
  return { ...c, missions: { ...m, c: { ...m.c, [id]: (m.c[id] || 0) + n } } };
}
export function prendreMission(c: C, id: MissionId, now = Date.now()): C | null {
  const m = missionsDuJour(c, now), M = MISSIONS[id];
  if (m.pris.includes(id) || (m.c[id] || 0) < M.but) return null;
  return { ...c, ecus: c.ecus + (M.ecus || 0), coffres: (c.coffres || 0) + (M.coffres || 0), missions: { ...m, pris: [...m.pris, id] } };
}
/** Toutes les missions faites : coffre doré (3 coffres, au moins un objet rare garanti à l'ouverture suivante) */
export function prendreBonusMissions(c: C, now = Date.now()): C | null {
  const m = missionsDuJour(c, now);
  if (m.bonus || m.pris.length < Object.keys(MISSIONS).length) return null;
  return { ...c, coffres: (c.coffres || 0) + 3, missions: { ...m, bonus: true } };
}
/** Bonus de connexion : 25 écus + 5 par jour de série (jusqu'à 7 jours) */
export function bonusConnexion(c: C, now = Date.now()): { c: C; gain: number; serie: number } | null {
  const j = jour(now); if (c.bonusJour === j) return null;
  const hier = jour(now - 864e5), n = c.serie?.jour === hier ? c.serie.n + 1 : 1, gain = 25 + 5 * Math.min(n, 7);
  return { c: { ...c, ecus: c.ecus + gain, bonusJour: j, serie: { jour: j, n }, coffres: (c.coffres || 0) + (n % 7 === 0 ? 2 : 0) }, gain, serie: n };
}

// ---------------------------------------------------------------------
// Résumé d'absence (« Pendant ton absence… »)
// ---------------------------------------------------------------------
export interface Absence { duree: number; paliers: number; victoires: number; defaites: number; attente: ReturnType<typeof enAttente> }
export function retour(c: C, now = Date.now(), rng: () => number = Math.random): { c: C; absence: Absence | null } {
  const vu = c.vu ?? now, avant = c.palier || 1;
  const { c: n, res } = chasser(c, now, rng);
  const duree = now - vu, absence = duree > 5 * 60000 ? { duree, paliers: (n.palier || 1) - avant, victoires: res.filter(r => r.ok).length, defaites: res.filter(r => !r.ok).length, attente: enAttente(n, now) } : null;
  return { c: { ...n, vu: now }, absence };
}
export const dureeTexte = (ms: number) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min` };
export { puissance };
