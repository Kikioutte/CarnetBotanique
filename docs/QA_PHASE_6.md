# Phase 6 — écrans secondaires et micro-interactions

## Objectif

Étendre la finition Apple Liquid Glass aux écrans secondaires sans ajouter de
poids visuel ou JavaScript inutile. La phase corrige aussi une régression de
positionnement apparue avec la couche de reflet de la Phase 5.

## Correctifs fonctionnels

- Le tiroir d'ajout est de nouveau fixé au viewport, bord droit sur ordinateur
  et plein écran sur mobile.
- La fiche express est de nouveau une vraie bottom sheet fixée en bas de
  l'écran.
- Le Quiz ne présente plus deux commandes « Fermer » concurrentes.
- Les emoji utilitaires sont remplacés par les icônes Font Awesome déjà
  chargées par l'application.

## Finition visuelle

- Tokens de mouvement communs : instantané, rapide, moyen et lent.
- Entrée cohérente des écrans Flashcards, Quiz, Floraisons, Tableau de bord et
  Soins.
- Pression tactile sobre, focus visible et cibles de fermeture de 44 px.
- Cartes secondaires, segments, formulaires et boutons alignés sur les surfaces
  Liquid Glass de la Phase 5.
- Onglets du formulaire animés sans masquer ni retarder le contenu.
- Mode sombre et `prefers-reduced-motion` conservés.

## Contrôles

```bash
npm run test:phase6
npm test
npm run test:phase3
npm run test:phase2
npm run test:phase5
npm run test:sw-version:strict
```

Les E2E vérifient désormais les styles calculés et les limites réelles du
tiroir et de la fiche express, afin qu'une future règle décorative ne puisse
plus annuler leur `position: fixed` silencieusement.
