/* v10 : navigation "app mobile" portee de SuvisPlant — hub modulaire, dock bas et fiche express */
(function(){
  'use strict';
  function $(id){return document.getElementById(id);}
  function all(sel){return Array.prototype.slice.call(document.querySelectorAll(sel));}
  function getPlants(){try{return Array.isArray(plants)?plants:[];}catch(e){return [];}}
  function getPlant(id){var list=getPlants();for(var i=0;i<list.length;i++){if(list[i]&&list[i].id===id)return list[i];}return null;}
  function setText(id,val){var el=$(id);if(el)el.textContent=val;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function store(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}}
  function monthRange(p){
    if(!p)return null;
    if(Array.isArray(p.floraisonMois)&&p.floraisonMois.length)return p.floraisonMois;
    if(Array.isArray(p.months)&&p.months.length)return p.months;
    if(typeof window.bloomRange==='function'){try{var r=window.bloomRange(p);if(r&&r.length)return r;}catch(e){}}
    return null;
  }
  function bloomsNow(p){
    var m=(new Date()).getMonth()+1;
    if(typeof window.bloomsIn==='function'){try{return window.bloomsIn(p,m);}catch(e){}}
    var r=monthRange(p);
    if(!r)return false;
    if(r.length===2&&typeof r[0]==='number'&&typeof r[1]==='number'){
      return r[0]<=r[1] ? (m>=r[0]&&m<=r[1]) : (m>=r[0]||m<=r[1]);
    }
    return r.indexOf(m)>=0;
  }
  function updateStats(){
    var list=getPlants();
    setText('fusionTotal',list.length);
    setText('fusionGarden',list.filter(function(p){return p&&p.inGarden===true;}).length);
    setText('fusionFamilies',(new Set(list.map(function(p){return p&&p.famille;}).filter(Boolean))).size);
    setText('fusionBloom',list.filter(bloomsNow).length);
    updateGardenPanel();
    updateLearningPanel();
  }
  function waterDueInfo(p){
    var journal=store('hdv_journal',{});
    var j=journal[p.id]||{};
    var every=parseInt(j.waterEvery,10)||0;
    if(!every)return {due:false,label:'Routine à définir',zone:j.zone||''};
    if(!j.lastWater)return {due:true,label:'Premier arrosage à noter',zone:j.zone||''};
    var last=new Date(j.lastWater).getTime();
    if(!last)return {due:true,label:'Date à vérifier',zone:j.zone||''};
    var days=Math.floor((Date.now()-last)/86400000);
    var left=every-days;
    return {due:left<=0,label:left<=0?"À arroser aujourd'hui":'Dans '+left+' j',zone:j.zone||''};
  }
  function updateGardenPanel(){
    var panel=$('fusionGardenPanel');if(!panel)return;
    var adopted=getPlants().filter(function(p){return p&&p.inGarden===true;});
    if(!adopted.length){panel.innerHTML='<div class="fusion-empty">Adoptez des plantes pour voir les rappels, zones et soins prioritaires.</div>';return;}
    var rows=adopted.map(function(p){var d=waterDueInfo(p);return {p:p,d:d,score:(d.due?0:1)+(bloomsNow(p)?0:.5)};})
      .sort(function(a,b){return a.score-b.score || String(a.p.nomFr).localeCompare(String(b.p.nomFr));}).slice(0,4);
    panel.innerHTML=rows.map(function(x){
      var sub=(x.d.zone?x.d.zone+' · ':'')+(bloomsNow(x.p)?'En floraison':'Suivi jardin');
      return '<button class="fusion-panel-row" type="button" onclick="window.fusionOpenSheet&&window.fusionOpenSheet(\''+x.p.id+'\')"><span><b>'+esc(x.p.nomFr)+'</b><small>'+esc(sub)+'</small></span><span class="pill">'+esc(x.d.label)+'</span></button>';
    }).join('');
  }
  function updateLearningPanel(){
    var panel=$('fusionLearningPanel');if(!panel)return;
    var leit=store('hdv_leitner',{}), quiz=store('hdv_quizhist',{}), list=getPlants();
    var now=Date.now();
    var due=list.filter(function(p){var l=leit[p.id]||{};return !l.due||l.due<=now;}).slice(0,3);
    var totalQuiz=Object.keys(quiz).reduce(function(n,k){var q=quiz[k]||{};return n+(q.ok||0)+(q.no||0);},0);
    if(!due.length&& !totalQuiz){panel.innerHTML='<div class="fusion-empty">Lancez quelques flashcards ou quiz pour créer un programme de révision.</div>';return;}
    var html=due.map(function(p){var box=(leit[p.id]&&leit[p.id].box)||0;return '<button class="fusion-panel-row" type="button" onclick="window.fusionOpenSheet&&window.fusionOpenSheet(\''+p.id+'\')"><span><b>'+esc(p.nomFr)+'</b><small>'+esc(p.famille||p.nomLat||'')+'</small></span><span class="pill">niveau '+box+'</span></button>';}).join('');
    if(totalQuiz){html+='<button class="fusion-panel-row" type="button" data-fusion-action="quiz"><span><b>Quiz adaptatif</b><small>'+totalQuiz+' réponses enregistrées</small></span><span class="pill">continuer</span></button>';}
    panel.innerHTML=html;
    bind();
  }
  function smoothTo(el,offset){
    if(!el)return;
    try{if(typeof lenis!=='undefined'&&lenis&&typeof lenis.scrollTo==='function'){lenis.scrollTo(el,{offset:offset||-90});return;}}catch(e){}
    var y=el.getBoundingClientRect().top+window.pageYOffset+(offset||-90);
    window.scrollTo({top:y,behavior:'smooth'});
  }
  function callGlobal(name){
    var fn=window[name];
    if(typeof fn!=='function')return false;
    try{fn();return true;}catch(e){return false;}
  }
  function setLenisStopped(stopped){
    try{
      if(typeof lenis==='undefined'||!lenis)return;
      if(stopped&&typeof lenis.stop==='function')lenis.stop();
      if(!stopped&&typeof lenis.start==='function')lenis.start();
    }catch(e){}
  }
  function anyLockedSurfaceOpen(){
    var drawer=$('plantDrawer'), modal=$('v7-modal'), confirm=$('confirmModal'), nav=$('mobileNav'), sheet=$('fusionQuickSheet');
    return !!(
      (sheet&&sheet.classList.contains('open'))||
      (drawer&&drawer.classList.contains('open'))||
      (modal&&modal.classList.contains('open'))||
      (confirm&&confirm.style.display==='flex')||
      (nav&&nav.classList.contains('open'))||
      document.body.classList.contains('flash-on')||
      document.body.classList.contains('quiz-on')||
      document.body.classList.contains('cal-on')||
      document.body.classList.contains('dash-on')||
      document.body.classList.contains('care-on')
    );
  }
  function restoreScrollIfIdle(){
    if(anyLockedSurfaceOpen())return;
    document.body.classList.remove('no-scroll','fusion-sheet-on');
    setLenisStopped(false);
  }
  function closePanels(){
    if(typeof window.releaseFocusTrap==='function')try{window.releaseFocusTrap();}catch(e){}
    closeQuickSheet();
    var confirm=$('confirmModal');
    if(confirm&&confirm.style.display==='flex'){
      if(!callGlobal('closeConfirmModal'))confirm.style.display='none';
    }
    callGlobal('closeImgZoom');
    callGlobal('closeDrawer');
    callGlobal('closeModal');
    callGlobal('closeMobileNav');
    document.body.classList.remove('search-open');
    ['flash-on','quiz-on','cal-on','dash-on','care-on'].forEach(function(c){document.body.classList.remove(c);});
    [
      ['flashcardSection','flashBtn'],
      ['quizSection','quizBtn'],
      ['calSection','calBtn'],
      ['dashSection','dashBtn'],
      ['careSection','careBtn']
    ].forEach(function(pair){
      var sec=$(pair[0]);if(sec)sec.style.display='none';
      var btn=$(pair[1]);if(btn)btn.classList.remove('active');
    });
    try{flashMode=false;}catch(e){}
    try{quizOn=false;}catch(e){}
    try{calOn=false;}catch(e){}
    try{dashOn=false;}catch(e){}
    try{careOn=false;}catch(e){}
    restoreScrollIfIdle();
  }
  function enhanceCatalogCards(){
    all('#plantCatalog .plant-actions').forEach(function(actions){
      if(actions.querySelector('.fusion-quick-btn'))return;
      var sec=actions.closest('.scrolly-section');
      if(!sec||!sec.id)return;
      var id=sec.id.replace('section-','');
      var btn=document.createElement('button');
      btn.type='button';
      btn.className='btn-luxe fusion-quick-btn';
      btn.innerHTML='<i class="fa-solid fa-magnifying-glass-plus"></i> Fiche express';
      btn.addEventListener('click',function(ev){ev.preventDefault();ev.stopPropagation();openQuickSheet(id);});
      actions.insertBefore(btn,actions.firstChild);
    });
  }
  function imageForPlant(id){
    try{var st=window.sectionImgs&&window.sectionImgs[id];if(st&&st.imgs&&st.imgs[st.idx])return st.imgs[st.idx];}catch(e){}
    var media=document.getElementById('media-'+id);
    var img=media?media.querySelector('.scrolly-img'):null;
    return img&&img.src?img.src:'';
  }
  function field(label,value){
    if(!value)return '';
    return '<div class="fusion-sheet-item"><b>'+esc(label)+'</b><span>'+esc(value)+'</span></div>';
  }
  function openQuickSheet(id){
    var p=getPlant(id), body=$('fusionSheetBody'), sheet=$('fusionQuickSheet'), back=$('fusionSheetBackdrop');
    if(!p||!body||!sheet||!back)return;
    var img=imageForPlant(id);
    var tox=p.toxDetail||p.tox_detail||p.toxicite||'Non renseignée';
    var bloom=(typeof window.bloomLabel==='function')?window.bloomLabel(p):(p.fl_texte||p.floraison||'');
    var care=p.besoins||p.description||'';
    var due=waterDueInfo(p);
    body.innerHTML=
      '<div class="fusion-sheet-hero">'+
        '<div class="fusion-sheet-img" style="'+(img?'background-image:url('+esc(img)+')':'')+'">'+(img?'':'<i class="fa-solid fa-leaf"></i>')+'</div>'+
        '<div class="fusion-sheet-title"><h2 id="fusionSheetTitle">'+esc(p.nomFr||'Fiche botanique')+'</h2><em>'+esc(p.nomLat||'')+'</em><br><span>'+esc(p.famille||p.type||'Herbier')+'</span></div>'+
      '</div>'+
      '<div class="fusion-sheet-grid">'+
        field('Type',p.type)+field('Origine',p.region)+field('Toxicité',tox)+field('Floraison',bloom)+field('Exposition',p.exposition||p.soleil)+field('Arrosage',p.arrosage||p.eau)+field('Rappel',due.label)+field('Tenue vase',p.tenueVase)+
      '</div>'+
      (care?'<div class="fusion-sheet-note">'+esc(care)+'</div>':'')+
      '<div class="fusion-sheet-actions">'+
        '<button class="btn-luxe '+(p.inGarden?'active':'')+'" onclick="toggleGardenStatus(\''+p.id+'\');window.fusionOpenSheet(\''+p.id+'\')"><i class="fa-solid fa-heart"></i> '+(p.inGarden?'Adoptée':'Adopter')+'</button>'+
        '<button class="btn-luxe" onclick="openEditDrawer(\''+p.id+'\')"><i class="fa-solid fa-pen-to-square"></i> Modifier</button>'+
        '<button class="btn-luxe" onclick="openJournal(\''+p.id+'\')"><i class="fa-solid fa-book"></i> Journal</button>'+
        '<button class="btn-luxe" onclick="sharePlant(\''+p.id+'\')"><i class="fa-solid fa-share-nodes"></i> Partager</button>'+
      '</div>';
    closePanels();
    back.classList.add('open');sheet.classList.add('open');
    sheet.setAttribute('aria-hidden','false');
    document.body.classList.add('fusion-sheet-on','no-scroll');
    setLenisStopped(true);
    if(typeof window.trapFocus==='function')try{window.trapFocus(sheet);}catch(e){}
  }
  function closeQuickSheet(){
    var sheet=$('fusionQuickSheet'), back=$('fusionSheetBackdrop');
    var wasOpen=!!(sheet&&sheet.classList.contains('open'));
    if(wasOpen&&typeof window.releaseFocusTrap==='function')try{window.releaseFocusTrap();}catch(e){}
    if(sheet)sheet.classList.remove('open');
    if(sheet)sheet.setAttribute('aria-hidden','true');
    if(back)back.classList.remove('open');
    document.body.classList.remove('fusion-sheet-on');
    restoreScrollIfIdle();
  }
  function sheetIsOpen(){
    var sheet=$('fusionQuickSheet');
    return !!(sheet&&sheet.classList.contains('open'));
  }
  function closeSheetBeforeSurface(fn,ctx,args){
    if(sheetIsOpen())closeQuickSheet();
    return fn.apply(ctx,args);
  }
  window.fusionOpenSheet=openQuickSheet;
  window.fusionCloseSheet=closeQuickSheet;
  function markDock(action){
    var key=(action==='home')?'home':(action==='add'?'add':(action==='quiz'?'quiz':(action==='care'?'care':'catalog')));
    all('.fusion-mobile-dock button').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-fusion-action')===key);});
  }
  function action(name){
    if(!name)return;
    if(name==='home'){
      closePanels();
      if(typeof window.clearCompare==='function')try{window.clearCompare();}catch(e){}
      smoothTo($('heroSection'),0);
      markDock('home');
      return;
    }
    if(name==='catalog'){
      closePanels();
      if(typeof window.setMode==='function')try{window.setMode('learn');}catch(e){}
      smoothTo($('plantCatalog'),-94);
      markDock('catalog');
      return;
    }
    if(name==='garden'){
      closePanels();
      if(typeof window.setMode==='function')try{window.setMode('garden');}catch(e){}
      smoothTo($('plantCatalog'),-94);
      markDock('catalog');
      return;
    }
    if(name==='add'){
      closePanels();
      if(typeof window.openDrawer==='function')try{window.openDrawer('add');}catch(e){}
      markDock('add');
      return;
    }
    if(name==='flash'){
      closePanels();
      if(typeof window.setMode==='function')try{window.setMode('learn');}catch(e){}
      if(typeof window.toggleFlashMode==='function')try{window.toggleFlashMode();}catch(e){}
      markDock('catalog');
      return;
    }
    if(name==='quiz'){
      closePanels();
      if(typeof window.setMode==='function')try{window.setMode('learn');}catch(e){}
      if(typeof window.toggleQuizMode==='function')try{window.toggleQuizMode();}catch(e){}
      markDock('quiz');
      return;
    }
    if(name==='calendar'){
      closePanels();
      if(typeof window.toggleCalMode==='function')try{window.toggleCalMode();}catch(e){}
      markDock('catalog');
      return;
    }
    if(name==='care'){
      closePanels();
      if(typeof window.toggleCareMode==='function')try{window.toggleCareMode();}catch(e){}
      markDock('care');
      return;
    }
    if(name==='dash'){
      closePanels();
      if(typeof window.toggleDashMode==='function')try{window.toggleDashMode();}catch(e){}
      markDock('catalog');
      return;
    }
    if(name==='print'&&typeof window.buildPrint==='function'){
      window.buildPrint();
    }
  }
  function bind(){
    all('[data-fusion-action]').forEach(function(btn){
      if(btn.getAttribute('data-fusion-bound'))return;
      btn.setAttribute('data-fusion-bound','1');
      btn.addEventListener('click',function(){action(btn.getAttribute('data-fusion-action'));});
    });
    var back=$('fusionSheetBackdrop');
    if(back&&!back.getAttribute('data-fusion-bound')){back.setAttribute('data-fusion-bound','1');back.addEventListener('click',closeQuickSheet);}
  }
  function installHooks(){
    if(window.__fusionHooksInstalled)return;
    window.__fusionHooksInstalled=true;
    if(typeof window.renderCatalog==='function'){
      var oldRender=window.renderCatalog;
      window.renderCatalog=function(){
        var out=oldRender.apply(this,arguments);
        try{updateStats();}catch(e){}
        try{enhanceCatalogCards();}catch(e){}
        return out;
      };
    }
    if(typeof window.toggleGardenStatus==='function'){
      var oldGarden=window.toggleGardenStatus;
      window.toggleGardenStatus=function(){
        var out=oldGarden.apply(this,arguments);
        try{updateStats();}catch(e){}
        return out;
      };
    }
    if(typeof window.handleFormSubmit==='function'){
      var oldSubmit=window.handleFormSubmit;
      window.handleFormSubmit=function(){
        var out=oldSubmit.apply(this,arguments);
        setTimeout(updateStats,0);
        return out;
      };
    }
    ['openEditDrawer','openJournal','sharePlant'].forEach(function(name){
      var oldFn=window[name];
      if(typeof oldFn!=='function')return;
      window[name]=function(){
        return closeSheetBeforeSurface(oldFn,this,arguments);
      };
    });
  }
  function init(){
    bind();
    installHooks();
    updateStats();
    enhanceCatalogCards();
    setTimeout(updateStats,400);
    setTimeout(updateStats,1400);
    setTimeout(enhanceCatalogCards,1500);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeQuickSheet();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
