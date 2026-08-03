/* Phase 9 : maturité produit — onboarding progressif, briefing quotidien,
   historique typé et centre de sauvegarde. Les formats v7/v8 restent lisibles. */
(function(){
  'use strict';
  function $(id){return document.getElementById(id);}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  /* esc() ne protège PAS une valeur placée dans une chaîne JS d'un gestionnaire inline
     (onclick="fn('…')") : le parseur HTML décode &#39; en apostrophe AVANT que le moteur JS
     ne lise la chaîne, ce qui la refermerait. encodeURIComponent ne laisse subsister ni
     quote, ni antislash, ni chevron. Les identifiants passant par _sanitizeId (app.js) sont
     déjà [A-Za-z0-9_-]+, donc inchangés en pratique : c'est une barrière de défense en
     profondeur, pas un changement de comportement. */
  function jsArg(value){return encodeURIComponent(String(value==null?'':value));}
  function read(key,fallback){try{var value=JSON.parse(localStorage.getItem(key));return value==null?fallback:value;}catch(e){return fallback;}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){if(typeof window.showToast==='function')window.showToast("Impossible d'enregistrer sur cet appareil.");return false;}}
  function list(){try{return Array.isArray(plants)?plants:[];}catch(e){return [];}}
  function plant(id){return list().find(function(item){return item&&item.id===id;});}
  function toast(text){if(typeof window.showToast==='function')window.showToast(text);}
  function modal(html){if(typeof window.openModalHTML==='function')window.openModalHTML(html);}
  function close(){if(typeof window.closeModal==='function')window.closeModal();}
  function todayISO(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function dateLabel(value){var d=new Date(String(value||'').slice(0,10)+'T12:00:00');return isNaN(d.getTime())?String(value||''):d.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});}
  function profile(){return read('hdv_profile_v1',{});}
  function journal(){return typeof window.__hdvJournalSnapshot==='function'?window.__hdvJournalSnapshot():read('hdv_journal',{});}
  function eventType(type){
    return ({water:['Arrosage','fa-droplet'],repot:['Rempotage','fa-seedling'],growth:['Croissance','fa-chart-column'],bloom:['Floraison','fa-leaf'],care:['Soin','fa-hand-holding-droplet'],note:['Observation','fa-pen-to-square']})[type]||['Observation','fa-pen-to-square'];
  }
  /* Même règle que le hub (v10) : l'échéance vient du prédicat partagé
     window.waterDue, seul à connaître les exemplaires individuels. Le journal
     ne fournit ici que « la routine est-elle configurée » et le libellé. */
  function dueInfo(p,data){
    var item=data[p.id]||{},every=parseInt(item.waterEvery,10)||0;
    var due=(typeof window.waterDue==='function')?!!window.waterDue(p.id):false;
    if(!every)return {configured:false,due:due,label:due?"À arroser aujourd'hui":'Routine à définir'};
    if(due)return {configured:true,due:true,label:"À arroser aujourd'hui"};
    if(!item.lastWater)return {configured:true,due:false,label:'Premier arrosage à noter'};
    var last=new Date(item.lastWater).getTime();
    if(!last)return {configured:true,due:false,label:'Date à vérifier'};
    var left=every-Math.floor((Date.now()-last)/86400000);
    return {configured:true,due:false,label:'Dans '+Math.max(left,0)+' j'};
  }
  function observationsThisMonth(data){
    var prefix=todayISO().slice(0,7),count=0;
    Object.keys(data).forEach(function(id){
      var entries=Array.isArray(data[id]&&data[id].entries)?data[id].entries:[];
      entries.forEach(function(entry){if(String(entry.iso||'').slice(0,7)===prefix)count++;});
    });
    return count;
  }

  /* ---------- Briefing quotidien ---------- */
  function renderBriefing(){
    var root=$('p9Briefing');if(!root)return;
    var p=profile(),data=journal(),garden=list().filter(function(item){return item&&item.inGarden===true;});
    var due=garden.filter(function(item){return dueInfo(item,data).due;});
    var configured=garden.filter(function(item){return dueInfo(item,data).configured;}).length;
    var notes=observationsThisMonth(data),name=(p.name||'').trim();
    var title=$('p9BriefingTitle'),copy=$('p9BriefingText'),metrics=$('p9BriefingMetrics'),actions=$('p9BriefingActions');
    if(title)title.textContent=name?'Bonjour '+name+', voici votre jardin':'Votre jardin en un regard';
    if(copy)copy.textContent=!p.completedAt
      ? 'Personnalisez le carnet en deux minutes pour obtenir des priorités adaptées, sans créer de compte.'
      : garden.length
        ? (due.length?due.length+' action'+(due.length>1?'s':'')+' mérite'+(due.length>1?'nt':'')+' votre attention aujourd’hui.':'Tout est à jour. Profitez-en pour observer une nouvelle pousse.')
        : 'Adoptez votre première plante pour créer un programme de soins personnel.';
    if(metrics)metrics.innerHTML=
      '<div class="p9-metric '+(due.length?'is-alert':'is-calm')+'"><b>'+due.length+'</b><span>à faire</span></div>'+ 
      '<div class="p9-metric"><b>'+configured+'/'+garden.length+'</b><span>routines</span></div>'+ 
      '<div class="p9-metric"><b>'+notes+'</b><span>notes ce mois</span></div>';
    if(actions)actions.innerHTML=
      (!p.completedAt?'<button class="btn-luxe btn-luxe-accent" type="button" onclick="window.p9OpenOnboarding()"><i class="fa-solid fa-wand-magic-sparkles"></i> Personnaliser en 2 min</button>':'<button class="btn-luxe" type="button" onclick="window.p9OpenOnboarding()"><i class="fa-solid fa-leaf"></i> Mon profil</button>')+
      '<button class="btn-luxe" type="button" onclick="toggleCareMode()"><i class="fa-solid fa-hand-holding-droplet"></i> Voir les soins</button>'+ 
      '<button class="btn-luxe" type="button" onclick="window.p9OpenBackupCenter()"><i class="fa-solid fa-bookmark"></i> Sauvegarder</button>';
  }
  window.p9RenderBriefing=renderBriefing;

  /* ---------- Onboarding progressif et réouvrable ---------- */
  var onboardingStep=0,onboardingDraft=null;
  function optionButton(name,value,label,icon,current){
    return '<button class="p9-choice '+(current===value?'selected':'')+'" type="button" data-p9-choice="'+esc(name)+'" data-value="'+esc(value)+'" aria-pressed="'+(current===value?'true':'false')+'"><i class="fa-solid '+icon+'"></i><span>'+esc(label)+'</span></button>';
  }
  function bindChoices(){
    Array.prototype.forEach.call(document.querySelectorAll('[data-p9-choice]'),function(button){
      button.addEventListener('click',function(){
        var name=button.getAttribute('data-p9-choice'),value=button.getAttribute('data-value');
        onboardingDraft[name]=value;
        document.querySelectorAll('[data-p9-choice="'+name+'"]').forEach(function(item){var on=item===button;item.classList.toggle('selected',on);item.setAttribute('aria-pressed',String(on));});
      });
    });
  }
  function captureOnboarding(){
    var name=$('p9ProfileName');if(name)onboardingDraft.name=name.value.trim().slice(0,40);
    var reminders=$('p9ProfileReminders');if(reminders)onboardingDraft.reminders=reminders.checked;
    if(onboardingStep===2)onboardingDraft.goals=Array.prototype.map.call(document.querySelectorAll('[name="p9Goal"]:checked'),function(el){return el.value;});
  }
  function onboardingHTML(){
    var completed=!!onboardingDraft.completedAt;
    var head='<div class="p9-onboarding-head"><span class="fusion-kicker">Configuration personnelle</span><h2 id="p9OnboardingTitle">'+(completed?'Mon profil botanique':'Bienvenue dans votre carnet')+'</h2><p>Étape '+(onboardingStep+1)+' sur 3 · vos choix restent uniquement sur cet appareil.</p><div class="p9-progress" aria-hidden="true"><span style="width:'+((onboardingStep+1)*33.333)+'%"></span></div></div>';
    var body='';
    if(onboardingStep===0){
      body='<div class="p9-onboarding-step"><label class="p9-profile-label" for="p9ProfileName">Comment souhaitez-vous être appelé ? <span>facultatif</span></label><input class="p9-profile-input" id="p9ProfileName" maxlength="40" autocomplete="name" value="'+esc(onboardingDraft.name||'')+'" placeholder="Votre prénom"><div class="p9-privacy"><i class="fa-solid fa-bookmark"></i><span>Aucun compte, aucun transfert : ce profil reste dans votre navigateur.</span></div></div>';
    }else if(onboardingStep===1){
      body='<div class="p9-onboarding-step"><fieldset class="p9-choice-field"><legend>Votre expérience</legend><div class="p9-choice-grid">'+
        optionButton('level','discover','Je découvre','fa-seedling',onboardingDraft.level)+optionButton('level','regular','Je pratique','fa-leaf',onboardingDraft.level)+optionButton('level','expert','Je collectionne','fa-trophy',onboardingDraft.level)+'</div></fieldset>'+ 
        '<fieldset class="p9-choice-field"><legend>Votre espace principal</legend><div class="p9-choice-grid">'+
        optionButton('space','inside','Intérieur','fa-location-dot',onboardingDraft.space)+optionButton('space','outside','Extérieur','fa-sun',onboardingDraft.space)+optionButton('space','mixed','Les deux','fa-earth-europe',onboardingDraft.space)+'</div></fieldset></div>';
    }else{
      var goals=onboardingDraft.goals||[];
      body='<div class="p9-onboarding-step"><fieldset class="p9-goals"><legend>Ce que vous voulez suivre</legend>'+ 
        [['care','Les soins et arrosages','fa-droplet'],['growth','La croissance et les floraisons','fa-chart-column'],['learn','La reconnaissance botanique','fa-brain']].map(function(g){return '<label><input type="checkbox" name="p9Goal" value="'+g[0]+'" '+(goals.indexOf(g[0])>=0?'checked':'')+'><i class="fa-solid '+g[2]+'"></i><span>'+g[1]+'</span></label>';}).join('')+
        '</fieldset><label class="p9-reminder-toggle"><input type="checkbox" id="p9ProfileReminders" '+(onboardingDraft.reminders?'checked':'')+'><span><b>Me proposer les notifications</b><small>Le navigateur ne demandera l’autorisation que lorsque vous l’activerez vous-même.</small></span></label></div>';
    }
    var foot='<div class="p9-onboarding-actions">'+(onboardingStep?'<button class="btn-luxe" type="button" onclick="window.p9OnboardingBack()"><i class="fa-solid fa-arrow-left"></i> Retour</button>':'<button class="btn-luxe" type="button" onclick="window.closeModal()">Plus tard</button>')+
      '<button class="btn-luxe btn-luxe-accent" type="button" onclick="window.p9OnboardingNext()">'+(onboardingStep===2?'Terminer':'Continuer')+' <i class="fa-solid '+(onboardingStep===2?'fa-check':'fa-arrow-right')+'"></i></button></div>';
    return '<div class="p9-onboarding">'+head+body+foot+'</div>';
  }
  function renderOnboarding(){modal(onboardingHTML());bindChoices();var input=$('p9ProfileName');if(input)setTimeout(function(){input.focus();},0);}
  window.p9OpenOnboarding=function(){onboardingStep=0;var saved=profile();onboardingDraft={name:saved.name||'',level:saved.level||'discover',space:saved.space||'mixed',goals:Array.isArray(saved.goals)?saved.goals.slice():['care','growth'],reminders:!!saved.reminders,completedAt:saved.completedAt||''};renderOnboarding();};
  window.p9OnboardingBack=function(){captureOnboarding();onboardingStep=Math.max(0,onboardingStep-1);renderOnboarding();};
  window.p9OnboardingNext=function(){
    captureOnboarding();
    if(onboardingStep<2){onboardingStep++;renderOnboarding();return;}
    onboardingDraft.completedAt=new Date().toISOString();
    if(!write('hdv_profile_v1',onboardingDraft))return;
    close();renderBriefing();toast('Votre carnet est personnalisé');
    if(onboardingDraft.reminders&&typeof Notification!=='undefined'&&Notification.permission==='default')setTimeout(function(){toast('Activez les notifications depuis les rappels quand vous serez prêt.');},900);
  };

  /* ---------- Historique de vie par plante ---------- */
  function journalUpdate(id,mutator){
    if(typeof window.__hdvJournalUpdate==='function')return window.__hdvJournalUpdate(id,mutator);
    var data=journal(),item=data[id]||(data[id]={entries:[],zone:'',waterEvery:0,lastWater:''}),before=JSON.stringify(data);
    try{mutator(item,data);localStorage.setItem('hdv_journal',JSON.stringify(data));return true;}catch(e){try{localStorage.setItem('hdv_journal',before);}catch(_){}return false;}
  }
  function timelineHTML(entries){
    if(!entries.length)return '<div class="p9-timeline-empty"><i class="fa-solid fa-book-open"></i><b>Le journal commence ici</b><span>Notez un arrosage, une floraison ou une observation.</span></div>';
    return entries.slice().sort(function(a,b){return String(b.iso||b.t||'').localeCompare(String(a.iso||a.t||''));}).map(function(entry){
      var type=eventType(entry.type),date=entry.iso?dateLabel(entry.iso):entry.t;
      return '<article class="p9-timeline-item"><div class="p9-timeline-icon"><i class="fa-solid '+type[1]+'"></i></div><div><div class="p9-timeline-meta"><b>'+esc(type[0])+'</b><time>'+esc(date||'Date non renseignée')+'</time></div><p>'+esc(entry.txt||type[0])+'</p></div></article>';
    }).join('');
  }
  window.p9OpenJournal=function(id){
    if(typeof window.fusionCloseSheet==='function')window.fusionCloseSheet();
    var p=plant(id);if(!p)return;var data=journal(),item=data[id]||{entries:[],zone:'',waterEvery:0};var entries=Array.isArray(item.entries)?item.entries:[];
    var html='<div class="p9-journal"><div class="p9-journal-head"><span class="fusion-kicker">Journal de vie</span><h2 id="p9JournalTitle">'+esc(p.nomFr)+'</h2><p><i>'+esc(p.nomLat||'')+'</i> · '+esc(p.famille||'Votre jardin')+'</p></div>'+ 
      '<div class="p9-journal-settings"><label>Emplacement<input id="p9JournalZone" value="'+esc(item.zone||'')+'" placeholder="Salon, balcon, serre…"></label><label>Arrosage tous les<input id="p9JournalWater" type="number" inputmode="numeric" min="0" max="365" value="'+esc(item.waterEvery||'')+'" aria-describedby="p9WaterUnit"><span id="p9WaterUnit">jours</span></label><button class="btn-luxe" type="button" onclick="window.p9SaveJournalRoutine(\''+jsArg(id)+'\')"><i class="fa-solid fa-floppy-disk"></i> Enregistrer la routine</button></div>'+ 
      '<form class="p9-event-composer" onsubmit="window.p9AddJournalEvent(event,\''+jsArg(id)+'\')"><h3>Ajouter un événement</h3><div class="p9-event-fields"><label>Type<select id="p9EventType"><option value="note">Observation</option><option value="water">Arrosage</option><option value="growth">Croissance</option><option value="bloom">Floraison</option><option value="repot">Rempotage</option><option value="care">Soin</option></select></label><label>Date<input id="p9EventDate" type="date" value="'+todayISO()+'" max="'+todayISO()+'"></label></div><label>Détail<textarea id="p9EventText" rows="2" maxlength="280" placeholder="Nouvelle pousse, feuille fragile, changement d’emplacement…"></textarea></label><button class="btn-luxe btn-luxe-accent" type="submit"><i class="fa-solid fa-plus"></i> Ajouter au journal</button></form>'+ 
      '<section class="p9-timeline" aria-labelledby="p9TimelineTitle"><div class="p9-section-heading"><h3 id="p9TimelineTitle">Historique</h3><span>'+entries.length+' événement'+(entries.length>1?'s':'')+'</span></div>'+timelineHTML(entries)+'</section>'+ 
      '<div class="p9-journal-footer"><button class="btn-luxe" type="button" onclick="window.sharePlant(\''+jsArg(id)+'\')"><i class="fa-solid fa-share-nodes"></i> Partager la fiche</button><button class="btn-luxe" type="button" onclick="window.p9OpenBackupCenter()"><i class="fa-solid fa-bookmark"></i> Sauvegarder le carnet</button></div></div>';
    modal(html);var card=$('v7-modal');if(card){card.setAttribute('aria-labelledby','p9JournalTitle');card.removeAttribute('aria-label');}
    /* v11 remplace openJournal après que v8 l'a enrichi. Réinjecter
       explicitement les photos évite de perdre ce module dans le nouveau
       journal et conserve le repli localStorage pendant la migration IDB. */
    if(typeof window.__v8InjectPhotos==='function')setTimeout(function(){window.__v8InjectPhotos(id);},0);
  };
  window.p9SaveJournalRoutine=function(id){var zone=$('p9JournalZone'),water=$('p9JournalWater');var ok=journalUpdate(id,function(item){item.zone=zone?zone.value.trim().slice(0,80):'';item.waterEvery=water?Math.max(0,Math.min(365,parseInt(water.value,10)||0)):0;});if(!ok){toast("La routine n'a pas pu être enregistrée.");return;}toast('Routine de soins enregistrée');refreshAfterJournal();};
  /* Un enregistrement de routine change l'emplacement et l'échéance : le filtre
     par zone, les étiquettes des fiches, le hub et le briefing doivent suivre
     sans attendre un rechargement. renderCatalog() est enveloppée par v10 et
     v11, un seul appel rafraîchit donc les trois surfaces. */
  function refreshAfterJournal(){
    if(typeof window.__hdvRebuildZoneFilter==='function')try{window.__hdvRebuildZoneFilter();}catch(e){}
    if(typeof window.renderCatalog==='function')try{window.renderCatalog();}catch(e){}
    renderBriefing();
  }
  window.p9AddJournalEvent=function(event,id){
    if(event)event.preventDefault();var type=$('p9EventType'),date=$('p9EventDate'),text=$('p9EventText');var typeValue=type?type.value:'note',meta=eventType(typeValue),detail=(text?text.value.trim():'')||meta[0]+' effectué';var iso=(date&&date.value)||todayISO();
    var entry={id:'event_'+Date.now(),type:typeValue,iso:iso,t:dateLabel(iso),txt:detail.slice(0,280)};
    var ok=journalUpdate(id,function(item){if(!Array.isArray(item.entries))item.entries=[];item.entries.push(entry);if(typeValue==='water')item.lastWater=new Date(iso+'T12:00:00').toISOString();});
    if(!ok){toast("L’événement n'a pas pu être enregistré.");return;}toast(meta[0]+' ajouté au journal');window.p9OpenJournal(id);refreshAfterJournal();
  };

  /* Remplace le journal v7 par la chronologie enrichie, sans changer les appels existants. */
  window.openJournal=window.p9OpenJournal;
  var originalWaterNow=window.waterNow;
  if(typeof originalWaterNow==='function')window.waterNow=function(id){
    originalWaterNow(id);
    journalUpdate(id,function(item){if(!Array.isArray(item.entries))item.entries=[];item.entries.push({id:'event_'+Date.now(),type:'water',iso:todayISO(),t:dateLabel(todayISO()),txt:'Arrosage effectué'});});
    renderBriefing();
  };

  /* ---------- Centre de sauvegarde ---------- */
  function storageSummary(){
    var keys=0,bytes=0;for(var i=0;i<localStorage.length;i++){var key=localStorage.key(i);if(key&&(key.indexOf('herbier')===0||key.indexOf('hdv_')===0)){keys++;bytes+=(localStorage.getItem(key)||'').length*2;}}
    return {keys:keys,kb:Math.max(1,Math.round(bytes/1024))};
  }
  window.p9OpenBackupCenter=function(){
    var last=localStorage.getItem('hdv_last_backup'),summary=storageSummary(),garden=list().filter(function(item){return item&&item.inGarden===true;}).length;
    var hasPrev=false;try{hasPrev=!!localStorage.getItem('hdv_prev_plants');}catch(e){}
    var html='<div class="p9-backup"><div class="p9-backup-head"><span class="p9-backup-icon"><i class="fa-solid fa-bookmark"></i></span><span class="fusion-kicker">Données personnelles</span><h2 id="p9BackupTitle">Votre carnet vous appartient</h2><p>Créez un fichier de sauvegarde contenant les fiches, routines, notes, progression et photos personnelles. Aucun serveur n’est utilisé.</p></div>'+ 
      '<div class="p9-backup-status"><div><b>'+list().length+'</b><span>fiches</span></div><div><b>'+garden+'</b><span>adoptées</span></div><div><b>'+summary.kb+' Ko</b><span>données locales</span></div></div>'+ 
      '<div class="p9-backup-card '+(last?'is-safe':'is-warning')+'"><i class="fa-solid '+(last?'fa-check':'fa-triangle-exclamation')+'"></i><div><b>'+(last?'Dernière sauvegarde créée':'Aucune sauvegarde connue')+'</b><span>'+(last?esc(new Date(last).toLocaleString('fr-FR')):'Exportez maintenant votre carnet pour pouvoir le restaurer sur un autre appareil.')+'</span></div></div>'+ 
      '<div class="p9-backup-actions"><button class="btn-luxe btn-luxe-accent" type="button" onclick="window.p9ExportBackup()"><i class="fa-solid fa-download"></i> Télécharger une sauvegarde</button><button class="btn-luxe" type="button" onclick="window.p9ImportBackup()"><i class="fa-solid fa-upload"></i> Restaurer un fichier</button>'+
      (hasPrev?'<button class="btn-luxe" type="button" onclick="window.p9RestorePrevious()"><i class="fa-solid fa-rotate-left"></i> Annuler le dernier import</button>':'')+'</div>'+
      '<div class="p9-privacy"><i class="fa-solid fa-bookmark"></i><span>La restauration valide entièrement le fichier avant toute écriture et conserve une copie de secours des fiches actuelles.</span></div></div>';
    modal(html);var root=$('v7-modal');if(root){root.setAttribute('aria-labelledby','p9BackupTitle');root.removeAttribute('aria-label');}
  };
  window.p9ExportBackup=function(){
    if(typeof window.v7Export!=='function'){toast('Export indisponible');return;}
    window.v7Export();try{localStorage.setItem('hdv_last_backup',new Date().toISOString());}catch(e){}setTimeout(window.p9OpenBackupCenter,120);renderBriefing();
  };
  window.p9ImportBackup=function(){
    var input=$('v7-file');if(!input){toast('Ouvrez une première fois le catalogue puis réessayez.');return;}
    close();input.click();
  };
  /* hdv_prev_plants est écrit avant chaque import mais n'était exploité qu'en
     cas de corruption détectée : l'utilisateur n'avait aucun moyen de revenir
     en arrière après un import regretté. */
  window.p9RestorePrevious=function(){
    var prev=null;try{prev=localStorage.getItem('hdv_prev_plants');}catch(e){}
    if(!prev){toast('Aucune copie de secours disponible');return;}
    var n=0;try{n=JSON.parse(prev).length;}catch(e){}
    if(!window.confirm('Restaurer la copie de secours ('+n+' fiche(s)) ?\n\nLes fiches actuelles seront remplacées.'))return;
    try{localStorage.setItem('herbier_plants_data_v4',prev);}catch(e){toast('Restauration impossible');return;}
    location.reload();
  };

  function installHooks(){
    if(window.__p9HooksInstalled)return;window.__p9HooksInstalled=true;
    if(typeof window.openModalHTML==='function'){
      var oldModal=window.openModalHTML;window.openModalHTML=function(html){
        var root=$('v7-modal');if(root){root.removeAttribute('aria-labelledby');root.setAttribute('aria-label','Boîte de dialogue');}
        return oldModal.call(this,html);
      };
    }
    if(typeof window.renderCatalog==='function'){
      var oldRender=window.renderCatalog;window.renderCatalog=function(){var result=oldRender.apply(this,arguments);try{renderBriefing();}catch(e){}return result;};
    }
    if(typeof window.toggleGardenStatus==='function'){
      var oldGarden=window.toggleGardenStatus;window.toggleGardenStatus=function(){var result=oldGarden.apply(this,arguments);try{renderBriefing();}catch(e){}return result;};
    }
  }
  function init(){installHooks();renderBriefing();setTimeout(renderBriefing,500);setTimeout(renderBriefing,1500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
