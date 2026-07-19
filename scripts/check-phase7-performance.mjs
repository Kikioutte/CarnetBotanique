#!/usr/bin/env node
/**
 * Phase 7 — contrat de performance mobile stable.
 *
 * La cause historique des scores mobiles instables (90/100 ± échecs
 * intermittents) était la dépendance du chemin critique à des origines
 * externes : image du hero servie par images.unsplash.com (élément LCP dont
 * la latence variait à chaque mesure) et polices Google Fonts. La Phase 7
 * rend le chemin critique 100 % local ; ce contrôle empêche toute
 * réintroduction d'une dépendance réseau dans le rendu initial.
 *
 * Deux familles de contrôles :
 *
 * 1. STRUCTURELS (toujours exécutés, déterministes — aucune instabilité CI) :
 *    - aucune feuille de style, script ou preload externe dans index.html ;
 *    - aucune url(http…) dans le CSS critique (styles.css / styles.min.css) ;
 *    - polices auto-hébergées : @font-face locaux avec font-display:swap,
 *      fichiers woff2 présents sur le disque et pré-cachés par le service
 *      worker (typographie hors-ligne) ;
 *    - image du hero hors chemin critique : dégradé local + initHeroPhoto.
 *
 * 2. RAPPORTS LIGHTHOUSE (si les rapports de la CI sont présents) :
 *    - performance ≥ 95 sur mobile ET desktop (au-dessus du plancher
 *      Phase 4 qui reste à 90 sur mobile) ;
 *    - accessibilité, bonnes pratiques, SEO ≥ 95 ;
 *    - CLS ≤ 0.1 ;
 *    - AUCUNE requête http(s) externe pendant la trace de chargement — c'est
 *      la garantie anti-« échec intermittent » : le score ne peut plus
 *      dépendre d'un serveur tiers.
 *
 * Usage :
 *   node scripts/check-phase7-performance.mjs                     → structurel + rapports si présents
 *   node scripts/check-phase7-performance.mjs --require-reports   → échoue si les rapports manquent (CI)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireReports = process.argv.includes('--require-reports');
let failed = false;

const ok = msg => console.log(`  ✓ ${msg}`);
const ko = msg => { console.error(`  ✗ ${msg}`); failed = true; };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('▶ Phase 7 — contrôles structurels (chemin critique 100 % local)');

const index = read('index.html');

// 1. Aucune ressource externe dans le HTML initial.
if (/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i.test(index) ||
    /<link[^>]+href=["']https?:\/\/[^>]+rel=["']stylesheet["']/i.test(index)) {
  ko('feuille de style externe détectée dans index.html');
} else ok('aucune feuille de style externe dans index.html');

if (/<script[^>]+src=["']https?:\/\//i.test(index)) {
  ko('script externe détecté dans le HTML initial');
} else ok('aucun script externe dans le HTML initial');

if (/<link[^>]+rel=["']preload["'][^>]*href=["']https?:\/\//i.test(index)) {
  ko('preload externe détecté dans index.html (réintroduit une dépendance réseau dans le chemin critique)');
} else ok('aucun preload externe dans index.html');

if (/rel=["']preconnect["'][^>]*fonts\.(googleapis|gstatic)\.com|fonts\.(googleapis|gstatic)\.com[^>]*rel=["']preconnect["']/i.test(index)) {
  ko('preconnect vers Google Fonts détecté : les polices doivent rester auto-hébergées');
} else ok('aucun preconnect vers Google Fonts');

// 2. CSS critique sans URL réseau (les data: restent permises).
for (const f of ['css/styles.css', 'dist/styles.min.css']) {
  const css = read(f);
  if (/url\(\s*["']?https?:\/\//i.test(css)) {
    ko(`${f} référence une URL http(s) — le CSS critique doit rester local`);
  } else ok(`${f} : aucune URL réseau`);
}

// 3. Polices auto-hébergées, présentes sur disque et pré-cachées.
const styles = read('css/styles.css');
const faces = [...styles.matchAll(/@font-face\{[^}]*\}/g)];
const fontFiles = [...styles.matchAll(/url\('\.\.\/(fonts\/[^']+\.woff2)'\)/g)].map(m => m[1]);
if (faces.length < 6 || fontFiles.length < 6) {
  ko(`@font-face locaux insuffisants (${faces.length} blocs, ${fontFiles.length} fichiers) — attendus : Cormorant Garamond (normal + italique) et Montserrat, en latin + latin-ext`);
} else ok(`@font-face locaux : ${faces.length} blocs, ${fontFiles.length} fichiers woff2`);
if (faces.some(f => !/font-display:swap/.test(f[0]))) {
  ko('un @font-face local ne déclare pas font-display:swap (premier rendu retardé)');
} else ok('font-display:swap présent sur tous les @font-face');
const missing = fontFiles.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) ko(`fichiers de police manquants : ${missing.join(', ')}`);
else ok('tous les fichiers woff2 référencés existent');

const sw = read('sw.js');
const notPrecached = fontFiles.filter(f => !sw.includes(`'${f}'`));
if (notPrecached.length) {
  ko(`polices absentes du précache SHELL de sw.js : ${notPrecached.join(', ')}`);
} else ok('toutes les polices sont dans le précache du service worker');

// 4. Image du hero hors chemin critique.
if (/\.hero\s*\{[^}]*url\(\s*["']?https?:/is.test(styles)) {
  ko('.hero déclare une image de fond réseau dans le CSS critique');
} else ok('.hero : fond critique local (dégradé), pas d’image réseau');
const appJs = read('js/app.js');
if (!/initHeroPhoto/.test(appJs) || !/hero-photo-on/.test(appJs)) {
  ko('initHeroPhoto absent de js/app.js — la photo du hero doit rester différée hors chemin critique');
} else ok('initHeroPhoto présent : photo du hero différée (cache SW ou première interaction)');

// 5. Rapports Lighthouse (produits par la CI juste avant ce contrôle).
const REPORTS = {
  desktop: 'test-results/phase0/lighthouse-desktop.report.json',
  mobile: 'test-results/phase0/lighthouse-mobile.report.json',
};
const MINIMUMS = { performance: 95, accessibility: 95, 'best-practices': 95, seo: 95 };
const CLS_MAX = 0.1;

for (const [device, file] of Object.entries(REPORTS)) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    if (requireReports) ko(`rapport Lighthouse ${device} introuvable : ${file}`);
    else console.log(`  · rapport Lighthouse ${device} absent — contrôles structurels uniquement (CI : --require-reports)`);
    continue;
  }
  const report = JSON.parse(fs.readFileSync(abs, 'utf8'));
  console.log(`▶ Phase 7 — Lighthouse ${device}`);
  for (const [category, minimum] of Object.entries(MINIMUMS)) {
    const score = Math.round((report.categories[category]?.score || 0) * 100);
    if (score >= minimum) ok(`${category}: ${score}/100 (minimum ${minimum})`);
    else ko(`${category}: ${score}/100 — minimum Phase 7 : ${minimum}`);
  }
  const cls = report.audits['cumulative-layout-shift']?.numericValue;
  if (cls !== undefined) {
    if (cls <= CLS_MAX) ok(`CLS ${cls.toFixed(3)} ≤ ${CLS_MAX}`);
    else ko(`CLS ${cls.toFixed(3)} > ${CLS_MAX}`);
  }
  ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'speed-index']
    .forEach(id => console.log(`  · ${id}: ${report.audits[id]?.displayValue || 'n/a'}`));

  // Garantie de stabilité : aucun document, style, script ou police externe
  // pendant la trace — le rendu ne peut dépendre d'aucun serveur tiers. Les
  // images externes différées (cartes Wikimedia sous la ligne de flottaison,
  // photo du hero après interaction) restent permises : elles n'appartiennent
  // pas au chemin critique et n'influencent pas la mesure.
  const requests = report.audits['network-requests']?.details?.items || [];
  const CRITICAL_TYPES = new Set(['Document', 'Stylesheet', 'Script', 'Font']);
  const external = requests.filter(r =>
    /^https?:\/\//.test(r.url) &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(r.url) &&
    CRITICAL_TYPES.has(r.resourceType));
  if (external.length) {
    ko(`${device} : ressource(s) critique(s) externe(s) pendant le chargement — ` +
      external.slice(0, 5).map(r => `${r.resourceType} ${r.url.slice(0, 80)}`).join(' | '));
  } else ok(`${device} : aucun document/style/script/police externe pendant le chargement`);
}

console.log(failed ? '\nPhase 7 : des contrôles ont échoué.' : '\nPhase 7 : tous les contrôles sont verts.');
process.exit(failed ? 1 : 0);
