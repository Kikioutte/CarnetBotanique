(function(){
  'use strict';
  function $(id){return document.getElementById(id);}
  function ce(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;}
  function L(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}}
  function S(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){liveSay('Stockage plein');if(typeof window.showToast==='function')window.showToast(isFR()?'Stockage plein \u2014 espace insuffisant':'Storage full');return false;}}
  function esc2(s){return (s==null?'':String(s)).replace(/[&<>\"]/g,function(m){return ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'})[m];});}
  function norm(s){try{return (s==null?'':String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}catch(e){return (s==null?'':String(s)).toLowerCase();}}
  function isFR(){return (window.hdvLang||'fr')!=='en';}
  function liveSay(m){var el=$('v8-live');if(el)el.textContent=m;}
  function getPlants(){try{return plants;}catch(e){return [];}}
  function getPlant(id){var a=getPlants();for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null;}
  function toast(m){if(typeof window.showToast==='function')window.showToast(m);liveSay(m);}
  function opt(v){return '<option value="'+esc2(v)+'">'+esc2(v)+'</option>';}
  function uniqSorted(arr){var s={},o=[];arr.forEach(function(x){if(x&&!s[x]){s[x]=1;o.push(x);}});o.sort(function(a,b){return String(a).localeCompare(b);});return o;}

  /* ============ GROUPE 1 : Performance ============ */
  window._catPageSize=30;
  window.__catPage=function(list){window._catTotal=list.length;var sz=window._catPageSize;if(!window._loadMore)window._catLimit=sz;if(window._catLimit==null)window._catLimit=sz;if(window._catLimit>list.length)window._catLimit=list.length;var out=list.slice(0,window._catLimit);window._catShown=out.length;return out;};
  function afterCatalog(){
    var cat=$('plantCatalog');if(!cat)return;
    var old=document.querySelector('.v8-loadmore-wrap');if(old)old.remove();
    if(window._catShown!=null&&window._catTotal!=null&&window._catShown<window._catTotal){
      var wrap=ce('div','v8-loadmore-wrap');
      var rest=window._catTotal-window._catShown;
      var btn=ce('button','btn-luxe','<i class="fa-solid fa-circle-down"></i> '+(isFR()?'Charger plus':'Load more')+' ('+rest+')');
      btn.id='v8-loadmore';
      btn.onclick=function(){window._loadMore=true;window._catLimit=(window._catLimit||30)+window._catPageSize;if(typeof window.renderCatalog==='function')window.renderCatalog();window._loadMore=false;};
      wrap.appendChild(btn);
      wrap.appendChild(ce('div','v8-count-note',window._catShown+' / '+window._catTotal+(isFR()?' especes affichees':' species shown')));
      cat.parentNode.insertBefore(wrap,cat.nextSibling);
    }
    highlightSearch();reflectWishlist();augmentToolbar();injectJSONLD();
  }
  window.v8ToggleCompact=function(){var on=document.body.classList.toggle('cat-compact');S('hdv_viewmode',on?'compact':'rich');var b=$('v8-viewbtn');if(b){b.classList.toggle('active',on);b.innerHTML=on?'<i class="fa-solid fa-newspaper"></i> '+(isFR()?'Vue riche':'Rich view'):'<i class="fa-solid fa-table-cells"></i> '+(isFR()?'Vue grille':'Grid view');}};

  /* ============ GROUPE 2 : Recherche & navigation ============ */
  function lev(a,b){if(a===b)return 0;var m=a.length,n=b.length;if(!m)return n;if(!n)return m;var prev=[],cur=[],i,j;for(j=0;j<=n;j++)prev[j]=j;for(i=1;i<=m;i++){cur[0]=i;for(j=1;j<=n;j++){var cost=a.charCodeAt(i-1)===b.charCodeAt(j-1)?0:1;cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);}for(j=0;j<=n;j++)prev[j]=cur[j];}return prev[n];}
  function fuzzyTok(tok,hay){if(hay.indexOf(tok)>=0)return true;if(tok.length<3)return false;var words=hay.split(/[^a-z0-9]+/);var tol=tok.length<=4?1:2;for(var i=0;i<words.length;i++){var w=words[i];if(!w)continue;if(Math.abs(w.length-tok.length)<=tol+1&&lev(tok,w)<=tol)return true;if(w.length>tok.length&&lev(tok,w.slice(0,tok.length))<=tol)return true;}return false;}
  window.__fuzzyMatch=function(p,q){q=norm(q).trim();if(!q)return false;var hay=norm((p.nomFr||'')+' '+(p.nomLat||'')+' '+(p.famille||'')+' '+(p.region||''));var toks=q.split(/\s+/);for(var i=0;i<toks.length;i++){if(!fuzzyTok(toks[i],hay))return false;}return true;};
  function highlightSearch(){
    var si=$('searchInput');var q=si?si.value.toLowerCase().trim():'';
    var els=document.querySelectorAll('#plantCatalog .plant-name-fr, #plantCatalog .plant-name-lat, #plantCatalog .plant-family');
    els.forEach(function(el){
      if(el.getAttribute('data-v8o')==null)el.setAttribute('data-v8o',el.textContent);
      var orig=el.getAttribute('data-v8o');
      if(!q){if(el.textContent!==orig)el.textContent=orig;return;}
      var lo=orig.toLowerCase();var idx=lo.indexOf(q);
      if(idx<0){if(el.textContent!==orig)el.textContent=orig;return;}
      el.innerHTML=esc2(orig.slice(0,idx))+'<mark class="v8-hl">'+esc2(orig.slice(idx,idx+q.length))+'</mark>'+esc2(orig.slice(idx+q.length));
    });
  }
  // tri etendu (delegue a v7 pour les cles connues)
  (function(){var orig=window.__advSort;window.__advSort=function(list){var sel=$('v7-sort');var v=sel?sel.value:'';var a=list.slice();
    if(v==='tox'){a.sort(function(x,y){return (toxRank(y)-toxRank(x))||x.nomFr.localeCompare(y.nomFr);});return a;}
    if(v==='zone'){a.sort(function(x,y){return zoneOf(x).localeCompare(zoneOf(y))||x.nomFr.localeCompare(y.nomFr);});return a;}
    if(v==='adopt'){var ad=L('hdv_adoptDates',{});a.sort(function(x,y){return (ad[y.id]||0)-(ad[x.id]||0);});return a;}
    return orig?orig(list):a;};})();
  function toxRank(p){return (p.toxicite&&p.toxicite!=='Non toxique')?1:0;}
  function zoneOf(p){var j=L('hdv_journal',{});return (j[p.id]&&j[p.id].zone)||'\uffff';}
  // vues enregistrees
  window.v8Views=function(){
    var views=L('hdv_views',{});var fr=isFR();
    var h='<h2 style="font-family:var(--primary-serif);font-size:1.8rem;margin-bottom:6px;">'+(fr?'Vues enregistrees':'Saved views')+'</h2>';
    h+='<p style="font-size:.82rem;color:var(--sage-green);margin-bottom:14px;">'+(fr?'Sauvegardez vos filtres et tris favoris.':'Save your favourite filters and sorts.')+'</p>';
    var keys=Object.keys(views);
    if(!keys.length)h+='<p style="font-style:italic;opacity:.7;">'+(fr?'Aucune vue enregistree.':'No saved view yet.')+'</p>';
    else h+='<div style="display:flex;flex-direction:column;gap:8px;">'+keys.map(function(k){return '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid var(--glass-border);border-radius:10px;padding:8px 12px;"><span>'+esc2(k)+'</span><span style="display:flex;gap:6px;"><button class="btn-luxe" onclick="window.v8ApplyView(\''+encodeURIComponent(k)+'\')"><i class="fa-solid fa-play"></i> '+(fr?'Appliquer':'Apply')+'</button><button class="btn-luxe" onclick="window.v8DeleteView(\''+encodeURIComponent(k)+'\')"><i class="fa-solid fa-trash"></i></button></span></div>';}).join('')+'</div>';
    h+='<div class="v7-actions-row" style="margin-top:16px;"><button class="btn-luxe" onclick="window.v8SaveView()"><i class="fa-solid fa-floppy-disk"></i> '+(fr?'Enregistrer la vue actuelle':'Save current view')+'</button></div>';
    if(typeof window.openModalHTML==='function')window.openModalHTML(h);
  };
  window.v8SaveView=function(){var name=prompt(isFR()?'Nom de la vue :':'View name:');if(!name)return;name=name.trim();if(!name)return;var views=L('hdv_views',{});var g=function(id){var e=$(id);return e?e.value:'';};views[name]={fam:g('v7-f-fam'),type:g('v7-f-type'),tox:g('v7-f-tox'),zone:g('v7-f-zone'),sort:g('v7-sort'),q:(($('searchInput')||{}).value)||''};S('hdv_views',views);toast(isFR()?'Vue enregistree':'View saved');window.v8Views();};
  window.v8ApplyView=function(k){k=decodeURIComponent(k);var v=L('hdv_views',{})[k];if(!v)return;var set=function(id,val){var e=$(id);if(e){e.value=val||'';}};set('v7-f-fam',v.fam);set('v7-f-type',v.type);set('v7-f-tox',v.tox);set('v7-f-zone',v.zone);set('v7-sort',v.sort);var si=$('searchInput');if(si){si.value=v.q||'';si.dispatchEvent(new Event('input',{bubbles:true}));}var ff=$('v7-f-fam');if(ff)ff.dispatchEvent(new Event('change',{bubbles:true}));if(typeof window.renderCatalog==='function')window.renderCatalog();if(typeof window.closeModal==='function')window.closeModal();toast((isFR()?'Vue appliquee : ':'View applied: ')+k);};
  window.v8DeleteView=function(k){k=decodeURIComponent(k);var views=L('hdv_views',{});delete views[k];S('hdv_views',views);window.v8Views();};

  /* ============ GROUPE 3 : Jardin & suivi ============ */
  /* Photos personnelles : IndexedDB (quota de centaines de Mo, contre ~5 Mo pour
     localStorage que les photos base64 saturaient vite). Les anciennes photos
     stockées sous hdv_photos sont migrées une fois puis la clé est supprimée.
     Repli localStorage si IndexedDB est indisponible (navigation privée ancienne). */
  var _idb=null;
  function idbOpen(){
    return new Promise(function(res,rej){
      if(!window.indexedDB)return rej(new Error('IDB indisponible'));
      if(_idb)return res(_idb);
      var rq=indexedDB.open('hdv',1);
      rq.onupgradeneeded=function(){rq.result.createObjectStore('photos');};
      rq.onsuccess=function(){_idb=rq.result;res(_idb);};
      rq.onerror=function(){rej(rq.error);};
    });
  }
  function getPhotos(id){
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var rq=db.transaction('photos','readonly').objectStore('photos').get(id);
        rq.onsuccess=function(){res(rq.result||[]);};
        rq.onerror=function(){res([]);};
      });
    }).catch(function(){var ph=L('hdv_photos',{});return ph[id]||[];});
  }
  function setPhotos(id,arr){
    return idbOpen().then(function(db){
      return new Promise(function(res,rej){
        var t=db.transaction('photos','readwrite');
        t.objectStore('photos').put(arr,id);
        t.oncomplete=function(){res(true);};
        t.onerror=function(){rej(t.error);};
      });
    }).catch(function(){var ph=L('hdv_photos',{});ph[id]=arr;return S('hdv_photos',ph);});
  }
  function migratePhotosToIDB(){
    try{
      var ph=L('hdv_photos',null);
      if(!ph||typeof ph!=='object')return;
      var ids=Object.keys(ph);if(!ids.length){try{localStorage.removeItem('hdv_photos');}catch(e){}return;}
      Promise.all(ids.map(function(k){return setPhotos(k,ph[k]);}))
        .then(function(){try{localStorage.removeItem('hdv_photos');}catch(e){}})
        .catch(function(){/* IDB indisponible : on reste sur localStorage */});
    }catch(e){}
  }
  var _photoCache={}; // dernier état rendu, pour le zoom synchrone
  function injectPhotos(id){
    var body=$('v7-modal-body');if(!body)return;if(body.querySelector('.v8-photoblock'))return;
    var fr=isFR();var wrap=ce('div','v8-photoblock');wrap.style.marginTop='10px';
    wrap.innerHTML='<label style="font-family:var(--primary-sans);font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--sage-green);display:block;margin-bottom:6px;">'+(fr?'Photos personnelles':'Personal photos')+'</label><div class="v8-photos" id="v8-photos-'+id+'"></div><input type="file" id="v8-photofile-'+id+'" accept="image/*" style="display:none"><button class="btn-luxe" type="button" id="v8-photoadd-'+id+'"><i class="fa-solid fa-camera"></i> '+(fr?'Ajouter une photo':'Add a photo')+'</button>';
    body.appendChild(wrap);
    renderPhotos(id);
    var inp=$('v8-photofile-'+id),add=$('v8-photoadd-'+id);
    if(add)add.onclick=function(){inp.click();};
    if(inp)inp.onchange=function(){
      var f=inp.files&&inp.files[0];if(!f)return;
      resizeImage(f,700,0.7,function(durl){
        if(!durl)return;
        getPhotos(id).then(function(arr){
          arr.push(durl);
          return setPhotos(id,arr);
        }).then(function(){renderPhotos(id);toast(fr?'Photo ajoutee':'Photo added');})
          .catch(function(){toast(fr?'Stockage photo impossible':'Could not store photo');});
      });
      inp.value='';
    };
  }
  function renderPhotos(id){
    var g=$('v8-photos-'+id);if(!g)return;
    getPhotos(id).then(function(arr){
      _photoCache[id]=arr;
      if(!document.getElementById('v8-photos-'+id))return; // modale refermée entre-temps
      g.innerHTML=arr.map(function(src,i){return '<div class="ph" onclick="window.v8ZoomPhoto('+i+',\''+id+'\')"><img src="'+src+'" alt="photo"><button title="Supprimer" onclick="event.stopPropagation();window.v8DelPhoto(\''+id+'\','+i+')"><i class="fa-solid fa-xmark"></i></button></div>';}).join('');
    });
  }
  window.v8DelPhoto=function(id,i){
    getPhotos(id).then(function(arr){arr.splice(i,1);return setPhotos(id,arr);}).then(function(){renderPhotos(id);});
  };
  window.v8ZoomPhoto=function(i,id){var arr=_photoCache[id]||[];if(typeof window.openImgZoom==='function'&&arr[i])window.openImgZoom(arr[i]);};
  /* Points d'accès pour l'export/import v7 : les photos IDB font partie des sauvegardes JSON */
  window.__hdvAllPhotos=function(){
    return idbOpen().then(function(db){
      return new Promise(function(res){
        var out={};var rq=db.transaction('photos','readonly').objectStore('photos').openCursor();
        rq.onsuccess=function(){var c=rq.result;if(c){out[c.key]=c.value;c.continue();}else res(out);};
        rq.onerror=function(){res({});};
      });
    }).catch(function(){return L('hdv_photos',{});});
  };
  window.__hdvRestorePhotos=function(map){
    if(!map||typeof map!=='object')return Promise.resolve();
    return Promise.all(Object.keys(map).map(function(k){
      return Array.isArray(map[k])?setPhotos(k,map[k]):null;
    })).catch(function(){});
  };
  function resizeImage(file,maxDim,quality,cb){try{var reader=new FileReader();reader.onload=function(e){var img=new Image();img.onload=function(){var w=img.width,h=img.height;var scale=Math.min(1,maxDim/Math.max(w,h));var cw=Math.round(w*scale),ch=Math.round(h*scale);var cv=document.createElement('canvas');cv.width=cw;cv.height=ch;cv.getContext('2d').drawImage(img,0,0,cw,ch);try{cb(cv.toDataURL('image/jpeg',quality));}catch(err){cb(e.target.result);}};img.onerror=function(){cb(null);};img.src=e.target.result;};reader.onerror=function(){cb(null);};reader.readAsDataURL(file);}catch(err){cb(null);}}
  // wrap openJournal pour injecter les photos
  (function(){var orig=window.openJournal;if(typeof orig==='function'){window.openJournal=function(id){orig.call(this,id);setTimeout(function(){injectPhotos(id);},0);};}})();
  // iCal + PDF jardin injectes dans la modale rappels
  (function(){var orig=window.openReminders;if(typeof orig==='function'){window.openReminders=function(){orig.apply(this,arguments);setTimeout(injectReminderExtras,0);};}})();
  function injectReminderExtras(){var body=$('v7-modal-body');if(!body||body.querySelector('.v8-remextra'))return;var fr=isFR();var row=ce('div','v7-actions-row v8-remextra');row.style.marginTop='14px';row.innerHTML='<button class="btn-luxe" onclick="window.v8ExportICS()"><i class="fa-solid fa-calendar-plus"></i> '+(fr?'Exporter (.ics)':'Export (.ics)')+'</button><button class="btn-luxe" onclick="window.v8GardenPDF()"><i class="fa-solid fa-file-pdf"></i> '+(fr?'Jardin en PDF':'Garden as PDF')+'</button><button class="btn-luxe" onclick="window.v8ShareGarden()"><i class="fa-solid fa-qrcode"></i> '+(fr?'Partager le jardin':'Share garden')+'</button>';body.appendChild(row);}
  window.__v8RemExtras=injectReminderExtras; /* v9 remplace openReminders : il réinjecte ces boutons via ce point d'entrée */
  window.v8ExportICS=function(){var j=L('hdv_journal',{});var adopted=getPlants().filter(function(p){return p.inGarden===true;});var dt=new Date();var ds=dt.getFullYear()+pad2(dt.getMonth()+1)+pad2(dt.getDate());var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Herbier de Vie//FR','CALSCALE:GREGORIAN'];var n=0;adopted.forEach(function(p){var every=j[p.id]&&j[p.id].waterEvery;if(every&&every>0){n++;lines.push('BEGIN:VEVENT','UID:water-'+p.id+'@herbier','DTSTART;VALUE=DATE:'+ds,'RRULE:FREQ=DAILY;INTERVAL='+every,'SUMMARY:'+(isFR()?'Arroser ':'Water ')+icsEsc(p.nomFr),'DESCRIPTION:'+icsEsc(p.nomLat||''),'END:VEVENT');}});lines.push('END:VCALENDAR');if(!n){toast(isFR()?'Definissez un intervalle d\'arrosage d\'abord':'Set a watering interval first');return;}downloadText(lines.join('\r\n'),'herbier-arrosage.ics','text/calendar');toast(isFR()?n+' rappel(s) exporte(s)':n+' reminder(s) exported');};
  function icsEsc(s){return String(s||'').replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n');}
  function pad2(n){return (n<10?'0':'')+n;}
  function downloadText(text,name,mime){try{var blob=new Blob([text],{type:mime||'text/plain'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);}catch(e){toast('Export impossible');}}
  // Liste de souhaits
  function getWish(){return L('hdv_wishlist',{});}
  window.wishToggle=function(id,ev){if(ev){ev.stopPropagation();ev.preventDefault();}var w=getWish();if(w[id])delete w[id];else w[id]=1;S('hdv_wishlist',w);reflectWishlist();if(window._v8WishOnly&&typeof window.renderCatalog==='function')window.renderCatalog();toast(w[id]?(isFR()?'Ajoute aux souhaits':'Added to wishlist'):(isFR()?'Retire des souhaits':'Removed'));};
  function reflectWishlist(){var w=getWish();document.querySelectorAll('.wl-btn').forEach(function(b){var id=b.getAttribute('data-wl');var on=!!w[id];b.classList.toggle('on',on);var ic=b.querySelector('i');if(ic)ic.className=on?'fa-solid fa-star':'fa-regular fa-star';var lbl=on?'Retirer des souhaits':'Ajouter aux souhaits';b.setAttribute('aria-label',lbl);b.title=lbl;});}
  (function(){var orig=window.__advFilter;window.__advFilter=function(p){if(window._v8WishOnly){var w=getWish();if(!w[p.id])return false;}return orig?orig(p):true;};})();
  window.v8ToggleWish=function(){window._v8WishOnly=!window._v8WishOnly;var b=$('v8-wishbtn');if(b)b.classList.toggle('active',window._v8WishOnly);if(typeof window.renderCatalog==='function')window.renderCatalog();};
  // dates d'adoption
  (function(){var orig=window.toggleGardenStatus;if(typeof orig==='function'){window.toggleGardenStatus=function(id){var was=false;var p=getPlant(id);if(p)was=p.inGarden===true;orig.apply(this,arguments);var ad=L('hdv_adoptDates',{});if(!was){ad[id]=Date.now();}else{delete ad[id];}S('hdv_adoptDates',ad);};}})();

  /* ============ GROUPE 4 : Apprentissage ============ */
  window._v8QuizSecs=15;window._v8Timed=false;window._v8QuizFam='';
  (function(){var orig=window.quizPool;window.quizPool=function(){var base=(typeof orig==='function')?orig():getPlants();if(window._v8QuizFam)base=base.filter(function(p){return p.famille===window._v8QuizFam;});return base;};})();
  var v8Timer=null;
  function clearTimer(){if(v8Timer){clearInterval(v8Timer);v8Timer=null;}}
  function startTimer(){clearTimer();if(!window._v8Timed)return;var card=$('quizCard');if(!card)return;var bar=ce('div','v8-timerbar','<i></i>');card.insertBefore(bar,card.firstChild);var fill=bar.querySelector('i');var total=window._v8QuizSecs||15;var left=total;fill.style.width='100%';v8Timer=setInterval(function(){left-=0.1;if(left<=0){clearTimer();fill.style.width='0%';autoAnswer();return;}fill.style.width=(left/total*100)+'%';},100);}
  function autoAnswer(){try{var correct=(quizMode==='fam')?quizCur.famille:(quizMode==='lat')?quizCur.nomLat:quizCur.nomFr;var opts=document.querySelectorAll('#quizCard .quiz-opt');for(var i=0;i<opts.length;i++){if(opts[i].textContent.trim()!==correct){opts[i].click();return;}}if(opts[0])opts[0].click();}catch(e){}}
  function ensureQuizCtrls(){var card=$('quizCard');if(!card||$('v8-quizctrls'))return;var fr=isFR();var fams=uniqSorted(getPlants().map(function(p){return p.famille;}));var ctr=ce('div','v8-quizctrls');ctr.id='v8-quizctrls';ctr.innerHTML='<button id="v8-timed" class="'+(window._v8Timed?'on':'')+'"><i class="fa-solid fa-stopwatch"></i> '+(fr?'Chrono':'Timed')+'</button>'+'<select id="v8-level" title="'+(fr?'Difficulte':'Difficulty')+'"><option value="25">'+(fr?'Facile (25s)':'Easy (25s)')+'</option><option value="15" selected>'+(fr?'Moyen (15s)':'Medium (15s)')+'</option><option value="8">'+(fr?'Rapide (8s)':'Fast (8s)')+'</option></select>'+'<select id="v8-quizfam"><option value="">'+(fr?'Toutes familles':'All families')+'</option>'+fams.map(opt).join('')+'</select>';card.parentNode.insertBefore(ctr,card);$('v8-timed').onclick=function(){window._v8Timed=!window._v8Timed;this.classList.toggle('on',window._v8Timed);if(typeof window.newQuestion==='function')window.newQuestion();};$('v8-level').onchange=function(){window._v8QuizSecs=parseInt(this.value,10)||15;if(window._v8Timed&&typeof window.newQuestion==='function')window.newQuestion();};$('v8-quizfam').onchange=function(){window._v8QuizFam=this.value;if(typeof window.newQuestion==='function')window.newQuestion();};}
  (function(){var orig=window.newQuestion;if(typeof orig==='function'){window.newQuestion=function(){orig.apply(this,arguments);ensureQuizCtrls();startTimer();};}})();
  (function(){var orig=window.answerQuiz;if(typeof orig==='function'){window.answerQuiz=function(btn){clearTimer();orig.call(this,btn);logQuiz(btn);};}})();
  function logQuiz(btn){try{var hist=L('hdv_quizhist',{});var d=new Date();var key=d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());if(!hist[key])hist[key]={ok:0,no:0};if(btn&&btn.classList&&btn.classList.contains('good'))hist[key].ok++;else hist[key].no++;S('hdv_quizhist',hist);}catch(e){}}
  // Tableau de bord enrichi
  (function(){var orig=window.renderDash;if(typeof orig==='function'){window.renderDash=function(){orig.apply(this,arguments);try{renderDashX();}catch(e){}};}})();
  function renderDashX(){var sec=$('dashSection');if(!sec)return;var box=$('v8-dashx');if(!box){box=ce('div','v8-dashx');box.id='v8-dashx';sec.appendChild(box);}var fr=isFR();
    var leit=L('hdv_leitner',{});var boxes=[0,0,0,0,0,0];getPlants().forEach(function(p){var b=(leit[p.id]&&leit[p.id].box)||0;if(b>5)b=5;boxes[b]++;});var labels=fr?['Nouveau','1j','3j','7j','14j','30j']:['New','1d','3d','7d','14d','30d'];
    var leitHTML='<div class="v8-leit">'+boxes.map(function(c,i){return '<div class="lv"><b>'+c+'</b><small>'+labels[i]+'</small></div>';}).join('')+'</div>';
    var mastered=boxes[4]+boxes[5];leitHTML+='<p style="margin-top:10px;font-size:.8rem;color:var(--sage-green);">'+(fr?'Cartes bien memorisees : ':'Well-memorised cards: ')+'<b>'+mastered+'</b></p>';
    var hist=L('hdv_quizhist',{});var days=[];for(var i=13;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);days.push(d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()));}var maxd=1;days.forEach(function(k){var h=hist[k];if(h)maxd=Math.max(maxd,h.ok+h.no);});
    var spark='<div class="v8-spark">'+days.map(function(k){var h=hist[k]||{ok:0,no:0};var okh=Math.round(h.ok/maxd*54),noh=Math.round(h.no/maxd*54);var dd=k.slice(8);return '<div class="col" title="'+k+' : '+h.ok+' OK / '+h.no+' KO"><div class="ok" style="height:'+okh+'px"></div><div class="no" style="height:'+noh+'px"></div><div class="d">'+dd+'</div></div>';}).join('')+'</div>';
    var byReg={};getPlants().forEach(function(p){var r=p.region||'\u2014';byReg[r]=(byReg[r]||0)+1;});var regs=Object.keys(byReg).map(function(k){return [k,byReg[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,6);var rmax=regs.length?regs[0][1]:1;
    var regHTML=regs.map(function(r){return '<div class="v8-bar"><span class="lbl" title="'+esc2(r[0])+'">'+esc2(r[0])+'</span><span class="track"><span class="fill" style="width:'+Math.round(r[1]/rmax*100)+'%"></span></span><span class="num">'+r[1]+'</span></div>';}).join('');
    var safe=getPlants().filter(function(p){return !p.toxicite||p.toxicite==='Non toxique';}).length;var toxc=getPlants().length-safe;var tt=safe+toxc||1;
    var toxHTML='<div class="v8-bar"><span class="lbl">'+(fr?'Non toxiques':'Non-toxic')+'</span><span class="track"><span class="fill" style="width:'+Math.round(safe/tt*100)+'%;background:var(--sage-green)"></span></span><span class="num">'+safe+'</span></div>'+'<div class="v8-bar"><span class="lbl">'+(fr?'Toxiques':'Toxic')+'</span><span class="track"><span class="fill" style="width:'+Math.round(toxc/tt*100)+'%;background:var(--terracotta)"></span></span><span class="num">'+toxc+'</span></div>';
    box.innerHTML='<div class="v8-panel"><h4><i class="fa-solid fa-layer-group"></i> '+(fr?'Progression (revision espacee)':'Spaced repetition progress')+'</h4>'+leitHTML+'</div>'+'<div class="v8-panel"><h4><i class="fa-solid fa-chart-column"></i> '+(fr?'Quiz \u2014 14 derniers jours':'Quiz \u2014 last 14 days')+'</h4>'+spark+'</div>'+'<div class="v8-panel"><h4><i class="fa-solid fa-earth-europe"></i> '+(fr?'Top regions':'Top regions')+'</h4>'+regHTML+'</div>'+'<div class="v8-panel"><h4><i class="fa-solid fa-triangle-exclamation"></i> '+(fr?'Toxicite':'Toxicity')+'</h4>'+toxHTML+'</div>';
  }

  /* ============ GROUPE 5 : Partage & sortie ============ */
  window.v8GardenPDF=function(){var area=$('printArea');if(!area){toast('Indisponible');return;}var list=getPlants().filter(function(p){return p.inGarden===true;});if(!list.length){toast(isFR()?'Aucune plante adoptee':'No adopted plant');return;}var html='';for(var i=0;i<list.length;i+=4){html+='<div class="pg">';for(var j=i;j<i+4;j++){if(j<list.length){var p=list[j];html+='<div class="pcard"><div class="pc-h"><span>'+esc2(p.nomFr)+'</span><small>'+esc2(p.type)+'</small></div><div class="pc-b"><div class="pc-row"><b>'+(isFR()?'Identite':'Identity')+'</b><span><i>'+esc2(p.nomLat)+'</i> \u2014 '+esc2(p.famille)+'</span></div><div class="pc-row"><b>'+(isFR()?'Origine':'Origin')+'</b><span>'+esc2(p.region)+'</span></div><div class="pc-row"><b>'+(isFR()?'Conserv.':'Care')+'</b><span>'+esc2(p.besoins)+'</span></div><div class="pc-row"><b>'+(isFR()?'Sensib.':'Pests')+'</b><span>'+esc2(p.ennemis)+'</span></div></div></div>';}else{html+='<div class="pcard empty"></div>';}}html+='</div>';}area.innerHTML=html;window.print();};
  function gardenLink(){var ids=getPlants().filter(function(p){return p.inGarden===true;}).map(function(p){return parseInt(String(p.id).replace(/[^0-9]/g,''),10);}).filter(function(n){return n>0;});var base=location.href.split('#')[0];return base+'#hdvg='+ids.join('.');}
  window.v8ShareGarden=function(){var fr=isFR();var link=gardenLink();var n=(link.split('hdvg=')[1]||'').split('.').filter(Boolean).length;
    var h='<h2 style="font-family:var(--primary-serif);font-size:1.8rem;margin-bottom:6px;">'+(fr?'Partager mon jardin':'Share my garden')+'</h2>';
    h+='<p style="font-size:.82rem;color:var(--sage-green);margin-bottom:12px;">'+n+(fr?' espece(s) adoptee(s). Ce lien recree la selection a l\'ouverture.':' adopted species. This link restores the selection on open.')+'</p>';
    h+='<input class="v8-share-link" id="v8-sharelink" readonly value="'+esc2(link)+'">';
    h+='<div class="v7-actions-row"><button class="btn-luxe" onclick="window.v8CopyLink()"><i class="fa-solid fa-copy"></i> '+(fr?'Copier le lien':'Copy link')+'</button></div>';
    h+='<div id="v8-qrwrap" style="text-align:center;margin-top:16px;"></div>';
    if(typeof window.openModalHTML==='function')window.openModalHTML(h);
    setTimeout(function(){drawQR(link);},20);
  };
  window.v8CopyLink=function(){var el=$('v8-sharelink');if(!el)return;el.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(el.value).then(function(){toast(isFR()?'Lien copie':'Link copied');},function(){});}else if(ok)toast(isFR()?'Lien copie':'Link copied');};
  function drawQR(link){var wrap=$('v8-qrwrap');if(!wrap)return;var m=qrEncode(link);if(!m){wrap.innerHTML='<p style="font-size:.8rem;font-style:italic;opacity:.75;">'+(isFR()?'Trop de plantes pour un QR code \u2014 utilisez le lien ci-dessus.':'Too many plants for a QR code \u2014 use the link above.')+'</p>';return;}var quiet=4,scale=6,n=m.length,dim=(n+quiet*2)*scale;var cv=document.createElement('canvas');cv.width=dim;cv.height=dim;var ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,dim,dim);ctx.fillStyle='#000';for(var r=0;r<n;r++)for(var c=0;c<n;c++){if(m[r][c])ctx.fillRect((c+quiet)*scale,(r+quiet)*scale,scale,scale);}var holder=ce('div');holder.id='v8-qr';holder.appendChild(cv);wrap.innerHTML='';wrap.appendChild(holder);wrap.appendChild(ce('div','v8-count-note',isFR()?'Scannez pour importer le jardin':'Scan to import the garden'));}
  /* Le lien encode la partie numérique de l'id (cf. gardenLink) : on matche donc par
     extraction numérique et non en reconstruisant 'pNNN' — les vrais ids sont du type
     'p001-achillea-filipendulina', la reconstruction ne correspondait jamais. */
  function importGardenFromHash(){var h=location.hash||'';var mIdx=h.indexOf('hdvg=');if(mIdx<0)return;var raw=h.slice(mIdx+5);var nums={};raw.split('.').forEach(function(x){var n=parseInt(x,10);if(n>0)nums[n]=1;});var matched=getPlants().filter(function(p){var n=parseInt(String(p.id).replace(/[^0-9]/g,''),10);return n>0&&nums[n];});var cnt=matched.length;if(!cnt)return;var msg=isFR()?('Importer '+cnt+' espece(s) partagee(s) dans votre jardin ?'):('Import '+cnt+' shared species into your garden?');if(window.confirm(msg)){matched.forEach(function(p){p.inGarden=true;});try{if(typeof saveData==='function')saveData();}catch(e){}if(typeof window.renderCatalog==='function')window.renderCatalog();toast(isFR()?cnt+' espece(s) importee(s)':cnt+' species imported');}try{history.replaceState(null,'',location.pathname+location.search);}catch(e){location.hash='';}}

  /* ============ GROUPE 6 : Accessibilite & SEO ============ */
  function injectJSONLD(){try{if($('v8-jsonld'))return;if(!getPlants().length)return;/* les donn\u00e9es arrivent apr\u00e8s DOMContentLoaded : r\u00e9essay\u00e9 depuis afterCatalog() */var items=getPlants().slice(0,400).map(function(p,i){return {'@type':'ListItem',position:i+1,name:p.nomFr,alternateName:p.nomLat};});var data={'@context':'https://schema.org','@type':'WebSite',name:"L'Herbier de Vie",inLanguage:'fr-FR',description:'Carnet de botanique premium \u2014 '+items.length+' especes',mainEntity:{'@type':'ItemList',numberOfItems:items.length,itemListElement:items}};var s=document.createElement('script');s.type='application/ld+json';s.id='v8-jsonld';s.textContent=JSON.stringify(data);document.head.appendChild(s);}catch(e){}}
  function setupKeyboard(){
    document.addEventListener('keydown',function(e){
      if(e.key==='Tab')document.body.classList.add('v8-kbd');
      // Échap : géré par le handler unique d'initV6Enhancements() (couvre aussi v7-modal/flashMode/quizOn/dashOn/calOn)
      var fm=(typeof flashMode!=='undefined')&&flashMode;
      if(fm){
        // Ne pas détourner Entrée/Espace quand le focus est sur un élément interactif
        // (sinon le bouton « Fermer » retournait la carte au lieu de fermer).
        if(e.target&&e.target.closest&&e.target.closest('button,a,input,select,textarea'))return;
        if(e.key==='ArrowLeft'&&typeof window.prevFlashcard==='function'){e.preventDefault();window.prevFlashcard();}
        else if(e.key==='ArrowRight'&&typeof window.nextFlashcard==='function'){e.preventDefault();window.nextFlashcard();}
        else if(e.key===' '||e.key==='Enter'){var card=$('currentCard');if(card){e.preventDefault();card.classList.toggle('flipped');}}
      }
    });
    // piege de focus dans la modale
    document.addEventListener('keydown',function(e){if(e.key!=='Tab')return;var modal=$('v7-modal');if(!modal||!modal.classList.contains('open'))return;var f=modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');if(!f.length)return;var first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  }
  // toasts -> aria-live
  (function(){var orig=window.showToast;if(typeof orig==='function'){window.showToast=function(m){liveSay(m);return orig.apply(this,arguments);};}})();

  /* ============ Barre d'outils : boutons v8 ============ */
  function augmentToolbar(){
    var bar=$('v7-toolbar');if(!bar)return;
    // options de tri supplementaires
    var sort=$('v7-sort');if(sort&&!sort.querySelector('option[value="adopt"]')){var fr=isFR();var add=function(v,frl,enl){var o=document.createElement('option');o.value=v;o.textContent=fr?frl:enl;sort.appendChild(o);};add('tox','Toxicite','Toxicity');add('zone','Emplacement','Location');add('adopt','Date d\'adoption','Adoption date');}
    // groupe de boutons v8
    if(!$('v8-tb')){var fr=isFR();var grp=ce('span','v7-tb-group');grp.id='v8-tb';
      var view=ce('button','v8-tb-btn');view.id='v8-viewbtn';view.type='button';var compact=document.body.classList.contains('cat-compact');view.innerHTML=compact?'<i class="fa-solid fa-newspaper"></i> '+(fr?'Vue riche':'Rich view'):'<i class="fa-solid fa-table-cells"></i> '+(fr?'Vue grille':'Grid view');view.classList.toggle('active',compact);view.onclick=window.v8ToggleCompact;
      var wish=ce('button','v8-tb-btn');wish.id='v8-wishbtn';wish.type='button';wish.innerHTML='<i class="fa-solid fa-star"></i> '+(fr?'Souhaits':'Wishlist');wish.classList.toggle('active',!!window._v8WishOnly);wish.onclick=window.v8ToggleWish;
      var views=ce('button','v8-tb-btn');views.type='button';views.innerHTML='<i class="fa-solid fa-bookmark"></i> '+(fr?'Vues':'Views');views.onclick=window.v8Views;
      grp.appendChild(view);grp.appendChild(wish);grp.appendChild(views);
      bar.appendChild(grp);
    }
  }

  /* ============ wrap renderCatalog (post-rendu) ============ */
  (function(){if(typeof window.renderCatalog==='function'){var orig=window.renderCatalog;window.renderCatalog=function(){orig.apply(this,arguments);try{afterCatalog();}catch(e){}};}})();

  /* ============ init ============ */
  function ready(fn){if(document.readyState!=='loading')setTimeout(fn,0);else document.addEventListener('DOMContentLoaded',fn);}
  ready(function(){
    try{if(L('hdv_viewmode','rich')==='compact')document.body.classList.add('cat-compact');}catch(e){}
    injectJSONLD();setupKeyboard();migratePhotosToIDB();
    setTimeout(importGardenFromHash,400);
    setTimeout(function(){try{augmentToolbar();reflectWishlist();}catch(e){}},300);
  });
})();

/* Verrou de defilement fiable pour fenetres plein ecran (molette + tactile incluse) */
(function(){
  var CL=['care-on','quiz-on','cal-on','dash-on','flash-on'];
  var locked=false,y=0;
  function anyOpen(){for(var i=0;i<CL.length;i++){if(document.body.classList.contains(CL[i]))return true;}return false;}
  function lock(){if(locked)return;y=window.scrollY||window.pageYOffset||0;var b=document.body;b.style.position='fixed';b.style.top=(-y)+'px';b.style.left='0';b.style.right='0';b.style.width='100%';locked=true;}
  function unlock(){if(!locked)return;var b=document.body;b.style.position='';b.style.top='';b.style.left='';b.style.right='';b.style.width='';locked=false;window.scrollTo(0,y);}
  try{var mo=new MutationObserver(function(){anyOpen()?lock():unlock();});mo.observe(document.body,{attributes:true,attributeFilter:['class']});}catch(e){}
})();
