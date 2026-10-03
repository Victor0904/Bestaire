# Bestiaire — mise en route

Application web mobile (PWA) : **React + Vite + TypeScript** côté écran, **Supabase** (base PostgreSQL, comptes, règles de sécurité) côté serveur, **Stripe** pour l'abonnement Bestiaire+ à 4,99 €/mois.

Toute la logique qui compte (tirages, fusions, plumes, enchères, abonnement) s'exécute **dans la base** : un joueur ne peut pas tricher en modifiant l'application dans son navigateur.

---

## Ce soir, dans l'ordre (≈ 45 min)

### 1. Créer le projet Supabase (gratuit)
1. Va sur <https://supabase.com>, crée ton compte puis **New project** (région : *West EU (Paris)* ou *Central EU (Frankfurt)*). Garde le mot de passe de la base dans ton gestionnaire de mots de passe.
2. **Project Settings → API** : note l'**URL** du projet et la clé **anon public**. (La clé `service_role` ne doit **jamais** aller dans l'application ni dans le dépôt Git.)

### 2. Installer la base (copier-coller)
1. Supabase → **Database → Extensions** : active **pg_cron** (clôture automatique des enchères chaque minute).
2. Supabase → **SQL Editor → New query** : colle tout le contenu de `supabase/migrations/20261002000001_schema.sql` → **Run**.
3. Nouvelle requête : colle `supabase/seed.sql` (les 1 135 espèces) → **Run**.
4. Nouvelle requête : colle `supabase/migrations/20261002000002_social.sql` (succès, amis, guildes, suppression de compte) → **Run**.
5. Nouvelle requête : colle `supabase/migrations/20261002000003_notif_moderation.sql` (notifications, modération) → **Run**.
6. Nouvelle requête : colle `supabase/migrations/20261003000004_aventure_rpg.sql` (expérience, niveaux, Aventure) → **Run**.
7. Nouvelle requête : colle `supabase/migrations/20261003000005_compagnon_test.sql` (mode Compagnon, onglet Test) → **Run**.
   Ces fichiers s'exécutent **toujours dans l'ordre 1 → 2 → 3 → 4 → 5**. Si tu en relances un, relance aussi les suivants.
6. Vérification rapide : `select count(*) from species;` doit renvoyer **1135**, et `select * from cron.job;` doit montrer `bestiaire-settle-auctions`.

> **Mise à jour d'une base existante** : relance `…001_schema.sql`, puis `…002_social.sql`, puis `…003_notif_moderation.sql`, puis `…004_aventure_rpg.sql`, puis `…005_compagnon_test.sql`, sans toucher au seed.
> Les fichiers peuvent être relancés sans risque (mise à jour sans perte de données).
> `supabase/tests/00_fake_supabase.sql` sert uniquement aux tests locaux : **ne pas l'exécuter sur Supabase**.

### 3. Connexion des joueurs
Supabase → **Authentication** :
- **URL Configuration** : *Site URL* = l'adresse finale (ex. `https://bestiaire.tondomaine.fr`) ; *Redirect URLs* : ajoute aussi `http://localhost:5173/**`.
- **Providers → Email** : activé par défaut (lien magique + mot de passe). Laisse « Confirm email » activé.
- **Providers → Google** (facultatif) : nécessite un identifiant OAuth Google Cloud. Tant qu'il n'est pas configuré, le bouton Google affiche une erreur ; les connexions par e-mail fonctionnent.

### 4. Lancer l'application sur ton PC (terminal VS Code)
Prérequis : **Node.js 20 ou plus** (`node -v` pour vérifier, sinon <https://nodejs.org>, version LTS).

```powershell
cd C:\Users\rescue123\Claude\Projects\bestiaire\bestiaire-app
copy .env.example .env      # puis ouvre .env et colle l'URL + la clé anon
npm install
npm run dev                 # ouvre http://localhost:5173
```

Pour tester sur ton téléphone sur le même Wi-Fi : `npm run dev -- --host` puis ouvre l'adresse « Network » affichée.

### 5. Tester sur ton téléphone (GitHub Pages, gratuit)
À chaque `git push`, GitHub teste le code, construit le site et le met en ligne sur **https://victor0904.github.io/Bestaire/** (fichier `.github/workflows/deploy.yml` à la racine du dépôt).
Réglages à faire une seule fois sur GitHub, dans le dépôt :
1. **Settings → Pages → Source : GitHub Actions**.
2. **Settings → Secrets and variables → Actions → New repository secret**, deux fois :
   `VITE_SUPABASE_URL` (même valeur que dans `.env`) et `VITE_SUPABASE_ANON_KEY` (la clé anon).
3. Supabase → Authentication → URL Configuration → *Redirect URLs* : ajoute `https://victor0904.github.io/Bestaire/**`.
4. Onglet **Actions** du dépôt → « Mise en ligne » → **Run workflow** (ou fais un push). Au bout de 2 minutes, le site est en ligne.
Sur le téléphone : ouvre l'adresse dans Chrome (Android) ou Safari (iPhone) → « Ajouter à l'écran d'accueil » pour l'avoir comme une appli.

### 6. Envoi des e-mails de connexion (obligatoire avant d'inviter des joueurs)
Sans réglage, Supabase n'envoie les e-mails qu'aux membres de ton équipe Supabase, et 2 par heure au maximum.
Crée un compte gratuit sur <https://resend.com> (3 000 e-mails/mois), puis Supabase → **Authentication → Emails → SMTP Settings** : hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = ta clé API Resend, expéditeur = une adresse de ton domaine vérifié dans Resend.
En attendant, crée les comptes de test dans Supabase → Authentication → Users → **Add user** (cocher *Auto Confirm User*).

### 7. Mettre en ligne sur Hostinger (plus tard, avec ton nom de domaine)
```powershell
npm run build
```
Envoie **le contenu** du dossier `dist/` dans `public_html` (ou un sous-dossier) via le gestionnaire de fichiers Hostinger ou FTP. Le site doit être en **HTTPS** (Hostinger active SSL gratuitement) : c'est nécessaire pour l'installation sur l'écran d'accueil du téléphone.
Ajoute ensuite l'adresse du site dans les *Redirect URLs* Supabase (étape 3).

---

## Abonnement Bestiaire+ (4,99 €/mois) — peut attendre un autre soir

**Ce que donne l'abonnement**
| | Gratuit | Bestiaire+ |
|---|---|---|
| Recharge d'une pellicule | 60 min | **40 min** |
| Réserve maximale | 6 | **9** |
| Défis du jour | 3 | **4** (le 4ᵉ rapporte une pellicule) |
| Badge `+` dans l'en-tête | — | ✓ |

Les chances de rareté sont **identiques** pour tout le monde (affichées dans le profil).

**Mise en place**
1. Crée ton compte Stripe (<https://dashboard.stripe.com>), reste d'abord en **mode test**.
2. **Catalogue de produits → Ajouter un produit** « Bestiaire+ », prix récurrent **4,99 € / mois**. Note l'identifiant du prix (`price_...`).
3. **Paramètres → Facturation → Portail client** : active-le (permet aux joueurs de se désabonner eux-mêmes).
4. Dans le terminal VS Code :
   ```powershell
   npx supabase login
   npx supabase link --project-ref TON_ID_DE_PROJET     # visible dans l'URL du projet
   npx supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID=price_... APP_URL=https://bestiaire.tondomaine.fr
   npx supabase functions deploy create-checkout
   npx supabase functions deploy customer-portal
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   ```
5. Stripe → **Développeurs → Webhooks → Ajouter un endpoint** :
   URL `https://TON_ID_DE_PROJET.supabase.co/functions/v1/stripe-webhook`, événements `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copie le **secret de signature** (`whsec_...`) puis :
   ```powershell
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
6. Test : bouton « S'abonner » dans le profil, carte de test Stripe `4242 4242 4242 4242`, date future, CVC quelconque. Le badge `+` apparaît en quelques secondes.
7. Quand tout marche : refais les étapes 2, 4 et 5 en **mode production** avec les clés `sk_live_...`.

**Point juridique à vérifier avant de lancer.** Vendre *plus de tirages aléatoires* contre de l'argent ressemble à une « loot box ». La Belgique les interdit quand elles sont payantes, et la France surveille le sujet. Ici, on vend du confort (recharge plus rapide) sans changer les chances, et rien ne se revend contre de l'argent réel, ce qui limite le risque. Mais si tu vises un vrai public, demande un avis (ou propose plutôt des avantages cosmétiques : cadres, thèmes, emplacements de bestiaire). Il faudra aussi des CGV, des mentions légales et une page de confidentialité (RGPD).

---

## Notifications sur le téléphone (≈ 10 min)
Sans cette étape, les notifications restent visibles dans la cloche du jeu ; avec, elles arrivent aussi sur l'écran du téléphone, jeu fermé.
1. **Clés de notification** (dans le terminal VS Code) : `npx web-push generate-vapid-keys`. Tu obtiens une clé publique et une clé privée.
2. **Secret pour le planificateur** : `node -e "console.log(crypto.randomUUID())"` (copie le résultat).
3. **Enregistrer et déployer** :
   ```powershell
   npx supabase login                                   # une seule fois
   npx supabase link --project-ref wrigianbbtzlpqbpkbps  # une seule fois
   npx supabase secrets set VAPID_PUBLIC_KEY=la_cle_publique VAPID_PRIVATE_KEY=la_cle_privee CRON_SECRET=le_secret
   npx supabase functions deploy send-push --no-verify-jwt
   ```
4. Supabase → **Database → Extensions** : active **pg_net**.
5. Supabase → **SQL Editor**, remplace `TON_ID` et `LE_SECRET` puis **Run** :
   ```sql
   select cron.schedule('bestiaire-push', '* * * * *', $$
     select net.http_post(url := 'https://TON_ID.supabase.co/functions/v1/send-push',
                          headers := '{"x-cron-secret": "LE_SECRET"}'::jsonb) $$);
   ```
   (ici `TON_ID` = `wrigianbbtzlpqbpkbps`)
   ```sql
   -- pour vérifier : la liste des tâches planifiées
   select jobname, schedule from cron.job;
   ```
6. Relance `…003_notif_moderation.sql` si pg_cron a été activé après (pour « pellicules rechargées »).
L'appli lit la clé publique sur le serveur : rien à ajouter sur GitHub. Sur iPhone, les notifications ne marchent qu'une fois l'appli installée sur l'écran d'accueil (iOS 16.4 ou plus).

## Modération
- **Automatique** : insultes et propos haineux refusés dans les pseudos, noms de guilde et messages ; un message signalé par 3 joueurs est masqué.
- **Joueurs** : « Signaler » (message, pseudo, guilde) et « Bloquer » (plus de messages ni de demande d'ami de sa part).
- **Toi, administrateur** : active ton compte une fois dans le SQL Editor :
  ```sql
  update profiles set is_admin = true where id = (select id from auth.users where email = 'TON_EMAIL_DE_JEU');
  ```
  Un panneau « Modération » apparaît alors dans ton profil : masquer, effacer un pseudo, renommer une guilde, rendre muet 7 jours, bannir.

## Pages légales : à compléter avant d'inviter des joueurs
Les textes sont dans `src/screens/Legal.tsx`. En haut du fichier, l'objet `LEGAL` contient les champs que le jeu ne peut pas deviner (statut, adresse, e-mail de contact, région Supabase, médiateur de la consommation) ; ils s'affichent surlignés tant qu'ils ne sont pas remplis.
Ces textes sont un point de départ sérieux, pas un avis juridique : fais-les relire avant de lancer l'abonnement payant.

## Tests automatiques

| Commande | Ce qui est vérifié |
|---|---|
| `npm test` | 48 tests (mode Compagnon, progression RPG, instinct et coups ultimes, 60 étapes d'aventure reproductibles, dont le chiffrement des notifications, vérifié avec la bibliothèque de référence) : données des 1 135 espèces, cote identique à la base, saisons, moteur de combat (300 combats simulés, toujours terminés), règles d'abonnement Stripe |
| `npm run test:db` | 178 tests sur une vraie base PostgreSQL : sécurité (RLS, anti-triche), safari, pellicules, premium, répartition des raretés sur 2 000 photos, fusions, enchères, collectionneurs, défis, combats, duels, succès, amis, guildes, notifications, modération, expérience et niveaux, aventure (étapes, étoiles, boss), suppression de compte |
| `npm run test:e2e` | 78 étapes dans un vrai navigateur mobile, 2 joueurs : connexion, safari, fusion, enchère gagnée par l’autre joueur, aventure (carte, étoiles, expérience), combat sauvage, duel, défis, abonnement, tentative de triche |

`test:db` et `test:e2e` demandent un PostgreSQL local et la passerelle de test (`tests/gateway.mjs`) : ils sont faits pour Linux/CI, pas besoin de les lancer sur ton PC.

---

## Organisation du code
```
src/
  data/species.json      1 135 espèces (rareté, biomes, activité, mois, masse, crédit photo)
  game/species.ts        données, cote, saisons, photos
  game/combat.ts         moteur de combat (archétypes, énergie, effets, chaîne alimentaire, fatigue)
  lib/api.ts             appels au serveur (fonctions sécurisées Supabase)
  lib/store.tsx          état du jeu partagé entre les écrans
  screens/               Safari, Bestiaire, Fiche, Combat, Marché, Profil, Connexion
  components/            cartes photo, révélation, animation de fusion
public/planches/         28 planches de photos (1 104 photos iNaturalist sous licence CC)
supabase/migrations/     tables, sécurité et toute la logique serveur
supabase/seed.sql        espèces
supabase/functions/      paiement Stripe (Checkout, portail client, webhook)
```

## Limites connues
- Les combats se jouent sur le téléphone ; le serveur plafonne les gains (30 récompenses de combat et 20 duels par jour, 400 plumes maximum par victoire). Un tricheur motivé pourrait gagner tous ses combats, sans jamais dépasser ces plafonds.
- 31 espèces françaises n'ont pas encore de photo exacte : elles sont exclues des tirages tant qu'il n'y en a pas.
- Les photos restent sous licences Creative Commons : les crédits sont affichés sur chaque fiche, il faut les conserver.

## Aventure et progression RPG

- **Aventure** (onglet Combat) : 6 chapitres (prairie, forêt, marais, côte, montagne, ville la nuit) de 10 étapes, avec une étape « élite » et un boss par chapitre. Étoiles : ★ victoire, ★★ sans perdre d'animal, ★★★ en peu de tours. Première victoire : plumes ; boss : +100 plumes et 1 pellicule ; 3 étoiles : +15 plumes.
- **Niveaux** : les combats donnent de l'expérience (60 combats récompensés par jour). Le **rang** (étoiles obtenues par fusion) fixe le niveau maximum : 10 à ★ … 40 à ★★★★★★★.
- **Instinct sauvage** : dès le niveau 3, une jauge se remplit en frappant et en encaissant ; pleine, elle libère un coup ultime propre à la classe de l'animal.
- **Arène** : rangs Bronze → Argent → Or → Diamant → Légende selon le classement.
- Les formules (niveaux, récompenses) existent côté jeu (`src/game/rpg.ts`, `src/game/adventure.ts`) et côté base (`g_niv`, `adventure_win`) : les garder identiques.

**Ressources libres utilisées** : icônes [game-icons.net](https://game-icons.net) (CC BY 3.0, crédit dans les mentions légales) ; décors SVG, effets de particules (canvas) et sons (Web Audio) créés pour le jeu, sans fichier externe.

## Onglet « Test » : mode Compagnon (prototype)

Un autre jeu dans le jeu : le joueur ouvre une box et reçoit **un seul animal célèbre** (lion, éléphant, rhinocéros, panda, loup, chat…, 14 pour le test) qu'il élève.

- **Soins** : faim et bonheur baissent avec le temps réel. Nourrir coûte des **écus** (gagnés en aventure, en arène et avec le bonus du jour). Le repas adapté au régime donne beaucoup d'expérience ; un régime inadapté répété transforme l'animal (**traits** : Brouteur, Carnassier, Toxique, Pêcheur) et lui apprend une compétence spéciale.
- **Compétences** : 1 point par niveau, 4 compétences actives + des passifs.
- **Aventure** : les 60 étapes de l'Aventure, 2 adversaires au plus. **Arène** : duels contre les compagnons des autres joueurs (classement).
- **Changer d'animal** : tous les 10 niveaux, nouvelle box (3 choix) ; niveau gardé, compétences et traits remis à zéro.
- Version test : l'état est calculé dans l'appli (`src/game/compagnon.ts`) et sauvegardé tel quel (`compagnons`). Avant une vraie sortie, il faudra déplacer les règles (écus, expérience) côté serveur pour empêcher la triche.
