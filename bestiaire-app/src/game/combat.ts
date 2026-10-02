import { Species, BYID } from './species';

export const ARCH = {
  p: { n: 'Prédateur', hp: 1, att: 1.25, def: 0.9, vit: 1.05, ab: [['embuscade', 3], ['frappe', 2]], l3: ['intimidation', 1], l5: ['frappe', 3] },
  g: { n: 'Costaud', hp: 1.25, att: 1.1, def: 1, vit: 0.8, ab: [['etourdir', 2], ['frappe', 2]], l3: ['bouclier', 1], l5: ['etourdir', 3] },
  f: { n: 'Rapide', hp: 0.95, att: 0.95, def: 0.85, vit: 1.35, ab: [['esquive', 2], ['frappe', 1]], l3: ['vitesse', 1], l5: ['embuscade', 2] },
  a: { n: 'Cuirassé', hp: 1.1, att: 0.85, def: 1.45, vit: 0.7, ab: [['bouclier', 2], ['frappe', 1]], l3: ['soin', 1], l5: ['bouclier', 3] },
  v: { n: 'Venimeux', hp: 0.95, att: 1, def: 0.95, vit: 1, ab: [['poison', 2], ['frappe', 1]], l3: ['intimidation', 1], l5: ['poison', 3] },
  n: { n: 'En groupe', hp: 1, att: 0.95, def: 0.9, vit: 1.1, ab: [['nuee', 2], ['esquive', 1]], l3: ['intimidation', 1], l5: ['nuee', 3] },
  o: { n: 'Opportuniste', hp: 1.05, att: 1, def: 1, vit: 1, ab: [['frappe', 1], ['soin', 2]], l3: ['intimidation', 1], l5: ['vitesse', 2] },
} as const;
export type Effet = 'frappe' | 'nuee' | 'poison' | 'bouclier' | 'esquive' | 'soin' | 'intimidation' | 'etourdir' | 'vitesse' | 'embuscade';
export const EFF: Record<Effet, string> = {
  frappe: 'Dégâts directs', nuee: '2 à 4 petits coups', poison: 'Poison 3 tours', bouclier: 'Absorbe des dégâts', esquive: 'Peut éviter la prochaine attaque',
  soin: 'Rend des PV', intimidation: "Baisse l'attaque adverse", etourdir: 'Dégâts, peut étourdir', vitesse: 'Plus rapide, +1 énergie', embuscade: 'Très fort si tu agis en premier',
};
const NAMES: Partial<Record<Effet, Partial<Record<string, string>>>> = {
  frappe: { M: 'Morsure', O: 'Coup de bec', R: 'Morsure', A: 'Coup de langue', P: 'Mâchoire', I: 'Mandibules', K: 'Chélicères', X: 'Pince' },
  embuscade: { M: 'Affût', O: 'Piqué', P: 'Attaque éclair', R: 'Détente', I: 'Saisie éclair', K: 'Guet', X: 'Embuscade' },
  esquive: { O: 'Envol', M: 'Bond', P: 'Plongée', A: 'Saut', R: 'Fuite', I: 'Envol' },
  bouclier: { M: 'Garde', R: 'Carapace', I: 'Élytres', X: 'Coquille', P: 'Armure' },
  poison: { I: 'Dard', K: 'Venin', R: 'Crochets venimeux', A: 'Peau toxique', X: 'Filaments urticants' },
  nuee: { O: 'Volée', I: 'Essaim', M: 'Meute' }, soin: { X: 'Régénération', O: 'Picorer', M: 'Repli au terrier' },
  intimidation: { O: "Cri d'alarme", M: 'Grognement', I: 'Bourdonnement', R: 'Sifflement' },
  vitesse: { O: "Battements d'ailes", P: 'Sprint aquatique', M: 'Course' }, etourdir: { M: 'Charge', O: 'Martèlement', P: 'Coup de queue', I: 'Coup de cornes' },
};
const GEN: Record<Effet, string> = { frappe: 'Attaque', embuscade: 'Embuscade', esquive: 'Esquive', bouclier: 'Protection', poison: 'Venin', nuee: 'Nuée', soin: 'Récupération', intimidation: 'Intimidation', vitesse: 'Accélération', etourdir: 'Coup puissant' };
export const abName = (e: Effet, s: Species) => (e === 'bouclier' && s.classe === 'M' && s.arch === 'a' ? 'Boule défensive' : NAMES[e]?.[s.classe] || GEN[e]);

const DEFAULT_G: Record<string, number> = { I: 0.5, K: 0.5, X: 30, P: 500, A: 30, R: 100, O: 100, M: 1000 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function baseStats(s: Species) {
  const g = s.g || DEFAULT_G[s.classe] || 50, lm = Math.log10(Math.max(g, 0.3)), A = ARCH[s.arch] || ARCH.o;
  return { pv: Math.round(clamp(28 + 15 * lm, 22, 120) * A.hp), att: Math.round(clamp(9 + 4 * lm, 6, 30) * A.att), def: Math.round(clamp(8 + 3 * lm, 5, 28) * A.def), vit: Math.round(clamp(14 - 1.2 * lm, 4, 20) * A.vit) };
}
export function statsAt(s: Species, lvl: number) { const b = baseStats(s), k = 1 + 0.1 * ((lvl || 1) - 1); return { pv: Math.round(b.pv * k), att: Math.round(b.att * k), def: Math.round(b.def * k), vit: Math.round(b.vit * k) }; }
export interface Ability { effet: Effet; puissance: number; nom: string }
export function abilities(s: Species, lvl: number): Ability[] {
  const A = ARCH[s.arch] || ARCH.o; const l: (readonly [string, number])[] = [...A.ab]; if (lvl >= 3) l.push(A.l3); if (lvl >= 5) l.push(A.l5);
  return l.map(([e, p], i) => ({ effet: e as Effet, puissance: p, nom: (i === 3 ? 'Spéciale : ' : '') + abName(e as Effet, s) }));
}
const PREY: Record<string, string[]> = { M: ['O', 'P', 'A'], O: ['I', 'K', 'R', 'A', 'X'], R: ['A', 'M', 'I'], A: ['I', 'K', 'X'], P: ['A', 'I', 'P', 'X'], I: ['I'], K: ['I'], X: [] };

export interface Fighter { s: Species; lvl: number; side: 'P' | 'E'; maxHp: number; hp: number; att: number; def: number; vit: number; energy: number; poison: { turns: number; dmg: number } | null; shield: number; dodge: number; stun: boolean; attMod: number; vitMod: number }
export interface LogLine { m: string; t?: 'sys'; adv?: boolean }
export interface Battle { round: number; biome: string; ph: string; P: Fighter[]; E: Fighter[]; pi: number; ei: number; log: LogLine[]; over: boolean; won?: boolean; fx?: { P: number; E: number } | null; pvp?: string; defRating?: number }
export type Rng = () => number;

export function mkFighter(s: Species, lvl: number, side: 'P' | 'E'): Fighter {
  const t = statsAt(s, lvl);
  return { s, lvl, side, maxHp: t.pv, hp: t.pv, att: t.att, def: t.def, vit: t.vit, energy: 1, poison: null, shield: 0, dodge: 0, stun: false, attMod: 1, vitMod: 1 };
}
export const prey = (a: Fighter, d: Fighter) => (a.s.arch === 'p' || a.s.arch === 'o') && (PREY[a.s.classe] || []).includes(d.s.classe) && a.s.id !== d.s.id;
export const active = (B: Battle, side: 'P' | 'E') => B[side][side === 'P' ? B.pi : B.ei];
function tb(B: Battle, f: Fighter) {
  let a = 1, d = 1, v = 1; if (f.s.biomes.includes(B.biome as never)) { a *= 1.15; d *= 1.15 }
  const night = B.ph === 'nuit', day = B.ph === 'jour';
  if (f.s.act === 'N') { if (night) { v *= 1.3; a *= 1.1 } else if (day) v *= 0.85 }
  else if (f.s.act === 'D') { if (day) { v *= 1.3; a *= 1.1 } else if (night) v *= 0.85 }
  else { if (!day && !night) { v *= 1.3; a *= 1.1 } else v *= 1.05 }
  return { a, d, v };
}
export const FATIGUE = 15, MAX_ROUNDS = 40;
const spd = (B: Battle, f: Fighter) => f.vit * f.vitMod * tb(B, f).v;
function hit(B: Battle, at: Fighter, df: Fighter, factor: number, L: LogLine[], rng: Rng) {
  if (df.dodge && rng() < df.dodge) { df.dodge = 0; L.push({ m: `${df.s.nom} esquive !` }); return }
  df.dodge = 0; const A = tb(B, at), D = tb(B, df);
  let dmg = at.att * at.attMod * A.a * factor * (30 / (30 + df.def * D.d)) * (0.9 + rng() * 0.2);
  const adv = prey(at, df); if (adv) dmg *= 1.5;
  // Fatigue : après le tour 15, les coups font de plus en plus mal (évite les combats sans fin)
  if (B.round > FATIGUE) dmg *= 1 + 0.2 * (B.round - FATIGUE);
  dmg = Math.max(1, Math.round(dmg));
  if (df.shield) { const ab = Math.min(df.shield, dmg); df.shield -= ab; dmg -= ab; if (ab) L.push({ t: 'sys', m: `Protection : ${ab} absorbés` }) }
  df.hp = Math.max(0, df.hp - dmg);
  L.push({ m: `${at.s.nom} inflige ${dmg} dégâts${adv ? ' (chaîne alimentaire ×1,5)' : ''}.`, adv });
}
function doAct(B: Battle, f: Fighter, t: Fighter, a: Ability | null, first: boolean, L: LogLine[], rng: Rng) {
  if (f.hp <= 0) return; if (f.stun) { f.stun = false; L.push({ m: `${f.s.nom} est étourdi et passe son tour.` }); return }
  if (!a) { L.push({ m: `${f.s.nom} attaque.` }); hit(B, f, t, 0.9, L, rng); return }
  f.energy -= a.puissance; const p = a.puissance; L.push({ m: `${f.s.nom} utilise ${a.nom}.` });
  switch (a.effet) {
    case 'frappe': hit(B, f, t, 1 + 0.4 * p, L, rng); break;
    case 'nuee': { const n = 2 + Math.floor(rng() * 3); for (let i = 0; i < n && t.hp > 0; i++) hit(B, f, t, 0.45 + 0.1 * p, L, rng); break }
    case 'poison': hit(B, f, t, 0.5, L, rng); if (t.hp > 0) { t.poison = { turns: 3, dmg: 3 + 3 * p }; L.push({ m: `${t.s.nom} est empoisonné.` }) } break;
    case 'bouclier': f.shield = Math.max(f.shield, 8 + 7 * p); // ne se cumule pas L.push({ m: `${f.s.nom} se protège (${8 + 7 * p}).` }); break;
    case 'esquive': f.dodge = Math.min(0.9, 0.5 + 0.1 * p); L.push({ m: `${f.s.nom} se prépare à esquiver.` }); break;
    case 'soin': { const h = Math.min(f.maxHp - f.hp, Math.round(f.maxHp * (0.1 + 0.08 * p))); f.hp += h; L.push({ m: `${f.s.nom} récupère ${h} PV.` }); break }
    case 'intimidation': t.attMod = Math.max(0.5, t.attMod * (1 - 0.1 * p)); L.push({ m: `L'attaque de ${t.s.nom} baisse.` }); break;
    case 'etourdir': hit(B, f, t, 0.6 + 0.15 * p, L, rng); if (t.hp > 0 && rng() < 0.2 + 0.15 * p) { t.stun = true; L.push({ m: `${t.s.nom} est étourdi !` }) } break;
    case 'vitesse': f.vitMod = Math.min(2, f.vitMod + 0.15 * p); f.energy = Math.min(5, f.energy + 1); L.push({ m: `${f.s.nom} accélère.` }); break;
    case 'embuscade': hit(B, f, t, first ? 1.2 + 0.4 * p : 0.55, L, rng); if (!first) L.push({ t: 'sys', m: "Embuscade éventée : l'adversaire a agi en premier." }); break;
  }
}
export function ai(f: Fighter, rng: Rng): Ability | null {
  const ab = abilities(f.s, f.lvl).filter(a => a.puissance <= f.energy);
  if (f.hp < f.maxHp * 0.35) { const d = ab.find(a => a.effet === 'soin' || a.effet === 'bouclier'); if (d) return d }
  if (ab.length && rng() < 0.75) { const off = ab.filter(a => ['frappe', 'nuee', 'poison', 'etourdir', 'embuscade'].includes(a.effet)); if (off.length) return off.sort((a, b) => b.puissance - a.puissance)[0]; return ab[Math.floor(rng() * ab.length)] }
  return null;
}
export function newBattle(team: { s: Species; lvl: number }[], foes: { s: Species; lvl: number }[], biome: string, ph: string): Battle {
  return { round: 1, biome, ph, P: team.map(x => mkFighter(x.s, x.lvl, 'P')), E: foes.map(x => mkFighter(x.s, x.lvl, 'E')), pi: 0, ei: 0, log: [], over: false };
}
/** Joue un tour. choice : capacité, null (attaque de base) ou {sw:index} (changement). Modifie B. */
export function playTurn(B: Battle, choice: Ability | null | { sw: number }, rng: Rng = Math.random) {
  if (B.over) return; const L: LogLine[] = []; const P = active(B, 'P'), E = active(B, 'E'), eA = ai(E, rng); const hp0 = { P: P.hp, E: E.hp };
  if (choice && 'sw' in choice) { B.pi = choice.sw; L.push({ m: `Tu envoies ${active(B, 'P').s.nom}.` }); doAct(B, E, active(B, 'P'), eA, true, L, rng) }
  else {
    const pf = spd(B, P) > spd(B, E) || (spd(B, P) === spd(B, E) && rng() < 0.5);
    const order: [Fighter, Fighter, Ability | null][] = pf ? [[P, E, choice], [E, P, eA]] : [[E, P, eA], [P, E, choice]];
    order.forEach(([f, t, a], i) => { if (f.hp > 0 && t.hp > 0) doAct(B, f, t, a, i === 0, L, rng) });
  }
  for (const f of [...B.P, ...B.E]) { if (f.hp > 0 && f.poison) { f.hp = Math.max(0, f.hp - f.poison.dmg); L.push({ t: 'sys', m: `Poison : ${f.s.nom} −${f.poison.dmg}` }); if (--f.poison.turns <= 0) f.poison = null } f.energy = Math.min(5, f.energy + 1) }
  B.fx = { P: Math.max(0, hp0.P - P.hp), E: Math.max(0, hp0.E - E.hp) }; B.round++;
  for (const sd of ['P', 'E'] as const) { const f = active(B, sd); if (f.hp <= 0) { L.push({ m: `${f.s.nom} est K.O.` }); const nx = B[sd].findIndex(x => x.hp > 0); if (nx >= 0) { if (sd === 'P') B.pi = nx; else B.ei = nx; L.push({ m: `${sd === 'P' ? 'Tu envoies' : 'Le camp adverse envoie'} ${B[sd][nx].s.nom}.` }) } } }
  B.log.push(...L);
  const pa = B.P.some(f => f.hp > 0), ea = B.E.some(f => f.hp > 0);
  if (!pa || !ea) { B.over = true; B.won = pa; return }
  if (B.round === FATIGUE + 1) B.log.push({ t: 'sys', m: 'Les animaux fatiguent : les coups font de plus en plus mal.' });
  if (B.round > MAX_ROUNDS) { // décision aux points : pourcentage de vie restant
    const pct = (side: Fighter[]) => side.reduce((a, f) => a + f.hp / f.maxHp, 0) / side.length;
    B.over = true; B.won = pct(B.P) >= pct(B.E); B.log.push({ t: 'sys', m: `Temps écoulé : victoire aux points ${B.won ? 'pour toi' : "pour l'adversaire"}.` });
  }
}
export const wildFoes = (pool: Species[], n: number, avgLvl: number, exclude: string[], rng: Rng = Math.random) =>
  [...pool].filter(s => !exclude.includes(s.id)).sort(() => rng() - 0.5).slice(0, n).map(s => ({ s, lvl: clamp(avgLvl + Math.floor(rng() * 3) - 1, 1, 7) }));
export { BYID };
