#!/usr/bin/env node
/**
 * Tests PWA — fiabilité des mises à jour du service worker.
 *
 * Simule le scénario réel qui a causé l'incident « ancienne interface servie » :
 *   1. première visite avec l'ANCIEN service worker (VERSION hdv-v7, cache-first,
 *      skipWaiting automatique) et un shell marqué « ancien » ;
 *   2. déploiement de la nouvelle version (sw.js actuel + shell marqué « nouveau ») ;
 *   3. détection de la mise à jour et affichage du message + bouton « Mettre à jour » ;
 *   4. clic → activation → rechargement unique (pas de boucle) ;
 *   5. la nouvelle version est réellement servie ;
 *   6. l'ancien cache hdv-v7-* a disparu, les données utilisateur sont intactes ;
 *   7. le mode hors-ligne fonctionne toujours après la mise à jour.
 *
 * Usage : npm run test:pwa
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8893;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
const localChromium = '/opt/pw-browsers/chromium';
const windowsEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync(localChromium)) launchOpts.executablePath = localChromium;
else if (fs.existsSync(windowsEdge)) launchOpts.executablePath = windowsEdge;

// ── Ancien service worker (comportement de la version hdv-v7 incriminée) ───
const OLD_SW = `
'use strict';
const VERSION = 'hdv-v7';
const SHELL_CACHE = VERSION + '-shell';
const SHELL = ['./','index.html','css/styles.css','css/icons.css','js/app.js',
  'js/extensions-v7.js','js/extensions-v8.js','js/extensions-v9.js','js/extensions-v10.js',
  'plants.json','especes.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) { return c.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      const copy = res.clone();
      caches.open(SHELL_CACHE).then(function (c) { c.put('index.html', copy); });
      return res;
    }).catch(function () { return caches.match('index.html', { ignoreSearch: true }); }));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req);
    }));
  }
});
`;

// ── Serveur : bascule ancien déploiement → nouveau déploiement ─────────────
const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let deploy = 'old'; // 'old' | 'new'
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (urlPath === '/sw.js' && deploy === 'old') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(OLD_SW);
    return;
  }
  const f = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  // Marqueur de déploiement dans le CSS : prouve quelle génération du shell est servie
  if (urlPath === '/css/styles.css') body = Buffer.concat([body, Buffer.from(`\n/*DEPLOY:${deploy}*/\n`)]);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise(r => server.listen(PORT, r));

let failures = 0, passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures++; console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
}

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
// IMPORTANT : pas de page.route() ici — l'interception Playwright fait pendre la
// vérification du script du service worker (register()/update() ne se résolvent
// jamais). Comme pour le test PWA de tests/e2e.mjs, le réseau reste naturel ;
// les ressources externes échouent d'elles-mêmes sans casser le scénario.
page.setDefaultTimeout(45000);
let navCount = 0;
page.on('framenavigated', f => { if (f === page.mainFrame()) navCount++; });

const cssDeploy = () => page.evaluate(() =>
  fetch('css/styles.css').then(r => r.text()).then(t => (t.match(/DEPLOY:(\w+)/) || [])[1] || 'aucun'));
const cacheKeys = () => page.evaluate(() => caches.keys());

// ── 1. Première visite : ancien SW hdv-v7 installé et aux commandes ────────
console.log('▶ ancienne version (hdv-v7) installée');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
await page.waitForTimeout(800);
const navsAfterFirstVisit = navCount;
check('SW enregistré et page contrôlée', await page.evaluate(() => !!navigator.serviceWorker.controller));
check('cache hdv-v7-shell présent', (await cacheKeys()).includes('hdv-v7-shell'), await cacheKeys());
check('shell ancien servi (cache-first)', (await cssDeploy()) === 'old', await cssDeploy());
check('première installation : aucun rechargement automatique', navsAfterFirstVisit === 1, navsAfterFirstVisit);
// Données utilisateur à préserver pendant la mise à jour
await page.evaluate(() => {
  localStorage.setItem('herbier_quiz_v1', JSON.stringify({ ok: 7, no: 3 }));
  localStorage.setItem('pwa-test-marker', 'conserve');
});

// ── 2. Déploiement de la nouvelle version, revisite en ligne ───────────────
console.log('▶ déploiement de la nouvelle version');
deploy = 'new';
navCount = 0;
await page.reload({ waitUntil: 'load', timeout: 60000 });
// L'ancien cache sert toujours l'ancien shell : c'est le bug d'origine, le
// visiteur doit maintenant se voir PROPOSER la nouvelle version.
check('avant mise à jour : ancien shell encore servi', (await cssDeploy()) === 'old', await cssDeploy());
await page.waitForSelector('#swUpdateBtn', { timeout: 45000 });
const toastText = await page.evaluate(() => document.getElementById('toast').textContent);
check('message « Une nouvelle version de Carnet Botanique est disponible »',
  toastText.includes('Une nouvelle version de Carnet Botanique est disponible'), toastText);
check('bouton « Mettre à jour » proposé', toastText.includes('Mettre à jour'));
const keysBeforeUpdate = await cacheKeys();
check('nouveau shell pré-caché en attente à côté de l\'ancien',
  keysBeforeUpdate.includes('hdv-v7-shell') && keysBeforeUpdate.some(k => k.startsWith('hdv-v10-') && k.endsWith('-shell')),
  keysBeforeUpdate);
check('pas de rechargement spontané avant le clic', navCount === 1, navCount);

// ── 3. Clic « Mettre à jour » → activation → UN rechargement ───────────────
console.log('▶ mise à jour demandée par l\'utilisateur');
await page.evaluate(() => { window.__avantClic = true; });
await page.click('#swUpdateBtn');
await page.waitForFunction(() => window.__avantClic === undefined, { timeout: 15000 }); // la page a rechargé
await page.waitForFunction(() => document.readyState === 'complete' && !!navigator.serviceWorker.controller, { timeout: 10000 });
await page.waitForTimeout(1500);
check('nouveau shell servi après mise à jour', (await cssDeploy()) === 'new', await cssDeploy());
const keysAfterUpdate = await cacheKeys();
check('ancien cache hdv-v7-shell supprimé', !keysAfterUpdate.some(k => k.startsWith('hdv-v7')), keysAfterUpdate);
check('seuls les caches de la version active restent',
  keysAfterUpdate.every(k => !k.startsWith('hdv-') || k.startsWith('hdv-v10-')), keysAfterUpdate);
const userData = await page.evaluate(() => ({
  quiz: localStorage.getItem('herbier_quiz_v1'),
  marker: localStorage.getItem('pwa-test-marker'),
}));
check('données utilisateur conservées (localStorage)',
  userData.marker === 'conserve' && JSON.parse(userData.quiz || '{}').ok === 7, userData);
check('application rendue après mise à jour',
  await page.evaluate(() => document.querySelectorAll('.scrolly-section').length > 0));

// Anti-boucle : on observe 3 s, aucun rechargement supplémentaire ne doit survenir
const navsApresMaj = navCount;
await page.waitForTimeout(3000);
check('un seul rechargement, aucune boucle', navCount === navsApresMaj && navsApresMaj === 2,
  { rechargements: navCount });

// ── 4. Hors-ligne après mise à jour ────────────────────────────────────────
console.log('▶ hors-ligne après mise à jour');
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
check('page servie hors-ligne par le nouveau SW', await page.evaluate(() =>
  !!navigator.serviceWorker.controller && document.querySelectorAll('.scrolly-section').length > 0));
check('shell servi hors-ligne = nouvelle version', (await cssDeploy()) === 'new', await cssDeploy());
await ctx.setOffline(false);

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors);

await browser.close();
server.close();
console.log(`\n${passed} réussis, ${failures} échecs`);
process.exit(failures ? 1 : 0);
