# Phase 3 — Accessibilité

## Objectif

Transformer la baseline d’accessibilité en contrat CI bloquant et supprimer les 25 défauts restants après la navigation responsive.

## Corrections couvertes

- lien « Aller au contenu » visible dès le premier `Tab` ;
- cible interactive minimale de 24 × 24 px ;
- noms accessibles pour tous les boutons, filtres et champs du formulaire ;
- cinq écrans plein format exposés comme fenêtres nommées (`dialog`, `aria-modal`) ;
- fenêtres fermées retirées du clavier et des lecteurs d’écran avec `inert` et `aria-hidden` ;
- piège de focus, fermeture par `Échap` et restitution du focus au déclencheur réel ;
- titres de plantes conservés comme titres, avec un vrai bouton pour ouvrir la fiche ;
- filtres, hero, crédits et pied de page répartis dans des repères uniques ;
- contrastes renforcés sans changer la palette décorative de l’application ;
- onglets du formulaire utilisables avec les flèches, `Début` et `Fin` ;
- fiche express nommée et retirée de l’arbre d’accessibilité quand elle est fermée.

## Contrat automatique strict

`npm run test:phase3` exécute les 83 contrôles de la baseline en mode bloquant :

- sept viewports de 320 à 1440 px ;
- navigation clavier et focus visible ;
- labels, cibles tactiles et lien d’évitement ;
- ouverture, piège de focus et fermeture des cinq fenêtres ;
- aucune violation axe-core critique, sérieuse, moyenne ou mineure ;
- budgets de performance et absence d’erreur JavaScript ;
- cohérence du service worker.

La CI ne peut plus passer si l’un de ces critères régresse.
