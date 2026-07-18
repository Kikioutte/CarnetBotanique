# Phase 4 — Performance mobile

## Objectif

Faire passer le chargement mobile Lighthouse de 67/100 à au moins 90/100, sans supprimer de fonction ni modifier l'identité visuelle.

## Optimisations

- JavaScript applicatif regroupé et minifié dans un seul fichier différé ;
- CSS principal minifié ;
- icônes et polices chargées sans bloquer le premier affichage ;
- GSAP, ScrollTrigger et Lenis retirés du chemin critique mobile et chargés uniquement sur ordinateur après interaction ;
- image d'accueil et images de repli adaptées à la largeur de l'écran ;
- serveur Lighthouse identique à une production statique moderne avec Brotli/Gzip ;
- budgets Lighthouse bloquants : performance ≥ 95 ordinateur et ≥ 90 mobile, accessibilité/bonnes pratiques/SEO ≥ 95.

## Commandes

```bash
npm run build:assets
npm run serve:prod
# Dans un second terminal, lancer Lighthouse sur http://localhost:8892/
npm run test:phase4
```
