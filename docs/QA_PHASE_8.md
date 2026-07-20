# Phase 8 — UX et robustesse produit

## Objectif

Rendre les parcours quotidiens compréhensibles, sûrs et récupérables sans ajouter de fonctionnalité décorative. La phase couvre le premier chargement, la recherche, les états vides, la création d’une fiche, la perte de saisie, l’échec du stockage local, la suppression et le mode hors-ligne.

## Problèmes corrigés

1. **Faux succès au chargement** — le toast contenait déjà « Fiche mise à jour avec succès » avant toute action. Il démarre désormais vide.
2. **États vides sans issue** — une recherche sans résultat, un jardin vide ou un catalogue indisponible proposent maintenant une prochaine action explicite.
3. **Échec de premier chargement silencieux** — si `plants.json` ne peut pas être chargé sur un nouvel appareil, l’écran explique le problème et propose une récupération réelle via « Réessayer ».
4. **Perte de saisie dans le tiroir** — fermer une fiche modifiée ouvre une confirmation interne. « Continuer la fiche » conserve chaque champ ; « Abandonner » ferme volontairement.
5. **Validation cachée par les onglets** — si un champ obligatoire se trouve dans un autre onglet, le formulaire revient automatiquement sur la bonne section et affiche une explication.
6. **Double soumission** — le bouton passe à « Enregistrement… », est désactivé pendant l’écriture et une double activation ne crée qu’une fiche.
7. **Succès mensonger si le stockage est plein** — création, modification, adoption et suppression valident désormais l’écriture avant d’annoncer le succès. En cas d’échec, la mutation mémoire est annulée et le formulaire reste ouvert.
8. **Suppression ambiguë** — le dialogue nomme la plante, emploie « Supprimer la fiche » et annonce honnêtement la possibilité d’annuler.
9. **État réseau invisible** — le passage hors-ligne et le retour de connexion sont annoncés sans bloquer l’usage des fiches locales.

## Contrat anti-régression

`npm run test:phase8` exécute Chromium sur les parcours réels et génère `test-results/phase8/` :

- `initial-mobile.png`
- `search-empty-mobile.png`
- `unsaved-guard-mobile.png`
- `load-error-desktop.png`
- `report.json`
- `summary.md`

Le test échoue si un état n’est plus actionnable, si un brouillon peut être perdu sans confirmation, si une écriture impossible modifie quand même les données, si une double activation crée un doublon, si l’annulation d’une suppression ne restaure pas la fiche, ou si une erreur JavaScript apparaît.

## Données utilisateur

Aucune clé de données n’est supprimée. Le modèle localStorage/IndexedDB et le format des sauvegardes restent compatibles. Les nouvelles protections ne modifient la collection persistée qu’après une écriture confirmée ; en cas de quota plein, la collection en mémoire est remise dans son état précédent.
