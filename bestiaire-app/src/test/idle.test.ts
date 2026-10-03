import { describe, it, expect } from 'vitest';
import { nouveau, xpNiv } from '../game/compagnon';
import {
  puissanceC, requis, chance, chasser, INTERVALLE, enAttente, recolter, booster, boosterRestant, ouvrir, ouvrirTout, tirerObjet, chancesRarete, equiperObjet,
  ameliorerCoffre, renaitre, peutRenaitre, pointsRenaissance, apprendreTalent, mission, prendreMission, prendreBonusMissions, bonusConnexion, retour, acheterCoffre, MISSIONS,
} from '../game/idle';
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const T0 = 1_800_000_000_000;
const base = () => ({ ...nouveau('x-panthera-leo', 'Simba'), maj: T0, recolte: T0, chasseA: T0, vu: T0, faim: 60 });

describe('territoire (chasse automatique)', () => {
  it('le palier requis augmente, la chance dépend de la puissance', () => {
    expect(requis(20)).toBeGreaterThan(requis(10)); expect(requis(10)).toBeGreaterThan(requis(9));   // boss
    expect(chance(1000, 1)).toBeCloseTo(0.97); expect(chance(10, 50)).toBeCloseTo(0.05);
  });
  it('une tentative toutes les 2 minutes, même hors ligne, plafonnée par le stockage', () => {
    const r = chasser(base(), T0 + 10 * INTERVALLE + 1000, seeded(1));
    expect(r.res.length).toBeGreaterThan(0); expect(r.res.length).toBeLessThanOrEqual(10);
    expect(r.c.palier).toBeGreaterThan(1); expect(r.c.chasseA).toBe(T0 + 10 * INTERVALLE + 1000);
    const loin = chasser(base(), T0 + 1000 * 3.6e6, seeded(2)); expect(loin.res.length).toBeLessThanOrEqual(120);  // 4 h de stockage
  });
  it('mur de puissance : on s’arrête quand c’est trop dur', () => {
    const c = { ...base(), palier: 200 }; const r = chasser(c, T0 + 3.6e6, seeded(3));
    expect(r.res.length).toBeLessThanOrEqual(2); expect(r.c.palier).toBe(200);
  });
  it('un animal équipé et de haut niveau est plus puissant', () => {
    const c = base(), fort = { ...c, xp: xpNiv(30), equip: { crocs: { slot: 'crocs' as const, rar: 3, ilvl: 30, stat: 'att' as const, pct: 50 } } };
    expect(puissanceC(fort)).toBeGreaterThan(puissanceC(c) * 1.5);
  });
});

describe('récolte et boost', () => {
  it('XP, écus et coffres selon le palier, plafonnés au stockage', () => {
    const c = { ...base(), palier: 20 }, a = enAttente(c, T0 + 2 * 3.6e6);
    expect(a.xp).toBe(2 * (10 + 60)); expect(a.ecus).toBe(2 * 24); expect(a.coffres).toBe(2);
    expect(enAttente(c, T0 + 99 * 3.6e6).h).toBe(4);
    const r = recolter(c, T0 + 2 * 3.6e6); expect(r.coffres).toBe(1 + 2); expect(enAttente(r, T0 + 2 * 3.6e6).xp).toBe(0);
  });
  it('boost ×2 : 3 fois par jour, 30 minutes', () => {
    let c = base(); const now = T0 + 1000;
    c = booster(c, now)!; expect(enAttente(c, now + 15 * 60000).xpH).toBe(2 * enAttente(base(), now).xpH);
    expect(booster(c, now + 1000)).toBeNull();                       // déjà actif
    c = booster(c, now + 31 * 60000)!; c = booster(c, now + 62 * 60000)!; expect(boosterRestant(c, now + 62 * 60000)).toBe(0);
  });
});

describe('coffres et équipement', () => {
  it('ouvrir un coffre donne un objet du niveau du palier', () => {
    const c = { ...base(), palier: 12, coffres: 1 }; const r = ouvrir(c, seeded(4))!;
    expect(r.o.ilvl).toBe(12); expect(r.c.coffres).toBe(0); expect(ouvrir(r.c)).toBeNull();
  });
  it('améliorer le coffre augmente les raretés', () => {
    const c = { ...base(), ecus: 1e6 }; const up = ameliorerCoffre(ameliorerCoffre(c)!)!;
    expect(chancesRarete(up)[3]).toBeGreaterThan(chancesRarete(c)[3]); expect(chancesRarete(up)[0]).toBeLessThan(chancesRarete(c)[0]);
  });
  it('« tout ouvrir » garde les meilleurs objets et recycle le reste', () => {
    const c = { ...base(), coffres: 30, palier: 20 }; const r = ouvrirTout(c, seeded(5));
    expect(r.c.coffres).toBe(0); expect(r.gardes.length + r.recycles).toBe(30); expect(r.c.ecus).toBeGreaterThan(c.ecus);
    expect(Object.keys(r.c.equip!).length).toBe(4);
  });
  it('équiper par-dessus un objet recycle l’ancien', () => {
    const o1 = tirerObjet(base(), seeded(6)), c1 = equiperObjet(base(), o1), c2 = equiperObjet(c1, { ...o1, pct: o1.pct + 5 });
    expect(c2.ecus).toBeGreaterThan(c1.ecus);
  });
  it('acheter un coffre coûte des écus', () => { const c = acheterCoffre({ ...base(), ecus: 500 })!; expect(c.coffres).toBe(2); expect(c.ecus).toBeLessThan(500) });
});

describe('renaissance et héritage', () => {
  it('possible dès le palier 25, donne des points, repart de zéro en gardant l’équipement', () => {
    const c = { ...base(), palierMax: 40, palier: 40, xp: xpNiv(30), equip: { crocs: tirerObjet(base(), seeded(7)) } };
    expect(peutRenaitre(c)).toBe(true); expect(peutRenaitre({ ...c, palierMax: 10 })).toBe(false);
    const pts = pointsRenaissance(c), n = renaitre(c, 'x-panthera-tigris', 'Shere Khan', T0);
    expect(pts).toBe(5 + 3); expect(n.heritage!.points).toBe(pts); expect(n.xp).toBe(0); expect(n.palier).toBe(1); expect(n.equip!.crocs).toBeTruthy();
    const t = apprendreTalent(n, 'force')!; expect(t.heritage!.talents.force).toBe(1);
    expect(puissanceC({ ...t, xp: 0 })).toBeGreaterThan(puissanceC({ ...n, xp: 0 }));
  });
});

describe('missions, connexion, absence', () => {
  it('missions du jour et coffre doré', () => {
    let c = { ...base(), coffres: 0 }; const now = T0;
    for (const [id, M] of Object.entries(MISSIONS)) { c = mission(c, id as keyof typeof MISSIONS, M.but, now); c = prendreMission(c, id as keyof typeof MISSIONS, now)! }
    expect(prendreMission(c, 'recolte', now)).toBeNull();
    const b = prendreBonusMissions(c, now)!; expect(b.coffres).toBe(c.coffres! + 3); expect(prendreBonusMissions(b, now)).toBeNull();
  });
  it('série de connexion', () => {
    const r1 = bonusConnexion(base(), T0)!; expect(r1.serie).toBe(1); expect(bonusConnexion(r1.c, T0 + 1000)).toBeNull();
    const r2 = bonusConnexion(r1.c, T0 + 864e5)!; expect(r2.serie).toBe(2); expect(r2.gain).toBe(35);
    expect(bonusConnexion(r2.c, T0 + 4 * 864e5)!.serie).toBe(1);
  });
  it('résumé « pendant ton absence » après plus de 5 minutes', () => {
    expect(retour(base(), T0 + 60000).absence).toBeNull();
    const r = retour(base(), T0 + 3 * 3.6e6, seeded(8)); expect(r.absence!.victoires).toBeGreaterThan(0); expect(r.c.vu).toBe(T0 + 3 * 3.6e6);
  });
});
