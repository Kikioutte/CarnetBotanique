#!/usr/bin/env node
/**
 * Phase 10 — contrat de sortie production.
 * Vérifie les derniers écarts visibles : contenu sous le dock mobile,
 * notifications qui masquent des actions, peinture initiale et thème sombre.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'test-results','phase10');
const PORT=8900;
const staticOnly=process.argv.includes('--static');
fs.mkdirSync(OUT,{recursive:true});

let passed=0,failed=0;const results=[];
function check(label,condition,details){const ok=!!condition;results.push({label,ok,details});console.log(`  ${ok?'✓':'✗'} ${label}${!ok&&details?` — ${JSON.stringify(details)}`:''}`);ok?passed++:failed++;}
function read(file){return fs.readFileSync(path.join(ROOT,file),'utf8');}

console.log('▶ Phase 10 — contrat structurel');
const index=read('index.html'),css=read('css/styles.css'),workflow=read('.github/workflows/phase0.yml');
check('image LCP locale, prioritaire et décodée sans report',/fetchpriority="high"/.test(index)&&/decoding="sync"/.test(index)&&/hero-botanique-640\.avif/.test(index));
check('catalogue hors écran peint à la demande',/\.scrolly-section\s*\{[\s\S]*?content-visibility:auto/.test(css)&&/contain-intrinsic-size:auto 760px/.test(css));
check('toast ordinateur ancré hors de l’axe central',/@media\(min-width:761px\)[\s\S]*?#toast\s*\{[\s\S]*?right:24px/.test(css));
check('zone de défilement mobile réserve header et dock',/scroll-padding-top:132px/.test(css)&&/scroll-padding-bottom:calc\(96px/.test(css)&&/body\{padding-bottom:calc\(108px/.test(css));
check('briefing sombre conserve des textes clairs explicites',/\.p9-briefing h2,\.p9-metric b\{color:#FFFDFB\}/.test(css)&&/\.p9-briefing \.btn-luxe\{[^}]*color:#FFFDFB/.test(css));
check('Phase 10 bloquante et artefacts publiés',/npm run test:phase10/.test(workflow)&&/test-results\/phase10\//.test(workflow));

if(staticOnly){finish('10-static');}

let chromium;try{({chromium}=await import('playwright'));}catch{({chromium}=await import('playwright-core'));}
const launchOpts={args:['--no-sandbox']};
const local='/opt/pw-browsers/chromium',edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE&&fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE))launchOpts.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
else if(fs.existsSync(local))launchOpts.executablePath=local;else if(fs.existsSync(edge))launchOpts.executablePath=edge;
const MIME={'.avif':'image/avif','.css':'text/css','.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(req.url.split('?')[0].split('#')[0]);const file=path.join(ROOT,pathname==='/'?'index.html':pathname);if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(PORT,resolve));
const browser=await chromium.launch(launchOpts);

try{
  console.log('▶ Phase 10 — mobile clair, sombre et dock');
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('hdv_profile_v1',JSON.stringify({name:'Alex',level:'regular',space:'inside',goals:['care','growth'],completedAt:new Date().toISOString()}));window.__p10LongTasks=[];try{new PerformanceObserver(list=>list.getEntries().forEach(entry=>window.__p10LongTasks.push(entry.duration))).observe({type:'longtask',buffered:true});}catch(e){}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/,route=>route.abort());
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'load'});await page.waitForSelector('.scrolly-section',{timeout:15000});await page.waitForSelector('#p9BriefingActions button');
  const mobile=await page.evaluate(()=>{const dock=document.querySelector('.fusion-mobile-dock'),style=getComputedStyle(document.body),hero=document.querySelector('.hero-media img'),section=document.querySelector('.scrolly-section');return {dockHeight:dock.getBoundingClientRect().height,paddingBottom:parseFloat(style.paddingBottom),hero:hero.currentSrc,contentVisibility:getComputedStyle(section).contentVisibility,nodes:document.querySelectorAll('*').length,maxLongTask:Math.max(0,...window.__p10LongTasks)};});
  check('dock compensé par une zone de contenu suffisante',mobile.paddingBottom>=mobile.dockHeight+24,mobile);
  check('petite image AVIF réellement choisie sur mobile',/hero-botanique-640\.avif/.test(mobile.hero),mobile.hero);
  check('peinture différée active dans le navigateur',mobile.contentVisibility==='auto',mobile.contentVisibility);
  check('DOM initial sous le budget de sortie',mobile.nodes<=2300,mobile.nodes);
  check('aucune longue tâche supérieure à 200 ms',mobile.maxLongTask<=200,mobile.maxLongTask);
  await page.evaluate(()=>{const b=document.getElementById('p9Briefing'),h=document.getElementById('mainHeader'),s=document.querySelector('.search-wrapper');b.scrollIntoView({block:'start'});const safeTop=Math.max(h.getBoundingClientRect().bottom,s?s.getBoundingClientRect().bottom:0);window.scrollBy(0,b.getBoundingClientRect().top-safeTop-12);});
  const reveal=await page.evaluate(()=>{const briefing=document.getElementById('p9Briefing').getBoundingClientRect(),actions=[...document.querySelectorAll('#p9BriefingActions button')],dock=document.querySelector('.fusion-mobile-dock').getBoundingClientRect(),header=document.getElementById('mainHeader').getBoundingClientRect(),search=document.querySelector('.search-wrapper')?.getBoundingClientRect();return {actions:actions.length,briefingTop:briefing.top,safeTop:Math.max(header.bottom,search?search.bottom:0),lastBottom:actions.at(-1)?.getBoundingClientRect().bottom,dockTop:dock.top};});
  check('briefing entièrement visible entre header et dock',reveal.actions>=2&&reveal.briefingTop>=reveal.safeTop+8&&reveal.lastBottom<=reveal.dockTop-8,reveal);
  await page.screenshot({path:path.join(OUT,'01-mobile-light.png')});
  await page.evaluate(()=>window.toggleTheme());await page.waitForTimeout(700);
  check('thème sombre appliqué sans rechargement',await page.evaluate(()=>document.body.classList.contains('theme-dark')));
  const darkText=await page.evaluate(()=>({title:getComputedStyle(document.getElementById('p9BriefingTitle')).color,button:getComputedStyle(document.querySelector('#p9BriefingActions button')).color}));
  check('briefing sombre garde un contraste clair',darkText.title==='rgb(255, 253, 251)'&&darkText.button==='rgb(255, 253, 251)',darkText);
  await page.addScriptTag({path:path.join(ROOT,'node_modules','axe-core','axe.min.js')});
  // content-visibility:auto retire les sections hors écran de l'arbre analysé :
  // sans cette neutralisation, axe ne voyait jamais le bas de page et laissait
  // passer un pied de page illisible en thème sombre.
  await page.addStyleTag({content:'*{content-visibility:visible !important}'});
  const runDarkAxe=()=>page.evaluate(async()=>{const report=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return report.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length,exemples:item.nodes.slice(0,3).map(n=>n.target.join(' '))}));});
  const darkAxe=await runDarkAxe();
  check('aucune violation axe-core en mode sombre (mobile)',darkAxe.length===0,darkAxe);
  await page.screenshot({path:path.join(OUT,'02-mobile-dark.png')});
  // Le contrôle sombre ne s'exécutait qu'en 390 px, où le pied de page est hors
  // écran : plusieurs défauts de contraste n'apparaissaient qu'en ordinateur.
  await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(500);
  const darkAxeDesktop=await runDarkAxe();
  check('aucune violation axe-core en mode sombre (ordinateur)',darkAxeDesktop.length===0,darkAxeDesktop);
  await page.screenshot({path:path.join(OUT,'02b-desktop-dark.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);

  console.log('▶ Phase 10 — toast et journal ordinateur');
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>window.toggleTheme());
  const plantId=await page.evaluate(()=>plants[0].id);await page.evaluate(id=>window.openJournal(id),plantId);await page.waitForSelector('.p9-journal');
  await page.evaluate(()=>window.showToast('Journal enregistré avec succès'));await page.waitForTimeout(80);
  const geometry=await page.evaluate(()=>{const toast=document.getElementById('toast').getBoundingClientRect(),actions=[...document.querySelectorAll('.p9-journal button')].map(el=>el.getBoundingClientRect());const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;return {toast:{left:toast.left,right:toast.right,top:toast.top,bottom:toast.bottom},overlaps:actions.filter(rect=>intersects(toast,rect)).length};});
  check('notification visible sans masquer les actions du journal',geometry.overlaps===0,geometry);
  await page.screenshot({path:path.join(OUT,'03-journal-toast-desktop.png')});
  await page.evaluate(()=>{document.getElementById('toast').classList.remove('show');window.closeModal();window.p9OpenBackupCenter();});await page.waitForSelector('.p9-backup');await page.waitForTimeout(600);await page.screenshot({path:path.join(OUT,'04-backup-desktop.png')});
  check('aucune erreur JavaScript pendant la passe de sortie',errors.length===0,errors);
  await context.close();
}finally{await browser.close();server.close();}

finish('10');
function finish(phase){const report={phase,passed,failed,results};fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(OUT,'summary.md'),`# Phase 10 — sortie production\n\n- ${passed} contrôles réussis\n- ${failed} échec(s)\n`);console.log(`\nPhase 10 : ${passed} réussis, ${failed} échec(s).`);process.exit(failed?1:0);}
