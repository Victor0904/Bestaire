// Test de bout en bout : 2 joueurs, vraie app React, vraie base PostgreSQL (via la passerelle de test).
// Prérequis : PostgreSQL de test + `node tests/gateway.mjs` + `vite` lancé avec VITE_SUPABASE_URL=http://localhost:54321
import { chromium } from 'playwright';
import pg from 'pg';
const APP = process.env.APP_URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || '/tmp';
const db = new pg.Pool();
let pass = 0, fail = 0; const errors = [], http4xx = [];
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗', m) } };
const browser = await chromium.launch();
async function player(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(email + ' : ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_|realtime|websocket|WebSocket|Failed to load resource/i.test(m.text())) errors.push(email + ' console : ' + m.text()) });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.googleapis|realtime/.test(r.url())) http4xx.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`) });
  await p.route('**/fonts.googleapis.com/**', r => r.abort());
  await p.goto(APP);
  await p.getByRole('button', { name: 'Utiliser un mot de passe' }).click();
  await p.getByLabel('Adresse e-mail').fill(email); await p.getByLabel('Mot de passe').fill('motdepasse1');
  await p.getByRole('button', { name: /Se connecter/ }).click();
  await p.waitForSelector('header.top', { timeout: 10000 });
  return p;
}
const uidOf = async (email) => (await db.query('select id from auth.users where email=$1', [email])).rows[0].id;
const plumes = async (email) => (await db.query('select plumes from profiles where id=(select id from auth.users where email=$1)', [email])).rows[0].plumes;
const tab = (p, name) => p.locator('nav.tabs').getByRole('button', { name }).click();
await db.query('truncate public.cards, public.auctions, public.sales, public.bot_offers, public.defenses, public.duels, public.profiles cascade; delete from auth.users;');

console.log('Connexion');
const A = await player('victor@test.fr');
await A.waitForFunction(() => /\d/.test(document.querySelector('.hchip b')?.textContent || ''));
ok((await A.locator('.hchip b').first().textContent()) === '3', 'A connecté : 3 pellicules affichées');
await A.screenshot({ path: SHOTS + '/e1-safari.png' });

console.log('Profil');
await tab(A, 'Profil'); await A.getByLabel(/Pseudo/).fill('Victor'); await A.getByRole('button', { name: 'Enregistrer' }).click();
await A.waitForTimeout(400);
ok((await db.query(`select pseudo from profiles where id=$1`, [await uidOf('victor@test.fr')])).rows[0].pseudo === 'Victor', 'pseudo enregistré en base');
await A.screenshot({ path: SHOTS + '/e2-profil.png', fullPage: true });

console.log('Safari');
await tab(A, 'Safari'); await A.locator('.biome', { hasText: 'Forêt' }).click();
await A.getByRole('button', { name: /Partir en forêt/ }).click();
await A.waitForSelector('.reveal'); ok(true, 'révélation plein écran ouverte');
await A.getByRole('button', { name: 'Développer' }).click(); await A.waitForTimeout(1300);
await A.screenshot({ path: SHOTS + '/e3-reveal.png' });
for (let i = 0; i < 12 && await A.locator('.reveal').count(); i++) { await A.locator('.rv-bottom button').click(); await A.waitForTimeout(150) }
ok(await A.locator('.roll .cell').count() === 5, 'pellicule de 5 photos affichée');
ok((await db.query(`select count(*)::int n from cards where owner=$1`, [await uidOf('victor@test.fr')])).rows[0].n === 5, '5 cartes créées par le serveur');
await A.waitForTimeout(300);
ok((await A.locator('.hchip').first().textContent()).includes('2'), 'pellicules : 2 restantes');

console.log('Fusion');
const ua = await uidOf('victor@test.fr');
await db.query(`insert into cards(owner, species_id, q, lvl) values ($1,'lynx-lynx',30,1),($1,'lynx-lynx',90,1)`, [ua]);
await A.reload(); await A.waitForSelector('header.top');
await tab(A, 'Bestiaire'); await A.locator('.cell', { hasText: 'Lynx boréal' }).click();
await A.getByRole('button', { name: /Fusionner 2/ }).click();
await A.waitForSelector('.fusionfx'); await A.waitForTimeout(1700);
ok(await A.locator('.fusionfx').getByText('NIVEAU 2 !').isVisible(), 'animation de fusion : NIVEAU 2 !');
await A.screenshot({ path: SHOTS + '/e4-fusion.png' });
await A.getByRole('button', { name: 'Super !' }).click();
ok((await db.query(`select lvl, q from cards where owner=$1 and species_id='lynx-lynx'`, [ua])).rows.map(r => r.lvl + ':' + r.q).join() === '2:90', 'en base : un lynx niveau 2 (photo 90 gardée) ' + (await db.query(`select lvl, q from cards where owner=$1 and species_id='lynx-lynx'`, [ua])).rows.map(r => r.lvl + ':' + r.q).join());

console.log('Mise aux enchères');
await A.getByRole('button', { name: 'Vendre' }).click();
await A.getByLabel('Mise de départ').fill('100'); await A.getByLabel('Durée').selectOption('10');
await A.getByRole('button', { name: 'Mettre en vente' }).click(); await A.waitForTimeout(500);
ok((await db.query(`select count(*)::int n from auctions where seller=$1 and status='open'`, [ua])).rows[0].n === 1, 'enchère créée');

console.log('Second joueur : enchère');
const B = await player('ami@test.fr'); const ub = await uidOf('ami@test.fr');
await db.query(`update profiles set plumes = 500 where id=$1`, [ub]);
await B.reload(); await B.waitForSelector('header.top'); await tab(B, 'Marché'); await B.waitForTimeout(800);
ok(await B.getByText('1 en cours').isVisible(), 'B voit l’enchère de A');
await B.screenshot({ path: SHOTS + '/e5-marche.png', fullPage: true });
await B.locator('.offer', { hasText: 'Lynx boréal' }).getByRole('button', { name: /Enchérir/ }).click();
await B.getByLabel('Ton offre (plumes)').fill('120');
await B.locator('.sheet').getByRole('button', { name: 'Enchérir' }).click(); await B.waitForTimeout(600);
ok(await plumes('ami@test.fr') === 380, 'B : 120 plumes bloquées');
await db.query(`update auctions set ends_at = now() - interval '1 second' where seller=$1`, [ua]);
await B.reload(); await B.waitForSelector('header.top'); await B.waitForTimeout(500);
ok((await db.query(`select owner from cards where species_id='lynx-lynx' and lvl=2`)).rows[0].owner === ub, 'enchère clôturée : le lynx appartient à B');
ok(await plumes('victor@test.fr') >= 170, 'A payé 120 plumes');
await tab(B, 'Bestiaire'); ok(await B.locator('.cell', { hasText: 'Lynx boréal' }).isVisible(), 'le lynx apparaît dans le bestiaire de B');

console.log('Collectionneurs');
await db.query(`update profiles set plumes = 5000 where id=$1`, [ua]);
await A.reload(); await A.waitForSelector('header.top'); await tab(A, 'Marché'); await A.waitForTimeout(800);
const nOff = await A.locator('.offer', { has: A.getByRole('button', { name: /Acheter/ }) }).count();
ok(nOff === 8, `8 offres de collectionneurs (${nOff})`);
await A.getByRole('button', { name: /Acheter/ }).first().click(); await A.waitForTimeout(600);
ok(await plumes('victor@test.fr') < 5000, 'achat auprès d’un collectionneur débité');

console.log('Combat contre des animaux sauvages');
await tab(A, 'Combat'); await A.locator('.cell.pick').first().click();
await A.getByRole('button', { name: 'Lancer le combat' }).click();
for (let i = 0; i < 80 && !(await A.getByRole('heading', { name: /Victoire|Défaite/ }).count()); i++) { await A.locator('.actions button').first().click(); await A.waitForTimeout(40) }
await A.waitForTimeout(600);
ok(await A.getByRole('heading', { name: /Victoire|Défaite/ }).isVisible(), 'combat terminé');
await A.screenshot({ path: SHOTS + '/e6-combat.png' });
const wl = (await db.query(`select wins+losses n from profiles where id=$1`, [ua])).rows[0].n;
ok(wl === 1, 'résultat enregistré par le serveur');

console.log('Duel contre un autre joueur');
await tab(B, 'Combat'); await B.getByRole('button', { name: 'Autres joueurs' }).click(); await B.waitForTimeout(400); await B.screenshot({ path: SHOTS + '/e7-defense.png' });
await B.locator('.cell.pick').first().click(); await B.getByRole('button', { name: /Enregistrer la sélection/ }).click(); await B.waitForTimeout(500);
ok((await db.query(`select count(*)::int n from defenses where owner=$1`, [ub])).rows[0].n === 1, 'défense de B enregistrée');
await A.getByRole('button', { name: "Changer d'équipe" }).click().catch(() => {});
await tab(A, 'Safari'); await tab(A, 'Combat'); await A.getByRole('button', { name: 'Autres joueurs' }).click(); await A.waitForTimeout(500);
await A.locator('.cell.pick').first().click(); await A.getByRole('button', { name: 'Défier' }).click();
for (let i = 0; i < 80 && !(await A.getByRole('heading', { name: /Victoire|Défaite/ }).count()); i++) { await A.locator('.actions button').first().click(); await A.waitForTimeout(40) }
await A.waitForTimeout(700);
ok((await db.query(`select count(*)::int n from duels where attacker=$1`, [ua])).rows[0].n === 1, 'duel enregistré, classement mis à jour');

console.log('Défis du jour');
await db.query(`update profiles set quests = jsonb_set(quests, '{0,prog}', to_jsonb((quests->0->>'goal')::int)) where id=$1`, [ua]);
const before = await plumes('victor@test.fr'); const filmsBefore = (await db.query('select films from profiles where id=$1', [ua])).rows[0].films;
await A.reload(); await A.waitForSelector('header.top'); await A.locator('#quests .btn.primary').first().click(); await A.waitForTimeout(500);
const after = await plumes('victor@test.fr'); const filmsAfter = (await db.query('select films from profiles where id=$1', [ua])).rows[0].films;
ok(after > before || filmsAfter > filmsBefore, 'récompense de défi créditée');

console.log('Abonnement');
await tab(A, 'Profil'); ok(await A.getByText('Passe à Bestiaire+').isVisible(), 'offre Bestiaire+ affichée');
await A.getByRole('button', { name: "S'abonner" }).click(); await A.waitForTimeout(800);
ok(A.url().includes('stripe-create-checkout'), 'redirection vers le paiement Stripe');
await db.query(`update profiles set premium_until = now() + interval '30 days' where id=$1`, [ua]);
await A.goto(APP); await A.waitForSelector('header.top'); await tab(A, 'Profil'); await A.waitForTimeout(400);
ok(await A.getByText('Merci pour ton soutien').isVisible() && await A.locator('.brand .plus').isVisible(), 'statut premium affiché');
await A.screenshot({ path: SHOTS + '/e7-premium.png', fullPage: true });
ok(await A.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'aucun débordement horizontal (en-tête premium sur mobile)');

console.log('Sécurité côté navigateur');
const hack = await A.evaluate(async () => { const r = await fetch('http://localhost:54321/rest/v1/profiles?id=neq.x', { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('auth-token')))).access_token }, body: JSON.stringify({ plumes: 999999 }) }); return r.status });
ok(hack >= 400 && await plumes('victor@test.fr') < 999999, 'tentative de triche (plumes) refusée par la base');

console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
console.log('Réponses HTTP en erreur :', http4xx);
const expected = http4xx.filter(x => /grant_type=password/.test(x) || /PATCH \/rest\/v1\/profiles\?id=neq/.test(x));
ok(expected.length === http4xx.length, 'seules les erreurs HTTP attendues (première connexion avant création du compte, tentative de triche)');
ok(errors.length === 0, 'aucune erreur JavaScript');
console.log(`\n${pass} réussis, ${fail} échoués`);
await browser.close(); await db.end(); process.exit(fail ? 1 : 0);
