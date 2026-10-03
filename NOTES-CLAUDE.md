# Journal partagé entre les sessions Claude

Chaque session ajoute une entrée en haut : date, qui (cloud / PC), ce qui a changé, ce qui reste.

## 2026-10-03 (19 h) — Claude (cloud)
- Nouvel onglet « Test » : mode Compagnon (box → un animal célèbre à élever : faim, bonheur, écus, régime alimentaire et traits, compétences, aventure, arène des compagnons, changement d'animal tous les 10 niveaux).
- Base : migration 005 `supabase/migrations/20261003000005_compagnon_test.sql` À EXÉCUTER (sans elle : sauvegarde sur le téléphone seulement, pas d'arène).
- Tests : 48 unitaires, 178 base, 78 navigateur — tout passe.

## 2026-10-03 (17 h) — Claude (cloud)
- Combat refait façon RPG : onglet Combat = Aventure (carte, 6 chapitres × 10 étapes, élites, boss, étoiles) + Sauvage + Arène (rangs Bronze → Légende).
- Arène animée : décors SVG par milieu et heure, particules (canvas), sons synthétisés, icônes game-icons.net (CC BY 3.0), jauge d'instinct + coup ultime par classe avec cinématique.
- Progression : expérience et niveaux (plafond selon le rang ★ de fusion), fiche RPG (anneau de niveau, radar de stats, capacités).
- Base : migration 004 `supabase/migrations/20261003000004_aventure_rpg.sql` À EXÉCUTER après 001 → 003.
- Tests : 40 unitaires, 169 base, 73 navigateur — tout passe.

## 2026-10-03 (11 h) — Claude (cloud)
- Passage aux ZONES : France à part + 8 grandes zones (`outils/zones.json`). Commande : `node outils/collecte-especes.mjs zones`.
- Une zone = pays déjà détaillés (recalculés depuis le cache puis fusionnés) + une collecte rapide groupée des autres pays (seuils : 10 obs. pour les classes complètes, 30 pour les autres ; mois seulement pour les vertébrés).
- Sorties : `donnees/zones/<ZONE>.json`. Testé hors ligne sur FR et une Europe réduite ; la collecte rapide sera validée au premier lancement réel.
- Prochaine étape côté app : zone du joueur, booster mondial quotidien, tirage par cases (pas 80 % d'insectes).

## 2026-10-03 (matin) — Claude (cloud)
- Nuit : 26 pays collectés (≈100 000 fiches, 13 880 espèces différentes). iNaturalist renvoie des 429 en continu depuis ~9 h 45 (Canada).
- Script corrigé : arrêt propre après 15 refus en 30 min, plafond 7 500 requêtes/jour, poids adultes (Wikidata sans « poids de naissance ») + poids typique par ordre, rareté = pays + monde + notoriété, nouveau mode `recalcul` (refait les listes depuis le cache).
- À faire par Victor : Ctrl+C, `node outils/collecte-especes.mjs recalcul`, puis `tous` le soir.

## 2026-10-03 — Claude (cloud, application Claude)
- Ajouté `outils/collecte-especes.mjs` + `outils/pays-inaturalist.json` : collecte automatique des espèces par pays via iNaturalist + Wikidata (photos libres, nom français, rareté, activité, mois, milieux). Sortie dans `donnees/pays/<CODE>.json`, journal dans `donnees/journal.txt`, cache ignoré par git.
- Usage (depuis le dossier `bestiaire`) : `node outils/collecte-especes.mjs MC` (test), `tous` (nuit, reprend où il s'est arrêté), `etat`.
- Reste : test Monaco → validation → nuit complète → refonte multi-pays de l'app + import base.

## 2026-10-02 — Claude (cloud, application Claude)
- Livré dans `bestiaire-app/` : combat animé, bestiaire avec filtres, succès, amis, guildes, partage de carte, tutoriel, aide à l'installation, pages légales, notifications (cloche + push), modération, thème clair/sombre, chargement plus rapide.
- Tests (sur Linux) : 27 unitaires, 150 base de données, 65 étapes navigateur — tout passe.
- **Pas encore fait par Victor** : migrations Supabase 001 → 002 → 003, `git push` du travail récent.
- Idée pour la session PC : aider Victor à faire le `git push` et, avec son accord, les étapes Supabase via `npx supabase` (README).
