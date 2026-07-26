#!/usr/bin/env node
/**
 * Suite de tests bout-en-bout — L'Herbier de Vie
 * Lance un serveur statique local + Chromium headless, et vérifie les parcours clés.
 * Usage :  npm test   (CI : après `npx playwright install chromium`)
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8890;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('playwright-core')); }
// Environnements où le navigateur Playwright n'est pas téléchargé (chromium système pré-installé)
const localChromium = '/opt/pw-browsers/chromium';
const windowsEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOpts = { args: ['--no-sandbox'] };
if (fs.existsSync(localChromium)) launchOpts.executablePath = localChromium;
else if (fs.existsSync(windowsEdge)) launchOpts.executablePath = windowsEdge;

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

  // Statique : chaque classe fa-* référencée dans le code a sa règle de masque dans icons.css
  // (le check DOM ci-dessus ne voit que les icônes rendues au chargement).
  {
    const iconCss = fs.readFileSync(path.join(ROOT, 'css/icons.css'), 'utf8');
    const defined = new Set([...iconCss.matchAll(/\.fa-([a-z0-9-]+)/g)].map(m => m[1]));
    defined.add('solid'); defined.add('regular');
    const used = new Set();
    for (const f of ['index.html', 'especes.html', 'js/app.js', 'js/extensions-v7.js', 'js/extensions-v8.js', 'js/extensions-v9.js', 'js/extensions-v10.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/fa-(?:solid|regular)\s+fa-([a-z0-9-]+)/g)) used.add(m[1]);
    }
    const missing = [...used].filter(u => !defined.has(u));
    check('icônes : toutes les classes fa-* du code définies dans icons.css', missing.length === 0, missing);
  }


  // Soins saisonniers : données, profils, mois et réinitialisation
  const careMonths = await page.evaluate(() => {
    const current = carePeriod(0);
    const previous = carePeriod(-1);
    const originalState = JSON.parse(JSON.stringify(careState));
    const originalLoaded = careStateLoaded;
    const fake = {
      id: 'qa-care-plant', nomFr: 'QA soins', nomLat: 'Qualitas cura',
      famille: 'Testacées', type: "Plante d'intérieur",
      rempotage: careMonthName(previous.month), engrais: ''
    };
    careState = { version: 2, startedAt: previous.key, months: {}, legacy: {}, adoptedAt: {} };
    careStateLoaded = true;
    // Mois précédent jamais visité (aucune entrée months) : le retard doit quand même remonter
    const unvisitedOverdue = careOverdueTaskDefs(fake).map(t => t.key);
    careState.months[previous.key] = { 'qa-care-plant': {} };
    careState.adoptedAt[fake.id] = current.key;
    const newlyAdoptedOverdue = careOverdueTaskDefs(fake).map(t => t.key);
    delete careState.adoptedAt[fake.id];
    const overdueBefore = careOverdueTaskDefs(fake).map(t => t.key);
    careState.months[previous.key]['qa-care-plant'].repot = true;
    const overdueAfter = careOverdueTaskDefs(fake).map(t => t.key);
    const currentFresh = carePlantState(current.key, fake.id, true).repot !== true;
    careState = originalState;
    careStateLoaded = originalLoaded;
    return {
      purchase: parseCareMonths("Planté à l'achat"),
      purchaseCurly: parseCareMonths("Planté à l’achat"),
      godet: parseCareMonths('Acheté en godet'),
      spring: parseCareMonths('Au printemps'),
      range: parseCareMonths('de mars à septembre'),
      crossYear: parseCareMonths('de novembre à février'),
      marchTasks: careTasksForMonth({ rempotage: "Planté à l'achat", engrais: 'mars à septembre' }, 3),
      coverage: plants.filter(p => p.rempotage && p.engrais).length,
      total: plants.length,
      cutKind: plantCareKind({ type: 'Fleur coupée' }),
      orchidKind: plantCareKind({ type: "Plante d'intérieur", famille: 'Orchidacées' }),
      carnKind: plantCareKind({ type: "Plante d'intérieur", nomLat: 'Dionaea muscipula' }),
      cutKeys: baseCareTaskDefs({ type: 'Fleur coupée' }).map(t => t.key),
      indoorKeys: baseCareTaskDefs({ type: "Plante d'intérieur", famille: 'Aracées' }).map(t => t.key),
      unvisitedOverdue, newlyAdoptedOverdue, overdueBefore, overdueAfter, currentFresh
    };
  });
  check('soins : les 335 fiches ont rempotage et engrais',
    careMonths.total === 335 && careMonths.coverage === careMonths.total, careMonths);
  check('soins : achat/plantation ne produit aucun mois',
    careMonths.purchase.length === 0 && careMonths.purchaseCurly.length === 0 && careMonths.godet.length === 0, careMonths);
  check('soins : saison printemps interprétée', JSON.stringify(careMonths.spring) === '[3,4,5]', careMonths.spring);
  check('soins : plage mars-septembre interprétée', JSON.stringify(careMonths.range) === '[3,4,5,6,7,8,9]', careMonths.range);
  check('soins : plage novembre-février interprétée', JSON.stringify(careMonths.crossYear) === '[1,2,11,12]', careMonths.crossYear);
  check('soins : aucun faux rappel de rempotage en mars',
    careMonths.marchTasks.some(t => /^Fertilisation/.test(t)) && !careMonths.marchTasks.some(t => /^Rempotage/.test(t)), careMonths.marchTasks);
  check('soins : profils fleur/orchidée/carnivore reconnus',
    careMonths.cutKind === 'cut' && careMonths.orchidKind === 'orchid' && careMonths.carnKind === 'carnivorous', careMonths);
  check('soins : tâches adaptées au type',
    careMonths.cutKeys.includes('fresh-water') && careMonths.indoorKeys.includes('check-water')
    && !careMonths.indoorKeys.includes('fresh-water'), careMonths);
  check('soins : une plante adoptée ce mois-ci n’a aucun faux retard',
    careMonths.newlyAdoptedOverdue.length === 0, careMonths.newlyAdoptedOverdue);
  check('soins : mois précédent jamais visité → retard signalé quand même',
    careMonths.unvisitedOverdue.includes('repot'), careMonths.unvisitedOverdue);
  check('soins : tâche précédente signalée puis retirée après validation',
    careMonths.overdueBefore.includes('repot') && careMonths.overdueAfter.length === 0, careMonths);
  check('soins : validation du mois précédent non reportée au mois courant', careMonths.currentFresh, careMonths);

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

  // Rappels d'arrosage v9 : les plantes adoptées apparaissent bien
  // (régression : lecture de window.plants, qui n'existe pas — `plants` est un let de portée script)
  const rem = await page.evaluate(() => {
    const p = plants.find(x => !x.inGarden);
    toggleGardenStatus(p.id);
    window.openReminders();
    const groups = document.querySelectorAll('#v7-modal .sp-group').length;
    const empty = !!document.querySelector('#v7-modal .v7-empty');
    window.closeModal();
    toggleGardenStatus(p.id); // restaure
    return { groups, empty };
  });
  check('rappels v9 : plante adoptée listée dans la modale', rem.groups >= 1 && !rem.empty, rem);

  // Migration v5 : l'heuristique texte libre ne doit pas écraser un champ legacy fiable
  const mig = await page.evaluate(() => {
    const flag = localStorage.getItem('herbier_v5_migrated_r3');
    localStorage.removeItem('herbier_v5_migrated_r3');
    plants.push({
      id: 'qa-migrate-plant', nomFr: 'QA migration', nomLat: 'Qualitas migratio',
      famille: 'Testacées', type: "Plante d'intérieur",
      soleil: 'Mi-ombre', eau: 'Par la soucoupe uniquement',
      besoins: 'Plein soleil, arrosage modéré.' // heuristique contradictoire : ne doit PAS gagner
    });
    migrateToV5();
    const m = plants.find(x => x.id === 'qa-migrate-plant');
    const out = { exposition: m.exposition, arrosage: m.arrosage };
    plants = plants.filter(x => x.id !== 'qa-migrate-plant');
    saveData();
    if (flag) localStorage.setItem('herbier_v5_migrated_r3', flag);
    return out;
  });
  check('migration v5 : les champs legacy fiables (soleil/eau) ne sont pas écrasés',
    mig.exposition === 'Mi-ombre' && mig.arrosage === 'Par la soucoupe uniquement', mig);

  // Re-rendu du catalogue : l'ancien IntersectionObserver doit être déconnecté (pas de fuite)
  const io = await page.evaluate(() => {
    let created = 0, disconnected = 0;
    const Orig = window.IntersectionObserver;
    window.IntersectionObserver = class extends Orig {
      constructor(...a) { super(...a); created++; }
      disconnect() { disconnected++; super.disconnect(); }
    };
    renderCatalog();
    renderCatalog();
    window.IntersectionObserver = Orig;
    return { created, disconnected };
  });
  check('lazy images : observateur précédent déconnecté au re-rendu',
    io.created === 2 && io.disconnected >= 1, io);

  // Course de photos : la réponse lente d'une carte précédente ne doit pas
  // s'afficher sur la carte actuellement visible (#flashPhoto recréé à même id)
  const race = await page.evaluate(async () => {
    const orig = window.fetchWiki;
    const pending = [];
    window.fetchWiki = () => new Promise(res => pending.push(res));
    toggleFlashMode();                       // carte A → 1re requête photo en attente
    const resolveA = pending.shift();
    nextFlashcard();                         // carte B affichée, requête A toujours en vol
    resolveA('http://localhost:8890/img-A.png'); // la réponse de A arrive APRÈS
    await new Promise(r => setTimeout(r, 50));
    const el = document.getElementById('flashPhoto');
    const bg = el ? el.style.backgroundImage : '';
    window.fetchWiki = orig;
    toggleFlashMode();                       // referme le panneau
    return { bg };
  });
  check('flashcards : réponse photo obsolète ignorée (anti-course)', !race.bg.includes('img-A'), race);

  // Photos personnelles : clé pas encore migrée vers IndexedDB → repli localStorage
  const ph = await page.evaluate(async () => {
    const pid = plants[0].id;
    const tiny = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    localStorage.setItem('hdv_photos', JSON.stringify({ [pid]: [tiny] }));
    openJournal(pid);                        // v8 injecte le bloc photos (async)
    await new Promise(r => setTimeout(r, 300));
    const imgs = document.querySelectorAll('#v8-photos-' + pid + ' img').length;
    window.closeModal();
    localStorage.removeItem('hdv_photos');
    return { imgs };
  });
  check('photos : clé non migrée vers IndexedDB → repli localStorage', ph.imgs === 1, ph);

  // Empilement : le toast doit rester visible au-dessus de toutes les couches modales
  const z = await page.evaluate(() => ({
    toast:   parseInt(getComputedStyle(document.getElementById('toast')).zIndex, 10),
    confirm: parseInt(getComputedStyle(document.getElementById('confirmModal')).zIndex, 10),
    v7modal: parseInt(getComputedStyle(document.getElementById('v7-modal')).zIndex, 10),
    zoom:    parseInt(getComputedStyle(document.getElementById('imgZoom')).zIndex, 10),
  }));
  check('toast au-dessus de toutes les couches modales',
    z.toast > z.confirm && z.toast > z.v7modal && z.toast > z.zoom, z);

  // Toxicité : prédicat unique — tous les écrans donnent la même réponse pour une même fiche
  const tox = await page.evaluate(() => {
    const modern = { id: 'qa-t1', nomFr: 'B', toxPets: 'toxic' };      // sans toxicite legacy
    const legacy = { id: 'qa-t2', nomFr: 'C', toxicite: 'Toxique chats' };
    const safe   = { id: 'qa-t3', nomFr: 'A', toxicite: 'Non toxique' };
    const sel = document.getElementById('v7-sort'); const prev = sel.value;
    sel.value = 'tox';                       // le tri v8 lit la valeur du select directement
    const sorted = window.__advSort([safe, modern]);
    sel.value = prev;
    return {
      modern: plantIsToxic(modern), legacy: plantIsToxic(legacy),
      anim: plantIsToxic({ tox_anim: 1 }), safe: plantIsToxic(safe),
      firstSorted: sorted[0].id
    };
  });
  check('toxicité : prédicat unique cohérent (toxPets/tox_anim/toxicite)',
    tox.modern && tox.legacy && tox.anim && !tox.safe, tox);
  check('toxicité : le tri v8 reconnaît une fiche toxPets sans toxicite legacy',
    tox.firstSorted === 'qa-t1', tox);

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
  const swShell = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check(
    'SW shell precache le bundle de production',
    /SHELL\s*=\s*\[[\s\S]*dist\/app\.min\.js/.test(swShell),
    'dist/app.min.js absent du precache',
  );
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
  await page.waitForTimeout(550);
  const drawerPlacement = await page.evaluate(() => {
    const drawer = document.getElementById('plantDrawer');
    const rect = drawer.getBoundingClientRect();
    return {
      position: getComputedStyle(drawer).position,
      top: Math.round(rect.top),
      rightGap: Math.round(innerWidth - rect.right),
      heightGap: Math.round(innerHeight - rect.height),
    };
  });
  check(
    'tiroir d\'ajout : ancré au viewport',
    drawerPlacement.position === 'fixed' && Math.abs(drawerPlacement.top) <= 1 &&
      Math.abs(drawerPlacement.rightGap) <= 1 && Math.abs(drawerPlacement.heightGap) <= 1,
    drawerPlacement,
  );
  const addSubmit = await page.evaluate(() => {
    const before = plants.length;
    const stamp = 'QA mobile ' + Date.now();
    document.getElementById('formNomFr').value = stamp;
    document.getElementById('formNomLat').value = 'Qualitas mobilis';
    document.getElementById('formFamille').value = 'Testaceae';
    document.getElementById('formType').value = 'Autre';
    document.getElementById('plantForm').requestSubmit();
    const created = plants.find(p => p.nomFr === stamp);
    return {
      before,
      after: plants.length,
      created: !!created,
      catalogRendered: document.querySelectorAll('.scrolly-section').length > 0,
      drawerClosed: !document.getElementById('plantDrawer').classList.contains('open'),
    };
  });
  check('formulaire Ajouter : soumission minimale cree une fiche', addSubmit.after === addSubmit.before + 1 && addSubmit.created, addSubmit);
  check('formulaire Ajouter : tiroir ferme et catalogue rendu', addSubmit.drawerClosed && addSubmit.catalogRendered, addSubmit);

  const drawerDock = await page.evaluate(() => {
    document.querySelector('.fusion-mobile-dock [data-fusion-action="add"]').click();
    const dock = document.querySelector('.fusion-mobile-dock');
    const r = dock.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const st = getComputedStyle(dock);
    const inactive = st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none' || !dock.contains(top);
    return {
      drawer: document.getElementById('plantDrawer').classList.contains('open'),
      dockDisplay: st.display,
      dockPointerEvents: st.pointerEvents,
      topTag: top && (top.id || top.className || top.tagName),
      inactive,
    };
  });
  check('drawer mobile : dock masque ou non interactif', drawerDock.drawer && drawerDock.inactive, drawerDock);
  await page.keyboard.press('Escape');

  // Fiche express : ouverture depuis une carte du catalogue, fermeture à l'Échap
  const sheetOpen = await page.evaluate(() => {
    document.querySelector('#plantCatalog .fusion-quick-btn').click();
    return document.getElementById('fusionQuickSheet').classList.contains('open');
  });
  check('fiche express s\'ouvre depuis le catalogue', sheetOpen);
  await page.waitForTimeout(420);
  const sheetPlacement = await page.evaluate(() => {
    const sheet = document.getElementById('fusionQuickSheet');
    const rect = sheet.getBoundingClientRect();
    return {
      position: getComputedStyle(sheet).position,
      bottomGap: Math.round(innerHeight - rect.bottom),
      leftGap: Math.round(rect.left),
      rightGap: Math.round(innerWidth - rect.right),
    };
  });
  check(
    'fiche express : ancrée en bas du viewport',
    sheetPlacement.position === 'fixed' && Math.abs(sheetPlacement.bottomGap) <= 1 &&
      Math.abs(sheetPlacement.leftGap - sheetPlacement.rightGap) <= 1,
    sheetPlacement,
  );
  await page.keyboard.press('Escape');
  const sheetClosed = await page.evaluate(() => !document.getElementById('fusionQuickSheet').classList.contains('open'));
  check('fiche express se ferme à l\'Échap', sheetClosed);

  // Dock "Accueil" referme la barre de comparaison si elle était ouverte
  const sheetDock = await page.evaluate(() => {
    document.querySelector('#plantCatalog .fusion-quick-btn').click();
    const dock = document.querySelector('.fusion-mobile-dock');
    const r = dock.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const st = getComputedStyle(dock);
    const inactive = st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none' || !dock.contains(top);
    return {
      sheet: document.getElementById('fusionQuickSheet').classList.contains('open'),
      backdrop: document.getElementById('fusionSheetBackdrop').classList.contains('open'),
      dockDisplay: st.display,
      dockPointerEvents: st.pointerEvents,
      topTag: top && (top.id || top.className || top.tagName),
      inactive,
    };
  });
  check('fiche express : dock masque ou non interactif', sheetDock.sheet && sheetDock.backdrop && sheetDock.inactive, sheetDock);
  await page.keyboard.press('Escape');

  const overlayMatrix = await page.evaluate(() => {
    function activeOverlays() {
      return [
        ['flash', document.body.classList.contains('flash-on')],
        ['quiz', document.body.classList.contains('quiz-on')],
        ['calendar', document.body.classList.contains('cal-on')],
        ['dashboard', document.body.classList.contains('dash-on')],
        ['care', document.body.classList.contains('care-on')],
        ['drawer', document.getElementById('plantDrawer').classList.contains('open')],
        ['sheet', document.getElementById('fusionQuickSheet').classList.contains('open')],
        ['modal', document.getElementById('v7-modal').classList.contains('open')],
      ].filter(x => x[1]).map(x => x[0]);
    }
    function dockInactive() {
      const dock = document.querySelector('.fusion-mobile-dock');
      const r = dock.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const st = getComputedStyle(dock);
      return st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none' || !dock.contains(top);
    }
    function snap(label) {
      const active = activeOverlays();
      return { label, active, single: active.length === 1, dockInactive: dockInactive() };
    }
    const out = [];
    document.querySelector('.fusion-mobile-dock [data-fusion-action="quiz"]').click();
    out.push(snap('quiz'));
    document.querySelector('.fusion-mobile-dock [data-fusion-action="care"]').click();
    out.push(snap('care-after-quiz'));
    document.querySelector('.fusion-mobile-dock [data-fusion-action="add"]').click();
    out.push(snap('drawer-after-care'));
    window.closeDrawer();
    document.querySelector('#plantCatalog .fusion-quick-btn').click();
    out.push(snap('sheet'));
    window.fusionCloseSheet();
    return out;
  });
  check('mobile overlays : un seul overlay actif a la fois', overlayMatrix.every(x => x.single), overlayMatrix);
  check('mobile overlays : dock masque ou non interactif pendant overlay/drawer/sheet', overlayMatrix.every(x => x.dockInactive), overlayMatrix);

  const sheetEdit = await page.evaluate(() => {
    document.querySelector('#plantCatalog .fusion-quick-btn').click();
    const editBtn = [...document.querySelectorAll('#fusionQuickSheet .fusion-sheet-actions .btn-luxe')]
      .find(b => /Modifier/.test(b.textContent));
    editBtn.click();
    return {
      drawerOpen: document.getElementById('plantDrawer').classList.contains('open'),
      sheetOpen: document.getElementById('fusionQuickSheet').classList.contains('open'),
    };
  });
  await page.waitForFunction(() => {
    const drawer = document.getElementById('plantDrawer');
    if (!drawer || !drawer.classList.contains('open')) return false;
    const r = drawer.getBoundingClientRect();
    // Attendre la fin de la translation : « visible de 1 px » ne suffit pas
    // pour vérifier le premier plan pendant l'animation d'entrée.
    return r.left < window.innerWidth && r.right > 0 &&
      Math.abs(window.innerWidth - r.right) <= 1;
  }, null, { timeout: 3000 });
  const sheetEditLayer = await page.evaluate(() => {
    const sheet = document.getElementById('fusionQuickSheet');
    const drawer = document.getElementById('plantDrawer');
    const r = drawer.getBoundingClientRect();
    const top = document.elementFromPoint(Math.max(1, r.left + 24), Math.max(1, r.top + 80));
    return {
      drawerOpen: drawer.classList.contains('open'),
      sheetOpen: sheet.classList.contains('open'),
      drawerForeground: !!(top && top.closest && top.closest('#plantDrawer')),
      topTag: top && (top.id || top.className || top.tagName),
    };
  });
  check('fiche express > Modifier : tiroir ouvert depuis la sheet', sheetEdit.drawerOpen && !sheetEdit.sheetOpen, sheetEdit);
  check('fiche express > Modifier : tiroir au premier plan', sheetEditLayer.drawerOpen && !sheetEditLayer.sheetOpen && sheetEditLayer.drawerForeground, sheetEditLayer);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { if (window.fusionCloseSheet) window.fusionCloseSheet(); });

  const sheetJournal = await page.evaluate(() => {
    document.querySelector('#plantCatalog .fusion-quick-btn').click();
    const journalBtn = [...document.querySelectorAll('#fusionQuickSheet .fusion-sheet-actions .btn-luxe')]
      .find(b => /Journal/.test(b.textContent));
    journalBtn.click();
    const sheet = document.getElementById('fusionQuickSheet');
    const modal = document.getElementById('v7-modal');
    const r = modal.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, Math.max(1, r.top + 80));
    return {
      modalOpen: modal.classList.contains('open'),
      sheetOpen: sheet.classList.contains('open'),
      modalForeground: !!(top && top.closest && top.closest('#v7-modal')),
      topTag: top && (top.id || top.className || top.tagName),
    };
  });
  check('fiche express > Journal : modale au premier plan', sheetJournal.modalOpen && !sheetJournal.sheetOpen && sheetJournal.modalForeground, sheetJournal);
  await page.keyboard.press('Escape');

  // Retour au test du raccourci Accueil.
  const homeClearsCompare = await page.evaluate(() => {
    document.querySelector('.cmp-btn').click();
    document.querySelector('.fusion-mobile-dock [data-fusion-action="home"]').click();
    return document.getElementById('v7-cmpbar').classList.contains('show');
  });
  check('dock "Accueil" referme la barre de comparaison', !homeClearsCompare);

  await ctx.close();
}

// ── 7. Résilience photo : retomber sur les candidats suivants avant le générique ──
{
  console.log('▶ résilience des photos de fiche');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await newPage(ctx);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const id = plants[0].id;
    const sec = document.getElementById('section-' + id);
    const img = sec.querySelector('.scrolly-img');
    sectionImgs[id] = { imgs: ['https://bad1.example/x.jpg', 'https://bad2.example/y.jpg', 'https://good.example/z.jpg'], idx: 0 };
    applySectionImg(id);
    const step0 = img.src;
    handleSectionImgError(img);
    const step1 = { src: img.src, idx: sectionImgs[id].idx };
    handleSectionImgError(img);
    const step2 = { src: img.src, idx: sectionImgs[id].idx };
    handleSectionImgError(img); // plus de candidat → doit retomber sur la photo générique
    const step3 = { src: img.src, idx: sectionImgs[id].idx };
    return { step0, step1, step2, step3 };
  });
  check('1er échec → tente le 2e candidat', r.step1.src === 'https://bad2.example/y.jpg' && r.step1.idx === 1, r);
  check('2e échec → tente le 3e candidat', r.step2.src === 'https://good.example/z.jpg' && r.step2.idx === 2, r);
  check('candidats épuisés → repli sur la photo générique locale', /\/img\/hero-botanique-960\.webp(?:\?|$)/.test(r.step3.src), r);

  await ctx.close();
}

// ── 8. Intégrité des données : les quatre régressions P0 de l'audit ─────────
// Chacun de ces contrôles reproduit un défaut réel constaté sur le dépôt.
// Ils franchissent volontairement les frontières entre couches (v7↔v9↔v11),
// là où les suites par phase ne regardaient pas.
{
  console.log('▶ intégrité des données');

  // 8.1 — Le suivi par exemplaire (v9) ne doit jamais écraser le journal (v7/v11).
  //       Régression : v9 écrivait via `window.journal`, qui n'existe pas — il
  //       repartait donc d'un objet vide et le persistait par-dessus hdv_journal.
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await newPage(ctx);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForSelector('.scrolly-section');

    const ids = await page.evaluate(() => {
      const a = plants[0].id, b = plants[1].id;
      plants[0].inGarden = true; plants[1].inGarden = true; saveData();
      return { a, b };
    });

    // Deux plantes documentées via l'interface réelle (journal v11).
    for (const [id, zone, jours, note] of [[ids.a, 'Salon', '7', 'Première pousse'], [ids.b, 'Balcon', '3', 'Floraison']]) {
      await page.evaluate(i => window.openJournal(i), id);
      await page.waitForSelector('#p9EventText');
      await page.fill('#p9EventText', note);
      await page.click('.p9-event-composer button[type="submit"]');
      await page.waitForTimeout(250);
      await page.fill('#p9JournalZone', zone);
      await page.fill('#p9JournalWater', jours);
      await page.click('button[onclick^="window.p9SaveJournalRoutine"]');
      await page.waitForTimeout(200);
      await page.evaluate(() => window.closeModal());
    }

    // L'écran Rappels doit refléter la routine saisie (et non des champs vides).
    await page.evaluate(() => window.openReminders());
    await page.waitForSelector('[data-sp-act="water"]');
    const affiche = await page.evaluate(() => ({
      every: document.querySelector('.sp-num').value,
      zone: document.querySelector('.sp-zone').value,
    }));
    check('rappels : la routine saisie dans le journal est reprise',
      affiche.every === '7' && affiche.zone === 'Salon', affiche);

    // L'action d'arrosage ne doit toucher que waterEvery/lastWater.
    await page.click('[data-sp-act="water"]');
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.scrolly-section');

    const apres = await page.evaluate(k => JSON.parse(localStorage.getItem('hdv_journal') || '{}'), null);
    check('journal : aucune plante perdue après un arrosage',
      Object.keys(apres).length === 2, Object.keys(apres));
    check('journal : notes conservées après un arrosage',
      (apres[ids.a] || {}).entries?.length === 1 && (apres[ids.b] || {}).entries?.length === 1,
      { a: (apres[ids.a] || {}).entries, b: (apres[ids.b] || {}).entries });
    check('journal : emplacement et rythme conservés après un arrosage',
      apres[ids.a]?.zone === 'Salon' && apres[ids.a]?.waterEvery === 7
      && apres[ids.b]?.zone === 'Balcon' && apres[ids.b]?.waterEvery === 3,
      { a: apres[ids.a], b: apres[ids.b] });

    await ctx.close();
  }

  // 8.2 — « Sans danger » ne doit jamais inclure une fiche dont la toxicité
  //       n'est pas documentée (321/335 portaient la valeur par défaut).
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await newPage(ctx);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForSelector('.scrolly-section');
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
      if (typeof plantToxicity !== 'function') return { absent: true };
      const etats = { toxic: 0, safe: 0, unknown: 0 };
      plants.forEach(p => { etats[plantToxicity(p)]++; });
      const sel = document.getElementById('v7-f-tox');
      sel.value = 'safe';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const passeEnSafe = plants.filter(p => window.__advFilter(p));
      return {
        etats,
        nonDocumenteesEnSafe: passeEnSafe.filter(p => p.toxPets !== 'safe').map(p => p.nomFr).slice(0, 5),
        optionInconnue: !!sel.querySelector('option[value="unknown"]'),
        predicatToxiqueInchange: plantIsToxic({ toxPets: 'toxic' })
          && plantIsToxic({ toxicite: 'Toxique chats' })
          && plantIsToxic({ tox_anim: 1 })
          && !plantIsToxic({ toxicite: 'Non toxique' }),
      };
    });
    check('toxicité : trois états distincts (toxic/safe/unknown)',
      !r.absent && r.etats.toxic > 0 && r.etats.unknown > 0, r.absent ? 'plantToxicity() absente' : r.etats);
    check('toxicité : aucune fiche non documentée dans « sans danger »',
      !r.absent && r.nonDocumenteesEnSafe.length === 0, r.nonDocumenteesEnSafe);
    check('toxicité : filtre « non renseignée » disponible', !r.absent && r.optionInconnue);
    check('toxicité : le prédicat « toxique » reste inchangé', !r.absent && r.predicatToxiqueInchange);

    await ctx.close();
  }

  // 8.3 — Un carnet neuf démarre sur un jardin vide (39 fiches étaient
  //       pré-adoptées dans plants.json, ce qui rendait l'état vide inatteignable).
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await newPage(ctx);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForSelector('.scrolly-section');
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => {
      setMode('garden');
      return {
        adoptees: plants.filter(p => p.inGarden === true).length,
        persistees: JSON.parse(localStorage.getItem('herbier_plants_data_v4') || '[]')
          .filter(p => p.inGarden === true).length,
        etatVide: !!document.querySelector('.catalog-state-garden'),
      };
    });
    check('premier lancement : aucun spécimen pré-adopté', r.adoptees === 0 && r.persistees === 0, r);
    check('premier lancement : l’état « jardin vide » est atteignable', r.etatVide, r);

    await ctx.close();
  }

  // 8.4 — L'import d'une sauvegarde demande confirmation et n'écrase jamais
  //       les clés qui ne sont pas des données de carnet (clé API notamment).
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await newPage(ctx);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForSelector('.scrolly-section');
    await page.waitForTimeout(600);

    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'hdv-e2e-'));
    const fichier = path.join(dossier, 'sauvegarde.json');
    fs.writeFileSync(fichier, JSON.stringify({
      _app: 'HerbierDeVie', _v: 8,
      data: {
        herbier_plants_data_v4: JSON.stringify([{ id: 'imp1', nomFr: 'Importée' }]),
        herbier_gemini_key: 'CLE-DU-FICHIER',
      },
    }));

    await page.evaluate(() => localStorage.setItem('herbier_gemini_key', 'CLE-LOCALE'));

    // a) refus de la confirmation : rien ne doit être écrit
    page.once('dialog', d => d.dismiss());
    await page.setInputFiles('#v7-file', fichier);
    await page.waitForTimeout(900);
    const refus = await page.evaluate(() => ({
      fiches: JSON.parse(localStorage.getItem('herbier_plants_data_v4') || '[]').length,
      cle: localStorage.getItem('herbier_gemini_key'),
    }));
    check('import : le refus de confirmation n’écrit rien', refus.fiches > 1, refus);

    // b) acceptation : les fiches sont remplacées, la clé API ne l'est pas
    page.once('dialog', d => d.accept());
    await page.setInputFiles('#v7-file', fichier);
    await page.waitForTimeout(1600);
    const apres = await page.evaluate(() => ({
      fiches: JSON.parse(localStorage.getItem('herbier_plants_data_v4') || '[]').length,
      cle: localStorage.getItem('herbier_gemini_key'),
      secours: !!localStorage.getItem('hdv_prev_plants'),
    }));
    check('import : les fiches sont bien restaurées après confirmation', apres.fiches === 1, apres);
    check('import : la clé API locale n’est pas écrasée par le fichier',
      apres.cle === 'CLE-LOCALE', apres);
    check('import : une copie de secours des fiches précédentes est conservée', apres.secours, apres);

    fs.rmSync(dossier, { recursive: true, force: true });
    await ctx.close();
  }
}

// ── Bilan ───────────────────────────────────────────────────────────────────
const realErrors = pageErrors.filter(e => !/ERR_FAILED|Failed to fetch|NetworkError|Load failed/i.test(e));
check('aucune erreur JavaScript', realErrors.length === 0, realErrors.slice(0, 5));

await browser.close();
server.close();
console.log(`\n${passed} réussis, ${failures} échecs`);
process.exit(failures ? 1 : 0);
