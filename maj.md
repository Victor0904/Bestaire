---
description: Récupère le travail déposé par Claude (cloud), le vérifie et le met en ligne
---
Une autre session Claude a peut-être déposé des modifications dans ce dossier.

1. Lis `NOTES-CLAUDE.md` (l'entrée la plus récente en haut) et résume-moi en 3 lignes ce qui a changé et ce qu'on me demande.
2. Dans `bestiaire-app/`, lance `npm install` si `package.json` a changé, puis `npm test` et `npm run build`. Si quelque chose échoue, arrête-toi et explique-moi le problème simplement.
3. Si la note demande d'exécuter du SQL dans Supabase ou une commande `npx supabase`, présente-moi exactement quoi faire et attends mon « oui » avant toute action.
4. Montre-moi `git status`, propose un message de commit en français, puis, après mon accord, fais `git add .`, `git commit` et `git push` depuis le dossier `bestiaire`.
5. Ajoute une entrée en haut de `NOTES-CLAUDE.md` (date, « Claude Code (PC) », ce que tu as fait, ce qui reste) et termine par la liste de ce qu'il me reste à faire.
