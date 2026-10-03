import { describe, it, expect } from 'vitest';
import { FRANCE } from '../game/species';
import { nivMax, niveau, nivBrut, xpPour, progression } from '../game/rpg';
import { abilities, statsAt, newBattle, playTurn, ai, mkFighter, ultPret, aInstinct, INST_MAX, MAX_ROUNDS } from '../game/combat';
import { etape, NB_ETAPES, etoilesGagnees, xpEtape, plumesEtape } from '../game/adventure';

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const M = FRANCE.find(s => s.classe === 'M' && s.arch === 'p')!;
const O = FRANCE.find(s => s.classe === 'O')!;

describe('progression RPG', () => {
  it('courbe d’expérience inversible', () => {
    for (let n = 1; n <= 40; n++) { expect(nivBrut(xpPour(n))).toBe(n); if (n > 1) expect(nivBrut(xpPour(n) - 1)).toBe(n - 1) }
    expect([xpPour(1), xpPour(10), xpPour(40)]).toEqual([0, 720, 8970]);
  });
  it('le rang plafonne le niveau (10 à ★, 40 à ★★★★★★★)', () => {
    expect([1, 2, 7].map(nivMax)).toEqual([10, 15, 40]);
    expect(niveau(99999, 1)).toBe(10); expect(niveau(99999, 7)).toBe(40);
    const p = progression(xpPour(10), 1); expect(p.plafond).toBe(true); expect(p.pct).toBe(100);
  });
  it('+3,5 % de stats par niveau, en plus du rang', () => {
    const a = statsAt(M, 1, 1), b = statsAt(M, 1, 21);
    expect(b.att / a.att).toBeGreaterThan(1.6); expect(b.att / a.att).toBeLessThan(1.8);
    expect(statsAt(M, 1)).toEqual(a);
  });
  it('capacités débloquées par le niveau ou par le rang', () => {
    expect(abilities(M, 1, 1).length).toBe(2);
    expect(abilities(M, 1, 5).length).toBe(3); expect(abilities(M, 1, 12).length).toBe(4);
    expect(abilities(M, 3, 1).length).toBe(3); expect(abilities(M, 5, 1).length).toBe(4);
  });
});

describe('instinct et coups ultimes', () => {
  it('pas d’instinct au niveau 1, débloqué au niveau 3', () => {
    expect(aInstinct(mkFighter(M, 1, 'P', 1))).toBe(false);
    expect(aInstinct(mkFighter(M, 1, 'P', 3))).toBe(true);
  });
  it('la jauge se remplit en combat puis l’ultime la vide', () => {
    const rng = seeded(3);
    const B = newBattle([{ s: M, lvl: 1, niv: 8 }], [{ s: O, lvl: 1, niv: 30 }], 'F', 'jour');
    for (let i = 0; i < 6 && !B.over; i++) playTurn(B, null, rng);
    const P = B.P[0];
    if (!B.over) {
      expect(P.inst).toBeGreaterThan(0);
      P.inst = INST_MAX; expect(ultPret(P)).toBe(true);
      playTurn(B, { ult: true }, rng);
      expect(B.log.some(l => /libère son instinct/.test(l.m))).toBe(true);
      expect(P.inst).toBeLessThan(INST_MAX);
    }
  });
  it('un ultime demandé sans jauge pleine devient une attaque simple', () => {
    const B = newBattle([{ s: M, lvl: 1, niv: 8 }], [{ s: O, lvl: 1, niv: 8 }], 'F', 'jour');
    playTurn(B, { ult: true }, seeded(1));
    expect(B.log.some(l => /libère son instinct/.test(l.m) && l.m.startsWith(M.nom))).toBe(false);
  });
  it('le piqué de l’oiseau frappe toujours en premier', () => {
    const slow = FRANCE.filter(s => s.classe === 'M').sort((a, b) => statsAt(b, 1).vit - statsAt(a, 1).vit)[0];
    const B = newBattle([{ s: O, lvl: 1, niv: 5 }], [{ s: slow, lvl: 7, niv: 40 }], 'F', 'jour');
    B.P[0].inst = INST_MAX; B.E[0].vitMod = 2;
    playTurn(B, { ult: true }, seeded(5));
    expect(B.ev![0].k).toBe('ult'); expect(B.ev![0].side).toBe('P');
  });
  it('les combats se terminent toujours avec les ultimes', () => {
    const rng = seeded(11);
    for (let k = 0; k < 150; k++) {
      const pick = () => FRANCE[Math.floor(rng() * FRANCE.length)];
      const B = newBattle([0, 1, 2].map(() => ({ s: pick(), lvl: 1 + Math.floor(rng() * 7), niv: 1 + Math.floor(rng() * 40) })), [0, 1, 2].map(() => ({ s: pick(), lvl: 1 + Math.floor(rng() * 7), niv: 1 + Math.floor(rng() * 40), boss: rng() < 0.2 })), 'H', 'nuit');
      let n = 0; while (!B.over && n++ < 100) playTurn(B, ai(B.P[B.pi], rng), rng);
      expect(B.over).toBe(true); expect(B.round).toBeLessThanOrEqual(MAX_ROUNDS + 1);
      for (const f of [...B.P, ...B.E]) { expect(f.hp).toBeGreaterThanOrEqual(0); expect(f.hp).toBeLessThanOrEqual(f.maxHp); expect(f.inst).toBeLessThanOrEqual(INST_MAX) }
    }
  });
});

describe('aventure', () => {
  it('60 étapes, reproductibles, avec élites et boss', () => {
    expect(NB_ETAPES).toBe(60);
    for (let g = 0; g < NB_ETAPES; g++) {
      const e = etape(g), e2 = etape(g);
      expect(e.foes.map(f => f.s.id)).toEqual(e2.foes.map(f => f.s.id));
      expect(e.foes.length).toBeGreaterThan(0); expect(e.foes.length).toBeLessThanOrEqual(3);
      expect(new Set(e.foes.map(f => f.s.id)).size).toBe(e.foes.length);
      expect(e.foes.every(f => f.s.biomes.includes(e.biome) && f.s.photo)).toBe(true);
      expect(e.genre).toBe(g % 10 === 9 ? 'boss' : g % 10 === 4 ? 'elite' : 'normal');
      if (e.genre === 'boss') { expect(e.foes[e.foes.length - 1].boss).toBe(true); expect(e.pellicule).toBe(true) }
      expect(e.foes.every(f => (f.mult || 1) >= 0.7 && (f.mult || 1) <= 1.6)).toBe(true);
    }
  });
  it('les adversaires deviennent plus forts au fil des chapitres', () => {
    const niv = (g: number) => etape(g).foes[0].niv!;
    expect(niv(55)).toBeGreaterThan(niv(25)); expect(niv(25)).toBeGreaterThan(niv(2));
  });
  it('étoiles : victoire, sans K.O., en peu de tours', () => {
    expect(etoilesGagnees(false, 0, 3, 9)).toBe(0);
    expect(etoilesGagnees(true, 2, 20, 9)).toBe(1);
    expect(etoilesGagnees(true, 0, 20, 9)).toBe(2);
    expect(etoilesGagnees(true, 0, 9, 9)).toBe(3);
  });
  it('récompenses identiques au serveur (adventure_win)', () => {
    expect([xpEtape(0), xpEtape(9)]).toEqual([15, 42]);
    expect([plumesEtape(0), plumesEtape(9), plumesEtape(10)]).toEqual([20, 156, 60]);
  });
});
