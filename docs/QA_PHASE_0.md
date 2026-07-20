# QA Phase 0 — Baseline qualité

La Phase 0 **mesure** l'application avant toute réparation. Elle n'apporte
aucune correction d'interface ni de fonctionnalité : les défauts détectés sont
consignés ici et dans les rapports générés, puis corrigés dans les phases
suivantes. Les 73 tests E2E existants (`tests/e2e.mjs`) sont préservés tels
quels.

## Commandes

```bash
npm test                      # 73 tests E2E existants (inchangés)
npm run test:phase0           # baseline : mesure tout, consigne les défauts, sort en 0
npm run test:phase0:strict    # strict : sort en 1 dès qu'un critère n'est pas respecté
npm run test:sw-version       # dérive de version du service worker (baseline)
npm run test:sw-version:strict
npm run test:all              # test + phase0 + sw-version
```

### Baseline vs strict

- **Baseline** (`test:phase0`, `test:sw-version`) : exécute tous les contrôles,
  génère `test-results/phase0/` (rapports + captures) et **sort toujours en 0**
  tant qu'aucune erreur technique (navigateur, serveur, capture) ne survient.
  C'est le mode branché en CI (`.github/workflows/phase0.yml`) : la CI ne casse
  pas à cause des défauts produit déjà connus.
- **Strict** (`test:phase0:strict`, `test:sw-version:strict`, ou
  `PHASE0_STRICT=1`) : les mêmes contrôles, mais **le processus sort en 1 dès
  qu'un critère qualité échoue**. À activer progressivement dans la CI au fur
  et à mesure des corrections (Phase 1+), jusqu'à remplacer la baseline.

## Ce qui est mesuré

1. **Responsive** — 7 viewports (320×720, 375×812, 768×900, 1024×900,
   1280×900, 1366×900, 1440×900) : débordement horizontal du document,
   `scrollWidth`/`clientWidth` du header, commandes interactives hors viewport,
   visibilité + saisie réelle dans la recherche, nombre de nœuds DOM, capture
   PNG par viewport.
2. **Accessibilité & clavier** — premier focus sur « Aller au contenu » et sa
   position au focus, 16 premières tabulations (hors viewport, focus visible),
   taille des cibles interactives (WCAG 2.5.8), labels accessibles des champs
   du tiroir d'ajout.
3. **Fenêtres modales** — `flashcardSection`, `quizSection`, `calSection`,
   `dashSection`, `careSection` : `role="dialog"`, `aria-modal="true"`,
   nom accessible, piège de focus (20 Tab), fermeture Échap, retour du focus au
   déclencheur, arrière-plan masqué (`aria-hidden`/`inert`).
4. **axe-core** — violations WCAG classées critique / sérieuse / moyenne /
   mineure (`axe-report.json`).
5. **Performance** — nœuds DOM, cartes rendues, images, scripts, feuilles CSS,
   poids transféré, poids non compressé des sources, durée de chargement,
   erreurs JS, longues tâches. Budgets : ≤ 3 000 nœuds DOM, ≤ 900 Ko de
   sources non compressées, 0 erreur JS au chargement.
6. **Service worker** — `scripts/check-sw-version.mjs` compare la `VERSION` de
   `sw.js` à la génération la plus récente des `js/extensions-v*.js`.
7. **Lighthouse** — desktop + mobile (best effort, rapports JSON + HTML).

Les rapports vont dans `test-results/phase0/` (`report.json`, `summary.md`,
`sw-version.json`, `axe-report.json`, captures `responsive-*.png`,
`keyboard-16-tabs.png`, rapports Lighthouse). Le dossier est ignoré par Git ;
la CI le publie en artifact `phase0-baseline` à chaque exécution.

## Baseline mesurée le 2026-07-18

- `npm test` : **73 réussis, 0 échec** (suite existante intacte).
- `npm run test:phase0` : **43 contrôles réussis, 40 défauts consignés**
  (sortie 0 en baseline, 1 en strict — vérifié).
- `npm run test:sw-version` : **dérive détectée** (baseline : sortie 0 ;
  strict : sortie 1 — vérifié).
- Lighthouse : desktop **85** perf / **86** a11y / **96** bonnes pratiques /
  **100** SEO — mobile **57** perf / **86** a11y / **96** BP / **100** SEO.

### Métriques par viewport

| Viewport | Débordement doc | Header (scroll/client) | Commandes hors champ | Recherche | Nœuds DOM |
|---|---|---|---|---|---|
| 320×720 | non | 320/320 | 24 | ok | 2859 |
| 375×812 | non | 375/375 | 17 | ok | 2859 |
| 768×900 | non | 768/768 | 17 | ok | 2859 |
| 1024×900 | non | **1476/1024** | 22 | **hors écran** | 2859 |
| 1280×900 | non | **1534/1280** | 20 | **hors écran** | 2859 |
| 1366×900 | non | **1537/1366** | 20 | **hors écran** | 2859 |
| 1440×900 | non | **1540/1440** | 19 | **hors écran** | 2859 |

### Performance (premier chargement, 1280×900, réseau externe coupé)

- 2 859 nœuds DOM (budget ≤ 3 000 : **ok**) — 30 cartes rendues.
- 31 images présentes, 0 chargée (toutes les photos sont des URLs externes,
  coupées par le harnais pour la reproductibilité — pas un défaut).
- 9 scripts, 4 feuilles CSS/style.
- ~1 771 Ko transférés depuis le dépôt (inclut le pré-cache du service
  worker qui re-télécharge la coquille) ; sources non compressées
  (HTML+CSS+JS) : **425 Ko** (budget ≤ 900 Ko : **ok**) ; plants.json : 360 Ko.
- `loadEventEnd` ≈ 130 ms en local ; 0 erreur JS ; 2 longues tâches (62 et
  88 ms, sous le seuil de 200 ms).

## Défauts consignés (à corriger dans les phases suivantes — contrôles qui resteront rouges en mode strict)

1. **Recherche hors écran en desktop** : dès 1024 px, `#searchInput` est
   positionné à gauche hors du viewport (`left` négatif) — invisible et
   inutilisable à 1024/1280/1366/1440.
2. **Header en débordement dès 1024 px** : `scrollWidth` jusqu'à 1540 px pour
   1024–1440 px de large ; les boutons `careBtn`/`printBtn`/`dashBtn`/
   `v7-remind`/`v7-theme` sortent du viewport (un clic souris est impossible).
3. **Commandes interactives hors viewport à toutes les largeurs** (17 à 24
   éléments) : inclut les champs du tiroir d'ajout fermé et de panneaux
   off-canvas qui restent focalisables au clavier alors qu'ils sont hors écran.
4. **Lien d'évitement invisible au focus** : « Aller au contenu » reçoit bien
   le premier Tab mais reste à `top:-48px`, hors viewport, sans style de focus.
5. **Tabulations hors écran** : parmi les 16 premiers arrêts de tabulation,
   `dashBtn`, `v7-remind`, `v7-theme` (et le lien d'évitement) sont hors
   viewport.
6. **Cibles trop petites** : 2 cibles < 24×24 px (WCAG 2.5.8) et 312 sous la
   recommandation 44×44.
7. **Tiroir d'ajout** : `autoFillInput` et `formToxDetail` sans label
   accessible.
8. **Les 5 overlays** (`flashcardSection`, `quizSection`, `calSection`,
   `dashSection`, `careSection`) n'ont ni `role="dialog"`, ni
   `aria-modal="true"`, ni nom accessible (le piège de focus, Échap, le retour
   de focus et le masquage de l'arrière-plan fonctionnent, eux).
9. **axe-core** : 2 violations critiques (`button-name` 30 nœuds,
   `select-name` 6 nœuds), 2 sérieuses (`aria-dialog-name` 1 nœud,
   `color-contrast` 293 nœuds), 3 moyennes (`landmark-no-duplicate-contentinfo`,
   `landmark-unique`, `region` 14 nœuds), 1 mineure (`aria-allowed-role`
   31 nœuds).
10. **Service worker en retard** : `sw.js` déclare `VERSION = 'hdv-v7'` alors
    que les extensions vont jusqu'à `extensions-v10.js`. Le cache de la
    coquille étant nommé d'après `VERSION` et servi cache-first, un visiteur
    qui possède déjà le cache `hdv-v7-shell` continue de recevoir l'ancienne
    coquille : les mises à jour v8–v10 ne lui parviennent jamais tant que
    `VERSION` n'est pas incrémentée. **Non corrigé en Phase 0, volontairement.**
    → **Corrigé depuis** par la PR « Fiabiliser les mises à jour PWA » :
    `VERSION = 'hdv-v11'` + empreinte `SHELL_HASH` contrôlée en CI
    (`npm run test:sw-version:strict`, bloquant) et flux de mise à jour côté
    page (`npm run test:pwa`).
11. **Lighthouse mobile : performance 57** (desktop 85).

## Blocages techniques connus

- Dans certains environnements, `npx playwright install` ne peut pas
  télécharger Chromium ; les scripts de test utilisent alors automatiquement
  un Chromium local (`/opt/pw-browsers/chromium`) s'il existe — même mécanisme
  que `tests/e2e.mjs`.
- Le harnais coupe le réseau externe (photos Wikimedia/Unsplash, CDN Lenis)
  pour des mesures reproductibles : les compteurs « images chargées » et
  « poids transféré » ne couvrent donc que les ressources du dépôt.
