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
4. Vérification rapide : `select count(*) from species;` doit renvoyer **1135**, et `select * from cron.job;` doit montrer `bestiaire-settle-auctions`.

> Les deux fichiers peuvent être relancés sans risque (mise à jour sans perte de données).
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

## Tests automatiques

| Commande | Ce qui est vérifié |
|---|---|
| `npm test` | 21 tests : données des 1 135 espèces, cote identique à la base, saisons, moteur de combat (300 combats simulés, toujours terminés), règles d'abonnement Stripe |
| `npm run test:db` | 67 tests sur une vraie base PostgreSQL : sécurité (RLS, anti-triche), safari, pellicules, premium, répartition des raretés sur 2 000 photos, fusions, enchères, collectionneurs, défis, combats, duels |
| `npm run test:e2e` | 28 étapes dans un vrai navigateur mobile, 2 joueurs : connexion, safari, fusion, enchère gagnée par l'autre joueur, combats, duel, défis, abonnement, tentative de triche |

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
