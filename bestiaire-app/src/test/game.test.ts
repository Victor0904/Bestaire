import { describe, it, expect } from 'vitest';
import { ALL, FRANCE, FOREIGN, cote, seasonText, qIndex, ODDS } from '../game/species';
import { newBattle, playTurn, ai, MAX_ROUNDS, abilities, statsAt, wildFoes, prey, mkFighter } from '../game/combat';
import { premiumUntil, customerId } from '../../supabase/functions/_shared/premium';
import sqlCote from './cote-sql.json';

// Générateur pseudo-aléatoire reproductible
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('données espèces', () => {
  it('1 135 espèces, identifiants uniques', () => {
    expect(ALL.length).toBe(1135);
    expect(new Set(ALL.map(s => s.id)).size).toBe(ALL.length);
  });
  it('France et étranger', () => {
    expect(FRANCE.length).toBeGreaterThan(1000);
    expect(FOREIGN.length).toBeGreaterThan(40);
  });
  it('chaque niveau de rareté existe', () => {
    for (let t = 0; t < 5; t++) expect(FRANCE.some(s => s.tier === t)).toBe(true);
    expect(ODDS.reduce((a, b) => a + b)).toBe(100);
  });
  it('chaque espèce française a une photo valide', () => {
    expect(FRANCE.length).toBeGreaterThan(1050);
    for (const s of ALL.filter(x => x.photo)) { const [sh, i] = s.photo!; expect(sh).toBeLessThan(28); expect(i).toBeLessThan(40) }
    for (const s of FRANCE) expect(s.photo, s.id).not.toBeNull();
  });
});

describe('cote', () => {
  it('identique à la fonction SQL g_cote (560 cas)', () => {
    for (const [t, l, q, f, exp] of sqlCote as [number, number, number, boolean, number][]) {
      const s = { ...ALL[0], tier: t, pays: f ? 'BR' : null };
      expect(cote(s, l, q), `${t}/${l}/${q}/${f}`).toBe(exp);
    }
  });
  it('seuils de qualité', () => {
    expect([0, 39, 40, 79, 80, 94, 95, 100].map(qIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('saisons', () => {
  const s = (months: number[] | null) => ({ ...ALL[0], months });
  it('toute l’année', () => expect(seasonText(s(null))).toBe("toute l'année"));
  it('période simple', () => expect(seasonText(s([4, 5, 6]))).toBe('de avril à juin'));
  it('période à cheval sur l’hiver', () => expect(seasonText(s([11, 12, 1, 2]))).toBe('de novembre à février'));
  it('deux périodes', () => expect(seasonText(s([3, 4, 9, 10]))).toBe('de mars à avril, puis septembre à octobre'));
});

describe('combat', () => {
  const team = FRANCE.filter(s => s.classe === 'M').slice(0, 3).map(s => ({ s, lvl: 3 }));
  it('les stats montent de 10 % par niveau', () => {
    const a = statsAt(team[0].s, 1), b = statsAt(team[0].s, 7);
    expect(b.pv).toBeGreaterThan(a.pv * 1.5);
  });
  it('capacités débloquées aux niveaux 3 et 5', () => {
    const sp = team[0].s;
    expect(abilities(sp, 5).length).toBeGreaterThan(abilities(sp, 1).length);
    expect(abilities(sp, 3).length).toBeGreaterThanOrEqual(abilities(sp, 1).length);
  });
  it.each([['joueur qui spamme la 1re capacité', false], ['joueur qui joue comme l’IA', true]])('un combat se termine toujours : %s', (_n, smart) => {
    const rng = seeded(42);
    let wins = 0;
    for (let k = 0; k < 300; k++) {
      const foes = wildFoes(FRANCE, 3, 3, team.map(t => t.s.id), rng);
      const B = newBattle(team, foes, 'F', 'jour');
      let n = 0;
      while (!B.over && n++ < 100) {
        const f = B.P[B.pi]; const ab = smart ? ai(f, rng) : abilities(f.s, f.lvl).find(a => f.energy >= a.puissance) || null;
        playTurn(B, ab, rng);
      }
      expect(B.over).toBe(true);
      expect(B.round).toBeLessThanOrEqual(MAX_ROUNDS + 1);
      for (const f of [...B.P, ...B.E]) { expect(f.hp).toBeGreaterThanOrEqual(0); expect(f.hp).toBeLessThanOrEqual(f.maxHp) }
      if (B.won) wins++;
    }
    expect(wins).toBeGreaterThan(0);
    expect(wins).toBeLessThan(300);
  });
  it('chaîne alimentaire : un prédateur chasse sa proie', () => {
    const oiseau = FRANCE.find(s => s.classe === 'O' && s.arch === 'p')!;
    const insecte = FRANCE.find(s => s.classe === 'I' && s.arch !== 'p' && s.arch !== 'o')!;
    expect(prey(mkFighter(oiseau, 1, 'P'), mkFighter(insecte, 1, 'E'))).toBe(true);
    expect(prey(mkFighter(insecte, 1, 'P'), mkFighter(oiseau, 1, 'E'))).toBe(false);
  });
  it('changement d’animal', () => {
    const B = newBattle(team, wildFoes(FRANCE, 3, 1, [], seeded(1)), 'F', 'jour');
    playTurn(B, { sw: 2 }, seeded(2));
    expect(B.pi === 2 || B.P[2].hp <= 0).toBe(true);
  });
});

describe('abonnement Stripe', () => {
  const now = Date.UTC(2026, 9, 2);
  const end = Math.floor(Date.UTC(2026, 10, 2) / 1000);
  it('abonnement actif : fin de période + 2 jours', () => {
    expect(premiumUntil({ status: 'active', current_period_end: end, customer: 'cus_1' }, now)).toBe(new Date(end * 1000 + 2 * 86400_000).toISOString());
  });
  it('nouvelle API Stripe : période dans items', () => {
    expect(premiumUntil({ status: 'trialing', items: { data: [{ current_period_end: end }] }, customer: 'cus_1' }, now)).toBe(new Date(end * 1000 + 2 * 86400_000).toISOString());
  });
  it('paiement en retard : premium conservé', () => {
    expect(premiumUntil({ status: 'past_due', current_period_end: end, customer: 'cus_1' }, now)).not.toBe(new Date(now).toISOString());
  });
  it('résilié ou impayé : premium coupé tout de suite', () => {
    for (const st of ['canceled', 'unpaid', 'incomplete_expired'])
      expect(premiumUntil({ status: st, current_period_end: end, customer: 'cus_1' }, now)).toBe(new Date(now).toISOString());
  });
  it('identifiant client', () => {
    expect(customerId({ status: 'active', customer: 'cus_1' })).toBe('cus_1');
    expect(customerId({ status: 'active', customer: { id: 'cus_2' } })).toBe('cus_2');
  });
});
