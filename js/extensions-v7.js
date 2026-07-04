(function(){
'use strict';
function L(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}}
function S(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function $(id){return document.getElementById(id);}
function ready(fn){if(document.readyState!=='loading'){setTimeout(fn,0);}else{document.addEventListener('DOMContentLoaded',fn);}}
function esc2(s){s=(s==null?'':String(s));return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(m){try{if(typeof showToast==='function'){showToast(m);return;}}catch(e){}console.log(m);}
function getPlant(id){try{for(var i=0;i<plants.length;i++){if(plants[i].id===id)return plants[i];}}catch(e){}return null;}
function uniq(a){var s={},o=[];a.forEach(function(x){if(x&&!s[x]){s[x]=1;o.push(x);}});o.sort(function(m,n){return String(m).localeCompare(n);});return o;}
function opt(v){return '<option value="'+esc2(v)+'">'+esc2(v)+'</option>';}

/* ---------- Mode sombre ---------- */
var theme=L('hdv_theme','light');
function applyTheme(){document.body.classList.toggle('theme-dark',theme==='dark');var b=$('v7-theme');if(b)b.innerHTML=(theme==='dark'?'<i class="fa-solid fa-sun"></i>':'<i class="fa-solid fa-moon"></i>');}
window.toggleTheme=function(){theme=(theme==='dark'?'light':'dark');S('hdv_theme',theme);applyTheme();};

/* ---------- i18n (libelles d'interface) ---------- */
var lang=L('hdv_lang','fr');
window.hdvLang=lang; /* exposé pour les couches v8/v9 (leurs IIFE n'ont pas accès à cette closure) */
var navEN={flashBtn:'Flashcards',quizBtn:'Quiz',calBtn:'Bloom',careBtn:'Care',printBtn:'Print',dashBtn:'Stats',modeLearn:'Learning',modeGarden:'My Garden'};
var navFR={};
function captureNavFR(){Object.keys(navEN).forEach(function(id){var b=$(id);if(b)navFR[id]=b.textContent.trim();});}
function setBtn(id,label){var b=$(id);if(!b)return;var ic=b.querySelector('i');var icon=ic?ic.outerHTML:'';b.innerHTML=icon+' '+label;}
function applyLang(){
  Object.keys(navEN).forEach(function(id){if(navFR[id]!=null)setBtn(id,lang==='en'?navEN[id]:navFR[id]);});
  var si=$('searchInput');if(si)si.placeholder=(lang==='en'?'Search a species...':'Rechercher une espece...');
  var nodes=document.querySelectorAll('[data-fr]');
  for(var i=0;i<nodes.length;i++){var el=nodes[i];var v=(lang==='en')?el.getAttribute('data-en'):el.getAttribute('data-fr');if(v!=null)el.textContent=v;}
  var lb=$('v7-lang');if(lb)lb.textContent=(lang==='en'?'FR':'EN');
}
window.toggleLang=function(){
  lang=(lang==='en'?'fr':'en');window.hdvLang=lang;S('hdv_lang',lang);
  applyLang();if($('v7-f-zone'))rebuildZoneFilter();
  // Le héro et la barre d'outils portent des libellés générés côté JS : on les régénère.
  try{if(typeof updateModeUI==='function')updateModeUI();}catch(e){}
  try{var bar=$('v7-toolbar');if(bar){bar.parentNode.removeChild(bar);buildToolbar();}if(typeof renderCatalog==='function')renderCatalog();}catch(e){}
};

/* ---------- Journal / zones / arrosage ---------- */
var journal=L('hdv_journal',{});
function saveJournal(){S('hdv_journal',journal);}
function J(pid){if(!journal[pid])journal[pid]={entries:[],zone:'',waterEvery:0,lastWater:''};return journal[pid];}
function knownZones(){var s={},o=[];Object.keys(journal).forEach(function(k){var z=journal[k]&&journal[k].zone;if(z&&!s[z]){s[z]=1;o.push(z);}});return o.sort();}

/* ---------- Filtres + tri ---------- */
var advFilters={fam:'',type:'',tox:'',zone:'',inv:''},advSort='default';
window.__advFilter=function(p){
  if(advFilters.fam&&p.famille!==advFilters.fam)return false;
  if(advFilters.type&&p.type!==advFilters.type)return false;
  var _isToxic=(p.toxPets==='toxic')||(p.tox_anim===true)||((p.toxicite)&&p.toxicite!=='Non toxique');
  if(advFilters.tox==='toxic'&&!_isToxic)return false;
  if(advFilters.tox==='safe'&&_isToxic)return false;
  if(advFilters.inv==='invasive'&&!p.invasive)return false;
  if(advFilters.inv==='noninvasive'&&p.invasive)return false;
  if(advFilters.zone){var z=(journal[p.id]&&journal[p.id].zone)||'';if(z!==advFilters.zone)return false;}
  return true;
};
window.__advSort=function(list){
  var a=list.slice();
  if(advSort==='nom')a.sort(function(x,y){return x.nomFr.localeCompare(y.nomFr);});
  else if(advSort==='nom-desc')a.sort(function(x,y){return y.nomFr.localeCompare(x.nomFr);});
  else if(advSort==='fam')a.sort(function(x,y){return x.famille.localeCompare(y.famille)||x.nomFr.localeCompare(y.nomFr);});
  return a;
};
window.__updateResultCount=function(n){var el=$('v7-count');if(el)el.textContent=n+(lang==='en'?' result(s)':' resultat(s)');};
window.__enrichChips=function(p){
  var c=[];
  if(p.feuillage)c.push('<span class="v7-chip"><i class="fa-solid fa-leaf"></i> '+esc2(p.feuillage)+'</span>');
  if(p.hauteur)c.push('<span class="v7-chip"><i class="fa-solid fa-ruler-vertical"></i> '+esc2(p.hauteur)+'</span>');
  if(p.rusticite)c.push('<span class="v7-chip"><i class="fa-solid fa-snowflake"></i> '+esc2(p.rusticite)+'</span>');
  var _chip_sol=p.exposition||p.soleil;
  if(_chip_sol)c.push('<span class="v7-chip"><i class="fa-solid fa-sun"></i> '+esc2(_chip_sol)+'</span>');
  var _chip_eau=p.arrosage||p.eau;
  if(_chip_eau)c.push('<span class="v7-chip"><i class="fa-solid fa-droplet"></i> '+esc2(_chip_eau)+'</span>');
  if(p.temperature)c.push('<span class="v7-chip"><i class="fa-solid fa-thermometer-half"></i> '+esc2(p.temperature)+'</span>');
  if(p.principes)c.push('<span class="v7-chip"><i class="fa-solid fa-flask"></i> '+esc2(p.principes)+'</span>');
  var _chip_tox=(p.toxPets==='toxic')||p.tox_anim;
  if(_chip_tox)c.push('<span class="v7-chip" style="color:#d32f2f;border-color:#d32f2f">⚠️ Toxique animaux</span>');
  if(p.invasive)c.push('<span class="v7-chip" style="color:#d32f2f;border-color:#d32f2f">🌾 Invasive</span>');
  var z=(journal[p.id]&&journal[p.id].zone);
  if(z)c.push('<span class="v7-chip"><i class="fa-solid fa-location-dot"></i> '+esc2(z)+'</span>');
  if(!c.length)c.push('<span class="v7-chip v7-chip-empty" onclick="openEditDrawer(\''+p.id+'\')"><i class="fa-solid fa-circle-plus"></i> Completer la fiche</span>');
  return '<div class="v7-chips">'+c.join('')+'</div>';
};
function readFilters(){var f=function(id){var e=$(id);return e?e.value:'';};advFilters.fam=f('v7-f-fam');advFilters.type=f('v7-f-type');advFilters.tox=f('v7-f-tox');advFilters.inv=f('v7-f-inv');advFilters.zone=f('v7-f-zone');advSort=f('v7-sort')||'default';}
function rebuildZoneFilter(){var sel=$('v7-f-zone');if(!sel)return;var cur=sel.value;var zs=knownZones();sel.innerHTML='<option value="">'+(lang==='en'?'All zones':'Toutes zones')+'</option>'+zs.map(opt).join('');sel.value=cur;}
function buildToolbar(){
  var cat=$('plantCatalog');if(!cat||$('v7-toolbar'))return;
  var fams=uniq(plants.map(function(p){return p.famille;}));
  var types=uniq(plants.map(function(p){return p.type||''}));
  var bar=document.createElement('div');bar.id='v7-toolbar';bar.className='v7-toolbar';
  var fr=(lang!=='en');
  bar.innerHTML=
   '<div class="v7-tb-group">'+
   '<select id="v7-f-fam"><option value="">'+(fr?'Toutes familles':'All families')+'</option>'+fams.map(opt).join('')+'</select>'+
   '<select id="v7-f-type"><option value="">'+(fr?'Tous types':'All types')+'</option>'+types.filter(Boolean).map(opt).join('')+'</select>'+
   '<select id="v7-f-tox"><option value="">'+(fr?'Animaux : toutes':'Animals: all')+'</option><option value="safe">'+(fr?'Sans danger':'Non-toxic')+'</option><option value="toxic">'+(fr?'Toxiques':'Toxic')+'</option></select>'+
   '<select id="v7-f-inv"><option value="">'+(fr?'Invasive : toutes':'Invasive: all')+'</option><option value="invasive">'+(fr?'Invasives':'Invasive')+'</option><option value="noninvasive">'+(fr?'Non invasives':'Non-invasive')+'</option></select>'+
   '<select id="v7-f-zone"><option value="">'+(fr?'Toutes zones':'All zones')+'</option></select>'+
   '<select id="v7-sort"><option value="default">'+(fr?'Tri par defaut':'Default order')+'</option><option value="nom">'+(fr?'Nom (A-Z)':'Name (A-Z)')+'</option><option value="nom-desc">'+(fr?'Nom (Z-A)':'Name (Z-A)')+'</option><option value="fam">'+(fr?'Famille':'Family')+'</option></select>'+
   '<button id="v7-reset" class="v7-tb-btn"><i class="fa-solid fa-rotate-left"></i> '+(fr?'Reinitialiser':'Reset')+'</button>'+
   '</div>'+
   '<div class="v7-tb-group v7-tb-right">'+
   '<span id="v7-count" class="v7-count"></span>'+
   '<button class="v7-tb-btn" onclick="window.v7Export()"><i class="fa-solid fa-download"></i> Export</button>'+
   '<button class="v7-tb-btn" onclick="window.v7Import()"><i class="fa-solid fa-upload"></i> Import</button>'+
   '<input type="file" id="v7-file" accept="application/json" style="display:none">'+
   '</div>';
  cat.parentNode.insertBefore(bar,cat);
  ['v7-f-fam','v7-f-type','v7-f-tox','v7-f-inv','v7-f-zone','v7-sort'].forEach(function(id){var e=$(id);if(e)e.addEventListener('change',function(){readFilters();renderCatalog();});});
  $('v7-reset').addEventListener('click',function(){advFilters={fam:'',type:'',tox:'',inv:'',zone:''};advSort='default';['v7-f-fam','v7-f-type','v7-f-tox','v7-f-inv','v7-f-zone'].forEach(function(id){var e=$(id);if(e)e.value='';});var s=$('v7-sort');if(s)s.value='default';renderCatalog();});
  $('v7-file').addEventListener('change',importHandler);
  bar.dataset.n=String(plants.length);
  rebuildZoneFilter();
}
/* Les données (plants.json) arrivent à window.onload, APRÈS la construction de la barre
   d'outils à DOMContentLoaded : sans ce rafraîchissement, les filtres Familles/Types
   restaient vides. Appelé à chaque rendu, il ne reconstruit que si le nombre d'espèces a changé. */
function refreshToolbarOptions(){
  var bar=$('v7-toolbar');if(!bar)return;
  if(bar.dataset.n===String(plants.length))return;
  bar.dataset.n=String(plants.length);
  var fr=(lang!=='en');
  var sf=$('v7-f-fam');
  if(sf){var cur=sf.value;sf.innerHTML='<option value="">'+(fr?'Toutes familles':'All families')+'</option>'+uniq(plants.map(function(p){return p.famille;})).map(opt).join('');sf.value=cur;}
  var st=$('v7-f-type');
  if(st){var cur2=st.value;st.innerHTML='<option value="">'+(fr?'Tous types':'All types')+'</option>'+uniq(plants.map(function(p){return p.type||'';})).filter(Boolean).map(opt).join('');st.value=cur2;}
}

/* ---------- Modale generique ---------- */
window.openModalHTML=function(html){var b=$('v7-modal-body');if(b)b.innerHTML=html;var m=$('v7-modal');if(m)m.classList.add('open');document.body.classList.add('no-scroll');try{lenis.stop();}catch(e){}applyLang();};
window.closeModal=function(){
  var m=$('v7-modal');if(m)m.classList.remove('open');document.body.classList.remove('no-scroll');try{lenis.start();}catch(e){}
  // Si la modale affichait une fiche détail, on retire son hash de l'URL
  if(/#plante=/.test(location.hash||'')){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){location.hash='';}}
};
(function(){var m=$('v7-modal');if(m)m.addEventListener('click',function(e){if(e.target===m)window.closeModal();});})();

/* ---------- Comparaison ---------- */
var cmp=[];
window.cmpToggle=function(id,ev){if(ev&&ev.stopPropagation)ev.stopPropagation();var i=cmp.indexOf(id);if(i>=0){cmp.splice(i,1);}else{if(cmp.length>=3){toast(lang==='en'?'Compare up to 3 species':'3 especes maximum');return;}cmp.push(id);}updateCmpBar();reflectCmpButtons();};
function reflectCmpButtons(){var bs=document.querySelectorAll('.cmp-btn');for(var i=0;i<bs.length;i++){var id=bs[i].getAttribute('data-cmp');bs[i].classList.toggle('active',cmp.indexOf(id)>=0);}}
function updateCmpBar(){var bar=$('v7-cmpbar');if(!bar)return;if(!cmp.length){bar.classList.remove('show');return;}bar.classList.add('show');var c=$('v7-cmpcount');if(c)c.textContent=cmp.length;}
window.clearCompare=function(){cmp=[];updateCmpBar();reflectCmpButtons();};
window.openCompare=function(){
  if(cmp.length<2){toast(lang==='en'?'Select at least 2 species':'Selectionnez au moins 2 especes');return;}
  var ps=cmp.map(getPlant).filter(Boolean);var fr=(lang!=='en');
  var rows=[
    ['Nom latin','Latin name',function(p){return p.nomLat;}],
    ['Famille','Family',function(p){return p.famille;}],
    ['Type','Type',function(p){return p.type;}],
    ['Origine','Origin',function(p){return p.region;}],
    ['Feuillage','Foliage',function(p){return p.feuillage;}],
    ['Port','Habit',function(p){return p.port;}],
    ['Hauteur','Height',function(p){return p.hauteur;}],
    ['Rusticite','Hardiness',function(p){return p.rusticite;}],
    ['Floraison','Blooming',function(p){return p.fl_texte;}],
    ['Toxicite animaux','Animal toxicity',function(p){return p.toxDetail||p.tox_detail;}],
    ['Exposition','Sun exposure',function(p){return p.exposition||p.soleil;}],
    ['Arrosage','Watering',function(p){return p.arrosage||p.eau;}],
    ['Substrat','Substrate',function(p){var s=p.substrat;return Array.isArray(s)?s.map(function(x){return (x.p||'?')+'% '+x.m;}).join(', '):(s||'');}],
    ['Conservation','Care',function(p){return p.besoins;}],
    ['Sensibilites','Pests',function(p){return p.ennemis;}],
    ['Tenue vase','Vase life',function(p){return p.tenueVase||p.pro_tenue;}],
    ['Temperature ideale','Ideal temp.',function(p){return p.tempIdeale||p.pro_temp;}],
    ['Conservation (pro)','Conservation',function(p){return p.conservation||p.pro_cons;}]
  ];
  var h='<h2 class="v7-h">'+(fr?'Comparatif':'Comparison')+'</h2><div class="v7-cmp-wrap"><table class="v7-cmp-table"><thead><tr><th></th>'+ps.map(function(p){return '<th>'+esc2(p.nomFr)+'</th>';}).join('')+'</tr></thead><tbody>';
  rows.forEach(function(r){h+='<tr><td class="v7-cmp-lbl">'+(fr?r[0]:r[1])+'</td>'+ps.map(function(p){var v=r[2](p);return '<td>'+esc2(v?v:'—')+'</td>';}).join('')+'</tr>';});
  h+='</tbody></table></div>';
  openModalHTML(h);
};

/* ---------- Journal de croissance ---------- */
window.openJournal=function(id){
  var p=getPlant(id);if(!p)return;var j=J(id);var fr=(lang!=='en');var zs=knownZones();
  var h='<h2 class="v7-h">'+esc2(p.nomFr)+'</h2><div class="v7-sub"><i>'+esc2(p.nomLat)+'</i> · '+esc2(p.famille)+'</div>';
  h+='<div class="v7-field"><label>'+(fr?'Emplacement / Zone':'Location / Zone')+'</label><input id="v7-zone" list="v7-zonelist" value="'+esc2(j.zone)+'" placeholder="'+(fr?'Salon, Balcon, Jardin...':'Living room, Balcony...')+'"><datalist id="v7-zonelist">'+zs.map(function(z){return '<option value="'+esc2(z)+'"></option>';}).join('')+'</datalist></div>';
  h+='<div class="v7-field"><label>'+(fr?'Arrosage tous les (jours)':'Water every (days)')+'</label><input id="v7-water" type="number" min="0" value="'+(j.waterEvery||'')+'"></div>';
  h+='<div class="v7-field"><label>'+(fr?'Nouvelle note':'New note')+'</label><textarea id="v7-note" rows="2" placeholder="'+(fr?'Nouvelle pousse, floraison, rempotage...':'New growth, bloom, repotting...')+'"></textarea></div>';
  h+='<div class="v7-actions-row"><button class="btn-luxe" onclick="window.addJournalNote(\''+id+'\')"><i class="fa-solid fa-plus"></i> '+(fr?'Ajouter la note':'Add note')+'</button><button class="btn-luxe" onclick="window.saveJournalMeta(\''+id+'\')"><i class="fa-solid fa-floppy-disk"></i> '+(fr?'Enregistrer':'Save')+'</button><button class="btn-luxe" onclick="window.printOne(\''+id+'\')"><i class="fa-solid fa-print"></i> '+(fr?'Imprimer':'Print')+'</button><button class="btn-luxe" onclick="window.sharePlant(\''+id+'\')"><i class="fa-solid fa-share-nodes"></i> '+(fr?'Partager':'Share')+'</button></div>';
  h+='<div class="v7-timeline">'+(j.entries.length?j.entries.slice().reverse().map(function(e){return '<div class="v7-tl"><span class="v7-tl-d">'+esc2(e.t)+'</span><span class="v7-tl-x">'+esc2(e.txt)+'</span></div>';}).join(''):'<div class="v7-empty">'+(fr?'Aucune note pour le moment.':'No notes yet.')+'</div>')+'</div>';
  openModalHTML(h);
};
window.addJournalNote=function(id){var t=$('v7-note');if(!t||!t.value.trim())return;var j=J(id);j.entries.push({t:new Date().toLocaleDateString(lang==='en'?'en-GB':'fr-FR'),txt:t.value.trim()});saveJournal();openJournal(id);toast(lang==='en'?'Note added':'Note ajoutee');};
window.saveJournalMeta=function(id){var j=J(id);var z=$('v7-zone'),w=$('v7-water');if(z)j.zone=z.value.trim();if(w)j.waterEvery=parseInt(w.value,10)||0;saveJournal();if(typeof renderCatalog==='function')renderCatalog();rebuildZoneFilter();toast(lang==='en'?'Saved':'Enregistre');};

/* ---------- Rappels d'arrosage + notifications ---------- */
function waterDue(id){var j=journal[id];if(!j||!j.waterEvery)return false;if(!j.lastWater)return true;var last=new Date(j.lastWater).getTime();return (Date.now()-last)>=j.waterEvery*86400000;}
window.setWater=function(id,v){var j=J(id);j.waterEvery=parseInt(v,10)||0;saveJournal();};
window.waterNow=function(id){var j=J(id);j.lastWater=new Date().toISOString();saveJournal();openReminders();toast(lang==='en'?'Watering logged':'Arrosage enregistre');};
window.enableNotif=function(){if(!('Notification' in window)){toast(lang==='en'?'Notifications unsupported':'Notifications non supportees');return;}Notification.requestPermission().then(function(p){if(p==='granted'){toast(lang==='en'?'Notifications enabled':'Notifications activees');checkReminders(true);}});};
window.openReminders=function(){
  var fr=(lang!=='en');var adopted=plants.filter(function(p){return p.inGarden===true;});
  var h='<h2 class="v7-h">'+(fr?'Rappels d\'arrosage':'Watering reminders')+'</h2>';
  h+='<div class="v7-actions-row"><button class="btn-luxe" onclick="window.enableNotif()"><i class="fa-solid fa-bell"></i> '+(fr?'Activer les notifications':'Enable notifications')+'</button></div>';
  if(!adopted.length){h+='<div class="v7-empty">'+(fr?'Adoptez des plantes (mode Jardin) pour suivre leur arrosage.':'Adopt plants (Garden mode) to track watering.')+'</div>';}
  else{h+='<div class="v7-rem-list">'+adopted.map(function(p){var j=J(p.id);var due=waterDue(p.id);return '<div class="v7-rem '+(due?'due':'')+'"><div class="v7-rem-n">'+esc2(p.nomFr)+'</div><div class="v7-rem-c"><label>'+(fr?'tous les':'every')+'</label><input type="number" min="0" value="'+(j.waterEvery||'')+'" onchange="window.setWater(\''+p.id+'\',this.value)"> '+(fr?'j':'d')+'<button class="btn-luxe" onclick="window.waterNow(\''+p.id+'\')"><i class="fa-solid fa-droplet"></i> '+(due?(fr?'Arroser':'Water'):'OK')+'</button></div></div>';}).join('')+'</div>';}
  openModalHTML(h);
};
function checkReminders(notify){
  var due=plants.filter(function(p){return p.inGarden===true&&waterDue(p.id);});
  var rb=$('v7-remind');
  if(due.length){
    if(rb)rb.classList.add('has-due');
    toast(due.length+(lang==='en'?' plant(s) need water':' plante(s) a arroser'));
    if(notify&&('Notification' in window)&&Notification.permission==='granted'){try{new Notification("L'Herbier de Vie",{body:due.length+(lang==='en'?' plant(s) to water: ':' plante(s) a arroser : ')+due.slice(0,3).map(function(p){return p.nomFr;}).join(', ')});}catch(e){}}
  }else if(rb){rb.classList.remove('has-due');}
}
window.checkReminders=checkReminders; /* utilisé par v9 pour rafraîchir le badge de la cloche */

/* ---------- Import / Export JSON ---------- */
window.v7Export=function(){
  var data={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&(k.indexOf('herbier')===0||k.indexOf('hdv_')===0))data[k]=localStorage.getItem(k);}
  function finish(photos){
    var payload={_app:'HerbierDeVie',_v:8,_date:new Date().toISOString(),data:data};
    if(photos&&Object.keys(photos).length)payload.photos=photos; // photos IndexedDB incluses dans la sauvegarde
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='herbier-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
    toast(lang==='en'?'Backup exported':'Sauvegarde exportee');
  }
  if(typeof window.__hdvAllPhotos==='function'){window.__hdvAllPhotos().then(finish,function(){finish(null);});}
  else finish(null);
};
window.v7Import=function(){var inp=$('v7-file');if(inp)inp.click();};
/* Validation stricte AVANT toute écriture : un fichier corrompu ou trafiqué ne doit
   jamais pouvoir laisser localStorage dans un état qui casse l'app au rechargement.
   Le jeu de données critique (herbier_plants_data_v4) doit être un tableau de fiches
   valides ; l'état précédent est conservé sous hdv_prev_plants pour rollback (cf. loadData). */
function validPlantsJSON(str){
  try{
    var arr=JSON.parse(str);
    if(!Array.isArray(arr)||!arr.length)return false;
    for(var i=0;i<arr.length;i++){
      var p=arr[i];
      if(!p||typeof p!=='object'||Array.isArray(p))return false;
      if(typeof p.nomFr!=='string'||!p.nomFr)return false;
    }
    return true;
  }catch(e){return false;}
}
function importHandler(e){
  var file=e.target.files&&e.target.files[0];if(!file)return;var rd=new FileReader();
  rd.onload=function(){
    try{
      var obj=JSON.parse(rd.result);
      var data=obj.data||obj;
      if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('structure');
      // 1re passe : tout valider, ne rien écrire. Seul le jeu critique exige un schéma ;
      // les autres clés sont des chaînes libres dont chaque lecteur a déjà son try/catch.
      var entries=[];
      Object.keys(data).forEach(function(k){
        if(k.indexOf('herbier')!==0&&k.indexOf('hdv_')!==0)return;
        var val=data[k];var str=(typeof val==='string')?val:JSON.stringify(val);
        if(k==='herbier_plants_data_v4'&&!validPlantsJSON(str))throw new Error('plantes invalides');
        entries.push([k,str]);
      });
      if(!entries.length)throw new Error('aucune donnée Herbier');
      // 2e passe : sauvegarde de l'état courant puis écriture
      try{var cur=localStorage.getItem('herbier_plants_data_v4');if(cur)localStorage.setItem('hdv_prev_plants',cur);}catch(bk){}
      entries.forEach(function(kv){localStorage.setItem(kv[0],kv[1]);});
      // Photos (IndexedDB) présentes dans la sauvegarde : restaurées avant rechargement
      var photosDone=(obj.photos&&typeof window.__hdvRestorePhotos==='function')
        ? window.__hdvRestorePhotos(obj.photos) : Promise.resolve();
      toast(lang==='en'?'Backup restored':'Sauvegarde restauree');
      photosDone.then(function(){setTimeout(function(){location.reload();},700);},
                      function(){setTimeout(function(){location.reload();},700);});
    }catch(err){toast((lang==='en'?'Invalid file — nothing imported':'Fichier invalide — rien n\'a été importé'));}
    finally{e.target.value='';}
  };
  rd.readAsText(file);
}

/* ---------- Partage / impression d'une fiche ---------- */
window.sharePlant=function(id){
  var p=getPlant(id);if(!p)return;var txt=p.nomFr+' ('+p.nomLat+') — '+p.famille+'. '+(p.description||'');
  // URL directe vers la fiche détail (#plante=…) incluse dans le partage
  var url=(typeof window.plantDetailURL==='function')?plantDetailURL(id):location.href;
  if(navigator.share){navigator.share({title:p.nomFr,text:txt,url:url}).catch(function(){});}
  else if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt+'\n'+url).then(function(){toast(lang==='en'?'Copied to clipboard':'Fiche copiee (avec lien)');},function(){window.printOne(id);});}
  else{window.printOne(id);}
};
window.printOne=function(id){
  var p=getPlant(id);var area=$('printArea');if(!area||!p)return;
  area.innerHTML='<div class="pg"><div class="pcard"><div class="pc-h"><span>'+esc2(p.nomFr)+'</span><small>'+esc2(p.type)+'</small></div><div class="pc-b"><div class="pc-row"><b>Identite</b><span><i>'+esc2(p.nomLat)+'</i> — '+esc2(p.famille)+'</span></div><div class="pc-row"><b>Origine</b><span>'+esc2(p.region)+'</span></div><div class="pc-row"><b>Conserv.</b><span>'+esc2(p.besoins)+'</span></div><div class="pc-row"><b>Sensib.</b><span>'+esc2(p.ennemis)+'</span></div><div class="pc-row"><b>Reconn.</b><span>'+esc2(p.visu1)+' ; '+esc2(p.visu2)+'</span></div></div></div></div>';
  window.print();
};

/* ---------- Quiz : series (streak) ---------- */
var qstreak=L('hdv_qstreak',{cur:0,best:0});
function updateStreakUI(){var pc=$('qsPc');if(!pc)return;var row=pc.parentNode.parentNode;if(!row)return;if(!$('v7-streak')){var d=document.createElement('div');d.className=pc.parentNode.className;d.innerHTML='<b id="v7-streak">0</b>'+(lang==='en'?'Streak':'Serie');var d2=document.createElement('div');d2.className=pc.parentNode.className;d2.innerHTML='<b id="v7-best">0</b>'+(lang==='en'?'Best':'Record');row.appendChild(d);row.appendChild(d2);}var a=$('v7-streak'),b=$('v7-best');if(a)a.textContent=qstreak.cur;if(b)b.textContent=qstreak.best;}

/* ---------- Repetition espacee (Leitner) flashcards ---------- */
var leit=L('hdv_leitner',{});
function saveLeit(){S('hdv_leitner',leit);}
var BOX_DAYS=[0,1,3,7,14,30];
window._fdeck=null;window._v7idx=0;
window.__flashDeck=function(){
  if(window._fdeck)return window._fdeck;
  var now=Date.now();var arr=plants.slice();
  arr.sort(function(a,b){var la=leit[a.id]||{box:0,due:0},lb=leit[b.id]||{box:0,due:0};var da=(la.due||0)<=now?0:1,db=(lb.due||0)<=now?0:1;if(da!==db)return da-db;return (la.box||0)-(lb.box||0);});
  window._fdeck=arr;return arr;
};
function injectGrading(){
  var sec=$('flashcardSection');if(!sec)return;var old=sec.querySelector('.v7-grade');if(old)old.parentNode.removeChild(old);
  var deck=(typeof window.__flashDeck==='function')?window.__flashDeck():plants;var len=deck.length||1;
  var idx=0;try{idx=currentFlashIndex;}catch(e){idx=window._v7idx;}if(idx>=len)idx=0;if(idx<0)idx=len-1;
  var p=deck[idx];if(!p)return;var box=(leit[p.id]&&leit[p.id].box)||0;var fr=(lang!=='en');
  var div=document.createElement('div');div.className='v7-grade';
  div.innerHTML='<div class="v7-grade-info">'+(fr?'Repetition espacee · Niveau ':'Spaced repetition · Level ')+box+'</div><div class="v7-grade-btns"><button class="v7-g-no" onclick="window.flashGrade(\''+p.id+'\',false)"><i class="fa-solid fa-rotate-left"></i> '+(fr?'A revoir':'Review')+'</button><button class="v7-g-ok" onclick="window.flashGrade(\''+p.id+'\',true)"><i class="fa-solid fa-check"></i> '+(fr?'Je savais':'I knew it')+'</button></div>';
  sec.appendChild(div);
}
window.flashGrade=function(id,ok){var l=leit[id]||{box:0,due:0};if(ok){l.box=Math.min((l.box||0)+1,5);}else{l.box=1;}var days=BOX_DAYS[l.box]||1;l.due=Date.now()+days*86400000;leit[id]=l;saveLeit();if(typeof nextFlashcard==='function')nextFlashcard();};

/* ---------- PWA ---------- */
/* Le manifest est désormais un vrai fichier (manifest.webmanifest, lié dans <head>) :
   les manifests injectés en blob ne déclenchent pas l'installation sur la plupart des
   navigateurs. L'enregistrement du service worker est fait dans js/app.js. */
function injectManifest(){}

/* ---------- Footer + boutons header ---------- */
function injectFooter(){if($('v7-footer'))return;var cat=$('plantCatalog');var f=document.createElement('footer');f.id='v7-footer';f.className='v7-footer';f.innerHTML='<div>L\'Herbier de Vie</div><div class="v7-credit" data-fr="Illustrations : Wikimedia Commons / loremflickr · Donnees enrichies par la communaute" data-en="Images: Wikimedia Commons / loremflickr · Data enriched by the community">Illustrations : Wikimedia Commons / loremflickr · Donnees enrichies par la communaute</div>';if(cat&&cat.parentNode){cat.parentNode.appendChild(f);}else{document.body.appendChild(f);}}
function mkBtn(id,html,title,handler){var b=document.createElement('button');b.className='btn-luxe';b.id=id;b.title=title;b.setAttribute('aria-label',title);b.innerHTML=html;b.addEventListener('click',handler);return b;}
function injectHeaderButtons(){var na=document.querySelector('.nav-actions');if(!na||$('v7-theme'))return;na.appendChild(mkBtn('v7-remind','<i class="fa-solid fa-bell"></i>',"Rappels d'arrosage",window.openReminders));na.appendChild(mkBtn('v7-theme','<i class="fa-solid fa-moon"></i>','Mode sombre',window.toggleTheme));na.appendChild(mkBtn('v7-langbtn','<i class="fa-solid fa-language"></i> <b id="v7-lang">EN</b>','Langue / Language',window.toggleLang));}

/* ---------- Hooks sur les fonctions existantes ---------- */
function installHooks(){
  if(typeof window.renderCatalog==='function'){var _rc=window.renderCatalog;window.renderCatalog=function(){if(!$('v7-toolbar')){try{buildToolbar();}catch(e){}}else{try{refreshToolbarOptions();}catch(e){}}_rc.apply(this,arguments);try{reflectCmpButtons();}catch(e){}};}
  if(typeof window.renderFlashcard==='function'){var _rf=window.renderFlashcard;window.renderFlashcard=function(){_rf.apply(this,arguments);try{injectGrading();}catch(e){}};}
  if(typeof window.toggleFlashMode==='function'){var _tf=window.toggleFlashMode;window.toggleFlashMode=function(){window._fdeck=null;window._v7idx=0;_tf.apply(this,arguments);};}
  if(typeof window.nextFlashcard==='function'){var _nf=window.nextFlashcard;window.nextFlashcard=function(){window._v7idx++;_nf.apply(this,arguments);};}
  if(typeof window.prevFlashcard==='function'){var _pf=window.prevFlashcard;window.prevFlashcard=function(){window._v7idx--;_pf.apply(this,arguments);};}
  if(typeof window.toggleQuizMode==='function'){var _tq=window.toggleQuizMode;window.toggleQuizMode=function(){_tq.apply(this,arguments);setTimeout(updateStreakUI,60);};}
  if(typeof window.answerQuiz==='function'){var _aq=window.answerQuiz;window.answerQuiz=function(btn){var already=document.querySelector('.quiz-opt.good,.quiz-opt.bad');_aq.call(this,btn);if(already)return;
    try{if(btn&&btn.classList.contains('good')){qstreak.cur++;if(qstreak.cur>qstreak.best)qstreak.best=qstreak.cur;}else if(btn&&btn.classList.contains('bad')){qstreak.cur=0;}S('hdv_qstreak',qstreak);updateStreakUI();}catch(e){}
    // Unification quiz ↔ répétition espacée : le résultat du quiz fait progresser
    // (ou retomber) la boîte Leitner de l'espèce — une erreur la rend immédiatement
    // prioritaire dans le paquet de flashcards.
    try{
      var qp=(typeof quizCur!=='undefined')&&quizCur;
      if(qp&&qp.id){
        var ok=!!(btn&&btn.classList.contains('good'));
        var l=leit[qp.id]||{box:0,due:0};
        if(ok){ l.box=Math.min((l.box||0)+1,5); l.due=Date.now()+(BOX_DAYS[l.box]||1)*86400000; }
        else  { l.box=1; l.due=Date.now(); }
        leit[qp.id]=l; saveLeit();
      }
    }catch(e){}
  };}
}

/* ---------- Initialisation ---------- */
function init(){
  injectManifest();
  installHooks();
  injectHeaderButtons();
  try{buildToolbar();}catch(e){}
  injectFooter();
  captureNavFR();
  applyTheme();
  applyLang();
  if($('v7-toolbar')){readFilters();if(typeof renderCatalog==='function')renderCatalog();}
  setTimeout(updateStreakUI,200);
  setTimeout(function(){try{checkReminders(false);}catch(e){}},1500);
}
ready(function(){setTimeout(init,30);});
})();
