# Phase 2 — Navigation responsive

## Objectif

Rendre toutes les fonctions de navigation accessibles et utilisables de 320 à 1440 px, sans débordement du header ni commande coupée.

## Architecture retenue

- Recherche persistante et visible à toutes les largeurs.
- Mobile (jusqu’à 768 px) : marque, recherche et menu principal, complétés par le dock des cinq actions quotidiennes.
- Tablette et ordinateur : modes et actions principales dans le header ; actions secondaires dans le menu principal.
- Menu principal commun aux trois familles d’écrans : apprentissage, jardin, flashcards, quiz, floraisons, soins, impression, tableau de bord, ajout, rappels et thème.
- Panneaux fermés marqués `aria-hidden` et `inert` afin qu’aucun contrôle hors écran ne reste interactif.

## Contrat automatique strict

`npm run test:phase2` vérifie sur 320×720, 375×812, 768×900, 1024×900, 1280×900, 1366×900 et 1440×900 :

- absence de débordement horizontal du document et du header ;
- recherche visible et réellement saisissable ;
- aucune commande visible coupée horizontalement ;
- adaptation des accès directs au breakpoint ;
- présence de toutes les destinations dans le menu ;
- ouverture, fermeture par Échap et restitution du focus ;
- ouverture réelle de l’écran Soins depuis le menu ;
- absence d’erreur JavaScript.

Les captures du header fermé aux sept largeurs, ainsi que le menu ouvert à 375, 1024 et 1440 px, sont publiées dans l’artifact CI `phase0-baseline`.
