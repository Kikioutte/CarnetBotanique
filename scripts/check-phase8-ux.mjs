#!/usr/bin/env node
/**
 * Phase 8 — contrat UX produit.
 * Vérifie les états chargement/erreur/vide, les sorties sûres du formulaire,
 * la persistance transactionnelle et les actions destructives réversibles.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'phase8');
const PORT = 8898;
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
  '.avif':'image/avif','.css':'text/css','.html':'text/html; charset=utf-8',
  '.js':'text/javascript','.json':'application/json','.png':'image/png',
  '.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

let passed = 0, failed = 0;
const results = [];
function check(label, condition, details) {
  const ok = !!condition;
  results.push({ label, ok, details });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && details ? ` — ${JSON.stringify(details)}` : ''}`);
  if (ok) passed++; else failed++;
}
async function appPage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, route => route.abort());
  page.phase8Errors = errors;
  return page;
}
async function ready(page) {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil:'load' });
  await page.waitForSelector('.scrolly-section', { timeout:15000 });
}

await new Promise(resolve => server.listen(PORT, resolve));
const browser = await chromium.launch(launchOpts);

try {
  console.log('▶ Phase 8 — parcours principal et états vides');
  const context = await browser.newContext({ viewport:{ width:390, height:844 } });
  const page = await appPage(context);
  await ready(page);
  await page.screenshot({ path:path.join(OUT, 'initial-mobile.png') });

  const initial = await page.evaluate(() => ({
    staleToast: document.getElementById('toast').textContent.trim(),
    sections: document.querySelectorAll('.scrolly-section').length,
    busy: document.getElementById('plantCatalog').getAttribute('aria-busy')
  }));
  check('aucun faux message de succès au premier chargement', initial.staleToast === '', initial);
  check('catalogue prêt et non occupé', initial.sections > 0 && initial.busy === 'false', initial);

  await page.fill('#searchInput', 'zzzz-aucune-plante-phase8');
  await page.waitForSelector('.catalog-state-search');
  const noResult = await page.evaluate(() => ({
    title: document.querySelector('.catalog-state-search h3')?.textContent,
    reset: !!document.querySelector('.catalog-state-search button'),
    busy: document.getElementById('plantCatalog').getAttribute('aria-busy')
  }));
  check('recherche sans résultat : explication et sortie explicites',
    noResult.title === 'Aucune espèce trouvée' && noResult.reset && noResult.busy === 'false', noResult);
  await page.screenshot({ path:path.join(OUT, 'search-empty-mobile.png') });
  await page.click('.catalog-state-search button');
  await page.waitForSelector('.scrolly-section');
  check('effacer les filtres restaure le catalogue',
    await page.inputValue('#searchInput') === '' && await page.locator('.scrolly-section').count() > 0);

  const garden = await page.evaluate(() => {
    plants.forEach(plant => { plant.inGarden = false; });
    saveData(); setMode('garden');
    return { mode:appMode, empty:!!document.querySelector('.catalog-state-garden') };
  });
  check('jardin vide : état contextualisé', garden.mode === 'garden' && garden.empty, garden);
  check('jardin vide : deux prochaines actions proposées',
    await page.locator('.catalog-state-garden button').count() === 2);
  await page.click('.catalog-state-garden button');
  await page.waitForSelector('.scrolly-section');
  check('le CTA du jardin vide ramène à l’herbier', await page.evaluate(() => appMode) === 'learn');

  console.log('▶ Phase 8 — formulaire sans perte de données');
  await page.evaluate(() => openDrawer('add'));
  await page.fill('#formNomFr', 'Brouillon Phase 8');
  await page.evaluate(() => closeDrawer());
  const guard = await page.evaluate(() => ({
    visible: !document.getElementById('drawerDiscardGuard').hidden,
    drawer: document.getElementById('plantDrawer').classList.contains('open'),
    focus: document.activeElement.id
  }));
  check('fermer une fiche modifiée demande confirmation',
    guard.visible && guard.drawer && guard.focus === 'drawerKeepEditingBtn', guard);
  await page.screenshot({ path:path.join(OUT, 'unsaved-guard-mobile.png') });
  await page.keyboard.press('Escape');
  check('Échap revient à l’édition sans perdre le brouillon', await page.evaluate(() => ({
    guard:document.getElementById('drawerDiscardGuard').hidden,
    drawer:document.getElementById('plantDrawer').classList.contains('open'),
    value:document.getElementById('formNomFr').value
  })).then(x => x.guard && x.drawer && x.value === 'Brouillon Phase 8'));

  await page.evaluate(() => switchFormTab(3));
  await page.click('#plantSubmitBtn');
  const invalid = await page.evaluate(() => ({
    tab: document.getElementById('formTab0').getAttribute('aria-selected'),
    feedback: document.getElementById('formFeedback').textContent,
    visible: !document.getElementById('formFeedback').hidden
  }));
  check('validation : retour automatique vers les champs obligatoires',
    invalid.tab === 'true' && invalid.visible && /obligatoires/.test(invalid.feedback), invalid);

  await page.fill('#formNomFr', 'Sauge Phase 8');
  await page.fill('#formNomLat', 'Salvia phaseocto');
  await page.fill('#formFamille', 'Lamiacées');
  await page.selectOption('#formType', 'Herbe aromatique');
  const beforeCreate = await page.evaluate(() => plants.length);
  await page.dblclick('#plantSubmitBtn');
  await page.waitForFunction(() => !document.getElementById('plantDrawer').classList.contains('open'));
  const created = await page.evaluate(() => ({
    count:plants.length,
    matches:plants.filter(p => p.nomFr === 'Sauge Phase 8').length,
    toast:document.getElementById('toast').textContent
  }));
  check('double clic : une seule fiche créée', created.count === beforeCreate + 1 && created.matches === 1, created);
  check('création confirmée avec un message précis', /Nouvelle fiche créée/.test(created.toast), created.toast);

  console.log('▶ Phase 8 — échec de stockage et suppression réversible');
  await page.evaluate(() => openDrawer('add'));
  await page.fill('#formNomFr', 'Ne doit pas être sauvée');
  await page.fill('#formNomLat', 'Erroris memoria');
  await page.fill('#formFamille', 'Testacées');
  await page.selectOption('#formType', 'Autre');
  const beforeFailure = await page.evaluate(() => plants.length);
  await page.evaluate(() => {
    window.__phase8SetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('Quota dépassé','QuotaExceededError'); };
  });
  await page.click('#plantSubmitBtn');
  const storageFailure = await page.evaluate(() => ({
    count:plants.length,
    drawer:document.getElementById('plantDrawer').classList.contains('open'),
    feedback:document.getElementById('formFeedback').textContent,
    enabled:!document.getElementById('plantSubmitBtn').disabled
  }));
  check('échec stockage : aucune mutation et formulaire conservé',
    storageFailure.count === beforeFailure && storageFailure.drawer && storageFailure.enabled && /pas été enregistrée/.test(storageFailure.feedback), storageFailure);
  await page.evaluate(() => { Storage.prototype.setItem = window.__phase8SetItem; discardDrawerChanges(); });

  const deleteProof = await page.evaluate(() => {
    var plant = plants[0];
    window.__phase8DeleteId = plant.id;
    window.__phase8DeleteName = plant.nomFr;
    triggerDelete(plant.id);
    return {
      name:plant.nomFr,
      title:document.getElementById('confirmModalTitle').textContent,
      copy:document.getElementById('confirmModalText').textContent,
      before:plants.length
    };
  });
  check('suppression : le dialogue nomme la fiche et annonce l’annulation',
    deleteProof.title.includes(deleteProof.name) && /annuler/.test(deleteProof.copy), deleteProof);
  await page.click('#confirmDeleteBtn');
  const afterDelete = await page.evaluate(() => plants.length);
  await page.click('#toast button');
  const afterUndo = await page.evaluate(() => plants.length);
  check('suppression annulable restaure la fiche', afterDelete === deleteProof.before - 1 && afterUndo === deleteProof.before,
    { before:deleteProof.before, afterDelete, afterUndo });

  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  check('passage hors-ligne expliqué', /hors ligne/.test((await page.textContent('#toast')).toLowerCase()));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  check('retour en ligne confirmé', /Connexion rétablie/.test(await page.textContent('#toast')));
  check('aucune erreur JavaScript sur les parcours principaux', page.phase8Errors.length === 0, page.phase8Errors);
  await context.close();

  console.log('▶ Phase 8 — premier lancement sans réseau');
  const errorContext = await browser.newContext({ viewport:{ width:1280, height:900 } });
  const errorPage = await appPage(errorContext);
  await errorPage.route(`http://localhost:${PORT}/plants.json`, route => route.abort());
  await errorPage.goto(`http://localhost:${PORT}/`, { waitUntil:'load' });
  await errorPage.waitForSelector('.catalog-state-error');
  const errorState = await errorPage.evaluate(() => ({
    title:document.querySelector('.catalog-state-error h3')?.textContent,
    retry:document.querySelector('.catalog-state-error button')?.textContent,
    busy:document.getElementById('plantCatalog').getAttribute('aria-busy')
  }));
  check('échec initial : erreur lisible et action Réessayer',
    /Impossible/.test(errorState.title) && /Réessayer/.test(errorState.retry) && errorState.busy === 'false', errorState);
  await errorPage.screenshot({ path:path.join(OUT, 'load-error-desktop.png') });
  await errorPage.unroute(`http://localhost:${PORT}/plants.json`);
  await errorPage.click('.catalog-state-error button');
  await errorPage.waitForSelector('.scrolly-section', { timeout:15000 });
  check('Réessayer récupère réellement le catalogue', await errorPage.locator('.scrolly-section').count() > 0);
  check('aucune erreur JavaScript sur la récupération', errorPage.phase8Errors.length === 0, errorPage.phase8Errors);
  await errorContext.close();
} finally {
  await browser.close();
  server.close();
}

const report = { phase:'8', passed, failed, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, 'summary.md'), `# Phase 8 — UX produit\n\n- ${passed} contrôles réussis\n- ${failed} échec(s)\n`);
console.log(`\nPhase 8 : ${passed} réussis, ${failed} échec(s).`);
process.exit(failed ? 1 : 0);
