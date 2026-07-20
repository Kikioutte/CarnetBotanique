# QA — Phase 7 : performance mobile stable

## Objectif

Rendre les scores Lighthouse reproductibles — mobile ≥ 95, desktop ≥ 95,
accessibilité / bonnes pratiques / SEO ≥ 95 — sans échec intermittent lié aux
images ou aux ressources externes, sans retirer de fonctionnalité ni dégrader
la finition Liquid Glass.

## Cause racine identifiée (prouvée par la mesure)

Avant la Phase 7, le **chemin critique du rendu dépendait de deux origines
externes** :

1. **`images.unsplash.com`** — la photo du hero était préchargée
   (`<link rel="preload" as="image" … fetchpriority="high">`) et déclarée en
   `background-image` dans le CSS critique. Une image de fond qui couvre le
   viewport **est l'élément LCP** dès qu'elle se peint : le LCP mobile suivait
   donc la latence du CDN Unsplash à chaque mesure (score 90/100, variable).
   Preuve : dans un environnement où `images.unsplash.com` est inaccessible,
   le LCP retombe sur le `<h1>` local et le score mobile passe à 96–100 —
   le score dépendait bien d'un serveur tiers, pas de l'application.
2. **`fonts.googleapis.com` / `fonts.gstatic.com`** — la feuille Google Fonts
   (chargée en `media="print"` + bascule) ajoutait une chaîne réseau externe
   et des erreurs console (donc un score « bonnes pratiques » dégradé à 96)
   dès que l'origine était lente ou inaccessible.

Un repaint parasite du titre a également été éliminé dans `updateModeUI`.
La photographie n'est toutefois pas cachée à Lighthouse : elle est servie
localement dès le HTML initial et participe à la même expérience que celle
réellement vue par le premier visiteur.

## Corrections apportées

| Correction | Fichiers |
|---|---|
| Polices auto-hébergées : 6 fichiers woff2 **variables** (Cormorant Garamond wght 300–700 + italique, Montserrat wght 100–900, sous-ensembles latin + latin-ext, mêmes `unicode-range` que Google Fonts, `font-display:swap`). Les licences SIL OFL 1.1 des deux familles sont versionnées avec les fichiers. | `fonts/*.woff2`, `fonts/LICENSE-*-OFL.txt`, `@font-face` en tête de `css/styles.css` |
| Suppression des liens externes du `<head>` : stylesheet Google Fonts, preconnect fonts.*, preload Unsplash | `index.html` |
| Hero : la photo d'origine est versionnée en AVIF/WebP dans trois compositions responsive (640, 960 et 1440 px). Un `<picture>` prioritaire la charge dès le premier affichage ; le dégradé local reste le fond de secours pendant le décodage. Aucune interaction utilisateur n'est nécessaire et aucune requête Unsplash n'est exécutée. | `img/hero-botanique-*`, `img/README.md`, `css/styles.css`, `index.html` |
| Variante mode sombre du dégradé du hero | `css/styles.css` |
| `updateModeUI()` ne réécrit plus le titre/badge du hero quand le contenu est identique (le repaint créait une entrée LCP tardive après le chargement des données) | `js/app.js` |
| Polices et six variantes du hero ajoutées au précache `SHELL` du service worker (premier écran complet hors-ligne dès l'installation) + `SHELL_HASH` régénérée | `sw.js` |
| Types MIME `woff2` et `avif` sur le serveur de mesure | `scripts/serve-production.mjs` |
| Contrat anti-régression Phase 7 (voir ci-dessous) | `scripts/check-phase7-performance.mjs`, `package.json`, `.github/workflows/phase0.yml` |

Aucun seuil existant n'a été abaissé (Phase 4 reste en place, la Phase 7
ajoute des exigences **plus strictes** : 95 partout au lieu de 90 sur mobile).
Aucun test n'a été désactivé.

## Contrat anti-régression

`npm run test:phase7` (`scripts/check-phase7-performance.mjs`) :

- **Contrôles structurels** (déterministes, exécutés partout — aucun risque
  de CI instable) : aucun stylesheet/script/preload externe dans
  `index.html` ; aucune `url(http…)` dans le CSS critique ; `@font-face`
  locaux complets avec `font-display:swap`, licences OFL présentes, fichiers
  présents et pré-cachés par le service worker ; `<picture>` responsive local,
  chargé immédiatement et sans URL Unsplash dans le code applicatif.
- **Contrôles Lighthouse** (dès que les rapports existent ; obligatoires en
  CI via `npm run test:phase7:ci`) : performance ≥ 95 mobile **et** desktop,
  accessibilité ≥ 95, bonnes pratiques ≥ 95, SEO ≥ 95, CLS ≤ 0.1, et aucune
  ressource critique (document, style, script, police) servie par une origine
  externe pendant la trace. Le rapport doit aussi prouver que la photographie
  locale du hero a bien été requêtée au premier affichage et qu'aucune requête
  Unsplash n'a été masquée après une interaction.

Intégration : `test:phase7` fait partie de `npm run test:all` ; le workflow
`phase0.yml` exécute `test:phase7:ci` juste après la génération des rapports
Lighthouse.

## Reproduire la mesure

```bash
npm install
npm run build:assets
node scripts/serve-production.mjs 8892 &
npx --yes lighthouse@12 http://localhost:8892/ --preset=desktop \
  --output=json --output=html --output-path=test-results/phase0/lighthouse-desktop \
  --chrome-flags="--headless=new --no-sandbox" --quiet
npx --yes lighthouse@12 http://localhost:8892/ \
  --output=json --output=html --output-path=test-results/phase0/lighthouse-mobile \
  --chrome-flags="--headless=new --no-sandbox" --quiet
npm run test:phase7:ci
```

Les rapports (`.report.html` / `.report.json`) sont publiés en artefact de CI
(`phase0-baseline`).

## Ce qui est préservé (vérifié)

- **Données utilisateur** : aucune écriture/suppression de `localStorage` ni
  d'IndexedDB n'a été modifiée ; le service worker ne supprime toujours que
  ses caches techniques `hdv-*` (tests `npm run test:pwa` verts : conservation
  de localStorage et des photos IndexedDB pendant la mise à jour).
- **Hors-ligne** : le shell, les polices et les variantes responsive du hero
  sont pré-cachés dès l'installation.
- **Mise à jour PWA** : `SHELL_HASH` régénérée → les visiteurs équipés
  reçoivent la nouvelle version (contrôle `test:sw-version:strict` vert).
- **Identité visuelle** : mêmes familles/graisses typographiques (fichiers
  Google Fonts identiques, servis localement) ; même photo du hero visible dès
  le premier affichage ; dégradé de secours aux tons exacts de la palette ;
  Liquid Glass intact (contrats phase 5 et 6 verts) ; animations desktop
  (GSAP/Lenis) inchangées ; `prefers-reduced-motion` respecté (fondu
  désactivé).
- **Fonctionnalités** : e2e 75/75, navigation responsive 98/98, accessibilité
  stricte 83/83, contrats phase 5/6 verts.

## Risques et limites connus

- Les photos des fiches du catalogue restent servies par Wikimedia (sous la
  ligne de flottaison, chargement paresseux) : elles n'influencent pas les
  scores mais nécessitent toujours le réseau à la première consultation.
- Les scores absolus mesurés dans un conteneur partagé varient avec la charge
  de la machine (le multiplicateur CPU simulé de Lighthouse amplifie le
  bruit) ; la CI GitHub Actions est l'arbitre de référence du contrat.
