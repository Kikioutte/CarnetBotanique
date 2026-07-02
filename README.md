# L'Herbier de Vie — Carnet de Botanique

Carnet de botanique interactif : 335 fiches d'espèces, flashcards à répétition espacée,
quiz, calendrier de floraison, suivi d'arrosage et journal de culture. Application
statique **sans étape de build**, installable en PWA et utilisable **hors-ligne**.

## Structure

| Fichier / dossier        | Rôle |
|--------------------------|------|
| `index.html`             | Coquille de l'application (markup uniquement) |
| `css/styles.css`         | Styles (blocs v5→v8 concaténés, ordre de cascade préservé) |
| `css/icons.css`          | Sous-ensemble d'icônes Font Awesome auto-hébergé (masques SVG) |
| `js/app.js`              | Cœur : données, catalogue, quiz, flashcards, calendrier, soins |
| `js/extensions-v7.js`    | Thème sombre, i18n, filtres, journal, comparaison, import/export |
| `js/extensions-v8.js`    | Pagination, recherche floue, photos (IndexedDB), vues, partage jardin |
| `js/extensions-v9.js`    | Suivi d'arrosage par exemplaire |
| `plants.json`            | Catalogue de base (chargé au premier lancement, puis localStorage) |
| `sw.js` + `manifest.webmanifest` | PWA : cache hors-ligne + installation |
| `especes.html` / `sitemap.xml`   | SEO statique **généré** — ne pas éditer à la main |
| `scripts/build-seo.mjs`  | Générateur du SEO statique |
| `tests/e2e.mjs`          | Suite de tests bout-en-bout (Playwright) |

## Commandes

```bash
npm install                  # dépendances de dev (Playwright)
npx playwright install chromium
npm test                     # suite e2e complète (~1 min)
npm run build:seo            # régénère especes.html + sitemap.xml après modification de plants.json
npm run build:seo -- https://mon-domaine.fr/   # avec l'URL publique réelle
```

Pour servir localement : `python3 -m http.server` (ou tout serveur statique) —
le service worker exige http(s), l'ouverture en `file://` fonctionne mais sans hors-ligne.

## Déploiement

Copier le dépôt tel quel sur n'importe quel hébergement statique (GitHub Pages, Netlify…).
Après chaque déploiement qui modifie CSS/JS/HTML, **incrémenter `VERSION` dans `sw.js`**
pour invalider le cache hors-ligne des visiteurs.

## Données

Tout est stocké côté client : `localStorage` (fiches, progression, réglages) et
IndexedDB (photos personnelles). Le bouton **Export** de la barre d'outils produit une
sauvegarde JSON complète (photos incluses) ; **Import** la restaure après validation.
