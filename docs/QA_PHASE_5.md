# Phase 5 — finition Apple Liquid Glass

## Objectif

Faire passer l’interface d’une base fonctionnelle et cohérente à une finition
visuelle premium, inspirée du langage Apple Liquid Glass, sans sacrifier
l’identité botanique, la lisibilité, l’accessibilité ni les performances.

## Principes appliqués

- transparence utilisée pour hiérarchiser, jamais pour réduire le contraste ;
- reflets lumineux subtils, bordures optiques et ombres diffuses ;
- mêmes surfaces pour le header, le hub, les fiches, les menus et les modales ;
- pictogrammes de la bibliothèque locale à la place des emoji utilitaires ;
- mouvement réservé aux souris fines et désactivé avec `prefers-reduced-motion` ;
- règles mobiles dédiées pour éviter les effets coûteux ou encombrants ;
- fiches catalogue en verre statique, sans filtre ni reflet par carte, afin de
  préserver le budget de composition sur une collection de plusieurs centaines
  d’espèces ;
- première page ramenée à 20 fiches : la collection complète reste disponible
  par « Afficher plus », la recherche et les filtres, avec un DOM initial plus
  léger.

## Contrat bloquant

`npm run test:phase5` vérifie les tokens, les surfaces clés, le contraste de la
carte principale, le respect des animations réduites, le coût borné du reflet
au pointeur et l’usage d’icônes cohérentes dans le formulaire.

La Phase 5 reste aussi soumise aux contrats des phases précédentes : 73 tests
E2E, PWA, WCAG strict, navigation responsive, service worker et budgets
Lighthouse desktop/mobile.
