#!/usr/bin/env node
/**
 * Suite de tests bout-en-bout — L'Herbier de Vie
 * Lance un serveur statique local + Chromium headless, et vérifie les parcours clés.
 * Usage :  npm test   (CI : après `npx playwright install chromium`)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8890;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
// Environnements où le navigateur Playwright n'est pas téléchargé (chromium système pré-installé)
const localChromium = '/opt/pw-browsers/chromium';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync(localChromium)) launchOpts.executablePath = localChromium;

const MIME = { '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
let slowJson = false; // simule un réseau lent sur plants.json (course de chargement réelle)
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const send = () => { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); };
  if (slowJson && f.endsWith('plants.json')) setTimeout(send, 800); else send();
});

let failures = 0, passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures++; console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
}

const pageErrors = [];
async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
  return page;
}

await new Promise(r => server.listen(PORT, r));
const browser = await chromium.launch(launchOpts);

// ── 1. Chargement, filtres, icônes ─────────────────────────────────────────
{
  console.log('▶ chargement & interface');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    sections: document.querySelectorAll('.scrolly-section').length,
    fam: document.getElementById('v7-f-fam')?.options.length ?? -1,
    type: document.getElementById('v7-f-type')?.options.length ?? -1,
    jsonld: (() => { try { return JSON.parse(document.getElementById('v8-jsonld').textContent).mainEntity.numberOfItems; } catch { return 0; } })(),
    icons: (() => { const is = document.querySelectorAll('i.fa-solid,i.fa-regular'); let ok = 0; is.forEach(i => { const st = getComputedStyle(i); if ((st.webkitMaskImage || st.maskImage) !== 'none') ok++; }); return { total: is.length, ok }; })(),
  }));
  check('catalogue rendu', r.sections > 0, r);
  check('filtre familles peuplé', r.fam > 50, r.fam);
  check('filtre types peuplé', r.type > 3, r.type);
  check('JSON-LD non vide', r.jsonld > 300, r.jsonld);
  check('toutes les icônes masquées', r.icons.total > 100 && r.icons.ok === r.icons.total, r.icons);

  // Recherche visible sur tablette
  await page.setViewportSize({ width: 900, height: 800 });
  check('recherche visible @900px', await page.evaluate(() => getComputedStyle(document.querySelector('.search-wrapper')).display !== 'none'));
  await page.setViewportSize({ width: 1400, height: 900 });

  // Édition sans perte de type legacy
  const t = await page.evaluate(() => {
    const p = plants.find(x => x.type === "Plante d'extérieur");
    openEditDrawer(p.id);
    const v = document.getElementById('formType').value;
    closeDrawer();
    return { expected: p.type, got: v };
  });
  check('type legacy préservé à l\'édition', t.got === t.expected, t);

  // Adoption en place (pas de re-rendu complet)
  const adopt = await page.evaluate(() => {
    const cat = document.getElementById('plantCatalog');
    cat.dataset.sentinel = '1';
    const sec = document.querySelector('.scrolly-section');
    const id = sec.id.replace('section-', '');
    const p = plants.find(x => x.id === id);
    const before = p.inGarden;
    toggleGardenStatus(id);
    const btn = sec.querySelector('.plant-actions .btn-luxe');
    const out = {
      stateFlipped: p.inGarden === !before,
      btnReflects: btn.classList.contains('active') === p.inGarden,
      noRebuild: document.getElementById('plantCatalog').dataset.sentinel === '1',
    };
    toggleGardenStatus(id); // restaure
    return out;
  });
  check('adoption : état basculé', adopt.stateFlipped);
  check('adoption : bouton mis à jour en place', adopt.btnReflects);
  check('adoption : catalogue non reconstruit', adopt.noRebuild);

  // Enrichissement IA : tous les champs remplis/cochés, sans écraser Wikipédia
  const ai = await page.evaluate(() => {
    openDrawer('add');
    document.getElementById('formRegion').value = 'Provence (source Wikipédia)'; // déjà rempli → ne doit PAS être écrasé
    const filled = applyAIEnrichment({
      famille: 'Lamiacées', type: "Plante d'extérieur", region: 'Méditerranée',
      besoins: 'Sol drainé.', ennemis: 'Cécidomyie.', feuillage: 'persistant',
      port: 'Touffu', hauteur: '40 cm', couleur: 'Violet', rusticite: '-15°C',
      flTexte: 'Juin à août', toxPets: 'safe', toxDetail: 'Sans danger',
      invasive: true, visu1: 'Épis violets', visu2: 'Feuilles linéaires',
      mnemonic: 'Lavande = lavage', exposition: 'Plein soleil',
      arrosage: 'Faible (1x par mois)', humidite: '40%', temperature: '15–25°C',
      rempotage: 'Printemps', engrais: 'Aucun', principes: 'Linalol',
      prepa: 'Recoupe', tempIdeale: '4–8°C', tenueVase: '7 jours',
      conservation: 'Chambre froide', stockage: 'Sec', precautions: 'Éthylène',
      substrat: [{ m: 'Terreau', p: 60 }, { m: 'Sable', p: 40 }],
    });
    const out = {
      count: filled.length,
      type: document.getElementById('formType').value,
      feuillage: document.getElementById('formFeuillage').value,  // « persistant » minuscule → doit matcher
      exposition: document.getElementById('formExposition').value,
      arrosage: document.getElementById('formArrosage').value,
      toxPets: document.getElementById('formToxPets').value,
      invasive: document.getElementById('formInvasive').checked,
      regionPreserved: document.getElementById('formRegion').value === 'Provence (source Wikipédia)',
      substrat: readSubstratRows().length,
    };
    closeDrawer();
    return out;
  });
  check('IA : ~30 champs appliqués', ai.count >= 28, ai.count);
  check('IA : selects renseignés (type/feuillage/expo/arrosage/toxicité)',
    ai.type === "Plante d'extérieur" && ai.feuillage === 'Persistant' && ai.exposition === 'Plein soleil'
    && ai.arrosage === 'Faible (1x par mois)' && ai.toxPets === 'safe', ai);
  check('IA : case invasive cochée', ai.invasive === true);
  check('IA : champ Wikipédia non écrasé', ai.regionPreserved);
  check('IA : substrat appliqué', ai.substrat === 2, ai.substrat);

  // Suppression + annulation
  const undo = await page.evaluate(async () => {
    const n0 = plants.length;
    const id = plants[0].id;
    triggerDelete(id);
    document.getElementById('confirmDeleteBtn').click();
    const afterDel = plants.length;
    const undoBtn = document.querySelector('#toast button');
    if (undoBtn) undoBtn.click();
    return { n0, afterDel, afterUndo: plants.length, firstBack: plants[0].id === id };
  });
  check('suppression effective', undo.afterDel === undo.n0 - 1, undo);
  check('annulation restaure la fiche à sa position', undo.afterUndo === undo.n0 && undo.firstBack, undo);

  // Fiche détail + hash
  const detail = await page.evaluate(() => {
    const id = plants[2].id;
    openPlantDetail(id);
    const open = document.getElementById('v7-modal').classList.contains('open');
    const hash = location.hash;
    closeModal();
    return { open, hash, hashCleared: !/plante=/.test(location.hash) };
  });
  check('fiche détail s\'ouvre', detail.open);
  check('hash #plante= posé', /plante=/.test(detail.hash), detail.hash);
  check('hash nettoyé à la fermeture', detail.hashCleared);

  // i18n : bascule EN
  const i18n = await page.evaluate(() => {
    toggleLang();
    const out = {
      quizH2: document.querySelector('#quizSection .quiz-head h2').textContent,
      mode: document.getElementById('modeLearn').textContent.trim(),
      hero: document.getElementById('heroText').textContent,
    };
    toggleLang(); // retour FR
    return out;
  });
  check('i18n EN : titre quiz', i18n.quizH2 === 'Review Room', i18n.quizH2);
  check('i18n EN : bouton mode', /Learning/.test(i18n.mode), i18n.mode);
  check('i18n EN : héro', /species/.test(i18n.hero), i18n.hero);

  // Quiz : erreur → Leitner + « Réviser mes erreurs »
  const quiz = await page.evaluate(() => {
    localStorage.removeItem('hdv_quiz_errors');
    toggleQuizMode();
    const correct = (quizMode === 'fam') ? quizCur.famille : quizCur.nomFr;
    const wrong = [...document.querySelectorAll('.quiz-opt')].find(o => o.textContent.trim() !== correct);
    wrong.click();
    const errs = JSON.parse(localStorage.getItem('hdv_quiz_errors') || '[]');
    const leit = JSON.parse(localStorage.getItem('hdv_leitner') || '{}');
    const btnVisible = document.getElementById('quizErrBtn').style.display !== 'none';
    const out = { tracked: errs.includes(quizCur.id), leitBox: (leit[quizCur.id] || {}).box, btnVisible };
    toggleQuizMode();
    return out;
  });
  check('erreur de quiz enregistrée', quiz.tracked, quiz);
  check('erreur de quiz → boîte Leitner 1', quiz.leitBox === 1, quiz.leitBox);
  check('bouton « Réviser mes erreurs » visible', quiz.btnVisible);

  // Focus trap + aria-hidden + Échap
  const trap = await page.evaluate(() => {
    toggleQuizMode();
    const hidden = document.getElementById('mainHeader').getAttribute('aria-hidden') === 'true';
    return { hidden, open: document.body.classList.contains('quiz-on') };
  });
  check('overlay ouvert : fond en aria-hidden', trap.hidden && trap.open, trap);
  await page.keyboard.press('Escape');
  const trapAfter = await page.evaluate(() => ({
    closed: !document.body.classList.contains('quiz-on'),
    unhidden: document.getElementById('mainHeader').getAttribute('aria-hidden') !== 'true',
  }));
  check('Échap ferme et rétablit aria-hidden', trapAfter.closed && trapAfter.unhidden, trapAfter);

  await ctx.close();
}

// ── 2. Course de chargement lent (bug historique des filtres vides) ───────
{
  console.log('▶ données lentes (800 ms)');
  slowJson = true;
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const fam = await page.evaluate(() => document.getElementById('v7-f-fam')?.options.length ?? -1);
  check('filtres peuplés malgré données lentes', fam > 50, fam);
  slowJson = false;
  await ctx.close();
}

// ── 3. Routage #plante= à l'ouverture ──────────────────────────────────────
{
  console.log('▶ routage par hash');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await newPage(ctx);
  const id = JSON.parse(fs.readFileSync(path.join(ROOT, 'plants.json'), 'utf8'))[5].id;
  await page.goto(`http://localhost:${PORT}/#plante=${encodeURIComponent(id)}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    open: document.getElementById('v7-modal').classList.contains('open'),
    title: (document.querySelector('#v7-modal-body .v7-h') || {}).textContent || '',
  }));
  check('URL partagée ouvre la fiche', r.open && r.title.length > 0, r);
  await ctx.close();
}

// ── 4. Restauration après corruption des données locales ──────────────────
{
  console.log('▶ rollback données corrompues');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    localStorage.setItem('hdv_prev_plants', localStorage.getItem('herbier_plants_data_v4'));
    localStorage.setItem('herbier_plants_data_v4', '{corrompu!!!');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => plants.length);
  check('données restaurées depuis la copie de secours', n > 300, n);
  await ctx.close();
}

// ── 5. Service worker : hors-ligne complet ─────────────────────────────────
{
  console.log('▶ PWA hors-ligne');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage(); // pas de blocage de routes : le SW doit intercepter
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    sections: document.querySelectorAll('.scrolly-section').length,
    controlled: !!navigator.serviceWorker.controller,
  }));
  check('page servie hors-ligne par le SW', r.controlled && r.sections > 0, r);
  await ctx.setOffline(false);
  await ctx.close();
}

// ── 6. Dock mobile, hub et fiche express (v10) ─────────────────────────────
{
  console.log('▶ navigation "app mobile" (v10)');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await newPage(ctx);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const hub = await page.evaluate(() => ({
    dockVisible: getComputedStyle(document.querySelector('.fusion-mobile-dock')).display !== 'none',
    total: parseInt(document.getElementById('fusionTotal').textContent, 10),
    dockButtons: document.querySelectorAll('.fusion-mobile-dock [data-fusion-action]').length,
  }));
  check('dock visible en largeur mobile', hub.dockVisible, hub);
  check('hub : statistique "espèces" peuplée', hub.total > 300, hub.total);
  check('dock : 5 raccourcis présents', hub.dockButtons === 5, hub.dockButtons);

  // Clic sur un bouton du dock → ouvre l'écran Soins
  const care = await page.evaluate(() => {
    document.querySelector('.fusion-mobile-dock [data-fusion-action="care"]').click();
    return { careOn: document.body.classList.contains('care-on'), active: document.querySelector('.fusion-mobile-dock [data-fusion-action="care"]').classList.contains('active') };
  });
  check('dock "Soins" ouvre l\'écran Soins', care.careOn, care);
  check('dock "Soins" marqué actif', care.active, care);
  await page.evaluate(() => window.toggleCareMode()); // referme

  // Clic sur un bouton du dock → ouvre le tiroir d'ajout
  const add = await page.evaluate(() => {
    document.querySelector('.fusion-mobile-dock [data-fusion-action="add"]').click();
    return document.getElementById('plantDrawer').classList.contains('open');
  });
  check('dock "Ajouter" ouvre le tiroir', add);
  await page.evaluate(() => window.closeDrawer());

  // Fiche express : ouverture depuis une carte du catalogue, fermeture à l'Échap
  const sheetOpen = await page.evaluate(() => {
    document.querySelector('#plantCatalog .fusion-quick-btn').click();
    return document.getElementById('fusionQuickSheet').classList.contains('open');
  });
  check('fiche express s\'ouvre depuis le catalogue', sheetOpen);
  await page.keyboard.press('Escape');
  const sheetClosed = await page.evaluate(() => !document.getElementById('fusionQuickSheet').classList.contains('open'));
  check('fiche express se ferme à l\'Échap', sheetClosed);

  // Dock "Accueil" referme la barre de comparaison si elle était ouverte
  const homeClearsCompare = await page.evaluate(() => {
    document.querySelector('.cmp-btn').click();
    document.querySelector('.fusion-mobile-dock [data-fusion-action="home"]').click();
    return document.getElementById('v7-cmpbar').classList.contains('show');
  });
  check('dock "Accueil" referme la barre de comparaison', !homeClearsCompare);

  await ctx.close();
}

// ── Bilan ───────────────────────────────────────────────────────────────────
const realErrors = pageErrors.filter(e => !/ERR_FAILED|Failed to fetch|NetworkError|Load failed/i.test(e));
check('aucune erreur JavaScript', realErrors.length === 0, realErrors.slice(0, 5));

await browser.close();
server.close();
console.log(`\n${passed} réussis, ${failures} échecs`);
process.exit(failures ? 1 : 0);
