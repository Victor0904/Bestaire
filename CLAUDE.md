# Bestiaire — contexte pour Claude Code

Projet de Victor : **Bestiaire**, jeu web mobile (PWA) de safari photo de la faune de France.
L'application est dans `bestiaire-app/`. Lis `bestiaire-app/README.md` pour l'installation complète.
Réponds toujours **en français**, simplement : Victor n'est pas développeur de métier.

## Le jeu en bref
- 1 135 espèces réelles (GBIF, Wikidata, photos iNaturalist CC) ; tirage selon l'heure, la saison et le milieu réels.
- Pellicules (5 photos), raretés 60/25/10/4/1 %, fusions (2 cartes même niveau → niveau +1, max 7), cote, marché aux enchères + collectionneurs (bots), combats (animaux sauvages, duels entre joueurs), défis du jour, succès, amis (code ami), guildes (objectif hebdomadaire, discussion), notifications, modération, abonnement Bestiaire+ 4,99 €/mois (Stripe).

## Technique
- Front : React 18 + Vite + TypeScript (`bestiaire-app/src`). Écrans dans `src/screens`, moteur de combat `src/game/combat.ts`.
- Serveur : Supabase. Toute la logique sensible est en SQL (`supabase/migrations`, fonctions « security definer », RLS partout, aucune écriture directe des joueurs).
  Migrations **toujours dans l'ordre** : `20261002000001_schema.sql` → `…002_social.sql` → `…003_notif_moderation.sql` (toutes ré-exécutables).
- Fonctions Edge (Deno) : `create-checkout`, `customer-portal`, `stripe-webhook`, `send-push` (Web Push maison dans `_shared/webpush.ts`).
- Projet Supabase : référence `wrigianbbtzlpqbpkbps`. Les clés sont dans `bestiaire-app/.env` (jamais dans Git).
- Mise en ligne : GitHub `Victor0904/Bestaire` (le dépôt Git est le dossier `bestiaire/` entier), GitHub Actions → https://victor0904.github.io/Bestiaire/ (`.github/workflows/deploy.yml`, secrets `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`).

## Commandes (dans `bestiaire-app/`)
- `npm run dev` : appli locale sur http://localhost:5173
- `npm test` : tests unitaires (Vitest) — `npm run build` : vérifie TypeScript et construit
- `npm run test:db` / `npm run test:e2e` : nécessitent un PostgreSQL de test + `tests/gateway.mjs` (prévus pour Linux, pas utiles sur ce PC)
- Après toute modification : `npm test` puis `npm run build` doivent passer avant de pousser.

## Étapes encore à faire par Victor (à lui rappeler tant que ce n'est pas fait)
1. Exécuter les 3 migrations dans Supabase (SQL Editor), dans l'ordre.
2. `git add .` → `git commit` → `git push` depuis `bestiaire/` (le travail récent n'est pas encore poussé).
3. Notifications push : clés VAPID + `send-push` + tâche pg_cron (README, section Notifications).
4. Avant d'inviter des joueurs : SMTP Resend dans Supabase, champs `LEGAL` en haut de `src/screens/Legal.tsx`, URL GitHub Pages dans les Redirect URLs Supabase, changer le mot de passe du compte de test, activer son compte admin (SQL dans le README).
5. Plus tard : Stripe (prix 4,99 €, webhook, déploiement des fonctions), relecture des CGV.

## Règles de Victor (à respecter strictement)
- Présenter chaque action (site, étapes, montant) et **attendre son « oui »** avant : paiement, création de compte, abonnement, envoi de message, suppression, modification de réglages du PC ou d'un compte en ligne.
- Ne jamais saisir ni créer de mot de passe ; ne jamais contourner un captcha. Pour les comptes en ligne, n'utiliser que l'adresse dédiée que Victor a créée pour Claude, jamais ses comptes personnels.
- Ne rien supprimer sans son accord. Ne rien inventer sur lui (les champs légaux restent « à compléter » tant qu'il ne les a pas donnés).
- Après chaque tâche : récapitulatif (ce qui a été fait, où, ce qu'il lui reste à faire).

## Travail à plusieurs Claude
Une autre conversation Claude (dans le cloud, application Claude) travaille aussi sur ce projet et dépose des fichiers dans ce dossier.
Les deux sessions ne peuvent pas se parler directement : notez ce que vous faites dans `NOTES-CLAUDE.md` (date, ce qui a changé, ce qui reste), et lisez-le en arrivant.
