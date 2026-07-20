# Phase 9 — maturité produit

## Objectif

Transformer les fonctions déjà présentes en une expérience quotidienne cohérente, sans compte obligatoire, sans faux service cloud et sans modifier les formats de données historiques.

## Expérience livrée

1. **Briefing « Aujourd’hui »** — une synthèse immédiatement actionnable regroupe les arrosages dus, les routines configurées et les observations du mois. Elle se recalcule après une adoption, un soin ou une note.
2. **Onboarding progressif** — le premier lancement reste consultable. Une invitation non bloquante ouvre un parcours réutilisable en trois étapes : prénom facultatif, niveau, espace principal, objectifs et préférence de notifications.
3. **Profil local et transparent** — les choix sont conservés sous `hdv_profile_v1`. Aucun compte ni transfert réseau n’est créé. Les notifications ne sont jamais demandées automatiquement.
4. **Journal de vie enrichi** — les anciennes notes restent visibles. Les nouveaux événements sont datés et typés : observation, arrosage, croissance, floraison, rempotage ou soin.
5. **Source de données unique** — le journal v7 expose une petite API transactionnelle. Rappels, filtres, fiche express et chronologie continuent donc à lire le même objet en mémoire.
6. **Centre de sauvegarde** — l’utilisateur voit ce qui est conservé localement, la dernière sauvegarde connue et les actions de téléchargement/restauration. Il réutilise la validation stricte et l’inclusion des photos déjà éprouvées en v7/v8.
7. **Accès responsive** — profil et sauvegarde sont disponibles dans le menu principal mobile ; le briefing et les quatre nouveaux parcours ont des dispositions dédiées aux petits écrans.

## Compatibilité des données

- `herbier_plants_data_v4`, `hdv_journal`, `herbier_care_v1`, les scores et les photos IndexedDB conservent leur format.
- Les entrées de journal historiques `{ t, txt }` restent valides.
- Les nouvelles entrées ajoutent seulement `id`, `type` et `iso`.
- Toute écriture de journal est annulée en mémoire si `localStorage` refuse la persistance.
- L’import conserve la validation préalable et la copie `hdv_prev_plants` existantes.

## Limites assumées

- La sauvegarde est un fichier local : aucune synchronisation multi-appareil silencieuse n’est promise.
- Les notifications dépendent des permissions et capacités du navigateur.
- L’identification automatique de maladies ou d’espèces n’est pas ajoutée sans service fiable, consentement et politique de confidentialité dédiés.

## Contrat anti-régression

`npm run test:phase9` exécute les parcours en Chromium et produit dans `test-results/phase9/` :

- `onboarding-mobile.png`
- `briefing-mobile.png`
- `journal-desktop.png`
- `backup-desktop.png`
- `report.json`
- `summary.md`

Le contrôle échoue si l’onboarding bloque le premier lancement, si le profil n’est pas persisté, si le briefing ne reflète pas les vraies routines, si une note historique disparaît, si un échec de stockage altère le journal ou si le centre de sauvegarde ne donne plus accès aux deux actions essentielles.
