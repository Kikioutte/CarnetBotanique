#!/usr/bin/env node
/**
 * Phase 0 — Baseline qualité de L'Herbier de Vie.
 *
 * Mesure (sans rien corriger) : responsive, accessibilité clavier, fenêtres
 * modales, axe-core, performance et budgets. Génère des rapports et captures
 * dans test-results/phase0/.
 *
 * Deux modes :
 *   node tests/phase0.mjs            → baseline : consigne tous les défauts,
 *                                      sort en 0 (la CI ne casse pas sur les
 *                                      défauts produit déjà connus)
 *   node tests/phase0.mjs --strict   → strict : sort en 1 dès qu'un critère
 *                                      qualité n'est pas respecté (à activer
 *                                      progressivement après corrections)
 *
 * Une erreur technique (navigateur, serveur, capture impossible) fait
 * toujours échouer le script, y compris en baseline (code 2).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSwVersion } from '../scripts/check-sw-version.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8891;
const STRICT = process.argv.includes('--strict') || process.env.PHASE0_STRICT === '1';
const OUT = path.join(ROOT, 'test-results', 'phase0');
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
const localChromium = '/opt/pw-browsers/chromium';
const windowsEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync(localChromium)) launchOpts.executablePath = localChromium;
else if (fs.existsSync(windowsEdge)) launchOpts.executablePath = windowsEdge;

// ── Serveur statique (compte les octets réellement servis) ─────────────────
const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
let transferredBytes = 0;
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const body = fs.readFileSync(f);
  transferredBytes += body.length;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(body);
});
await new Promise(r => server.listen(PORT, r));

// ── Collecte des résultats ─────────────────────────────────────────────────
const checks = [];   // { area, name, ok, details }
const blockers = []; // blocages techniques (outillage), pas des défauts produit
function check(area, name, ok, details) {
  checks.push({ area, name, ok: !!ok, details: details === undefined ? null : details });
  const mark = ok ? '  ✓ ' : (STRICT ? '  ✗ ' : '  ⚠ ');
  console.log(mark + name + (ok || details === undefined ? '' : ' — ' + JSON.stringify(details)));
}

const browser = await chromium.launch(launchOpts);

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  // Réseau externe coupé : mesures déterministes, uniquement les ressources du dépôt
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) });
      }).observe({ type: 'longtask', buffered: true });
    } catch (_) {}
  });
  return { ctx, page };
}

const INTERACTIVE_SEL = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE RESPONSIVE — 7 largeurs, débordement, header, commandes hors champ,
// recherche, nœuds DOM, capture PNG
// ═══════════════════════════════════════════════════════════════════════════
const VIEWPORTS = [
  { width: 320, height: 720 }, { width: 375, height: 812 }, { width: 768, height: 900 },
  { width: 1024, height: 900 }, { width: 1280, height: 900 }, { width: 1366, height: 900 },
  { width: 1440, height: 900 },
];
const responsive = [];
console.log('▶ Responsive');
for (const vp of VIEWPORTS) {
  const { ctx, page } = await newPage(vp);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const m = await page.evaluate((sel) => {
    const de = document.documentElement;
    const header = document.getElementById('mainHeader');
    const vw = window.innerWidth;
    const offscreen = [];
    for (const el of document.querySelectorAll(sel)) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        offscreen.push({
          tag: el.tagName.toLowerCase(), id: el.id || null,
          text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
    }
    const search = document.getElementById('searchInput');
    let searchVisible = false, searchRect = null;
    if (search) {
      const st = getComputedStyle(search);
      const r = search.getBoundingClientRect();
      searchRect = { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      searchVisible = st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 &&
        r.left >= 0 && r.right <= vw;
    }
    return {
      innerWidth: vw,
      docScrollWidth: de.scrollWidth, docClientWidth: de.clientWidth,
      docOverflowX: de.scrollWidth > de.clientWidth,
      headerScrollWidth: header ? header.scrollWidth : null,
      headerClientWidth: header ? header.clientWidth : null,
      headerOverflow: header ? header.scrollWidth > header.clientWidth : null,
      offscreenControls: offscreen.slice(0, 25),
      offscreenControlCount: offscreen.length,
      searchVisible, searchRect,
      domNodes: document.getElementsByTagName('*').length,
    };
  }, INTERACTIVE_SEL);

  // Recherche « utilisable » : on tape réellement dedans si elle est visible
  let searchUsable = false;
  if (m.searchVisible) {
    try {
      await page.fill('#searchInput', 'rose');
      searchUsable = (await page.inputValue('#searchInput')) === 'rose';
      await page.fill('#searchInput', '');
    } catch (_) { searchUsable = false; }
  }
  const shot = `responsive-${vp.width}x${vp.height}.png`;
  await page.screenshot({ path: path.join(OUT, shot) });

  const tag = `${vp.width}×${vp.height}`;
  check('responsive', `${tag} : pas de débordement horizontal du document`, !m.docOverflowX,
    { scrollWidth: m.docScrollWidth, clientWidth: m.docClientWidth });
  check('responsive', `${tag} : header sans débordement (scrollWidth ≤ clientWidth)`, !m.headerOverflow,
    { scrollWidth: m.headerScrollWidth, clientWidth: m.headerClientWidth });
  check('responsive', `${tag} : aucune commande interactive hors viewport`, m.offscreenControlCount === 0,
    { count: m.offscreenControlCount, exemples: m.offscreenControls.slice(0, 6) });
  check('responsive', `${tag} : recherche visible et utilisable`, m.searchVisible && searchUsable,
    { visible: m.searchVisible, usable: searchUsable, rect: m.searchRect });
  responsive.push({ viewport: vp, ...m, searchUsable, screenshot: `test-results/phase0/${shot}`, jsErrors: page.errors.slice() });
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE ACCESSIBILITÉ & CLAVIER — desktop 1280×900
// ═══════════════════════════════════════════════════════════════════════════
console.log('▶ Accessibilité & clavier');
const a11y = {};
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Premier focus : lien « Aller au contenu »
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    const focusVisible =
      (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || st.boxShadow !== 'none';
    return {
      tag: el.tagName.toLowerCase(), class: el.className || null,
      text: (el.textContent || '').trim().slice(0, 60),
      rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) },
      inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0 && r.height > 0,
      visible: st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0',
      focusVisible,
    };
  });
  check('clavier', 'premier Tab : focus sur « Aller au contenu »', first.text.includes('Aller au contenu'), first);
  check('clavier', 'lien d\'évitement visible et dans le viewport quand focalisé', first.inViewport && first.visible, first);
  a11y.skipLink = first;

  // 16 premières tabulations
  const tabStops = [first];
  for (let i = 1; i < 16; i++) {
    await page.keyboard.press('Tab');
    tabStops.push(await page.evaluate(() => {
      const el = document.activeElement;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      const focusVisible =
        (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0) || st.boxShadow !== 'none';
      return {
        tag: el.tagName.toLowerCase(), id: el.id || null,
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 40),
        rect: { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) },
        inViewport: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
        focusVisible,
      };
    }));
  }
  await page.screenshot({ path: path.join(OUT, 'keyboard-16-tabs.png') });
  const outOfView = tabStops.filter(t => !t.inViewport);
  const noFocusStyle = tabStops.filter(t => !t.focusVisible);
  check('clavier', '16 tabulations : aucun élément focalisé hors viewport', outOfView.length === 0,
    { horsViewport: outOfView.map(t => t.id || t.text) });
  check('clavier', '16 tabulations : focus visible sur chaque arrêt', noFocusStyle.length === 0,
    { sansStyleFocus: noFocusStyle.map(t => t.id || t.text) });
  a11y.tabStops = tabStops;

  // Taille des cibles interactives (WCAG 2.5.8 : 24×24 minimum ; 44×44 recommandé)
  const targets = await page.evaluate((sel) => {
    const tooSmall24 = [], tooSmall44 = [];
    let total = 0;
    for (const el of document.querySelectorAll(sel)) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      total++;
      const d = { tag: el.tagName.toLowerCase(), id: el.id || null, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
      if (r.width < 24 || r.height < 24) tooSmall24.push(d);
      if (r.width < 44 || r.height < 44) tooSmall44.push(d);
    }
    return { total, tooSmall24Count: tooSmall24.length, tooSmall44Count: tooSmall44.length, tooSmall24: tooSmall24.slice(0, 20) };
  }, INTERACTIVE_SEL);
  check('clavier', 'cibles interactives ≥ 24×24 px (WCAG 2.5.8)', targets.tooSmall24Count === 0,
    { total: targets.total, sous24: targets.tooSmall24Count, sous44: targets.tooSmall44Count, exemples: targets.tooSmall24.slice(0, 6) });
  a11y.targets = targets;

  // Labels accessibles des champs du tiroir d'ajout
  await page.evaluate(() => window.openDrawer && window.openDrawer('add'));
  await page.waitForTimeout(600);
  const drawer = await page.evaluate(() => {
    const d = document.getElementById('plantDrawer');
    if (!d) return { present: false };
    const fields = [];
    for (const el of d.querySelectorAll('input, select, textarea')) {
      if (el.type === 'hidden') continue;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      let label = el.getAttribute('aria-label') || '';
      const lbId = el.getAttribute('aria-labelledby');
      if (!label && lbId) label = lbId.split(/\s+/).map(i => document.getElementById(i)?.textContent || '').join(' ').trim();
      if (!label && el.id) label = document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() || '';
      if (!label) label = el.closest('label')?.textContent?.trim() || '';
      fields.push({ id: el.id || null, type: el.type || el.tagName.toLowerCase(), label: label.slice(0, 50) || null });
    }
    return { present: true, open: d.classList.contains('open') || getComputedStyle(d).display !== 'none', fields };
  });
  const unlabeled = (drawer.fields || []).filter(f => !f.label);
  check('clavier', 'tiroir d\'ajout : tous les champs visibles ont un label accessible', drawer.present && unlabeled.length === 0,
    { champs: drawer.fields?.length, sansLabel: unlabeled.map(f => f.id || f.type) });
  a11y.drawerFields = drawer;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE FENÊTRES MODALES — 5 overlays
// ═══════════════════════════════════════════════════════════════════════════
console.log('▶ Fenêtres modales (overlays)');
const MODALS = [
  { id: 'flashcardSection', trigger: '#flashBtn' },
  { id: 'quizSection', trigger: '#quizBtn' },
  { id: 'calSection', trigger: '#calBtn' },
  // Depuis la Phase 2, le tableau de bord est dans le menu principal : le
  // parcours clavier réel doit restituer le focus au bouton qui ouvre ce menu.
  { id: 'dashSection', trigger: '#burgerBtn', menuAction: 'dashboard' },
  { id: 'careSection', trigger: '#careBtn' },
];
const modals = [];
for (const mod of MODALS) {
  try {
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Déclenchement par le parcours réellement proposé dans l'interface.
  if (mod.menuAction) {
    await page.click('#burgerBtn');
    await page.click(`[data-nav-action="${mod.menuAction}"]`);
  } else {
    await page.click(mod.trigger);
  }
  await page.waitForTimeout(600);

  const state = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { present: false };
    const st = getComputedStyle(el);
    const open = st.display !== 'none' && st.visibility !== 'hidden';
    let labelValid = false, labelSource = null;
    const lbId = el.getAttribute('aria-labelledby');
    if (lbId) {
      const txt = lbId.split(/\s+/).map(i => document.getElementById(i)?.textContent || '').join(' ').trim();
      labelValid = txt.length > 0; labelSource = 'aria-labelledby';
    } else if (el.getAttribute('aria-label')) {
      labelValid = el.getAttribute('aria-label').trim().length > 0; labelSource = 'aria-label';
    }
    const header = document.getElementById('mainHeader');
    const main = document.querySelector('main');
    const hidden = n => !n || n.getAttribute('aria-hidden') === 'true' || n.inert === true;
    return {
      present: true, open,
      role: el.getAttribute('role'),
      ariaModal: el.getAttribute('aria-modal'),
      labelValid, labelSource,
      backgroundHidden: hidden(header) && hidden(main),
      focusInside: el.contains(document.activeElement),
    };
  }, mod.id);

  check('modales', `${mod.id} : s'ouvre via son déclencheur`, state.present && state.open, state);

  // Piège de focus : 20 tabulations, le focus doit rester dans l'overlay
  let trapped = false, everInside = false;
  if (state.open) {
    const inside = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      inside.push(await page.evaluate((id) => document.getElementById(id).contains(document.activeElement), mod.id));
    }
    everInside = inside.some(Boolean);
    trapped = everInside && inside.every(Boolean);
  }

  check('modales', `${mod.id} : role="dialog"`, state.role === 'dialog', { role: state.role });
  check('modales', `${mod.id} : aria-modal="true"`, state.ariaModal === 'true', { ariaModal: state.ariaModal });
  check('modales', `${mod.id} : aria-labelledby ou aria-label valide`, state.labelValid, { source: state.labelSource });
  check('modales', `${mod.id} : piège de focus (20 Tab restent dans la fenêtre)`, trapped, { focusEntre: everInside });
  check('modales', `${mod.id} : arrière-plan masqué (aria-hidden/inert sur header et main)`, state.backgroundHidden === true, state);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const after = await page.evaluate((arg) => {
    const el = document.getElementById(arg.id);
    const st = el ? getComputedStyle(el) : null;
    const trig = document.querySelector(arg.trigger);
    return {
      closed: !el || st.display === 'none' || st.visibility === 'hidden',
      focusOnTrigger: trig ? document.activeElement === trig : false,
      activeElement: document.activeElement ? (document.activeElement.id || document.activeElement.tagName.toLowerCase()) : null,
    };
  }, mod);
  check('modales', `${mod.id} : Échap referme la fenêtre`, after.closed, after);
  check('modales', `${mod.id} : le focus revient au déclencheur après Échap`, after.focusOnTrigger, after);

  modals.push({ id: mod.id, ...state, trapped, everInside, ...after, jsErrors: page.errors.slice() });
  await ctx.close();
  } catch (e) {
    blockers.push(`Contrôle de ${mod.id} interrompu par une erreur technique : ${e.message.split('\n')[0]}`);
    check('modales', `${mod.id} : contrôle exécuté sans erreur technique`, false, e.message.split('\n')[0]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AXE-CORE — violations WCAG par gravité
// ═══════════════════════════════════════════════════════════════════════════
console.log('▶ axe-core');
let axeSummary = null;
{
  const axePath = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
  if (!fs.existsSync(axePath)) {
    blockers.push('axe-core introuvable dans node_modules — audit WCAG non exécuté (npm install requis)');
    console.log('  ⚠ axe-core indisponible — audit sauté');
  } else {
    const { ctx, page } = await newPage({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.addScriptTag({ content: fs.readFileSync(axePath, 'utf8') });
    const axeResults = await page.evaluate(async () => {
      const res = await window.axe.run(document, { resultTypes: ['violations'] });
      return res.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
        nodes: v.nodes.length,
        exemples: v.nodes.slice(0, 5).map(n => n.target.join(' ')),
      }));
    });
    fs.writeFileSync(path.join(OUT, 'axe-report.json'), JSON.stringify(axeResults, null, 2) + '\n');
    const byImpact = { critical: [], serious: [], moderate: [], minor: [] };
    for (const v of axeResults) (byImpact[v.impact] || byImpact.minor).push(v);
    axeSummary = {
      total: axeResults.length,
      critical: byImpact.critical.length, serious: byImpact.serious.length,
      moderate: byImpact.moderate.length, minor: byImpact.minor.length,
      violations: axeResults,
    };
    check('axe', 'aucune violation WCAG critique', byImpact.critical.length === 0,
      byImpact.critical.map(v => `${v.id} (${v.nodes} nœuds)`));
    check('axe', 'aucune violation WCAG sérieuse', byImpact.serious.length === 0,
      byImpact.serious.map(v => `${v.id} (${v.nodes} nœuds)`));
    check('axe', 'aucune violation WCAG moyenne', byImpact.moderate.length === 0,
      byImpact.moderate.map(v => `${v.id} (${v.nodes} nœuds)`));
    check('axe', 'aucune violation WCAG mineure', byImpact.minor.length === 0,
      byImpact.minor.map(v => `${v.id} (${v.nodes} nœuds)`));

    // L'écran « Rappels d'arrosage » est construit par v9 en dehors du document
    // initial : le balayage ci-dessus ne le voyait pas. Ses champs de saisie
    // n'avaient donc aucun nom accessible sans que rien ne le signale.
    const rappels = await page.evaluate(async () => {
      plants.slice(0, 3).forEach(p => { p.inGarden = true; });
      saveData();
      window.openReminders();
      await new Promise(r => setTimeout(r, 400));
      const res = await window.axe.run(document.getElementById('v7-modal'), { resultTypes: ['violations'] });
      const champs = [...document.querySelectorAll('#v7-modal .sp-edit')].map(el => ({
        classe: el.className,
        nomAccessible: !!(el.getAttribute('aria-label') || el.closest('label')
          || (el.id && document.querySelector(`label[for="${el.id}"]`))),
      }));
      window.closeModal();
      return {
        violations: res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        champs, sansNom: champs.filter(c => !c.nomAccessible).length,
      };
    });
    check('axe', 'écran Rappels : aucune violation WCAG', rappels.violations.length === 0,
      rappels.violations.map(v => `${v.id} (${v.nodes} nœuds, ${v.impact})`));
    check('axe', 'écran Rappels : tous les champs ont un nom accessible',
      rappels.champs.length > 0 && rappels.sansNom === 0,
      { total: rappels.champs.length, sansNom: rappels.sansNom });

    // Les réglages du quiz (chrono, difficulté, famille) sont eux aussi injectés
    // après coup par v8 et échappaient donc au balayage du document initial.
    const quiz = await page.evaluate(async () => {
      window.toggleQuizMode();
      await new Promise(r => setTimeout(r, 600));
      const res = await window.axe.run(document, { resultTypes: ['violations'] });
      const controles = [...document.querySelectorAll('.v8-quizctrls select, .v8-quizctrls button')].map(el => ({
        id: el.id,
        nomAccessible: !!(el.getAttribute('aria-label') || el.getAttribute('title')
          || el.textContent.trim() || el.closest('label')),
      }));
      window.toggleQuizMode();
      return {
        violations: res.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        controles, sansNom: controles.filter(c => !c.nomAccessible).length,
      };
    });
    check('axe', 'écran Quiz : aucune violation WCAG', quiz.violations.length === 0,
      quiz.violations.map(v => `${v.id} (${v.nodes} nœuds, ${v.impact})`));
    check('axe', 'écran Quiz : tous les réglages ont un nom accessible',
      quiz.controles.length > 0 && quiz.sansNom === 0,
      { total: quiz.controles.length, sansNom: quiz.sansNom });

    await ctx.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE PERFORMANCE — premier chargement, budgets
// ═══════════════════════════════════════════════════════════════════════════
console.log('▶ Performance');
let perf = null;
{
  transferredBytes = 0;
  const { ctx, page } = await newPage({ width: 1280, height: 900 });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const imgs = [...document.images];
    return {
      domNodes: document.getElementsByTagName('*').length,
      cards: document.querySelectorAll('.scrolly-section').length,
      imagesPresent: imgs.length,
      imagesLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      scripts: document.scripts.length,
      stylesheets: document.querySelectorAll('link[rel="stylesheet"], style').length,
      loadEventEnd: nav ? Math.round(nav.loadEventEnd) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      longTasks: window.__longTasks || [],
    };
  });
  const wallLoadMs = Date.now() - t0;

  // Poids non compressé des sources applicatives (hors données plants.json)
  const sourceFiles = ['index.html', 'sw.js', 'css/styles.css', 'css/icons.css',
    'js/app.js', 'js/extensions-v7.js', 'js/extensions-v8.js', 'js/extensions-v9.js', 'js/extensions-v10.js'];
  const sourceSizes = Object.fromEntries(sourceFiles.map(f => [f, fs.statSync(path.join(ROOT, f)).size]));
  const sourceTotal = Object.values(sourceSizes).reduce((a, b) => a + b, 0);
  const plantsJsonSize = fs.statSync(path.join(ROOT, 'plants.json')).size;

  perf = {
    ...m, wallLoadMs,
    transferredBytes,
    sourceSizes, sourceTotalBytes: sourceTotal, plantsJsonBytes: plantsJsonSize,
    jsErrors: page.errors.slice(),
  };
  console.log(`  nœuds DOM: ${m.domNodes} | cartes: ${m.cards} | images: ${m.imagesLoaded}/${m.imagesPresent} | scripts: ${m.scripts} | CSS: ${m.stylesheets}`);
  console.log(`  transféré: ${(transferredBytes / 1024).toFixed(0)} Ko | sources: ${(sourceTotal / 1024).toFixed(0)} Ko | plants.json: ${(plantsJsonSize / 1024).toFixed(0)} Ko | load: ${m.loadEventEnd} ms`);
  check('performance', 'budget : ≤ 3000 nœuds DOM au premier chargement', m.domNodes <= 3000, { domNodes: m.domNodes });
  check('performance', 'budget : ≤ 900 Ko de sources non compressées', sourceTotal <= 900 * 1024, { sourceKo: Math.round(sourceTotal / 1024) });
  check('performance', 'budget : aucune erreur JavaScript au chargement', page.errors.length === 0, page.errors);
  check('performance', 'aucune longue tâche > 200 ms au chargement', !m.longTasks.some(t => t.duration > 200), m.longTasks.slice(0, 8));
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER — dérive de version (consignée, jamais corrigée ici)
// ═══════════════════════════════════════════════════════════════════════════
console.log('▶ Service worker');
const sw = checkSwVersion(ROOT);
fs.writeFileSync(path.join(OUT, 'sw-version.json'), JSON.stringify(sw, null, 2) + '\n');
check('service-worker', `VERSION de sw.js alignée sur la génération d'extensions la plus récente (${sw.swVersion} vs v${sw.latestExtensionGeneration})`,
  sw.parseable && !sw.drift, { explication: sw.explanation });

// ═══════════════════════════════════════════════════════════════════════════
// RAPPORTS
// ═══════════════════════════════════════════════════════════════════════════
await browser.close();
server.close();

const failed = checks.filter(c => !c.ok);
const passedChecks = checks.filter(c => c.ok);
const report = {
  generatedAt: new Date().toISOString(),
  mode: STRICT ? 'strict' : 'baseline',
  totals: { passed: passedChecks.length, failed: failed.length, total: checks.length },
  checks, responsive, a11y, modals, axe: axeSummary, performance: perf, serviceWorker: sw, blockers,
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');

const md = [];
md.push('# Phase 0 — Baseline qualité', '');
md.push(`Générée le ${report.generatedAt} — mode **${report.mode}**.`, '');
md.push(`## Totaux`, '', `- Contrôles réussis : **${passedChecks.length}**`, `- Contrôles échoués (défauts consignés) : **${failed.length}**`, `- Total : ${checks.length}`, '');
md.push('## Contrôles échoués (à corriger dans les phases suivantes)', '');
for (const c of failed) md.push(`- [${c.area}] ${c.name}${c.details ? ' — `' + JSON.stringify(c.details).slice(0, 200) + '`' : ''}`);
if (!failed.length) md.push('- aucun');
md.push('', '## Blocages techniques', '');
for (const b of blockers) md.push(`- ${b}`);
if (!blockers.length) md.push('- aucun');
md.push('', '## Métriques par viewport', '');
md.push('| Viewport | Débordement doc | Header (scroll/client) | Commandes hors champ | Recherche | Nœuds DOM | Capture |');
md.push('|---|---|---|---|---|---|---|');
for (const r of responsive) {
  md.push(`| ${r.viewport.width}×${r.viewport.height} | ${r.docOverflowX ? `oui (${r.docScrollWidth}/${r.docClientWidth})` : 'non'} | ${r.headerScrollWidth}/${r.headerClientWidth} | ${r.offscreenControlCount} | ${r.searchVisible && r.searchUsable ? 'ok' : 'défaillante'} | ${r.domNodes} | ${path.basename(r.screenshot)} |`);
}
md.push('', '## Performance (premier chargement, 1280×900, réseau externe coupé)', '');
if (perf) {
  md.push(`- Nœuds DOM : ${perf.domNodes} (budget ≤ 3000)`);
  md.push(`- Cartes rendues (.scrolly-section) : ${perf.cards}`);
  md.push(`- Images : ${perf.imagesLoaded}/${perf.imagesPresent} chargées`);
  md.push(`- Scripts : ${perf.scripts} — Feuilles CSS/style : ${perf.stylesheets}`);
  md.push(`- Poids transféré (ressources du dépôt) : ${(perf.transferredBytes / 1024).toFixed(0)} Ko`);
  md.push(`- Poids non compressé des sources (HTML+CSS+JS) : ${(perf.sourceTotalBytes / 1024).toFixed(0)} Ko (budget ≤ 900 Ko) — plants.json : ${(perf.plantsJsonBytes / 1024).toFixed(0)} Ko`);
  md.push(`- loadEventEnd : ${perf.loadEventEnd} ms — DOMContentLoaded : ${perf.domContentLoaded} ms`);
  md.push(`- Erreurs JavaScript : ${perf.jsErrors.length}`);
  md.push(`- Longues tâches : ${perf.longTasks.length}${perf.longTasks.length ? ' — ' + perf.longTasks.map(t => t.duration + ' ms').join(', ') : ''}`);
}
md.push('', '## axe-core', '');
if (axeSummary) {
  md.push(`- Critiques : ${axeSummary.critical} — Sérieuses : ${axeSummary.serious} — Moyennes : ${axeSummary.moderate} — Mineures : ${axeSummary.minor}`);
  for (const v of axeSummary.violations) md.push(`  - [${v.impact}] ${v.id} : ${v.help} (${v.nodes} nœuds)`);
} else {
  md.push('- non exécuté (voir blocages)');
}
md.push('', '## Service worker', '', `- ${sw.explanation}`);
md.push('', '## Commandes', '', '```', 'npm test                      # 73 tests E2E existants',
  'npm run test:phase0           # baseline (ne casse pas sur les défauts connus)',
  'npm run test:phase0:strict    # strict (échoue sur chaque critère non respecté)',
  'npm run test:sw-version       # dérive de version SW (baseline)',
  'npm run test:sw-version:strict', 'npm run test:all', '```', '');
fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'));

console.log(`\n${passedChecks.length} contrôles réussis, ${failed.length} défauts consignés (mode ${report.mode}).`);
console.log(`Rapports : test-results/phase0/report.json, summary.md, sw-version.json`);

if (STRICT && failed.length) process.exit(1);
process.exit(0);
