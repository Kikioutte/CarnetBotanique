#!/usr/bin/env node
/**
 * Tests PWA — fiabilité des mises à jour du service worker.
 *
 * Deux parcours indépendants sont réellement exécutés :
 *   A. un client possédant déjà le code de mise à jour reçoit le toast, clique
 *      sur « Mettre à jour », puis recharge une seule fois ;
 *   B. un véritable ancien client sans toast installe le nouveau worker en
 *      attente, ferme son dernier onglet, puis reçoit la nouvelle version à la
 *      visite suivante.
 *
 * Les deux parcours vérifient la suppression du cache v7, le nouveau shell,
 * l'absence de boucle et la conservation de localStorage. Le second vérifie
 * aussi qu'une photo stockée dans IndexedDB reste intacte.
 *
 * Usage : npm run test:pwa
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
const localChromium = '/opt/pw-browsers/chromium';
const windowsEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync(localChromium)) launchOpts.executablePath = localChromium;
else if (fs.existsSync(windowsEdge)) launchOpts.executablePath = windowsEdge;

// Ancien service worker hdv-v7 incriminé.
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

// Enregistrement réellement présent dans l'ancien app.js : aucun updatefound,
// aucun toast et aucun message SKIP_WAITING.
const OLD_APP_JS = `
if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('SW non enregistré', e);
    });
  });
}
`;

const OLD_INDEX = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Ancien Carnet Botanique</title>
<link rel="stylesheet" href="css/styles.css"></head>
<body><main id="legacyApp">Ancienne version</main><script src="js/app.js"></script></body></html>`;

const MIME = {
  '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

// old-current : ancien SW + app actuelle (parcours avec bouton)
// old-authentic : ancien SW + ancien app.js sans toast (rattrapage naturel)
// new : déploiement actuel complet
let deploy = 'old-current';
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const oldDeploy = deploy !== 'new';
  if (urlPath === '/sw.js' && oldDeploy) {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(OLD_SW);
    return;
  }
  if (deploy === 'old-authentic' && (urlPath === '/' || urlPath === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(OLD_INDEX);
    return;
  }
  if (deploy === 'old-authentic' && urlPath === '/js/app.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end(OLD_APP_JS);
    return;
  }
  // Les anciens bundles ne sont pas utiles au scénario minimal, mais doivent
  // exister dans le cache v7 comme sur une ancienne installation.
  if (deploy === 'old-authentic' && /^\/js\/extensions-v\d+\.js$/.test(urlPath)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    res.end('/* ancien bundle sans mécanisme de mise à jour */');
    return;
  }
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  let body = fs.readFileSync(file);
  if (urlPath === '/css/styles.css') {
    const marker = deploy === 'new' ? 'new' : 'old';
    body = Buffer.concat([body, Buffer.from(`\n/*DEPLOY:${marker}*/\n`)]);
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  res.end(body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const origin = `http://127.0.0.1:${port}`;

let failures = 0;
let passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else {
    failures++;
    console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  }
}

const cssDeploy = page => page.evaluate(() =>
  fetch('css/styles.css').then(r => r.text()).then(t => (t.match(/DEPLOY:(\w+)/) || [])[1] || 'aucun'));
const cacheKeys = page => page.evaluate(() => caches.keys());

async function seedUserData(page) {
  await page.evaluate(async () => {
    localStorage.setItem('herbier_quiz_v1', JSON.stringify({ ok: 7, no: 3 }));
    localStorage.setItem('pwa-test-marker', 'conserve');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('hdv', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('photos')) request.result.createObjectStore('photos');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('photos', 'readwrite');
      transaction.objectStore('photos').put(['data:image/png;base64,cGhvdG8='], 'pwa-test-photo');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
}

async function readUserData(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('hdv', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const photo = await new Promise((resolve, reject) => {
      const request = db.transaction('photos', 'readonly').objectStore('photos').get('pwa-test-photo');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return {
      quiz: localStorage.getItem('herbier_quiz_v1'),
      marker: localStorage.getItem('pwa-test-marker'),
      photo
    };
  });
}

function observePage(page, pageErrors) {
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => pageErrors.push(error.message));
  // Ne pas employer page.route() : Playwright bloque alors register()/update().
}

async function waitForWaitingWorker(page, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let state = null;
  while (Date.now() < deadline) {
    state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { waiting: !!(registration && registration.waiting), keys: await caches.keys() };
    });
    if (state.waiting && state.keys.some(k => k.startsWith('hdv-v10-') && k.endsWith('-shell'))) {
      return state;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('Le nouveau worker n’est pas resté en attente : ' + JSON.stringify(state));
}

async function testUpdateButton(browser) {
  console.log('▶ parcours A — mise à jour explicite avec bouton');
  deploy = 'old-current';
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  let navCount = 0;
  try {
    const page = await ctx.newPage();
    observePage(page, pageErrors);
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navCount++; });

    await page.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
    await page.waitForTimeout(800);
    const navsAfterFirstVisit = navCount;
    check('A — SW enregistré et page contrôlée', await page.evaluate(() => !!navigator.serviceWorker.controller));
    check('A — cache hdv-v7-shell présent', (await cacheKeys(page)).includes('hdv-v7-shell'), await cacheKeys(page));
    check('A — shell ancien servi', (await cssDeploy(page)) === 'old', await cssDeploy(page));
    check('A — aucun rechargement à la première installation', navsAfterFirstVisit === 1, navsAfterFirstVisit);
    await seedUserData(page);

    deploy = 'new';
    navCount = 0;
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    check('A — ancien shell encore servi avant acceptation', (await cssDeploy(page)) === 'old', await cssDeploy(page));
    await page.waitForSelector('#swUpdateBtn', { timeout: 45000 });
    const toastText = await page.evaluate(() => document.getElementById('toast').textContent);
    check('A — message de nouvelle version affiché',
      toastText.includes('Une nouvelle version de Carnet Botanique est disponible'), toastText);
    check('A — bouton « Mettre à jour » proposé', toastText.includes('Mettre à jour'));
    const keysBeforeUpdate = await cacheKeys(page);
    check('A — ancien et nouveau shells coexistent avant activation',
      keysBeforeUpdate.includes('hdv-v7-shell') &&
      keysBeforeUpdate.some(k => k.startsWith('hdv-v10-') && k.endsWith('-shell')), keysBeforeUpdate);
    check('A — aucun rechargement spontané avant le clic', navCount === 1, navCount);

    await page.evaluate(() => { window.__avantClic = true; });
    await page.click('#swUpdateBtn');
    await page.waitForFunction(() => window.__avantClic === undefined, { timeout: 15000 });
    await page.waitForFunction(() => document.readyState === 'complete' && !!navigator.serviceWorker.controller);
    await page.waitForTimeout(1500);
    check('A — nouveau shell servi après mise à jour', (await cssDeploy(page)) === 'new', await cssDeploy(page));
    const keysAfterUpdate = await cacheKeys(page);
    check('A — cache hdv-v7 supprimé', !keysAfterUpdate.some(k => k.startsWith('hdv-v7')), keysAfterUpdate);
    check('A — seuls les caches actifs restent',
      keysAfterUpdate.every(k => !k.startsWith('hdv-') || k.startsWith('hdv-v10-')), keysAfterUpdate);
    const userData = await readUserData(page);
    check('A — localStorage conservé',
      userData.marker === 'conserve' && JSON.parse(userData.quiz || '{}').ok === 7, userData);
    check('A — photo IndexedDB conservée',
      Array.isArray(userData.photo) && userData.photo[0] === 'data:image/png;base64,cGhvdG8=', userData.photo);
    check('A — application rendue',
      await page.evaluate(() => document.querySelectorAll('.scrolly-section').length > 0));

    const navsAfterUpdate = navCount;
    await page.waitForTimeout(3000);
    check('A — un seul rechargement, aucune boucle', navCount === navsAfterUpdate && navsAfterUpdate === 2,
      { navigations: navCount });

    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    check('A — page disponible hors-ligne', await page.evaluate(() =>
      !!navigator.serviceWorker.controller && document.querySelectorAll('.scrolly-section').length > 0));
    check('A — shell hors-ligne à jour', (await cssDeploy(page)) === 'new', await cssDeploy(page));
    await ctx.setOffline(false);
    check('A — aucune erreur JavaScript', pageErrors.length === 0, pageErrors);
  } finally {
    await ctx.setOffline(false).catch(() => {});
    await ctx.close();
  }
}

async function testLegacyRecovery(browser) {
  console.log('▶ parcours B — ancien app.js sans toast, fermeture puis nouvelle visite');
  deploy = 'old-authentic';
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageErrors = [];
  try {
    let page = await ctx.newPage();
    observePage(page, pageErrors);
    await page.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
    await page.waitForTimeout(800);
    check('B — ancien client réellement sans bouton de mise à jour',
      await page.evaluate(() => !document.getElementById('swUpdateBtn')));
    check('B — cache hdv-v7-shell présent', (await cacheKeys(page)).includes('hdv-v7-shell'), await cacheKeys(page));
    check('B — ancien shell servi', (await cssDeploy(page)) === 'old', await cssDeploy(page));
    await seedUserData(page);

    deploy = 'new';
    // Une nouvelle visite déclenche la vérification native du script SW. Le
    // premier onglet reste ouvert : le worker v10 doit donc réellement attendre.
    const updatePage = await ctx.newPage();
    observePage(updatePage, pageErrors);
    await updatePage.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
    const waitingState = await waitForWaitingWorker(updatePage);
    const waitingKeys = waitingState.keys;
    check('B — nouveau worker installé et en attente', waitingState.waiting);
    check('B — aucun toast possible dans ancien app.js',
      await updatePage.evaluate(() => !document.getElementById('swUpdateBtn')));
    check('B — ancien shell reste actif tant que l’onglet est ouvert',
      (await cssDeploy(updatePage)) === 'old', await cssDeploy(updatePage));
    check('B — les deux générations coexistent pendant l’attente',
      waitingKeys.includes('hdv-v7-shell') &&
      waitingKeys.some(k => k.startsWith('hdv-v10-') && k.endsWith('-shell')), waitingKeys);

    await updatePage.close();
    await page.close();
    await new Promise(resolve => setTimeout(resolve, 1500));

    page = await ctx.newPage();
    observePage(page, pageErrors);
    let navCount = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navCount++; });
    await page.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      return !keys.some(k => k.startsWith('hdv-v7'));
    }, { timeout: 15000 });
    check('B — nouveau shell servi à la visite suivante', (await cssDeploy(page)) === 'new', await cssDeploy(page));
    const activeKeys = await cacheKeys(page);
    check('B — ancien cache supprimé sans clic', !activeKeys.some(k => k.startsWith('hdv-v7')), activeKeys);
    check('B — uniquement les caches v10 restent',
      activeKeys.every(k => !k.startsWith('hdv-') || k.startsWith('hdv-v10-')), activeKeys);
    const userData = await readUserData(page);
    check('B — localStorage conservé sans clic',
      userData.marker === 'conserve' && JSON.parse(userData.quiz || '{}').ok === 7, userData);
    check('B — photo IndexedDB conservée sans clic',
      Array.isArray(userData.photo) && userData.photo[0] === 'data:image/png;base64,cGhvdG8=', userData.photo);
    check('B — application actuelle rendue',
      await page.evaluate(() => document.querySelectorAll('.scrolly-section').length > 0));

    const navsAfterOpen = navCount;
    await page.waitForTimeout(3000);
    check('B — aucune boucle à la visite suivante', navCount === navsAfterOpen && navsAfterOpen === 1,
      { navigations: navCount });

    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    check('B — nouvelle version disponible hors-ligne',
      (await cssDeploy(page)) === 'new' && await page.evaluate(() =>
        !!navigator.serviceWorker.controller && document.querySelectorAll('.scrolly-section').length > 0));
    await ctx.setOffline(false);
    check('B — aucune erreur JavaScript', pageErrors.length === 0, pageErrors);
  } finally {
    await ctx.setOffline(false).catch(() => {});
    await ctx.close();
  }
}

let browser;
try {
  browser = await chromium.launch(launchOpts);
  await testUpdateButton(browser);
  await testLegacyRecovery(browser);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

console.log(`\n${passed} réussis, ${failures} échecs`);
if (failures) process.exitCode = 1;
