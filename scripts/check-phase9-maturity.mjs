#!/usr/bin/env node
/**
 * Phase 9 — maturité produit.
 * Vérifie le briefing quotidien, l'onboarding progressif, le journal typé,
 * la persistance transactionnelle et le centre de sauvegarde.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'phase9');
const PORT = 8899;
const staticOnly = process.argv.includes('--static');
fs.mkdirSync(OUT, { recursive:true });

let passed=0,failed=0;
const results=[];
function check(label,condition,details){
  const ok=!!condition;results.push({label,ok,details});
  console.log(`  ${ok?'✓':'✗'} ${label}${!ok&&details?` — ${JSON.stringify(details)}`:''}`);
  if(ok)passed++;else failed++;
}
function read(file){return fs.readFileSync(path.join(ROOT,file),'utf8');}

console.log('▶ Phase 9 — contrat structurel');
const index=read('index.html'),css=read('css/styles.css'),source=read('js/extensions-v11.js'),build=read('scripts/build-assets.mjs');
check('briefing Aujourd’hui présent dans le HTML initial',/id="p9Briefing"/.test(index)&&/id="p9BriefingMetrics"/.test(index));
check('profil et sauvegarde accessibles depuis le menu responsive',/data-nav-action="profile"/.test(index)&&/data-nav-action="backup"/.test(index));
check('extension Phase 9 incluse dans le build','js/extensions-v11.js'.split('/').every(Boolean)&&build.includes("'js/extensions-v11.js'"));
check('onboarding local, explicite et réouvrable',/hdv_profile_v1/.test(source)&&/Aucun compte, aucun transfert/.test(source)&&/p9OpenOnboarding/.test(source));
check('journal compatible avec la source v7',/__hdvJournalUpdate/.test(read('js/extensions-v7.js'))&&/__hdvJournalUpdate/.test(source));
check('centre de sauvegarde réutilise export et import validés',/window\.v7Export/.test(source)&&/window\.v7Import|v7-file/.test(source));
check('styles responsive et mode sombre présents',/@media\(max-width:760px\)/.test(css)&&/body\.theme-dark \.p9-onboarding/.test(css));

if(staticOnly){
  const report={phase:'9-static',passed,failed,results};
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(OUT,'summary.md'),`# Phase 9 — contrat structurel\n\n- ${passed} contrôles réussis\n- ${failed} échec(s)\n`);
  console.log(`\nPhase 9 statique : ${passed} réussis, ${failed} échec(s).`);
  process.exit(failed?1:0);
}

let chromium;
try{({chromium}=await import('playwright'));}catch{({chromium}=await import('playwright-core'));}
const localChromium='/opt/pw-browsers/chromium';
const windowsEdge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const launchOpts={args:['--no-sandbox']};
if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE&&fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE))launchOpts.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
else if(fs.existsSync(localChromium))launchOpts.executablePath=localChromium;
else if(fs.existsSync(windowsEdge))launchOpts.executablePath=windowsEdge;

const MIME={'.avif':'image/avif','.css':'text/css','.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file=path.join(ROOT,pathname==='/'?'index.html':pathname);
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(PORT,resolve));
const browser=await chromium.launch(launchOpts);

try{
  console.log('▶ Phase 9 — onboarding et briefing mobile');
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{localStorage.clear();});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/,route=>route.abort());
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'load'});
  await page.waitForSelector('.scrolly-section',{timeout:15000});
  await page.waitForSelector('#p9BriefingActions button');
  const initial=await page.evaluate(()=>({modal:document.getElementById('v7-modal').classList.contains('open'),profile:localStorage.getItem('hdv_profile_v1'),cta:document.getElementById('p9BriefingActions').textContent}));
  check('premier lancement non bloquant',!initial.modal&&initial.profile===null,initial);
  check('onboarding proposé depuis le briefing',/Personnaliser/.test(initial.cta),initial.cta);

  await page.evaluate(()=>window.p9OpenOnboarding());
  await page.fill('#p9ProfileName','Alex');
  await page.click('.p9-onboarding-actions .btn-luxe-accent');
  await page.click('[data-p9-choice="level"][data-value="regular"]');
  await page.click('[data-p9-choice="space"][data-value="inside"]');
  const selections=await page.evaluate(()=>({level:document.querySelector('[data-p9-choice="level"].selected')?.dataset.value,space:document.querySelector('[data-p9-choice="space"].selected')?.dataset.value}));
  check('choix exclusifs annoncés et visibles',selections.level==='regular'&&selections.space==='inside',selections);
  await page.click('.p9-onboarding-actions .btn-luxe-accent');
  await page.locator('.p9-onboarding').screenshot({path:path.join(OUT,'onboarding-mobile.png')});
  await page.click('.p9-onboarding-actions .btn-luxe-accent');
  const savedProfile=await page.evaluate(()=>JSON.parse(localStorage.getItem('hdv_profile_v1')));
  check('profil sauvegardé avec les choix du parcours',savedProfile.name==='Alex'&&savedProfile.level==='regular'&&savedProfile.space==='inside'&&!!savedProfile.completedAt,savedProfile);
  check('briefing personnalisé immédiatement',/Bonjour Alex/.test(await page.textContent('#p9BriefingTitle')));
  await page.waitForTimeout(4700);
  await page.locator('#p9Briefing').scrollIntoViewIfNeeded();
  await page.locator('#p9Briefing').screenshot({path:path.join(OUT,'briefing-mobile.png')});

  console.log('▶ Phase 9 — priorités et journal de vie');
  await page.setViewportSize({width:1280,height:900});
  const plantId=await page.evaluate(()=>{
    plants.forEach(item=>{item.inGarden=false;});const p=plants[0];p.inGarden=true;saveData();
    window.__hdvJournalUpdate(p.id,item=>{item.waterEvery=7;item.lastWater='';item.zone='Salon';item.entries=[{t:'1 janvier 2026',txt:'Note historique conservée'}];});
    renderCatalog();window.p9RenderBriefing();return p.id;
  });
  const metrics=await page.evaluate(()=>Array.from(document.querySelectorAll('.p9-metric b')).map(el=>el.textContent));
  check('briefing recalculé depuis les vraies données de soin',metrics[0]==='1'&&metrics[1]==='1/1',metrics);
  await page.evaluate(id=>window.openJournal(id),plantId);
  await page.waitForSelector('.p9-journal');
  check('ancienne note v7 conservée dans la nouvelle chronologie',/Note historique conservée/.test(await page.textContent('.p9-timeline')));
  await page.selectOption('#p9EventType','bloom');
  await page.fill('#p9EventText','Première floraison observée');
  await page.click('.p9-event-composer button[type="submit"]');
  const journalState=await page.evaluate(id=>window.__hdvJournalSnapshot()[id],plantId);
  check('événement typé persisté sans perdre le format existant',journalState.entries.length===2&&journalState.entries.some(e=>e.type==='bloom'&&/Première floraison/.test(e.txt)),journalState.entries);
  await page.locator('.p9-journal').screenshot({path:path.join(OUT,'journal-desktop.png')});

  const beforeFailure=journalState.entries.length;
  await page.evaluate(()=>{window.__p9SetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError');};});
  await page.selectOption('#p9EventType','care');
  await page.fill('#p9EventText','Ne doit pas persister');
  await page.click('.p9-event-composer button[type="submit"]');
  const afterFailure=await page.evaluate(id=>window.__hdvJournalSnapshot()[id].entries.length,plantId);
  check('échec de stockage : chronologie restaurée',afterFailure===beforeFailure,{beforeFailure,afterFailure});
  await page.evaluate(()=>{Storage.prototype.setItem=window.__p9SetItem;});

  console.log('▶ Phase 9 — sauvegarde et données');
  await page.evaluate(()=>window.p9OpenBackupCenter());
  await page.waitForSelector('.p9-backup');
  const backup=await page.evaluate(()=>({title:document.getElementById('p9BackupTitle').textContent,actions:document.querySelectorAll('.p9-backup-actions button').length,copy:document.querySelector('.p9-backup-head p').textContent}));
  check('centre de sauvegarde explique portée et confidentialité',backup.actions===2&&/Aucun serveur/.test(backup.copy)&&/appartient/.test(backup.title),backup);
  await page.evaluate(()=>{localStorage.setItem('hdv_last_backup',new Date().toISOString());window.p9OpenBackupCenter();});
  check('date de dernière sauvegarde rendue visible',/Dernière sauvegarde créée/.test(await page.textContent('.p9-backup-card')));
  await page.locator('.p9-backup').screenshot({path:path.join(OUT,'backup-desktop.png')});
  check('aucune erreur JavaScript dans les parcours Phase 9',errors.length===0,errors);
  await context.close();
}finally{
  await browser.close();server.close();
}

const report={phase:'9',passed,failed,results};
fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(OUT,'summary.md'),`# Phase 9 — maturité produit\n\n- ${passed} contrôles réussis\n- ${failed} échec(s)\n`);
console.log(`\nPhase 9 : ${passed} réussis, ${failed} échec(s).`);
process.exit(failed?1:0);
