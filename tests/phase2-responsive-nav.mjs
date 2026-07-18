#!/usr/bin/env node
/**
 * Phase 2 — contrat strict de navigation responsive.
 *
 * Vérifie sept largeurs réelles, la recherche, l'absence de débordement,
 * l'ouverture/fermeture clavier du menu et un parcours vers un écran produit.
 * Les captures sont publiées avec l'artifact CI Phase 0.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8893;
const OUT = path.join(ROOT, 'test-results', 'phase2');
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
const localChromium = '/opt/pw-browsers/chromium';
const windowsEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync(localChromium)) launchOpts.executablePath = localChromium;
else if (fs.existsSync(windowsEdge)) launchOpts.executablePath = windowsEdge;

const MIME = {
  '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

const viewports = [
  { width: 320, height: 720 }, { width: 375, height: 812 }, { width: 768, height: 900 },
  { width: 1024, height: 900 }, { width: 1280, height: 900 },
  { width: 1366, height: 900 }, { width: 1440, height: 900 },
];
const requiredActions = [
  'learn', 'garden', 'flash', 'quiz', 'calendar', 'care',
  'print', 'dashboard', 'add', 'reminders', 'theme',
];
const results = [];
let passed = 0;
let failed = 0;

function check(viewport, name, ok, details = null) {
  const result = { viewport: `${viewport.width}x${viewport.height}`, name, ok: !!ok, details };
  results.push(result);
  if (ok) { passed++; console.log(`  ✓ ${result.viewport} — ${name}`); }
  else { failed++; console.error(`  ✗ ${result.viewport} — ${name}${details ? ` — ${JSON.stringify(details)}` : ''}`); }
}

await new Promise(resolve => server.listen(PORT, resolve));
const browser = await chromium.launch(launchOpts);

try {
  for (const viewport of viewports) {
    console.log(`▶ Navigation ${viewport.width}×${viewport.height}`);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => route.abort());
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const closed = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' &&
          style.opacity !== '0' && element.getClientRects().length > 0;
      };
      const interactive = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')];
      const horizontalOffscreen = interactive.filter(element => {
        if (!visible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map(element => ({
        id: element.id || null,
        text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 36),
        rect: (() => { const r = element.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; })(),
      }));
      const header = document.getElementById('mainHeader');
      const search = document.getElementById('searchInput');
      const searchRect = search.getBoundingClientRect();
      const burger = document.getElementById('burgerBtn');
      const burgerRect = burger.getBoundingClientRect();
      const navActions = document.querySelector('.nav-actions');
      return {
        document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        header: { scrollWidth: header.scrollWidth, clientWidth: header.clientWidth, rect: header.getBoundingClientRect().toJSON() },
        search: { visible: visible(search), left: searchRect.left, right: searchRect.right, width: searchRect.width },
        burger: { visible: visible(burger), left: burgerRect.left, right: burgerRect.right, expanded: burger.getAttribute('aria-expanded') },
        directNavVisible: visible(navActions),
        horizontalOffscreen,
        drawerHidden: document.getElementById('plantDrawer').hasAttribute('inert') &&
          document.getElementById('plantDrawer').getAttribute('aria-hidden') === 'true',
      };
    });

    check(viewport, 'document sans débordement horizontal', closed.document.scrollWidth <= closed.document.clientWidth, closed.document);
    check(viewport, 'header sans débordement', closed.header.scrollWidth <= closed.header.clientWidth, closed.header);
    check(viewport, 'aucune commande visible hors viewport', closed.horizontalOffscreen.length === 0, closed.horizontalOffscreen.slice(0, 8));
    check(viewport, 'recherche entièrement visible', closed.search.visible && closed.search.left >= 0 && closed.search.right <= viewport.width, closed.search);
    check(viewport, 'menu principal visible et dans le viewport', closed.burger.visible && closed.burger.left >= 0 && closed.burger.right <= viewport.width && closed.burger.expanded === 'false', closed.burger);
    check(viewport, 'navigation directe adaptée au breakpoint', viewport.width <= 768 ? !closed.directNavVisible : closed.directNavVisible, { directNavVisible: closed.directNavVisible });
    check(viewport, 'tiroir fermé retiré de l’interaction', closed.drawerHidden, { drawerHidden: closed.drawerHidden });

    await page.fill('#searchInput', 'rose');
    check(viewport, 'recherche utilisable', await page.inputValue('#searchInput') === 'rose');
    await page.fill('#searchInput', '');
    await page.screenshot({ path: path.join(OUT, `navigation-${viewport.width}x${viewport.height}.png`) });

    await page.click('#burgerBtn');
    await page.waitForTimeout(450);
    const opened = await page.evaluate(required => {
      const nav = document.getElementById('mobileNav');
      const buttons = [...nav.querySelectorAll('[data-nav-action]')];
      const visibleButtons = buttons.filter(button => {
        const style = getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      return {
        open: nav.classList.contains('open'),
        ariaHidden: nav.getAttribute('aria-hidden'),
        inert: nav.hasAttribute('inert'),
        actions: buttons.map(button => button.dataset.navAction),
        missing: required.filter(action => !buttons.some(button => button.dataset.navAction === action)),
        horizontallyClipped: visibleButtons.filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).map(button => button.dataset.navAction),
      };
    }, requiredActions);
    check(viewport, 'menu ouvert avec état sémantique correct', opened.open && opened.ariaHidden === 'false' && !opened.inert, opened);
    check(viewport, 'toutes les destinations présentes', opened.missing.length === 0, opened);
    check(viewport, 'aucun bouton du menu n’est coupé horizontalement', opened.horizontallyClipped.length === 0, opened.horizontallyClipped);
    if ([375, 1024, 1440].includes(viewport.width)) {
      await page.screenshot({ path: path.join(OUT, `menu-open-${viewport.width}x${viewport.height}.png`) });
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const escaped = await page.evaluate(() => ({
      open: document.getElementById('mobileNav').classList.contains('open'),
      ariaHidden: document.getElementById('mobileNav').getAttribute('aria-hidden'),
      inert: document.getElementById('mobileNav').hasAttribute('inert'),
      focus: document.activeElement?.id || null,
    }));
    check(viewport, 'Échap ferme le menu et restaure le focus', !escaped.open && escaped.ariaHidden === 'true' && escaped.inert && escaped.focus === 'burgerBtn', escaped);

    await page.click('#burgerBtn');
    await page.click('[data-nav-action="care"]');
    await page.waitForTimeout(250);
    const care = await page.evaluate(() => ({
      careOn: document.body.classList.contains('care-on'),
      menuOpen: document.getElementById('mobileNav').classList.contains('open'),
    }));
    check(viewport, 'une destination ouvre réellement son écran', care.careOn && !care.menuOpen, care);
    await page.evaluate(() => { if (document.body.classList.contains('care-on')) window.toggleCareMode(); });

    check(viewport, 'aucune erreur JavaScript', pageErrors.length === 0, pageErrors);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

const report = { generatedAt: new Date().toISOString(), passed, failed, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'summary.md'), [
  '# Phase 2 — Navigation responsive', '',
  `- ${passed} contrôles réussis`, `- ${failed} échec(s)`,
  '- Viewports : 320, 375, 768, 1024, 1280, 1366 et 1440 px', '',
].join('\n'));

console.log(`\nPhase 2 : ${passed} réussis, ${failed} échec(s).`);
process.exit(failed ? 1 : 0);
