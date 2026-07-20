# Phase 10 — sortie production

## Objectif

Fermer les derniers écarts observés après la Phase 9 sans ajouter de service distant ni modifier les données utilisateur.

## Corrections

- Les fiches éloignées du viewport utilisent `content-visibility: auto` : elles restent accessibles et présentes dans le DOM, mais leur peinture attend l’approche du défilement.
- L’image locale du hero conserve `fetchpriority="high"` et utilise un décodage synchrone adapté à son faible poids afin d’éviter un report inutile de l’élément LCP.
- Sur ordinateur, les notifications sont ancrées à droite et ne recouvrent plus les actions centrales des modales.
- Sur mobile, la zone de défilement et les captures de contrôle tiennent explicitement compte du header et du dock fixes.
- Le briefing conserve des titres, chiffres et actions explicitement clairs en mode sombre, indépendamment de la variable de surface `--cream`.

## Contrat anti-régression

`npm run test:phase10` vérifie en Chromium :

- le choix réel de l’AVIF 640 px sur mobile ;
- la peinture différée des fiches ;
- le budget de 2 300 nœuds et l’absence de tâche longue supérieure à 200 ms ;
- l’accès à toutes les actions du briefing au-dessus du dock ;
- le thème sombre sans rechargement ;
- l’absence de violation axe-core WCAG 2.2 AA dans ce thème ;
- l’absence de chevauchement entre un toast et les actions du journal ;
- l’absence d’erreur JavaScript.

Les captures clair, sombre, journal et sauvegarde sont publiées dans l’artefact CI `phase0-baseline`.
