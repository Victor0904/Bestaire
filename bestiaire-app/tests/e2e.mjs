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
async function player(email, skipTuto = true) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['notifications'] });
  // Chrome sans écran répond toujours « refusé » : on simule un téléphone qui n'a pas encore été sollicité
  await ctx.addInitScript(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }) } catch { /* rien */ } });
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
  if (skipTuto) { await p.locator('.onb').waitFor({ timeout: 4000 }).catch(() => {}); if (await p.locator('.onb').count()) await p.getByRole('button', { name: 'Passer' }).click() }
  return p;
}
const uidOf = async (email) => (await db.query('select id from auth.users where email=$1', [email])).rows[0].id;
const plumes = async (email) => (await db.query('select plumes from profiles where id=(select id from auth.users where email=$1)', [email])).rows[0].plumes;
const tab = (p, name) => p.locator('nav.tabs').getByRole('button', { name }).click();
await db.query('truncate public.cards, public.auctions, public.sales, public.bot_offers, public.defenses, public.duels, public.profiles cascade; delete from auth.users;');

console.log('Connexion');
const A = await player('victor@test.fr', false);
console.log('Tutoriel de premier lancement');
await A.locator('.onb').waitFor({ timeout: 5000 });
ok(await A.getByRole('heading', { name: 'Bienvenue dans Bestiaire' }).isVisible(), 'tutoriel affiché au premier lancement');
for (let i = 0; i < 5; i++) await A.getByRole('button', { name: 'Suivant' }).click();
ok(await A.getByRole('heading', { name: /écran d'accueil/ }).isVisible() && await A.getByRole('tab', { name: 'iPhone' }).isVisible(), 'dernière étape : installer l’appli (iPhone / Android)');
await A.getByRole('tab', { name: 'iPhone' }).click(); await A.screenshot({ path: SHOTS + '/e0-tuto-install.png' });
await A.getByRole('button', { name: "C'est parti !" }).click(); await A.waitForTimeout(500);
ok((await db.query(`select onboarded from profiles where id=(select id from auth.users where email='victor@test.fr')`)).rows[0].onboarded === true && !(await A.locator('.onb').count()), 'tutoriel terminé, mémorisé en base');
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
await tab(B, 'Bestiaire'); ok(await B.locator('.cell', { hasText: 'Lynx boréal' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'le lynx apparaît dans le bestiaire de B');

console.log('Collectionneurs');
await db.query(`update profiles set plumes = 5000 where id=$1`, [ua]);
await A.reload(); await A.waitForSelector('header.top'); await tab(A, 'Marché'); await A.waitForTimeout(800);
const nOff = await A.locator('.offer', { has: A.getByRole('button', { name: /Acheter/ }) }).count();
ok(nOff === 8, `8 offres de collectionneurs (${nOff})`);
await A.getByRole('button', { name: /Acheter/ }).first().click(); await A.waitForTimeout(600);
ok(await plumes('victor@test.fr') < 5000, 'achat auprès d’un collectionneur débité');

console.log('Bestiaire : filtres et tris');
await tab(A, 'Bestiaire'); await A.waitForTimeout(300); await A.screenshot({ path: SHOTS + '/e5a-dex.png', fullPage: true });
ok(await A.locator('.dex-head .ring').isVisible(), 'progression de la collection affichée');
await A.getByRole('tab', { name: 'À découvrir' }).click(); await A.waitForTimeout(200);
ok(await A.locator('.ghost-card').count() > 10, 'espèces à découvrir affichées avec indices');
await A.getByRole('button', { name: /^Filtres/ }).click(); await A.locator('.sheet .fchip', { hasText: 'Oiseau' }).click();
await A.screenshot({ path: SHOTS + '/e5b-filtres.png' });
await A.locator('.sheet').getByRole('button', { name: /^Voir \d+ espèce/ }).click(); await A.waitForTimeout(200);
const birdTxt = await A.locator('.ghost-card').allTextContents();
ok(birdTxt.length > 0 && birdTxt.every(t => t.includes('Oiseau')), `filtre classe : ${birdTxt.length} oiseaux, que des oiseaux`);
await A.getByRole('button', { name: 'Liste' }).click(); await A.waitForTimeout(200);
ok(await A.locator('.dl').count() > 0, 'vue liste');
await A.screenshot({ path: SHOTS + '/e5c-liste.png' });
await A.getByRole('button', { name: 'Tout effacer' }).click(); await A.getByRole('tab', { name: 'Miennes' }).click();
await A.locator('.sortsel select').selectOption('cote'); await A.waitForTimeout(200);
const vals = (await A.locator('.dl-v').allTextContents()).map(t => parseInt(t));
ok(vals.length > 0 && vals.every((v, i) => i === 0 || vals[i - 1] >= v), 'tri par cote décroissante');
await A.getByRole('button', { name: 'Grille' }).click();

console.log('Aventure');
await tab(A, 'Combat'); await A.locator('.chap').first().waitFor();
ok(await A.getByRole('tab', { name: 'Aventure' }).getAttribute('aria-selected') === 'true' && await A.locator('.chap').count() === 6, 'onglet Combat : la carte d’aventure (6 chapitres) s’ouvre par défaut');
ok(await A.locator('.node.ici').count() === 1 && await A.locator('.node:disabled').count() >= 9, 'seule la première étape est ouverte');
await A.screenshot({ path: SHOTS + '/e6-carte.png' });
await A.locator('.node.ici').click(); await A.locator('.prep').waitFor();
ok(await A.locator('.prep .foe').count() >= 1 && await A.locator('.objs > div').count() === 3, 'préparation : adversaires et 3 objectifs d’étoiles');
ok(await A.locator('.slot3:not(.empty)').count() >= 1, 'équipe remplie automatiquement avec les meilleurs animaux');
await A.screenshot({ path: SHOTS + '/e6a-prep.png' });
await A.getByRole('button', { name: /^Combattre/ }).click(); await A.locator('.arena3').waitFor();
ok(await A.locator('.arena3 .portrait3').count() === 2 && await A.locator('.actions3 button').count() >= 3 && await A.locator('.arena3 .decor').count() === 1, 'arène : décor, 2 portraits et capacités');
await A.locator('.actions3 button').first().click(); await A.waitForTimeout(300); await A.screenshot({ path: SHOTS + '/e6b-combat-anim.png' });
await A.waitForTimeout(1500);
if (!(await A.locator('.a-end3').count())) { await A.getByRole('button', { name: /Auto/ }).click(); await A.getByRole('button', { name: /×2/ }).click() }
await A.getByRole('heading', { name: /Victoire|Défaite|Boss vaincu/ }).waitFor({ timeout: 120000 });
await A.waitForTimeout(900); await A.screenshot({ path: SHOTS + '/e6-combat.png' });
const pa = (await db.query(`select wins+losses n, adv from profiles where id=$1`, [ua])).rows[0];
ok(pa.n === 1, 'résultat d’aventure enregistré par le serveur');
ok((await db.query(`select max(xp)::int x from cards where owner=$1`, [ua])).rows[0].x > 0, 'l’équipe a gagné de l’expérience');
ok(await A.locator('.xpg-l').count() >= 1, 'écran de fin : expérience gagnée par animal');
if (pa.adv['0']) ok(await A.locator('.stars3 .on').count() >= 1, `étoiles affichées (${pa.adv['0']})`);
await A.getByRole('button', { name: 'Retour' }).click(); await A.locator('.chap').first().waitFor();

console.log('Combat contre des animaux sauvages');
await A.getByRole('tab', { name: 'Sauvage' }).click(); await A.getByRole('button', { name: /Lancer le combat/ }).click();
await A.getByRole('button', { name: /Auto/ }).click(); await A.getByRole('button', { name: /×2/ }).click();
await A.getByRole('heading', { name: /Victoire|Défaite/ }).waitFor({ timeout: 120000 });
await A.waitForTimeout(800);
ok((await db.query(`select wins+losses n from profiles where id=$1`, [ua])).rows[0].n === 2, 'combat sauvage enregistré par le serveur');
await A.getByRole('button', { name: 'Retour' }).click();

console.log('Duel contre un autre joueur');
await tab(B, 'Combat'); await B.getByRole('tab', { name: 'Arène' }).click(); await B.waitForTimeout(400);
await B.getByRole('button', { name: /Enregistrer mon équipe/ }).click(); await B.waitForTimeout(500); await B.screenshot({ path: SHOTS + '/e7-defense.png' });
ok((await db.query(`select count(*)::int n from defenses where owner=$1`, [ub])).rows[0].n === 1, 'défense de B enregistrée');
ok((await db.query(`select team from defenses where owner=$1`, [ub])).rows[0].team.every(t => t.niv >= 1), 'la défense garde le niveau des animaux');
await tab(A, 'Safari'); await tab(A, 'Combat'); await A.getByRole('tab', { name: 'Arène' }).click(); await A.waitForTimeout(500);
await A.getByRole('button', { name: 'Défier' }).first().click();
await A.getByRole('button', { name: /Auto/ }).click(); await A.getByRole('button', { name: /×2/ }).click();
await A.getByRole('heading', { name: /Victoire|Défaite/ }).waitFor({ timeout: 120000 });
await A.waitForTimeout(700);
ok((await db.query(`select count(*)::int n from duels where attacker=$1`, [ua])).rows[0].n === 1, 'duel enregistré, classement mis à jour');
await A.getByRole('button', { name: 'Retour' }).click();

console.log('Mode test : compagnon');
await tab(A, 'Test'); await A.locator('.box').click(); await A.getByRole('button', { name: /^Adopter/ }).waitFor({ timeout: 5000 });
ok(await A.locator('.rc-portrait .spr').count() === 1, 'box ouverte : un animal célèbre révélé');
await A.getByLabel('Donne-lui un surnom').fill('Simba'); await A.getByRole('button', { name: /^Adopter/ }).click();
await A.locator('.pet').waitFor(); ok(await A.getByRole('heading', { name: 'Simba' }).isVisible(), 'compagnon adopté avec son surnom');
await A.getByRole('button', { name: /Nourrir/ }).click(); await A.locator('.food.ideal').first().click(); await A.waitForTimeout(300);
ok(/écus/.test(await A.locator('.mg-head').innerText()) && !(await A.locator('.mg-head').innerText()).includes('60 écus'), 'repas payé en écus');
await A.getByRole('button', { name: /←/ }).click(); await A.getByRole('button', { name: /Aventure/ }).click();
await A.getByRole('button', { name: /Combattre avec/ }).click(); await A.getByRole('button', { name: /Auto/ }).click();
await A.locator('.a-end3').waitFor({ timeout: 90000 }); ok(true, 'combat d’aventure du compagnon terminé');
await A.getByRole('button', { name: 'Retour' }).click(); await A.waitForTimeout(1600);
ok((await db.query(`select surnom from compagnons where owner=$1`, [ua])).rows[0]?.surnom === 'Simba', 'compagnon sauvegardé en ligne');

console.log('Défis du jour');
await db.query(`update profiles set quests = jsonb_set(quests, '{0,prog}', to_jsonb((quests->0->>'goal')::int)) where id=$1`, [ua]);
const before = await plumes('victor@test.fr'); const filmsBefore = (await db.query('select films from profiles where id=$1', [ua])).rows[0].films;
await A.reload(); await A.waitForSelector('header.top'); await A.locator('#quests .btn.primary').first().click(); await A.waitForTimeout(500);
const after = await plumes('victor@test.fr'); const filmsAfter = (await db.query('select films from profiles where id=$1', [ua])).rows[0].films;
ok(after > before || filmsAfter > filmsBefore, 'récompense de défi créditée');


console.log('Succès');
await tab(A, 'Profil'); await A.getByRole('tab', { name: /Succès/ }).click(); await A.locator('.achv').first().waitFor();
ok(await A.locator('.achv').count() >= 30, `liste des succès (${await A.locator('.achv').count()})`);
const plBefore = await plumes('victor@test.fr');
await A.locator('.achv', { hasText: 'Premier déclic' }).getByRole('button', { name: 'Récupérer' }).click(); await A.waitForTimeout(600);
ok(await plumes('victor@test.fr') === plBefore + 20, 'succès « Premier déclic » récupéré : +20 plumes');
await A.screenshot({ path: SHOTS + '/e8-succes.png', fullPage: true });

console.log('Amis');
await db.query(`update profiles set pseudo = 'Ami' where id = $1`, [ub]);
await A.getByRole('tab', { name: /Amis/ }).click(); await A.locator('.mycode .code').waitFor();
await A.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.querySelector('.mycode .code')?.textContent || ''));
const codeA = (await A.locator('.mycode .code').textContent()).trim();
await tab(B, 'Profil'); await B.getByRole('tab', { name: /Amis/ }).click(); await B.getByLabel('Code ami à ajouter').fill(codeA.toLowerCase()); await B.getByRole('button', { name: 'Ajouter' }).click(); await B.waitForTimeout(500);
await A.getByRole('tab', { name: /Succès/ }).click(); await A.getByRole('tab', { name: /Amis/ }).click(); await A.getByRole('button', { name: 'Accepter' }).waitFor();
await A.getByRole('button', { name: 'Accepter' }).click(); await A.waitForTimeout(600);
ok(await A.locator('.friend', { hasText: 'Ami' }).isVisible(), 'demande d’ami acceptée : B dans la liste de A');
await A.locator('.friend', { hasText: 'Ami' }).click(); await A.locator('.pstats').waitFor();
ok(await A.locator('.sheet .grid .cell').count() >= 1, 'profil de l’ami : ses plus belles cartes');
await A.screenshot({ path: SHOTS + '/e9-ami.png' });
await A.getByRole('button', { name: 'Défier en duel' }).click(); await A.locator('.challenge').waitFor();
ok(await A.locator('.challenge').getByText(/Duel contre Ami/).isVisible(), 'défi lancé depuis la liste d’amis');
await A.getByRole('button', { name: 'Lancer le duel' }).click();
await A.getByRole('button', { name: /Auto/ }).click(); await A.getByRole('button', { name: /×2/ }).click();
await A.getByRole('heading', { name: /Victoire|Défaite/ }).waitFor({ timeout: 120000 }); await A.waitForTimeout(800);
ok((await db.query(`select count(*)::int n from duels where attacker=$1`, [ua])).rows[0].n === 2, 'duel entre amis enregistré');
await A.getByRole('button', { name: 'Retour' }).click();

console.log('Guilde');
await tab(A, 'Profil'); await A.getByRole('tab', { name: /Guilde/ }).click();
await A.getByRole('button', { name: /Fonder une guilde/ }).click();
await A.getByLabel('Nom').fill('Les Hiboux de Nancy'); await A.getByLabel(/Sigle/).fill('hib'); await A.getByLabel('Description').fill('Photographes de nuit');
await A.locator('.emblems button').first().click(); await A.getByRole('button', { name: /^Fonder · 100 plumes/ }).click();
await A.locator('.ghead').waitFor();
ok(await A.getByRole('heading', { name: /Les Hiboux de Nancy/ }).isVisible() && await A.locator('.ghead .emblem .spr').count() === 1, 'guilde fondée avec son emblème');
await tab(B, 'Profil'); await B.getByRole('tab', { name: /Guilde/ }).click(); await B.getByLabel('Chercher une guilde').fill('hib'); await B.waitForTimeout(600);
await B.locator('.guildrow', { hasText: 'Les Hiboux' }).getByRole('button', { name: 'Rejoindre' }).click(); await B.locator('.ghead').waitFor();
ok((await B.locator('.friend').count()) === 2, 'B a rejoint la guilde (2 membres)');
await B.getByLabel('Message à la guilde').fill('Salut les hiboux !'); await B.getByRole('button', { name: 'Envoyer' }).click(); await B.waitForTimeout(500);
await A.getByRole('tab', { name: /Amis/ }).click(); await A.getByRole('tab', { name: /Guilde/ }).click(); await A.locator('.chat').waitFor();
ok(await A.locator('.chat .msg', { hasText: 'Salut les hiboux !' }).isVisible(), 'message de B reçu par A dans la discussion');
await A.screenshot({ path: SHOTS + '/e10-guilde.png', fullPage: true });

console.log('Notifications');
await B.reload(); await B.waitForSelector('header.top'); await B.waitForTimeout(800);
ok(await B.locator('.bell .bcount').isVisible(), `cloche de B : ${await B.locator('.bell .bcount').textContent().catch(() => '0')} notification(s) non lue(s)`);
await B.locator('.bell').click(); await B.locator('.nlist').waitFor();
ok(await B.locator('.nitem', { hasText: 'Ta défense a été attaquée' }).count() >= 1 && await B.locator('.nitem', { hasText: 'Nouvel ami' }).count() >= 1, 'boîte de réception : duel subi et nouvel ami');
await B.screenshot({ path: SHOTS + '/e12-notifs.png' });
await B.locator('.nitem', { hasText: 'Ta défense a été attaquée' }).first().click(); await B.waitForTimeout(300);
ok((await B.locator('nav.tabs button[aria-current="page"]').textContent()).startsWith('Combat'), 'toucher la notification ouvre le bon onglet');
ok((await db.query(`select count(*)::int n from notifications where user_id = $1 and read_at is null`, [ub])).rows[0].n === 0 && !(await B.locator('.bell .bcount').count()), 'notifications marquées comme lues');
await tab(B, 'Safari'); await B.waitForTimeout(800);
ok(await B.locator('.nprompt').isVisible(), 'invitation à activer les notifications sur l’écran Safari');
await B.screenshot({ path: SHOTS + '/e13-invitation-notifs.png' });
await B.getByRole('button', { name: 'Plus tard' }).click();
ok(!(await B.locator('.nprompt').count()), '« Plus tard » masque l’invitation');
await tab(B, 'Profil'); await B.getByRole('tab', { name: 'Profil' }).click();
await B.locator('#reglages-notifs .switch', { hasText: 'Guilde' }).click(); await B.waitForTimeout(500);
ok((await db.query(`select notif->>'guilde' g from profiles where id = $1`, [ub])).rows[0].g === 'false', 'réglage par type enregistré (guilde coupée)');

console.log('Modération');
await tab(A, 'Profil'); await A.getByRole('tab', { name: /Guilde/ }).click(); await A.locator('.chat').waitFor();
await A.getByLabel('Message à la guilde').fill('Bienvenue à toi'); await A.getByRole('button', { name: 'Envoyer' }).click(); await A.waitForTimeout(500);
await B.getByRole('tab', { name: /Guilde/ }).click(); await B.locator('.chat').waitFor();
await B.locator('.chat .msg', { hasText: 'Bienvenue à toi' }).click();
await B.getByRole('button', { name: 'Signaler ce message' }).click(); await B.getByLabel('Spam, publicité').check();
await B.screenshot({ path: SHOTS + '/e14-signaler.png' });
await B.getByRole('button', { name: 'Envoyer le signalement' }).click(); await B.waitForTimeout(500);
ok((await db.query(`select count(*)::int n from reports where reporter = $1 and kind = 'message'`, [ub])).rows[0].n === 1, 'message signalé depuis la discussion');
await B.waitForTimeout(2600);
await B.getByLabel('Message à la guilde').fill('espèce de connard'); await B.getByRole('button', { name: 'Envoyer' }).click(); await B.waitForTimeout(500);
ok(await B.locator('.toast', { hasText: /inappropri/ }).isVisible() && !(await db.query(`select count(*)::int n from guild_messages where body like '%connard%'`)).rows[0].n, 'insulte bloquée avant envoi');
await db.query(`update profiles set is_admin = true where id = $1`, [ua]);
await tab(A, 'Safari'); await A.reload(); await A.waitForSelector('header.top'); await tab(A, 'Profil'); await A.getByRole('tab', { name: 'Profil' }).click();
await A.locator('.admin .report').first().waitFor();
ok(await A.locator('.admin .report', { hasText: 'Bienvenue à toi' }).isVisible(), 'l’administrateur voit le signalement');
await A.screenshot({ path: SHOTS + '/e15-admin.png' });
await A.locator('.admin .report', { hasText: 'Bienvenue à toi' }).getByRole('button', { name: 'Ignorer' }).click(); await A.waitForTimeout(500);
ok((await db.query(`select count(*)::int n from reports where status = 'open'`)).rows[0].n === 0, 'signalement traité');
await db.query(`update profiles set is_admin = false where id = $1`, [ua]);

console.log('Thème');
await A.getByRole('radio', { name: 'Sombre' }).click();
ok(await A.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'thème sombre appliqué');
await A.reload(); await A.waitForSelector('header.top');
ok(await A.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'thème mémorisé après rechargement');
await A.screenshot({ path: SHOTS + '/e16-sombre.png' });
await tab(A, 'Profil'); await A.getByRole('tab', { name: 'Profil' }).click(); await A.getByRole('radio', { name: 'Clair' }).click();
ok(await A.evaluate(() => document.documentElement.dataset.theme) === 'light' && await A.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(238, 240, 230)', 'thème clair forcé');
await A.getByRole('radio', { name: 'Automatique' }).click();

console.log('Partager une carte');
await tab(A, 'Bestiaire'); await A.locator('.dex .cell').first().click(); await A.locator('.sheet').waitFor();
const [dl] = await Promise.all([A.waitForEvent('download'), A.getByRole('button', { name: 'Partager' }).click()]);
const imgPath = SHOTS + '/e11-partage.png'; await dl.saveAs(imgPath);
const { statSync } = await import('node:fs');
ok(/^bestiaire-.+\.png$/.test(dl.suggestedFilename()) && statSync(imgPath).size > 50000, `image de la carte générée (${dl.suggestedFilename()}, ${Math.round(statSync(imgPath).size / 1024)} Ko)`);
await A.keyboard.press('Escape');

console.log('Pages légales');
await tab(A, 'Profil'); await A.getByRole('tab', { name: 'Profil' }).click();
await A.getByRole('button', { name: 'Mentions légales' }).click();
ok(await A.locator('.legal h2', { hasText: 'Mentions légales' }).isVisible() && await A.locator('.legal mark.todo').count() > 0, 'mentions légales (champs à compléter signalés)');
await A.locator('.sheet').getByRole('tab', { name: 'Confidentialité' }).click();
ok(await A.locator('.legal').getByText(/Supprimer mon compte/).isVisible(), 'politique de confidentialité : suppression du compte expliquée');
await A.locator('.sheet').getByRole('button', { name: 'Fermer' }).click();
ok(await A.getByRole('button', { name: 'Supprimer mon compte' }).isVisible() && await A.locator('.install').count() === 1, 'profil : installation de l’appli et suppression du compte');

console.log('Abonnement');
await tab(A, 'Profil'); ok(await A.getByText('Passe à Bestiaire+').isVisible(), 'offre Bestiaire+ affichée');
await A.getByRole('button', { name: "S'abonner" }).click(); await A.waitForTimeout(400);
ok(!A.url().includes('stripe'), 'paiement bloqué tant que la case de renonciation n’est pas cochée');
await A.getByRole('checkbox').check(); await A.getByRole('button', { name: "S'abonner" }).click(); await A.waitForTimeout(800);
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
const expected = http4xx.filter(x => /grant_type=password/.test(x) || /PATCH \/rest\/v1\/profiles\?id=neq/.test(x) || /rpc\/guild_post/.test(x));
ok(expected.length === http4xx.length, 'seules les erreurs HTTP attendues (première connexion, tentative de triche, insulte refusée)');
ok(errors.length === 0, 'aucune erreur JavaScript');
console.log(`\n${pass} réussis, ${fail} échoués`);
await browser.close(); await db.end(); process.exit(fail ? 1 : 0);
