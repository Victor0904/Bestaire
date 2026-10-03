import { describe, it, expect } from 'vitest';
import { STARS, star, nouveau, nourrir, vieillir, jouer, apprendre, equiper, points, niveauC, xpNiv, changer, peutChanger, membre, adequation, MAX_ACTIVES } from '../game/compagnon';
import { mkFighter, newBattle, playTurn, ai } from '../game/combat';
import { etape } from '../game/adventure';

const lion = () => ({ ...nouveau('x-panthera-leo', 'Simba'), ecus: 1000, faim: 10 });
describe('compagnon', () => {
  it('la box contient des animaux célèbres, tous avec photo', () => {
    expect(STARS.length).toBeGreaterThanOrEqual(12);
    expect(STARS.map(s => s.nom)).toEqual(expect.arrayContaining(['Lion', 'Éléphant', 'Rhinocéros', 'Panda', 'Loup', 'Chat']));
  });
  it('régime : la viande est idéale pour le lion, l’herbe inadaptée ; le bambou idéal pour le panda', () => {
    expect(adequation(star('x-panthera-leo'), 'viande')).toBe('ideal');
    expect(adequation(star('x-panthera-leo'), 'herbe')).toBe('inadapte');
    expect(adequation(star('x-ailuropoda-melanoleuca'), 'bambou')).toBe('ideal');
  });
  it('un repas adapté fait progresser plus vite et coûte des écus', () => {
    const a = nourrir(lion(), 'viande'), b = nourrir(lion(), 'herbe');
    expect(a.xp).toBeGreaterThan(b.xp * 3); expect(a.c.ecus).toBe(1000 - 15); expect(a.c.faim).toBeGreaterThan(10);
    expect(nourrir({ ...lion(), faim: 99 }, 'viande').refus).toBeTruthy();
    expect(nourrir({ ...lion(), ecus: 1 }, 'viande').refus).toBeTruthy();
  });
  it('un lion nourri d’herbe devient « Brouteur » et apprend une compétence', () => {
    let c = lion(); let trait;
    for (let i = 0; i < 8; i++) { c.faim = 10; const r = nourrir(c, 'herbe'); c = r.c; trait = r.trait || trait }
    expect(trait?.id).toBe('brouteur'); expect(c.traits).toContain('brouteur'); expect(c.appris).toContain('photosynthese');
    expect(membre(c).mods!.pv!).toBeGreaterThan(membre(lion()).mods!.pv!);
  });
  it('la faim et le bonheur baissent avec le temps ; un animal affamé est plus faible', () => {
    const c = { ...nouveau('canis-lupus', 'Croc'), faim: 80, bonheur: 80, maj: 0 };
    const v = vieillir(c, 10 * 3.6e6); expect(Math.round(v.faim)).toBe(40); expect(Math.round(v.bonheur)).toBe(60);
    expect(membre({ ...c, faim: 10 }).mods!.att!).toBeLessThan(membre({ ...c, faim: 60 }).mods!.att!);
    expect(jouer(c, 1e9)!.bonheur).toBe(100); expect(jouer({ ...c, jeuA: 1e9 }, 1e9 + 1000)).toBeNull();
  });
  it('compétences : 1 point par niveau, 4 actives au maximum', () => {
    let c = { ...nouveau('x-panthera-leo', 'Simba'), xp: xpNiv(12) };
    expect(niveauC(c.xp)).toBe(12); expect(points(c)).toBe(11);
    for (const id of ['morsure', 'carapace', 'esquive', 'rugissement', 'charge', 'robuste']) c = apprendre(c, id) || c;
    expect(c.actives.length).toBe(MAX_ACTIVES); expect(points(c)).toBe(5);
    expect(apprendre(c, 'assaut')).not.toBeNull(); expect(apprendre({ ...c, xp: 0 }, 'assaut')).toBeNull();
    c = equiper(c, 'morsure'); expect(c.actives).not.toContain('morsure'); c = equiper(c, 'charge'); expect(c.actives).toContain('charge');
  });
  it('changer d’animal tous les 10 niveaux : niveau gardé, compétences remises à zéro', () => {
    const c = { ...lion(), xp: xpNiv(11), appris: ['griffes', 'morsure'], traits: ['brouteur'] };
    expect(peutChanger(c)).toBe(true);
    const n = changer(c, 'x-loxodonta-africana', 'Dumbo');
    expect(niveauC(n.xp)).toBe(11); expect(n.appris).toEqual(['griffes']); expect(n.traits).toEqual([]); expect(peutChanger(n)).toBe(false);
  });
  it('le compagnon combat avec ses compétences choisies', () => {
    const c = { ...nouveau('x-panthera-leo', 'Simba'), actives: ['griffes', 'morsure'], appris: ['griffes', 'morsure'], xp: xpNiv(5) };
    const m = membre(c), f = mkFighter(m.s, 1, 'P', m.niv, false, 1, m.abil, m.mods);
    expect(f.abil!.map(a => a.nom)).toEqual(['Coup de griffes', 'Morsure puissante']); expect(f.s.nom).toBe('Simba');
    const B = newBattle([m], etape(3).foes.slice(0, 2), 'P', 'jour'); let n = 0;
    while (!B.over && n++ < 100) playTurn(B, ai(B.P[0], Math.random));
    expect(B.over).toBe(true);
  });
});
