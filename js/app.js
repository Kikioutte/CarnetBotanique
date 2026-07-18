// --- DONNÉES BOTANIQUES DE BASE (PREMIUM) ---
// basePlants : déplacé dans plants.json (chargé via fetch dans loadData(), uniquement au premier lancement)

// --- ÉTAT GLOBAL DE L'APPLICATION ---
let plants = [];
let appMode = "learn"; // "learn" = Tous les végétaux, "garden" = Mon Jardin (favoris)
let flashMode = false;
let currentFlashIndex = 0;
let deleteTargetId = null;

// --- ACCÉLÉRATEUR DE DÉFILEMENT (LENIS) ---
// v6 : initialisation protégée. Si le CDN Lenis échoue, on retombe sur un
// objet "no-op" compatible (stop/start/scrollTo/raf) pour que l'application
// continue de fonctionner sans erreur console et avec le scroll natif.
let lenis;
try {
  if (typeof Lenis === 'undefined') throw new Error('Lenis indisponible');
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) throw new Error('Animations reduites demandees');
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    direction: 'vertical',
    gestureDirection: 'vertical',
    smooth: true,
    mouseMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });
} catch (e) {
  // Fallback : scroll natif + API factice pour ne jamais casser les appels existants.
  lenis = {
    _stopped: false,
    raf() {},
    stop() { this._stopped = true; document.documentElement.style.overflow = 'hidden'; },
    start() { this._stopped = false; document.documentElement.style.overflow = ''; },
    scrollTo(target, opts) {
      try {
        const el = (typeof target === 'string') ? document.querySelector(target) : target;
        const y = (el && el.getBoundingClientRect ? el.getBoundingClientRect().top + window.pageYOffset : 0)
                  + ((opts && opts.offset) ? opts.offset : 0);
        window.scrollTo({ top: y, behavior: 'smooth' });
      } catch (_) {}
    }
  };
}

function raf(time) {
  try { lenis.raf(time); } catch (e) {}
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// --- INITIALISATION ---
window.onload = function() {
  // v6 : chaque étape est isolée — une erreur ponctuelle n'interrompt plus tout le démarrage.
  // loadData() est asynchrone (fetch de plants.json au tout premier lancement uniquement) ;
  // tout le reste de l'init attend que les données soient prêtes pour éviter un catalogue vide.
  loadData().catch(function(e){ console.warn('loadData', e); }).then(function() {
    try { migrateToV5(); } catch (e) { console.warn('migrateToV5', e); }
    try { renderCatalog(); } catch (e) { console.warn('renderCatalog', e); }
    try { initHeaderScroll(); } catch (e) { console.warn('initHeaderScroll', e); }
    try { initGSAPAnimations(); } catch (e) { console.warn('initGSAPAnimations', e); }
    try { initV6Enhancements(); } catch (e) { console.warn('initV6Enhancements', e); }
    try { openDetailFromHash(); } catch (e) { console.warn('openDetailFromHash', e); }
  });
};

function initHeaderScroll() {
  const header = document.getElementById('mainHeader');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });
}

// --- CHARGEMENT & PERSISTANCE DES DONNÉES (LOCALSTORAGE) ---
// Les id de plantes sont injectés bruts dans des attributs/chaînes JS onclick (templates de rendu) ;
// on garantit ici qu'ils ne contiennent jamais de quote/chevron, y compris après un import JSON externe.
function _sanitizeId(id) {
  var s = String(id == null ? '' : id);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : ('p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
}

// Retourne toujours une Promise résolue (jamais de rejet non géré) : le catalogue de base
// (plants.json, ~325 Ko) n'est téléchargé qu'au tout premier lancement (localStorage vide) ;
// les visites suivantes relisent directement localStorage, sans aucune requête réseau.
function loadData() {
  function _finish() {
    plants.forEach(function(p) { if (p) p.id = _sanitizeId(p.id); });
    appMode = localStorage.getItem('herbier_appmode') || 'learn';
    updateModeUI();
  }
  try {
    const local = localStorage.getItem('herbier_plants_data_v4');
    if (local) {
      try {
        plants = JSON.parse(local);
        if (!Array.isArray(plants)) throw new Error('format inattendu');
      } catch (corrupt) {
        // Données locales corrompues : repli sur la copie de secours prise avant le
        // dernier import (hdv_prev_plants), sinon on repartira de plants.json.
        console.warn('Données locales corrompues, tentative de restauration', corrupt);
        var prev = null;
        try { prev = JSON.parse(localStorage.getItem('hdv_prev_plants')); } catch (e3) {}
        if (Array.isArray(prev) && prev.length) {
          plants = prev;
          saveData();
          try { showToast('Données restaurées depuis la copie de secours'); } catch (e4) {}
        } else {
          localStorage.removeItem('herbier_plants_data_v4');
          return loadData();
        }
      }
      _finish();
      return Promise.resolve();
    }
    return fetch('plants.json')
      .then(function(r) { return r.json(); })
      .then(function(base) {
        plants = base;
        _finish();
        saveData();
      })
      .catch(function(e) {
        console.warn('Échec du chargement de plants.json', e);
        plants = [];
        _finish();
      });
  } catch(e) {
    plants = [];
    try { _finish(); } catch(e2) {}
    return Promise.resolve();
  }
}

function saveData() {
  try {
    localStorage.setItem('herbier_plants_data_v4', JSON.stringify(plants));
  } catch(e) {
    showToast("Impossible d'enregistrer localement.");
  }
}

function migrateToV5() {
  if (localStorage.getItem('herbier_v5_migrated_r3')) return;
  var SUB={"Plante d'intérieur":[{m:'Terreau universel',p:60},{m:'Perlite',p:30},{m:'Écorces de pin',p:10}],"Plante d'extérieur":[{m:'Terre de jardin',p:50},{m:'Compost',p:30},{m:'Gravier',p:20}],"Plante bulbeuse":[{m:'Terreau pour bulbes',p:60},{m:'Sable grossier',p:40}],"Plante acidophile":[{m:'Terreau acidophile',p:70},{m:'Écorces de pin',p:20},{m:'Sable',p:10}],"Feuillage":[{m:'Terre légère',p:60},{m:'Compost',p:30},{m:'Sable',p:10}]};
  var NTV=[['ROSE','7–10 j'],['TULIPE','7–10 j'],['LISIANTHUS','14–21 j'],['ORCHIDÉE','14–28 j'],['PIVOINE','5–7 j'],['DAHLIA','5–7 j'],['HORTENSIA','5–8 j'],['LYS','10–14 j'],['LIS','10–14 j'],['LILIUM','10–14 j'],['CHRYSANTHÈME','14–21 j'],['GERBERA','7–10 j'],['ALSTROEMERIA','10–14 j'],['ANÉMONE','5–7 j'],['EUCALYPTUS','14–21 j'],['TOURNESOL','7–10 j'],['GLAÏEUL','7–10 j'],['STRELITZIA','14–21 j'],['ANTHURIUM','14–21 j'],['ACHILLÉE','10–14 j'],['AGAPANTHE','10–14 j'],['IRIS','5–7 j']];
  function _tv(p){var n=(p.nomFr||'').toUpperCase();for(var i=0;i<NTV.length;i++){if(n.indexOf(NTV[i][0])>=0)return NTV[i][1];}return '7–10 j';}
  function _xp(b){if(/Plein soleil/.test(b))return 'Plein soleil';if(/Pleine lumière/.test(b))return 'Pleine lumière';if(/Lumière vive.*sans soleil|Lumière forte.*sans soleil/.test(b))return 'Lumière vive, sans soleil direct';if(/Lumière vive/.test(b))return 'Lumière vive';if(/Lumière forte/.test(b))return 'Lumière forte';if(/Lumière modérée/.test(b))return 'Lumière modérée';if(/Lumière faible/.test(b))return 'Lumière faible à modérée';if(/Mi-ombre/.test(b))return 'Mi-ombre';return '';}
  function _ar(b){if(/arrosage très modéré/.test(b))return 'Très modéré — laisser sécher entre arrosages';if(/arrosage modéré hiver/.test(b))return 'Modéré en hiver, copieux en été';if(/arrosage modéré/.test(b))return 'Modéré';if(/arrosage copieux|quotidien|arrosage important/.test(b))return 'Copieux — terre toujours humide';if(/par la soucoupe/.test(b))return 'Par la soucoupe uniquement';if(/laisser sécher.*40.60/.test(b))return 'Modéré — laisser sécher la surface (40–60%)';if(/laisser sécher.*60.80/.test(b))return 'Abondant — sol humide constant (60–80%)';if(/laisser sécher/.test(b))return 'Modéré — laisser sécher entre arrosages';return '';}
  function _tp(b){var m=b.match(/min\.\s*([-\d]+°C)/);if(m)return 'Min. '+m[1];if(/10[-–]15°C/.test(b))return '10–15°C';return '';}
  function _hm(b){var m=b.match(/hygrométrie\s*(≥\s*\d+\s*%|\d+\s*%)/);if(m)return m[1].replace(/\s+/g,'');if(/forte hygrométrie/.test(b))return '≥70%';return '';}
  function _pr(b){var p=[];if(/biseau/.test(b))p.push("Recoupe en biseau (couteau propre, sous l'eau)");else if(/Recouper/.test(b))p.push("Recouper les tiges sous l'eau");if(/brûler|bouillante/.test(b))p.push("Brûler l'extrémité ou immerger 30 sec eau bouillante");if(/Effeuiller/.test(b))p.push("Effeuiller la partie immergée");if(/mucilage|Vase séparé/.test(b))p.push("Vase séparé 24h (purger mucilages)");return p.join('. ')+(p.length?'.':'');}
  function _cn(b){if(/Chambre climatique/.test(b))return "Chambre climatique 2–5°C. Eau propre + conservateur floral.";if(/Chambre froide/.test(b))return "Chambre froide 2–4°C. Renouveler l'eau tous les 2 jours.";if(/Chambre fraîche/.test(b))return "Chambre fraîche 8–12°C. Surveiller le niveau d'eau.";if(/ambiant/.test(b))return "Température ambiante 18–22°C. Loin des courants d'air.";return "Chambre climatique 2–5°C. Eau propre + conservateur floral.";}
  function _ct(b){if(/Chambre climatique/.test(b))return '2–5°C';if(/Chambre froide/.test(b))return '2–4°C';if(/Chambre fraîche/.test(b))return '8–12°C';if(/tropical/.test(b))return '14–18°C';if(/ambiant/.test(b))return '18–22°C';return '2–5°C';}
  function _pc(e){var p=[];if(/éthylène|ethylène/i.test(e))p.push("Éloigner des fruits mûrs (éthylène)");if(/courant/i.test(e))p.push("Éviter courants d'air");if(/Botrytis/i.test(e))p.push("Surveiller le botrytis");return p.join('. ')+(p.length?'.':'');}
  plants = plants.map(function(p) {
    var u={},b=p.besoins||p.description||'',e=p.ennemis||'',t=p.type||'';
    if(!p.toxPets&&p.toxicite&&p.toxicite!=='Non toxique'){u.toxPets='toxic';if(!p.toxDetail)u.toxDetail=p.toxicite;}
    if(!p.exposition&&p.soleil)u.exposition=p.soleil;
    if(!p.arrosage&&p.eau)u.arrosage=p.eau;
    if(!p.prepa&&p.pro_prep)u.prepa=p.pro_prep;
    if(!p.tempIdeale&&p.pro_temp)u.tempIdeale=p.pro_temp;
    if(!p.tenueVase&&p.pro_tenue)u.tenueVase=p.pro_tenue;
    if(!p.conservation&&p.pro_cons)u.conservation=p.pro_cons;
    if(!p.stockage&&p.pro_stock)u.stockage=p.pro_stock;
    if(!p.precautions&&p.pro_prec)u.precautions=p.pro_prec;
    if(!Array.isArray(p.substrat)||!p.substrat.length){var sd=SUB[t];if(sd)u.substrat=sd;}
    // Les heuristiques texte libre ci-dessous ne doivent jamais écraser une valeur
    // déjà reprise d'un champ legacy fiable (u.X posé plus haut) : on teste u.X aussi.
    if(t==='Fleur coupée'||t==='Feuillage'){
      if(!p.prepa&&!u.prepa){var pr=_pr(b);if(pr)u.prepa=pr;}
      if(!p.conservation&&!u.conservation)u.conservation=_cn(b);
      if(!p.tempIdeale&&!u.tempIdeale)u.tempIdeale=_ct(b);
      if(!p.precautions&&!u.precautions){var pc=_pc(e);if(pc)u.precautions=pc;}
      if(!p.tenueVase&&!u.tenueVase)u.tenueVase=_tv(p);
      if(!p.stockage&&!u.stockage)u.stockage='En boîte ou vase à '+_ct(b)+", à l'abri de la lumière directe.";
    }
    if(t==="Plante d'intérieur"||t==="Plante d'extérieur"||t==="Plante bulbeuse"||t==="Plante acidophile"){
      if(!p.exposition&&!u.exposition){var xp=_xp(b);if(xp)u.exposition=xp;}
      if(!p.arrosage&&!u.arrosage){var ar=_ar(b);if(ar)u.arrosage=ar;}
      if(!p.temperature){var tm=_tp(b);if(tm)u.temperature=tm;}
      if(!p.humidite){var hm=_hm(b);if(hm)u.humidite=hm;}
    }
    if(u.exposition&&!p.soleil)u.soleil=u.exposition;
    if(u.arrosage&&!p.eau)u.eau=u.arrosage;
    return Object.keys(u).length?Object.assign({},p,u):p;
  });
  saveData();
  localStorage.setItem('herbier_v5_migrated_r3','1');
}

// --- RENDU DYNAMIQUE DU SCROLLYTELLING (CATALOGUE) ---

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
// Prédicat UNIQUE « toxique pour les animaux » — badge, tags, tableau de bord, filtres
// (v7) et tri/stats (v8) doivent donner la même réponse pour une même fiche, quels que
// soient les champs présents selon l'origine des données : toxPets (v5), tox_anim
// (legacy booléen) ou toxicite (legacy texte). Déclaration top-level → window.plantIsToxic.
function plantIsToxic(p){
  return !!p && (p.toxPets==='toxic' || !!p.tox_anim || !!(p.toxicite && p.toxicite!=='Non toxique'));
}
const HERO_FALLBACK="https://images.unsplash.com/photo-1545241047-6083a3684587?q=80&w=1200&auto=format&fit=crop";
// Jetons anti-course : #flashPhoto/#quizPhoto/#pdPhoto sont recréés à chaque rendu avec
// le même id ; seule la requête photo la plus récente a le droit d'écrire dedans, sinon
// une réponse lente d'une carte précédente s'affiche sur la carte actuellement visible.
var _photoSeq={flash:0,quiz:0,pd:0};
const imgCache=(function(){try{return JSON.parse(localStorage.getItem('hdv_imgCache')||'{}')||{};}catch(e){return {};}})();
let _imgCacheSaveT=null;
let _imgCacheFirstPending=0;
function setImgCache(term,val){
  imgCache[term]=val;
  // Sauvegarde différée dans localStorage pour éviter de refetcher Wikimedia à chaque visite,
  // avec un délai max de 3s pour ne pas repousser indéfiniment l'écriture en cas de scroll continu.
  var now=Date.now();
  if(!_imgCacheFirstPending) _imgCacheFirstPending=now;
  clearTimeout(_imgCacheSaveT);
  var wait=(now-_imgCacheFirstPending>=3000)?0:500;
  _imgCacheSaveT=setTimeout(function(){
    _imgCacheFirstPending=0;
    // Les échecs (null) restent en mémoire pour la session mais ne sont pas persistés :
    // une panne réseau ponctuelle ne doit pas bloquer définitivement l'image d'une plante.
    try{
      var persist={};
      for(var k in imgCache){ if(imgCache[k]) persist[k]=imgCache[k]; }
      localStorage.setItem('hdv_imgCache',JSON.stringify(persist));
    }catch(e){}
  },wait);
  return val;
}
async function fetchWiki(term){
  if(!term) return null;
  if(term in imgCache) return imgCache[term];
  const apis=['https://fr.wikipedia.org/w/api.php','https://en.wikipedia.org/w/api.php'];
  for(const api of apis){
    try{
      const u=api+'?action=query&titles='+encodeURIComponent(term)+'&prop=pageimages&format=json&pithumbsize=1200&origin=*';
      const r=await fetch(u); const d=await r.json();
      const pages=d.query&&d.query.pages?Object.values(d.query.pages):[];
      const pg=pages.find(x=>x.thumbnail);
      if(pg&&pg.thumbnail){return setImgCache(term,pg.thumbnail.source);}
    }catch(e){}
  }
  try{
    const u='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(term)+'&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*';
    const r=await fetch(u); const d=await r.json();
    const pages=d.query&&d.query.pages?Object.values(d.query.pages):[];
    const ii=pages[0]&&pages[0].imageinfo&&pages[0].imageinfo[0];
    if(ii&&ii.thumburl){return setImgCache(term,ii.thumburl);}
  }catch(e){}
  return setImgCache(term,null);
}
var sectionImgs={};
async function fetchWikiList(term,n){
  if(!term) return [];
  try{
    var u='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(term)+'&gsrnamespace=6&gsrlimit='+(n+5)+'&prop=imageinfo&iiprop=url|mime&iiurlwidth=1200&format=json&origin=*';
    var r=await fetch(u); var d=await r.json();
    var pages=d.query&&d.query.pages?Object.values(d.query.pages):[];
    pages.sort(function(a,b){return (a.index||0)-(b.index||0);});
    var urls=[];
    for(var i=0;i<pages.length;i++){ var ii=pages[i].imageinfo&&pages[i].imageinfo[0]; if(ii&&ii.thumburl&&/(jpe?g|png)/i.test(ii.thumburl)){ if(urls.indexOf(ii.thumburl)<0) urls.push(ii.thumburl); } if(urls.length>=n) break; }
    return urls;
  }catch(e){ return []; }
}
async function loadSectionImage(sec){
  if(sec.dataset.loaded==='1') return; sec.dataset.loaded='1';
  var id=sec.id.replace('section-','');
  var imgs=[];
  // L'image choisie par l'utilisateur (champ "URL Image" / génération IA) est prioritaire
  var pl=plants.find(function(x){return x.id===id;});
  if(pl&&pl.imgUrl) imgs.push(pl.imgUrl);
  var lead=await fetchWiki(sec.dataset.w1); if(lead&&imgs.indexOf(lead)<0) imgs.push(lead);
  var more=await fetchWikiList(sec.dataset.w1,4); more.forEach(function(u){ if(imgs.indexOf(u)<0) imgs.push(u); });
  if(imgs.length<2 && sec.dataset.w2 && sec.dataset.w2!==sec.dataset.w1){
    var l2=await fetchWiki(sec.dataset.w2); if(l2 && imgs.indexOf(l2)<0) imgs.push(l2);
    var m2=await fetchWikiList(sec.dataset.w2,3); m2.forEach(function(u){ if(imgs.indexOf(u)<0) imgs.push(u); });
  }
  imgs=imgs.slice(0,3);
  if(!imgs.length) return;
  sectionImgs[id]={imgs:imgs, idx:0};
  applySectionImg(id);
  var media=document.getElementById('media-'+id);
  if(media && imgs.length>1) media.classList.add('multi');
  var dots=document.getElementById('dots-'+id);
  if(dots && imgs.length>1) dots.innerHTML=imgs.map(function(_,k){return '<span class="dot'+(k===0?' on':'')+'"></span>';}).join('');
}
// Variantes responsive pour les vignettes Wikimedia (URL en /NNNpx-) : le navigateur
// choisit la taille adaptée à la vue (grille compacte ≈ 300px, scrolly ≈ 640px, Retina 1200px).
function wikiSrcset(src){
  if(!/\/\d+px-/.test(src)) return null;
  var widths=[480,800,1200];
  return {
    srcset: widths.map(function(w){ return src.replace(/\/\d+px-/, '/'+w+'px-')+' '+w+'w'; }).join(', '),
    sizes: '(max-width: 768px) 92vw, (max-width: 1024px) 88vw, 640px'
  };
}
function applySectionImg(id){
  var st=sectionImgs[id]; if(!st) return;
  var media=document.getElementById('media-'+id); if(!media) return;
  var img=media.querySelector('.scrolly-img'); var src=st.imgs[st.idx];
  if(img&&src){
    var rs=wikiSrcset(src);
    if(rs){ img.srcset=rs.srcset; img.sizes=rs.sizes; } else { img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
    img.src=src; img.style.cursor='zoom-in'; img.onclick=function(){ openImgZoom(src); };
  }
  var dots=document.getElementById('dots-'+id);
  if(dots){ var ds=dots.querySelectorAll('.dot'); for(var k=0;k<ds.length;k++){ ds[k].classList.toggle('on',k===st.idx); } }
}
// Si la photo choisie échoue (lien mort, hoquet réseau), on tente les autres
// candidats déjà trouvés par Wikimedia avant de retomber sur la photo générique.
function handleSectionImgError(imgEl){
  var sec=imgEl.closest('.scrolly-section'); var id=sec&&sec.id.replace('section-','');
  var st=id&&sectionImgs[id];
  if(st&&st.imgs&&st.idx<st.imgs.length-1){ st.idx++; applySectionImg(id); return; }
  imgEl.removeAttribute('srcset'); imgEl.removeAttribute('sizes'); imgEl.src=HERO_FALLBACK;
}
function sectionImg(id,dir,ev){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  var st=sectionImgs[id]; if(!st) return;
  st.idx=(st.idx+dir+st.imgs.length)%st.imgs.length;
  applySectionImg(id);
}
// Observateur unique, déconnecté avant chaque re-rendu : renderCatalog() remplace le
// innerHTML du catalogue (à chaque frappe de recherche), les observateurs des nœuds
// détachés s'accumuleraient sinon pour toute la durée de vie de la page.
let _lazyIO=null;
function initLazyImages(){
  if(!('IntersectionObserver' in window)){document.querySelectorAll('.scrolly-section').forEach(loadSectionImage);return;}
  if(_lazyIO)_lazyIO.disconnect();
  const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){loadSectionImage(e.target);io.unobserve(e.target);}});},{rootMargin:'150px'});
  _lazyIO=io;
  document.querySelectorAll('.scrolly-section').forEach(s=>io.observe(s));
}

function renderCatalog() {
  const catalog = document.getElementById('plantCatalog');
  const searchVal = document.getElementById('searchInput').value.toLowerCase();
  
  // Filtrage selon mode et recherche
  let filtered = plants.filter(p => {
    let matchSearch = (p.nomFr||'').toLowerCase().includes(searchVal) ||
                        (p.nomLat||'').toLowerCase().includes(searchVal) ||
                        (p.famille||'').toLowerCase().includes(searchVal);
    if (!matchSearch && searchVal && searchVal.length >= 3 && typeof window.__fuzzyMatch === 'function') { try { matchSearch = window.__fuzzyMatch(p, searchVal); } catch(e){} }
    
    var advOk = (typeof window.__advFilter === 'function') ? window.__advFilter(p) : true;
    if (appMode === 'garden') {
      return matchSearch && advOk && p.inGarden === true;
    }
    return matchSearch && advOk;
  });
  if (typeof window.__advSort === 'function') { try { filtered = window.__advSort(filtered); } catch(e){} }
  if (typeof window.__updateResultCount === 'function') { try { window.__updateResultCount(filtered.length); } catch(e){} }
  if (typeof window.__catPage === 'function') { try { filtered = window.__catPage(filtered); } catch(e){} }

  if (filtered.length === 0) {
    catalog.innerHTML = `
      <div style="text-align: center; padding: 120px 20px; background: var(--bg-sand-dark)">
        <i class="fa-solid fa-seedling" style="font-size: 3rem; color: var(--gold); margin-bottom: 20px;"></i>
        <h3 style="font-size: 2rem;">Votre Herbier est préservé</h3>
        <p style="font-family: var(--primary-serif); font-style: italic; max-width: 450px; margin: 10px auto;">
          ${appMode === 'garden' ? "Vous n'avez pas encore adopté de spécimen dans votre jardin privé." : "Aucune espèce correspondante dans nos registres."}
        </p>
      </div>
    `;
    return;
  }

  catalog.innerHTML = filtered.map(p => {
    const inG = p.inGarden === true;
    const isTox = plantIsToxic(p);
    const soins = p.besoins || p.description || '';
    const exposi = p.exposition || p.soleil || '';
    const arrosa = p.arrosage  || p.eau    || '';
    // Bloc pro : noms v5 avec fallback anciens noms
    const fPrepa  = p.prepa      || p.pro_prep  || '';
    const fTempI  = p.tempIdeale || p.pro_temp  || '';
    const fTenue  = p.tenueVase  || p.pro_tenue || '';
    const fCons   = p.conservation||p.pro_cons  || '';
    const fPrec   = p.precautions|| p.pro_prec  || '';
    const hasPro  = fPrepa||fTempI||fTenue||fCons||fPrec;
    const subBar  = mkSubstratBar(p.substrat);
    return `
      <section class="scrolly-section" id="section-${p.id}" data-w1="${esc(p.w1||p.nomLat)}" data-w2="${esc(p.w2||p.nomLat)}">
        <div class="scrolly-grid">
          <div class="scrolly-media" id="media-${p.id}">
            <img alt="${esc(p.nomFr)}" class="scrolly-img" loading="lazy" decoding="async" width="1200" height="900" src="${HERO_FALLBACK}" onerror="handleSectionImgError(this)">
            ${isTox ? `<div class="scrolly-overlay-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(p.toxDetail||p.tox_detail||'Toxique animaux')}</div>` : ''}
            <div class="water-indicator-floating"><i class="fa-solid fa-scissors"></i> ${esc(p.type||'')}</div>
            <div class="media-zoom-cue"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
            <button class="media-nav media-prev" onclick="sectionImg('${p.id}',-1,event)" aria-label="Photo précédente"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="media-nav media-next" onclick="sectionImg('${p.id}',1,event)" aria-label="Photo suivante"><i class="fa-solid fa-chevron-right"></i></button>
            <div class="media-dots" id="dots-${p.id}"></div>
          </div>
          <div class="scrolly-content">
            <span class="plant-family">${esc(p.famille)}</span>
            <div class="plant-name-lat">${esc(p.nomLat)}</div>
            <h2 class="plant-name-fr pd-link" role="link" tabindex="0" title="Ouvrir la fiche complète" onclick="openPlantDetail('${p.id}')" onkeydown="if(event.key==='Enter')openPlantDetail('${p.id}')">${esc(p.nomFr)}</h2>
            ${mkV5Tags(p)}
            <p class="plant-desc" style="margin-top:10px">${esc(soins.substring(0,120))}${soins.length>120?'…':''}</p>
            <div class="pro-details">
              <span class="tech-label" style="color:var(--terracotta)"><i class="fa-solid fa-bug-slash"></i> Sensibilités &amp; Ennemis</span>
              <p style="margin-top:5px;font-size:0.85rem;">${esc(p.ennemis||'')}</p>
            </div>
            ${hasPro ? `
            <div class="pro-fleuriste">
              <span class="tech-label" style="color:var(--gold)"><i class="fa-solid fa-scissors"></i> Fiche Fleuriste</span>
              ${fPrepa ? `<p style="margin-top:5px;font-size:0.82rem;"><strong>Préparation :</strong> ${esc(fPrepa)}</p>` : ''}
              ${fTempI ? `<p style="font-size:0.82rem;"><strong>Température :</strong> ${esc(fTempI)}</p>` : ''}
              ${fTenue ? `<p style="font-size:0.82rem;"><strong>Tenue en vase :</strong> ${esc(fTenue)}</p>` : ''}
              ${fCons  ? `<p style="font-size:0.82rem;"><strong>Conservation :</strong> ${esc(fCons)}</p>` : ''}
              ${fPrec  ? `<p style="font-size:0.82rem;"><strong>Précautions :</strong> ${esc(fPrec)}</p>` : ''}
            </div>` : ''}
            <div class="technical-grid">
              <div class="tech-item"><span class="tech-label">Origine</span><span class="tech-val"><i class="fa-solid fa-location-dot" style="color:var(--gold)"></i> ${esc(p.region||'—')}</span></div>
              ${p.visu1 ? `<div class="tech-item"><span class="tech-label">Reconnaissance</span><span class="tech-val"><i class="fa-solid fa-leaf" style="color:var(--sage-green)"></i> ${esc(p.visu1)}</span></div>` : ''}
              ${p.feuillage ? `<div class="tech-item"><span class="tech-label">Feuillage</span><span class="tech-val">${esc(p.feuillage)}</span></div>` : ''}
              ${p.port ? `<div class="tech-item"><span class="tech-label">Port</span><span class="tech-val">${esc(p.port)}</span></div>` : ''}
              ${p.hauteur ? `<div class="tech-item"><span class="tech-label">Hauteur</span><span class="tech-val">${esc(p.hauteur)}</span></div>` : ''}
              ${p.couleur ? `<div class="tech-item"><span class="tech-label">Couleur</span><span class="tech-val">${esc(p.couleur)}</span></div>` : ''}
              ${p.rusticite ? `<div class="tech-item"><span class="tech-label">Rusticité</span><span class="tech-val">${esc(p.rusticite)}</span></div>` : ''}
              ${p.fl_texte ? `<div class="tech-item"><span class="tech-label">Floraison</span><span class="tech-val">🌸 ${esc(p.fl_texte)}</span></div>` : ''}
              ${exposi ? `<div class="tech-item"><span class="tech-label">☀️ Exposition</span><span class="tech-val">${esc(exposi)}</span></div>` : ''}
              ${arrosa ? `<div class="tech-item"><span class="tech-label">💧 Arrosage</span><span class="tech-val">${esc(arrosa)}</span></div>` : ''}
              ${p.humidite ? `<div class="tech-item"><span class="tech-label">💨 Humidité</span><span class="tech-val">${esc(p.humidite)}</span></div>` : ''}
              ${p.temperature ? `<div class="tech-item"><span class="tech-label">🌡️ Température</span><span class="tech-val">${esc(p.temperature)}</span></div>` : ''}
              ${p.rempotage ? `<div class="tech-item"><span class="tech-label">🪴 Rempotage</span><span class="tech-val">${esc(p.rempotage)}</span></div>` : ''}
              ${p.engrais ? `<div class="tech-item"><span class="tech-label">🌿 Engrais</span><span class="tech-val">${esc(p.engrais)}</span></div>` : ''}
              ${subBar ? `<div class="tech-item" style="grid-column:1/-1"><span class="tech-label">🪨 Substrat conseillé</span>${subBar}</div>` : ''}
            </div>
            ${(typeof window.__enrichChips === 'function') ? window.__enrichChips(p) : ''}
            <div class="plant-actions">
              <button class="btn-luxe ${inG ? 'active' : ''}" onclick="toggleGardenStatus('${p.id}')"><i class="fa-solid fa-heart"></i> ${inG ? 'Adopt&eacute;e' : 'Adopter'}</button>
              <button class="btn-luxe wl-btn" data-wl="${p.id}" onclick="wishToggle('${p.id}',event)" title="Liste de souhaits" aria-label="Ajouter aux souhaits"><i class="fa-regular fa-star"></i></button>
              <button class="btn-luxe" onclick="openPlantDetail('${p.id}')" title="Fiche complète" aria-label="Fiche complète"><i class="fa-solid fa-book-open"></i></button>
              <button class="btn-luxe" onclick="openEditDrawer('${p.id}')"><i class="fa-solid fa-pen-to-square"></i> Modifier</button>
              <button class="btn-luxe cmp-btn" data-cmp="${p.id}" onclick="cmpToggle('${p.id}',event)" title="Comparer" aria-label="Comparer"><i class="fa-solid fa-scale-balanced"></i></button>
              <button class="btn-luxe" onclick="openJournal('${p.id}')" title="Journal &amp; emplacement"><i class="fa-solid fa-book"></i></button>
              <button class="btn-luxe" onclick="sharePlant('${p.id}')" title="Partager / Imprimer la fiche"><i class="fa-solid fa-share-nodes"></i></button>
              <button class="btn-luxe" onclick="triggerDelete('${p.id}')" style="border-color:rgba(195,106,75,0.3);color:var(--terracotta);"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      </section>
    `;
  }).join('');

  initLazyImages();
  // Re-déclencher les animations GSAP suite au nouveau rendu
  setTimeout(() => {
    initGSAPAnimations();
  }, 100);
}

// --- ANIMATIONS DE SCROLLYTELLING GSAP ---
function initGSAPAnimations() {
  // v6 : sortie anticipée si GSAP/ScrollTrigger absents (CDN bloqué) → aucune erreur console.
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  try { gsap.registerPlugin(ScrollTrigger); } catch (e) {}

  // Supprimer les triggers existants pour éviter les doublons lors des re-rendus
  ScrollTrigger.getAll().forEach(t => t.kill());

  // Animation douce sur chaque section au scroll
  const sections = gsap.utils.toArray('.scrolly-section');
  sections.forEach((sec) => {
    const img = sec.querySelector('.scrolly-img');
    const content = sec.querySelector('.scrolly-content');
    
    gsap.fromTo(img, 
      { scale: 1.12, opacity: 0.85 },
      { 
        scale: 1, 
        opacity: 1,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sec,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      }
    );

    gsap.fromTo(content, 
      { y: 60, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: sec,
          start: "top 75%",
          toggleActions: "play none none reverse"
        }
      }
    );
  });
}

// Interactivité de recherche — v6 : "debounce" pour épargner le CPU mobile
// (évite un rendu + reconstruction GSAP complète à chaque frappe).
(function(){
  var _si = document.getElementById('searchInput');
  if (!_si) return;
  var _pc = document.getElementById('plantCatalog');
  var _t = null;
  _si.addEventListener('input', function () {
    if (_pc) _pc.style.opacity = '.55';
    if (_t) clearTimeout(_t);
    _t = setTimeout(function(){
      try { renderCatalog(); } catch(e){}
      if (_pc) _pc.style.opacity = '1';
    }, 180);
  });
})();

// --- APPRENTISSAGE & MODE FLASHCARDS ---
/* ══ SOINS & CONSERVATION — logique ══ */
var careOn=false;
var GLOBAL_CARE_TIPS=[
  "Observer la plante avant d'intervenir",
  "Adapter l'arrosage au substrat, à la saison et à la température",
  "Utiliser du matériel propre",
  "Ne jamais fertiliser une plante affaiblie ou fraîchement rempotée"
];
var careState={version:2,startedAt:'',months:{},legacy:{},adoptedAt:{}};
var careStateLoaded=false;

function normalizeCareText(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
/* Interprète uniquement les indications saisonnières explicites.
   « Planté à l'achat », « acheté en godet », etc. ne sont pas des mois. */
function parseCareMonths(value){
  var text=normalizeCareText(value);
  if(!text || /plante?e?\s+a?\s*l'achat|achete?e?\s*(en|au)?\s*godet|mise\s+en\s+terre|achat|semis|bouture|non\s+concerne|aucun\s+engrais/.test(text)) return [];
  var months=[
    ['janvier|janv|jan',1],['fevrier|fevr|fev',2],['mars',3],
    ['avril|avr',4],['mai',5],['juin',6],['juillet|juil',7],
    ['aout|aou',8],['septembre|sept',9],['octobre|oct',10],
    ['novembre|nov',11],['decembre|dec',12]
  ];
  var matches=[];
  months.forEach(function(m){
    var re=new RegExp('(?:^|[^a-z])('+m[0]+')(?=[^a-z]|$)','ig'), hit;
    while((hit=re.exec(text))){ matches.push({month:m[1],index:hit.index}); if(re.lastIndex===hit.index) re.lastIndex++; }
  });
  matches.sort(function(a,b){return a.index-b.index;});
  var found=matches.map(function(x){return x.month;});
  var seasons=[
    [/printemps/, [3,4,5]], [/ete/, [6,7,8]], [/automne/, [9,10,11]], [/hiver/, [12,1,2]]
  ];
  seasons.forEach(function(s){ if(s[0].test(text)) found=found.concat(s[1]); });
  if(matches.length===2){
    var between=text.slice(matches[0].index,matches[1].index);
    if(/\b(a|au|jusqu|jusqu'a)\b|[-–—]/.test(between)){
      found=[];
      for(var n=matches[0].month;;n=(n%12)+1){
        found.push(n);
        if(n===matches[1].month||found.length>=12) break;
      }
    }
  }
  return found.filter(function(m,i,a){ return a.indexOf(m)===i; }).sort(function(a,b){return a-b;});
}
function careMonthName(month){
  return ['','janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][month]||'';
}
function carePeriod(offset){
  var d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+(offset||0));
  var m=d.getMonth()+1;
  return {key:d.getFullYear()+'-'+String(m).padStart(2,'0'),month:m,year:d.getFullYear(),label:careMonthName(m)+' '+d.getFullYear()};
}
function plantCareKind(p){
  var type=normalizeCareText(p&&p.type), text=normalizeCareText([p&&p.nomFr,p&&p.nomLat,p&&p.famille].join(' '));
  if(type.indexOf('fleur coupee')>=0) return 'cut';
  if(type==='feuillage') return 'foliage-cut';
  if(type.indexOf('acidophile')>=0) return 'acid';
  if(type.indexOf('bulbeuse')>=0) return 'bulb';
  if(/dionaea|nepenthes|drosera|sarracenia|droseracees|nepenthacees/.test(text)) return 'carnivorous';
  if(/orchidacees|phalaenopsis|cymbidium|dendrobium|oncidium|cattleya|vanda|miltonia|odontoglossum|paphiopedilum/.test(text)) return 'orchid';
  if(/cactacees|crassulacees|euphorbia|aloe|sansevier|zamioculcas|aeonium|sedum|kalanchoe|echeveria|crassula/.test(text)) return 'succulent';
  if(type.indexOf('interieur')>=0) return 'indoor';
  if(type.indexOf('exterieur')>=0||type.indexOf('jardin')>=0||type.indexOf('aromatique')>=0) return 'outdoor';
  return 'indoor';
}
function baseCareTaskDefs(p){
  var kind=plantCareKind(p), defs={
    cut:[
      {key:'cut-stem',label:'Recouper les tiges avec un outil propre'},
      {key:'fresh-water',label:'Renouveler l’eau et le conservateur floral'},
      {key:'strip-leaves',label:'Retirer les feuilles immergées et les fleurs fanées'},
      {key:'check-vase',label:'Contrôler le niveau d’eau et éloigner des fruits mûrs'}
    ],
    'foliage-cut':[
      {key:'cut-stem',label:'Recouper les tiges avec un outil propre'},
      {key:'fresh-water',label:'Renouveler l’eau du vase'},
      {key:'clean-foliage',label:'Nettoyer le feuillage et retirer les parties abîmées'},
      {key:'check-vase',label:'Contrôler le niveau d’eau et l’exposition'}
    ],
    indoor:[
      {key:'check-water',label:'Vérifier l’humidité du substrat avant d’arroser'},
      {key:'health-check',label:'Observer feuilles, tiges et parasites'},
      {key:'clean-leaves',label:'Retirer les feuilles fanées et dépoussiérer si nécessaire'},
      {key:'check-light',label:'Contrôler l’exposition et tourner le pot si utile'}
    ],
    orchid:[
      {key:'check-roots',label:'Vérifier les racines et l’humidité du substrat'},
      {key:'drain-pot',label:'Vider toute eau stagnante après l’arrosage'},
      {key:'health-check',label:'Observer feuilles, hampes et parasites'},
      {key:'flower-care',label:'Retirer seulement les parties totalement sèches'}
    ],
    succulent:[
      {key:'check-dryness',label:'Arroser uniquement lorsque le substrat est bien sec'},
      {key:'check-rot',label:'Vérifier l’absence de pourriture au collet'},
      {key:'health-check',label:'Observer cochenilles et autres parasites'},
      {key:'check-light',label:'Contrôler la lumière sans brûlure directe'}
    ],
    carnivorous:[
      {key:'check-water-tray',label:'Maintenir une eau adaptée selon l’espèce'},
      {key:'no-fertilizer',label:'Ne pas ajouter d’engrais au substrat'},
      {key:'remove-traps',label:'Retirer uniquement les pièges totalement noirs'},
      {key:'check-dormancy',label:'Respecter la période de repos de l’espèce'}
    ],
    outdoor:[
      {key:'check-water',label:'Vérifier l’humidité du sol ou du pot'},
      {key:'deadhead',label:'Retirer les fleurs fanées et parties abîmées'},
      {key:'health-check',label:'Observer ravageurs et maladies'},
      {key:'support-mulch',label:'Contrôler paillage, tuteurage et drainage'}
    ],
    bulb:[
      {key:'check-water',label:'Vérifier l’humidité sans détremper le bulbe'},
      {key:'deadhead',label:'Retirer les fleurs fanées sans couper le feuillage vert'},
      {key:'check-rot',label:'Observer le bulbe et le collet pour prévenir la pourriture'},
      {key:'check-dormancy',label:'Respecter le repos après jaunissement du feuillage'}
    ],
    acid:[
      {key:'check-water',label:'Vérifier l’humidité et privilégier une eau peu calcaire'},
      {key:'check-acidity',label:'Contrôler paillage et maintien d’un substrat acide'},
      {key:'deadhead',label:'Retirer les fleurs fanées et parties abîmées'},
      {key:'health-check',label:'Observer chlorose, ravageurs et maladies'}
    ]
  };
  return (defs[kind]||defs.indoor).slice();
}
function seasonalCareTaskDefsForMonth(p, month){
  var tasks=[], repot=String(p&&p.rempotage||'').trim(), fert=String(p&&p.engrais||'').trim();
  if(repot && parseCareMonths(repot).indexOf(Number(month))>=0) tasks.push({key:'repot',label:'Rempotage — '+repot});
  if(fert && parseCareMonths(fert).indexOf(Number(month))>=0) tasks.push({key:'fertilize',label:'Fertilisation — '+fert});
  return tasks;
}
function careTaskDefsForMonth(p, month){
  return baseCareTaskDefs(p).concat(seasonalCareTaskDefsForMonth(p,month));
}
/* Compatibilité et tests : renvoie les libellés comme l'ancienne fonction. */
function careTasksForMonth(p, month){
  return careTaskDefsForMonth(p,month).map(function(t){return t.label;});
}
function loadCareState(){
  if(careStateLoaded) return;
  careStateLoaded=true;
  var raw=null;
  try{ raw=JSON.parse(localStorage.getItem('herbier_care_v1')); }catch(e){}
  if(raw&&raw.version===2&&raw.months&&typeof raw.months==='object'){
    careState=raw;
    if(!careState.legacy) careState.legacy={};
    if(!careState.adoptedAt) careState.adoptedAt={};
    if(!careState.startedAt) careState.startedAt=carePeriod(0).key;
  } else {
    careState={version:2,startedAt:carePeriod(0).key,months:{},legacy:(raw&&typeof raw==='object'?raw:{}),adoptedAt:{}};
    saveCareState();
  }
}
function saveCareState(){
  try{ localStorage.setItem('herbier_care_v1',JSON.stringify(careState)); }catch(e){}
}
function carePlantState(periodKey,id,create){
  if(create&&!careState.months[periodKey]) careState.months[periodKey]={};
  var month=careState.months[periodKey];
  if(!month) return {};
  if(create&&!month[id]) month[id]={};
  return month[id]||{};
}
function migrateLegacyCare(p,defs,periodKey){
  var legacy=careState.legacy&&careState.legacy[p.id];
  if(!legacy) return false;
  var st=carePlantState(periodKey,p.id,true);
  defs.forEach(function(t,i){ if(legacy[i]) st[t.key]=true; });
  delete careState.legacy[p.id];
  return true;
}
function toggleCareTask(id,taskKey,periodKey){
  loadCareState();
  var st=carePlantState(periodKey||carePeriod(0).key,id,true);
  st[taskKey]=!st[taskKey];
  saveCareState();
  renderCare();
}
function careOverdueTaskDefs(p){
  loadCareState();
  var prev=carePeriod(-1);
  // Un mois jamais visité (careState.months[prev.key] absent) est un mois où RIEN
  // n'a été validé : les tâches saisonnières y sont bien en retard. Seules bornes
  // légitimes : avant le début du suivi (startedAt) ou avant l'adoption (adoptedAt).
  if(prev.key<careState.startedAt) return [];
  var adoptedAt=careState.adoptedAt&&careState.adoptedAt[p.id];
  if(adoptedAt&&prev.key<adoptedAt) return [];
  var st=carePlantState(prev.key,p.id,false);
  return seasonalCareTaskDefsForMonth(p,prev.month).filter(function(t){return !st[t.key];});
}
function renderCare(){
  loadCareState();
  var body=document.getElementById('careBody'); if(!body) return;
  var adopted=plants.filter(function(p){return p.inGarden===true;});
  var current=carePeriod(0), html='', migrated=false;
  html+='<div class="care-sec"><h3>Principes essentiels</h3><div class="care-tips">'+
    GLOBAL_CARE_TIPS.map(function(t){return '<div class="care-tip"><i class="fa-solid fa-leaf"></i> '+esc(t)+'</div>';}).join('')+
    '</div></div>';
  html+='<div class="care-sec"><h3>Mes fiches à soigner ('+adopted.length+')</h3>';
  html+='<p class="care-month-context"><i class="fa-solid fa-calendar-days"></i> '+esc(current.label)+' · les validations repartent automatiquement à zéro chaque mois.</p>';
  if(!adopted.length){
    html+='<div class="care-empty">Aucune espèce adoptée pour l\'instant.<br>Passez en <b>Mon Jardin</b> et adoptez des fiches pour suivre leurs soins ici.</div>';
  }else{
    adopted.sort(function(a,b){return a.nomFr.localeCompare(b.nomFr);});
    html+=adopted.map(function(p){
      var defs=careTaskDefsForMonth(p,current.month);
      if(migrateLegacyCare(p,defs,current.key)) migrated=true;
      var st=carePlantState(current.key,p.id,true);
      var done=defs.filter(function(t){return !!st[t.key];}).length;
      var seasonal=defs.slice(baseCareTaskDefs(p).length);
      var overdue=careOverdueTaskDefs(p);
      var tasksHtml=defs.map(function(t){
        var on=!!st[t.key];
        return '<button class="care-task'+(on?' done':'')+'" onclick="toggleCareTask(\''+p.id+'\',\''+t.key+'\',\''+current.key+'\')"><span class="cbx">'+(on?'<i class="fa-solid fa-check"></i>':'')+'</span>'+esc(t.label)+'</button>';
      }).join('');
      return '<div class="care-card" data-care-kind="'+esc(plantCareKind(p))+'">'+
        '<div class="care-h"><span class="care-n">'+esc(p.nomFr)+'</span><span class="care-prog">'+done+'/'+defs.length+'</span></div>'+
        '<div class="care-lat">'+esc(p.nomLat)+' · '+esc(p.famille)+'</div>'+
        '<div class="care-proto"><b>Conseil principal</b> &nbsp;'+esc(p.besoins||p.description||'')+'</div>'+
        (seasonal.length?'<div class="care-seasonal"><i class="fa-solid fa-calendar-check"></i> '+seasonal.length+' tâche(s) saisonnière(s) à faire ce mois-ci</div>':'')+
        (overdue.length?'<div class="care-overdue"><i class="fa-solid fa-clock-rotate-left"></i> <b>En retard :</b> '+esc(overdue.map(function(t){return t.label;}).join(' · '))+'</div>':'')+
        (p.ennemis?'<div class="care-warn"><i class="fa-solid fa-triangle-exclamation"></i> '+esc(p.ennemis)+'</div>':'')+
        '<div class="care-tasks">'+tasksHtml+'</div>'+
      '</div>';
    }).join('');
  }
  html+='</div>';
  body.innerHTML=html;
  if(migrated) saveCareState();
}

function toggleCareMode(){
  var willOpen=!careOn;
  _closeAllPanels();
  if(willOpen){
    careOn=true;
    document.body.classList.add('care-on');
    var b=document.getElementById('careBtn'); if(b) b.classList.add('active');
    var sec=document.getElementById('careSection'); if(sec) sec.style.display='block';
    try{lenis.stop();}catch(e){}
    renderCare();
    trapFocus(sec);
  } else { try{lenis.start();}catch(e){} }
}

/* ══ Accessibilité — piège de focus commun à tous les overlays plein écran ══
   WCAG 2.4.3 : tant qu'un overlay est ouvert, Tab cycle à l'intérieur ; le fond
   passe en aria-hidden ; à la fermeture, le focus revient à l'élément déclencheur. */
var _trapState=null;
function _focusablesIn(el){
  return el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
}
function trapFocus(overlay){
  if(!overlay) return;
  releaseFocusTrap();
  _trapState={overlay:overlay,prev:document.activeElement,hidden:[]};
  Array.prototype.forEach.call(document.body.children,function(el){
    if(el===overlay||el.contains(overlay)||el.tagName==='SCRIPT'||el.tagName==='STYLE')return;
    // Éléments transitoires susceptibles de s'afficher PAR-DESSUS l'overlay piégé
    if(el.id==='toast'||el.id==='imgZoom'||el.id==='v7-modal')return;
    if(el.getAttribute('aria-hidden')==='true')return;
    el.setAttribute('aria-hidden','true');el.setAttribute('data-trap-hidden','1');
    _trapState.hidden.push(el);
  });
  var f=_focusablesIn(overlay);
  if(f.length){ try{f[0].focus();}catch(e){} }
}
function releaseFocusTrap(){
  if(!_trapState)return;
  _trapState.hidden.forEach(function(el){ el.removeAttribute('aria-hidden'); el.removeAttribute('data-trap-hidden'); });
  var prev=_trapState.prev; _trapState=null;
  if(prev&&typeof prev.focus==='function'){ try{prev.focus();}catch(e){} }
}
document.addEventListener('keydown',function(e){
  if(e.key!=='Tab'||!_trapState)return;
  var f=_focusablesIn(_trapState.overlay); if(!f.length)return;
  var first=f[0],last=f[f.length-1],a=document.activeElement;
  if(e.shiftKey&&a===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}
  else if(!_trapState.overlay.contains(a)){e.preventDefault();first.focus();}
});

function _closeAllPanels(){
  releaseFocusTrap();
  flashMode=false; document.body.classList.remove('flash-on'); var _fb=document.getElementById('flashBtn'); if(_fb)_fb.classList.remove('active'); var _fs=document.getElementById('flashcardSection'); if(_fs)_fs.style.display='none';
  quizOn=false; document.body.classList.remove('quiz-on'); var _qb=document.getElementById('quizBtn'); if(_qb)_qb.classList.remove('active'); var _qs=document.getElementById('quizSection'); if(_qs)_qs.style.display='none';
  calOn=false; document.body.classList.remove('cal-on'); var _cb=document.getElementById('calBtn'); if(_cb)_cb.classList.remove('active'); var _cs=document.getElementById('calSection'); if(_cs)_cs.style.display='none';
  dashOn=false; document.body.classList.remove('dash-on'); var _db=document.getElementById('dashBtn'); if(_db)_db.classList.remove('active'); var _ds=document.getElementById('dashSection'); if(_ds)_ds.style.display='none';
  careOn=false; document.body.classList.remove('care-on'); var _ceb=document.getElementById('careBtn'); if(_ceb)_ceb.classList.remove('active'); var _ce=document.getElementById('careSection'); if(_ce)_ce.style.display='none';
}
function toggleFlashMode(){
  const willOpen=!flashMode;
  _closeAllPanels();
  if(willOpen){
    flashMode=true;
    document.body.classList.add('flash-on');
    var b=document.getElementById('flashBtn'); if(b)b.classList.add('active');
    var sec=document.getElementById('flashcardSection'); if(sec)sec.style.display='block';
    try{lenis.stop();}catch(e){}
    currentFlashIndex=0; renderFlashcard();
    trapFocus(sec);
  } else { try{lenis.start();}catch(e){} }
}

function renderFlashcard() {
  const container = document.getElementById('flashContainer');
  const list = (typeof window.__flashDeck === 'function' ? window.__flashDeck() : plants);
  if (list.length === 0) { container.innerHTML = `<p style="text-align:center;">Aucune fiche disponible pour révision.</p>`; return; }
  if (currentFlashIndex >= list.length) currentFlashIndex = 0;
  if (currentFlashIndex < 0) currentFlashIndex = list.length - 1;
  const p = list[currentFlashIndex];
  container.innerHTML = `
    <div class="flash-card" id="currentCard" onclick="this.classList.toggle('flipped')">
      <div class="card-face card-front">
        <span class="plant-family" style="font-size:0.8rem;">Devinez l'espèce</span>
        <h2 style="font-size: 3rem; text-align:center; margin: 20px 0;">${esc(p.nomFr)}</h2>
        <p style="font-family: var(--primary-serif); font-style:italic;">Cliquez pour retourner</p>
      </div>
      <div class="card-face card-back">
        <div class="flash-photo" id="flashPhoto"><i class="fa-solid fa-leaf"></i></div>
        <span class="plant-family" style="color: var(--gold);">${esc(p.famille)}</span>
        <h3 style="font-size: 1.5rem; font-style: italic; color: var(--bg-sand); margin:4px 0 8px;">${esc(p.nomLat)}</h3>
        <p style="color: rgba(250,247,242,0.85); text-align:center; margin-bottom:10px; font-size:0.82rem; line-height:1.4;">${esc((p.besoins||p.description||'').substring(0,90))}${(p.besoins||p.description||'').length>90?'…':''}</p>
        <div style="font-size:0.74rem; text-transform:uppercase; letter-spacing:1px; display:flex; flex-direction:column; gap:5px; text-align:center;">
          <div><i class="fa-solid fa-location-dot" style="color:var(--gold);"></i> ${esc(p.region||'')}</div>
          ${p.visu1 ? `<div><i class="fa-solid fa-leaf" style="color:var(--sage-green);"></i> ${esc(p.visu1)}</div>` : ''}
          ${p.fl_texte ? `<div>🌸 ${esc(p.fl_texte)}</div>` : ''}
        </div>
        ${p.mnemonic ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(194,162,106,0.15);border-radius:8px;font-size:0.78rem;font-style:italic;color:var(--gold);text-align:center;max-width:100%;"><i class="fa-solid fa-lightbulb"></i> ${esc(p.mnemonic)}</div>` : ''}
      </div>
    </div>
  `;
  const _fp = p;
  const _seq = ++_photoSeq.flash;
  (_fp.imgUrl?Promise.resolve(_fp.imgUrl):fetchWiki(_fp.w1||_fp.nomLat).then(function(s){return s||fetchWiki(_fp.w2||_fp.nomLat);})).then(function(s){if(_seq!==_photoSeq.flash)return;var el=document.getElementById('flashPhoto');if(el&&s){el.style.backgroundImage='url('+s+')';el.innerHTML='';}});
}

function prevFlashcard() {
  currentFlashIndex--;
  renderFlashcard();
}

function nextFlashcard() {
  currentFlashIndex++;
  renderFlashcard();
}

// --- ACTIONS & ÉDITION DES SPÉCIMENS ---
function toggleMode(){ setMode(appMode==='garden'?'learn':'garden'); }

function updateModeUI() {
  var heroBadge=document.getElementById('heroBadge');
  var heroTitle=document.getElementById('heroTitle');
  var heroText=document.getElementById('heroText');
  document.body.classList.toggle('mode-garden', appMode==='garden');
  document.body.classList.toggle('mode-learn', appMode!=='garden');
  var l=document.getElementById('modeLearn'), g=document.getElementById('modeGarden');
  if(l)l.classList.toggle('on', appMode!=='garden'); if(g)g.classList.toggle('on', appMode==='garden');
  if (appMode==='garden') {
    if(heroBadge)heroBadge.textContent='Votre Domaine Privé';
    if(heroTitle)heroTitle.innerHTML='Mon Jardin <i>personnel</i>';
    if(heroText)heroText.textContent='Les espèces que vous avez adoptées, à cultiver et à suivre.';
  } else {
    if(heroBadge)heroBadge.textContent='Académie Royale de Botanique';
    if(heroTitle)heroTitle.innerHTML='Le carnet botanique <i>vivant</i>';
    if(heroText)heroText.textContent=plants.length
      ?('Découvrez, apprenez et révisez les '+plants.length+' espèces avec élégance.')
      :'Découvrez, apprenez et soignez les plus belles espèces du vivant avec élégance.';
  }
}
function setMode(m){
  if(m==='garden'){ if(typeof quizOn!=='undefined'&&quizOn)toggleQuizMode(); if(typeof flashMode!=='undefined'&&flashMode)toggleFlashMode(); }
  appMode=m; try{localStorage.setItem('herbier_appmode',m);}catch(e){}
  updateModeUI(); renderCatalog();
}


function toggleGardenStatus(id) {
  const p = plants.find(item => item.id === id);
  if (!p) return;
  p.inGarden = !p.inGarden;
  loadCareState();
  if(p.inGarden) careState.adoptedAt[p.id]=carePeriod(0).key;
  else delete careState.adoptedAt[p.id];
  saveCareState();
  saveData();
  showToast(p.inGarden ? `${p.nomFr} ajoutée à votre Jardin` : `${p.nomFr} retirée de votre Jardin`);
  // En mode Jardin la liste filtrée change : re-rendu complet nécessaire.
  // Sinon, mise à jour en place de la section — évite de reconstruire 30 fiches
  // + toutes les animations GSAP (et la perte de position de scroll) pour un clic.
  if (appMode === 'garden') { renderCatalog(); return; }
  const sec = document.getElementById('section-' + id);
  if (!sec) { renderCatalog(); return; }
  const btn = sec.querySelector('.plant-actions .btn-luxe');
  if (btn) {
    btn.classList.toggle('active', p.inGarden);
    btn.innerHTML = '<i class="fa-solid fa-heart"></i> ' + (p.inGarden ? 'Adopt&eacute;e' : 'Adopter');
  }
  const newTags = mkV5Tags(p);
  let tagsEl = sec.querySelector('.v5-tags');
  if (newTags) {
    const tmp = document.createElement('div');
    tmp.innerHTML = newTags;
    if (tagsEl) tagsEl.replaceWith(tmp.firstChild);
    else { const h2 = sec.querySelector('.plant-name-fr'); if (h2) h2.after(tmp.firstChild); }
  } else if (tagsEl) {
    tagsEl.remove();
  }
}

// --- CONCIERGERIE DRAWERS (OUVERTURE/FERMETURE) ---
function openDrawer(type, plantId = null) {
  const drawer = document.getElementById('plantDrawer');
  const title = document.getElementById('drawerTitle');
  drawer.removeAttribute('inert');
  drawer.setAttribute('aria-hidden', 'false');
  document.getElementById('plantForm').reset();
  document.getElementById('formPlantId').value = "";
  var _gkRestore = localStorage.getItem('herbier_gemini_key');
  if (_gkRestore) { var _gkEl = document.getElementById('geminiKeyInput'); if (_gkEl) _gkEl.value = _gkRestore; }
  switchFormTab(0);

  if (type === 'add') {
    title.textContent = "Inscrire un spécimen";
    renderSubstratRows([]);
  }

  drawer.classList.add('open');
  document.body.classList.add('no-scroll');
  try { lenis.stop(); } catch(e) {}
  trapFocus(drawer);
}

function closeDrawer() {
  releaseFocusTrap();
  const drawer = document.getElementById('plantDrawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('inert', '');
  document.body.classList.remove('no-scroll');
  try { lenis.start(); } catch(e) {}
}

window.switchFormTab = function switchFormTab(idx) {
  var panels = document.querySelectorAll('.form-tab-panel');
  var btns = document.querySelectorAll('.form-tab-btn');
  panels.forEach(function(p,i){ p.classList.toggle('active', i===idx); });
  btns.forEach(function(b,i){ b.classList.toggle('active', i===idx); });
};

function _gv(id) { var el = document.getElementById(id); return el ? el.value : ''; }
function _gc(id) { var el = document.getElementById(id); return el ? el.checked : false; }
function _sv(id, v) { var el = document.getElementById(id); if(el) el.value = v||''; }
function _sc(id, v) { var el = document.getElementById(id); if(el) el.checked = !!v; }
// Comme _sv mais pour <select> : si la valeur héritée n'existe pas parmi les <option>,
// on l'ajoute dynamiquement au lieu de la vider — sinon un simple "Modifier + Enregistrer"
// effaçait silencieusement le champ (ex. type "Plante d'extérieur", exposition legacy).
function _svSelect(id, v) {
  var el = document.getElementById(id);
  if (!el) return;
  var has = v && Array.prototype.some.call(el.options, function(o) { return o.value === v; });
  if (v && !has) {
    var o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
    has = true;
  }
  el.value = has ? v : '';
}

// Accessibilité : associe chaque <label class="form-label"> au premier champ de son .form-group
// (au lieu de compter sur le seul ordre visuel) afin qu'un clic/lecteur d'écran cible le bon champ.
(function _autoLabelFor() {
  document.querySelectorAll('#plantForm .form-group').forEach(function(g) {
    var label = g.querySelector('label.form-label');
    var ctrl = g.querySelector('input, select, textarea');
    if (label && ctrl && ctrl.id) label.setAttribute('for', ctrl.id);
  });
})();

// ── Couleurs palette substrat (identiques v5) ──
var SUBSTRAT_COLORS = ['#6b4f3a','#8a9a5b','#c9a66b','#5e7e8b','#9b7653','#a8c686','#7d6b8a'];

// Construit la barre visuelle substrat depuis un tableau [{m,p}]
function mkSubstratBar(substrat) {
  var list = Array.isArray(substrat) ? substrat.filter(function(s){return s&&s.m;}) : [];
  if (!list.length) return '';
  var total = list.reduce(function(s,x){return s+(Number(x.p)||0);},0)||1;
  var bar='',leg='';
  list.forEach(function(s,i){
    var col = SUBSTRAT_COLORS[i % SUBSTRAT_COLORS.length];
    var pct = Math.round((Number(s.p)||0)/total*100);
    bar += '<div style="width:'+pct+'%;height:100%;flex-shrink:0;background:'+col+'" title="'+esc(s.m)+' '+pct+'%"></div>';
    leg += '<span><em style="background:'+col+'"></em>'+pct+'% '+esc(s.m)+'</span>';
  });
  return '<div class="substrat-bar">'+bar+'</div><div class="substrat-legend">'+leg+'</div>';
}

// Tags d'alerte v5 (toxicité animaux, invasif) intégrés au design luxe
function mkV5Tags(p) {
  var tags = [];
  if (p.toxPets === 'safe') tags.push('<span class="v5-tag tag-safe">🐾 Sans danger animaux</span>');
  else if (plantIsToxic(p)) tags.push('<span class="v5-tag tag-tox">☠️ Toxique animaux</span>');
  if (p.invasive) tags.push('<span class="v5-tag tag-inv">⚠️ Invasive / Épillets</span>');
  if (p.inGarden) tags.push('<span class="v5-tag tag-garden">🌱 Au jardin</span>');
  return tags.length ? '<div class="v5-tags">'+tags.join('')+'</div>' : '';
}

// Éditeur substrat — ajout d'une ligne {m, p}
window.addSubstratRow = function(mat, pct) {
  var ed = document.getElementById('subEditor'); if (!ed) return;
  var idx = ed.querySelectorAll('.sub-row').length;
  var col = SUBSTRAT_COLORS[idx % SUBSTRAT_COLORS.length];
  var row = document.createElement('div'); row.className = 'sub-row';
  row.innerHTML = '<input type="text" class="form-control sub-m" placeholder="ex: Terreau, Perlite…" value="'+esc(mat||'')+'">'
    +'<input type="number" class="form-control sub-p" min="0" max="100" placeholder="%" value="'+(pct||'')+'" style="border-left:3px solid '+col+'">'
    +'<button type="button" class="btn-luxe" onclick="removeSubstratRow(this)" style="padding:8px 10px;"><i class="fa-solid fa-xmark"></i></button>';
  row.querySelector('.sub-m').addEventListener('input', updateSubstratPreview);
  row.querySelector('.sub-p').addEventListener('input', updateSubstratPreview);
  ed.appendChild(row);
  updateSubstratPreview();
};
window.removeSubstratRow = function(btn) {
  var row = btn.closest('.sub-row'); if (row) row.remove();
  updateSubstratPreview();
};
function updateSubstratPreview() {
  var prev = document.getElementById('subPreview'); if (!prev) return;
  prev.innerHTML = mkSubstratBar(readSubstratRows());
}
function readSubstratRows() {
  var ed = document.getElementById('subEditor'); if (!ed) return [];
  return Array.from(ed.querySelectorAll('.sub-row')).map(function(r){
    return {m: (r.querySelector('.sub-m')||{}).value||'', p: (r.querySelector('.sub-p')||{}).value||0};
  }).filter(function(s){return s.m;});
}
function renderSubstratRows(substrat) {
  var ed = document.getElementById('subEditor'); if (!ed) return;
  ed.innerHTML = '';
  var list = Array.isArray(substrat) ? substrat : [];
  list.filter(function(s){return s&&s.m;}).forEach(function(s){ addSubstratRow(s.m, s.p); });
  updateSubstratPreview();
}

// ── Autofill Wikipedia / Wikidata ──────────────────────────────────────────────

var _wikiSuggestTimer = null;

function setAutoFillStatus(msg, cls) {
  var el = document.getElementById('autoFillStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'autofill-status' + (cls ? ' ' + cls : '');
}

function closeWikiDropdown() {
  var dd = document.getElementById('autoFillDropdown');
  if (dd) { dd.style.display = 'none'; dd.innerHTML = ''; }
}

function wikiSuggest(val) {
  clearTimeout(_wikiSuggestTimer);
  if (!val || val.length < 2) { closeWikiDropdown(); return; }
  _wikiSuggestTimer = setTimeout(function() {
    fetch('https://fr.wikipedia.org/w/api.php?action=opensearch&search=' +
      encodeURIComponent(val) + '&limit=6&namespace=0&format=json&origin=*')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var titles = d[1] || [], descs = d[2] || [];
        var dd = document.getElementById('autoFillDropdown');
        if (!dd || !titles.length) { closeWikiDropdown(); return; }
        dd.innerHTML = titles.map(function(t, i) {
          return '<div class="autofill-opt" tabindex="-1" data-title="' + esc(t) + '">' + esc(t) +
            (descs[i] ? '<small>' + esc(descs[i].substring(0, 80)) + (descs[i].length > 80 ? '…' : '') + '</small>' : '') +
            '</div>';
        }).join('');
        dd.style.display = 'block';
        if (!dd.dataset.delegated) {
          dd.dataset.delegated = '1';
          dd.addEventListener('click', function(e) {
            var opt = e.target.closest('.autofill-opt');
            if (opt) wikiPickSuggestion(opt.dataset.title);
          });
        }
      })
      .catch(function() { closeWikiDropdown(); });
  }, 280);
}

function wikiPickSuggestion(title) {
  var inp = document.getElementById('autoFillInput');
  if (inp) inp.value = title;
  closeWikiDropdown();
  autoFillFromWiki(title);
}

function wikiSuggestKey(e) {
  var dd = document.getElementById('autoFillDropdown');
  if (!dd || dd.style.display === 'none') {
    if (e.key === 'Enter') { e.preventDefault(); autoFillFromWiki(); }
    return;
  }
  var opts = dd.querySelectorAll('.autofill-opt');
  var focused = dd.querySelector('.autofill-opt.focused');
  var idx = focused ? Array.from(opts).indexOf(focused) : -1;
  if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, opts.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); }
  else if (e.key === 'Enter') { e.preventDefault(); if (focused) focused.click(); else autoFillFromWiki(); return; }
  else if (e.key === 'Escape') { closeWikiDropdown(); return; }
  opts.forEach(function(o) { o.classList.remove('focused'); });
  if (opts[idx]) opts[idx].classList.add('focused');
}

function _cleanWiki(txt) {
  if (!txt) return '';
  return txt
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'''?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _wikiField(wikitext, keys) {
  for (var i = 0; i < keys.length; i++) {
    var re = new RegExp('\\|\\s*' + keys[i] + '\\s*=\\s*([^|}\n\\[]+(?:\\[[^\\]]*\\][^|}\n]*)*)', 'i');
    var m = wikitext.match(re);
    if (m && m[1].trim()) return _cleanWiki(m[1]);
  }
  return '';
}

/* Applique la réponse JSON de l'IA au formulaire d'ajout/édition.
   Règles : ne remplit QUE les champs encore vides (les données Wikipédia/Wikidata,
   plus factuelles, restent prioritaires) ; les <select> n'acceptent que leurs valeurs
   légales (correspondance tolérante casse/inclusion) ; la case « invasive » n'est
   cochée que sur un booléen explicite. Retourne la liste des libellés remplis. */
function applyAIEnrichment(g) {
  if (!g || typeof g !== 'object') return [];
  var filled = [];
  function txt(id, val, label) {
    if (val == null || val === '') return;
    var el = document.getElementById(id);
    if (!el || String(el.value || '').trim()) return;
    el.value = String(val);
    filled.push(label);
  }
  function sel(id, val, label) {
    if (!val) return;
    var el = document.getElementById(id);
    if (!el || el.value) return;
    var v = String(val).trim().toLowerCase();
    var opts = Array.prototype.filter.call(el.options, function (o) { return o.value; });
    var hit = opts.find(function (o) { return o.value.toLowerCase() === v; })
           || opts.find(function (o) { return v.indexOf(o.value.toLowerCase()) >= 0 || o.value.toLowerCase().indexOf(v) >= 0; });
    if (hit) { el.value = hit.value; filled.push(label); }
  }
  txt('formFamille',     g.famille,     'Famille');
  sel('formType',        g.type,        'Catégorie');
  txt('formRegion',      g.region,      'Région');
  txt('formBesoins',     g.besoins,     'Besoins');
  txt('formEnnemis',     g.ennemis,     'Ennemis');
  sel('formFeuillage',   g.feuillage,   'Feuillage');
  sel('formPort',        g.port,        'Port');
  txt('formHauteur',     g.hauteur,     'Hauteur');
  txt('formCouleur',     g.couleur,     'Couleur');
  txt('formRusticite',   g.rusticite,   'Rusticité');
  txt('formFlTexte',     g.flTexte || g.fl_texte, 'Floraison');
  sel('formToxPets',     g.toxPets,     'Toxicité animaux');
  txt('formToxDetail',   g.toxDetail,   'Détail toxicité');
  if (g.invasive === true && !_gc('formInvasive')) { _sc('formInvasive', true); filled.push('Invasif'); }
  txt('formVisu1',       g.visu1,       'Fleurs');
  txt('formVisu2',       g.visu2,       'Feuilles');
  txt('formMnemonic',    g.mnemonic,    'Mnémo');
  sel('formExposition',  g.exposition,  'Exposition');
  sel('formArrosage',    g.arrosage,    'Arrosage');
  txt('formHumidite',    g.humidite,    'Humidité');
  txt('formTemperature', g.temperature, 'Température');
  txt('formRempotage',   g.rempotage,   'Rempotage');
  txt('formEngrais',     g.engrais,     'Engrais');
  txt('formPrincipes',   g.principes,   'Principes actifs');
  txt('formPrepa',       g.prepa,       'Prépa');
  txt('formTempIdeale',  g.tempIdeale,  'Temp. idéale');
  txt('formTenueVase',   g.tenueVase,   'Tenue vase');
  txt('formConservation',g.conservation,'Conservation');
  txt('formStockage',    g.stockage,    'Stockage');
  txt('formPrecautions', g.precautions, 'Précautions');
  if (Array.isArray(g.substrat) && g.substrat.length && !readSubstratRows().length) {
    var subOk = g.substrat.filter(function (s) { return s && s.m; });
    if (subOk.length) { renderSubstratRows(subOk); filled.push('Substrat'); }
  }
  return filled;
}

async function autoFillFromWiki(forcedTitle) {
  var term = forcedTitle || (document.getElementById('autoFillInput') || {}).value || '';
  term = term.trim();
  if (!term) { setAutoFillStatus('Entrez un nom de plante', ''); return; }
  closeWikiDropdown();
  setAutoFillStatus('🔍 Recherche Wikipedia…', '');

  // Fetch avec timeout 8s — évite le gel sur iOS Safari
  function _ft(url, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function() { ctrl.abort(); }, 10000);
    return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})).finally(function() { clearTimeout(t); });
  }

  try {
    // 1. Résoudre le titre Wikipedia
    var srRes = await _ft('https://fr.wikipedia.org/w/api.php?action=opensearch&search=' +
      encodeURIComponent(term) + '&limit=1&namespace=0&format=json&origin=*');
    var srData = await srRes.json();
    var title = (srData[1] && srData[1][0]) || term;

    setAutoFillStatus('📖 Lecture Wikipedia…', '');

    // 2. Résumé + wikitext + pageprops en PARALLÈLE
    var wikiBase = 'https://fr.wikipedia.org/w/api.php';
    var results = await Promise.allSettled([
      _ft('https://fr.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title)).then(function(r){return r.json();}),
      _ft(wikiBase + '?action=parse&page=' + encodeURIComponent(title) + '&prop=wikitext&format=json&origin=*').then(function(r){return r.json();}),
      _ft(wikiBase + '?action=query&titles=' + encodeURIComponent(title) + '&prop=pageprops|categories&cllimit=50&format=json&origin=*').then(function(r){return r.json();})
    ]);
    var sum      = results[0].status === 'fulfilled' ? results[0].value : {};
    var parseData= results[1].status === 'fulfilled' ? results[1].value : {};
    var propData = results[2].status === 'fulfilled' ? results[2].value : {};
    var wikitext = (parseData.parse && parseData.parse.wikitext && parseData.parse.wikitext['*']) || '';
    var pages    = propData.query && propData.query.pages;
    var _pageObj = pages && pages[Object.keys(pages)[0]];
    var wdId     = _pageObj && _pageObj.pageprops && _pageObj.pageprops.wikibase_item;
    var cats     = (_pageObj && _pageObj.categories)
                   ? _pageObj.categories.map(function(c){ return c.title || ''; })
                   : [];

    // 3. Wikidata : appels API ciblés (évite les gros JSON ~5 Mo qui gèlent iOS)
    var wdNomLat = '', wdFamille = '', wdRegion = '';
    var WD = 'https://www.wikidata.org/w/api.php';

    // Récupère uniquement les claims d'une entité (pas labels/sitelinks)
    function _wdClaims(id) {
      return _ft(WD + '?action=wbgetentities&ids=' + encodeURIComponent(id) +
        '&props=claims&format=json&origin=*')
        .then(function(r){return r.json();})
        .then(function(j){return (j.entities && j.entities[id] && j.entities[id].claims) || null;})
        .catch(function(){return null;});
    }
    // Récupère uniquement le label fr/en d'une entité
    function _wdLabel(id) {
      return _ft(WD + '?action=wbgetentities&ids=' + encodeURIComponent(id) +
        '&props=labels&languages=fr%7Cen&format=json&origin=*')
        .then(function(r){return r.json();})
        .then(function(j){
          var e = j.entities && j.entities[id];
          return (e && e.labels && ((e.labels.fr && e.labels.fr.value) || (e.labels.en && e.labels.en.value))) || '';
        }).catch(function(){return '';});
    }

    if (wdId) {
      setAutoFillStatus('🧬 Lecture Wikidata…', '');
      try {
        var cl = await _wdClaims(wdId);
        if (cl) {
          // P225 = nom scientifique
          if (cl.P225 && cl.P225[0]) wdNomLat = cl.P225[0].mainsnak.datavalue.value || '';

          // P183 (région) + P171 (taxon parent) en PARALLÈLE — labels uniquement
          var regionProm = Promise.resolve('');
          var familleProm = Promise.resolve('');

          if (cl.P183 && cl.P183[0] && cl.P183[0].mainsnak.datavalue.value) {
            var regId = cl.P183[0].mainsnak.datavalue.value.id;
            if (regId) regionProm = _wdLabel(regId);
          }

          if (cl.P171 && cl.P171[0] && cl.P171[0].mainsnak.datavalue.value) {
            var parentId = cl.P171[0].mainsnak.datavalue.value.id;
            if (parentId) familleProm = _wdClaims(parentId).then(function(pCl) {
              if (!pCl) return '';
              var isFamily = pCl.P105 && pCl.P105[0] &&
                pCl.P105[0].mainsnak.datavalue.value.id === 'Q35409';
              if (isFamily) return _wdLabel(parentId);
              // Monter d'un niveau (genre → famille)
              if (pCl.P171 && pCl.P171[0] && pCl.P171[0].mainsnak.datavalue.value) {
                var gpId = pCl.P171[0].mainsnak.datavalue.value.id;
                return _wdClaims(gpId).then(function(gpCl) {
                  if (!gpCl) return '';
                  var gpIsFamily = gpCl.P105 && gpCl.P105[0] &&
                    gpCl.P105[0].mainsnak.datavalue.value.id === 'Q35409';
                  return gpIsFamily ? _wdLabel(gpId) : '';
                });
              }
              return '';
            });
          }

          var wdSubs = await Promise.all([regionProm, familleProm]);
          wdRegion  = wdSubs[0];
          wdFamille = wdSubs[1];
        }
      } catch(e) { /* Wikidata optionnel — on continue sans */ }
    }

    // 4. Extraire tous les champs depuis l'infobox wikitext
    var itFamille    = _wikiField(wikitext, ['famille','Famille','family','taxon_famille']);
    var itRegion     = _wikiField(wikitext, ['aire_de_répartition','répartition','native_range','origine','distribution']);
    var itToxicite   = _wikiField(wikitext, ['toxicité','toxicite','toxicity','toxic']);
    var itSoleil     = _wikiField(wikitext, ['exposition','ensoleillement','soleil','lumière']);
    var itEau        = _wikiField(wikitext, ['arrosage','eau','water','irrigation']);
    var itHauteur    = _wikiField(wikitext, ['taille','hauteur','height','taille_maximum','taille_adulte']);
    var itCouleur    = _wikiField(wikitext, ['couleur_fleurs','couleur_des_fleurs','flower_color','couleur','color']);
    var itFloraison  = _wikiField(wikitext, ['floraison','époque_de_floraison','flowering_time','période_de_floraison','flowering','saison_floraison']);
    var itRusticite  = _wikiField(wikitext, ['rusticité','zone_usda','hardiness','résistance_au_froid','rusticite','zone']);
    var itHumidite   = _wikiField(wikitext, ['humidité','humidite','humidity','hygrométrie']);
    var itTemperature= _wikiField(wikitext, ['température','temperature','temp_min','température_minimale','temp']);
    var itEnnemis    = _wikiField(wikitext, ['maladies','ravageurs','pests','maladies_et_ravageurs','parasites','nuisibles']);
    var itPrincipes  = _wikiField(wikitext, ['principes_actifs','constituants','composants','active_substances','composés']);
    var itFeuillage  = _wikiField(wikitext, ['feuillage','type_feuillage','leaf_type','feuilles_type','persistance']);
    var itPort       = _wikiField(wikitext, ['port','forme','habit','growth_form','croissance']);
    var itEngrais    = _wikiField(wikitext, ['fertilisation','engrais','fertilizer','nutrition']);
    var itVisu1      = _wikiField(wikitext, ['fleurs','inflorescence','fleur','flower','inflorescence_type']);
    var itVisu2      = _wikiField(wikitext, ['feuilles','feuille','leaf','foliage','limbe']);

    // Helper : mapper du texte libre vers une valeur de <select>
    function _mapSel(text, maps) {
      if (!text) return '';
      var t = text.toLowerCase();
      for (var i = 0; i < maps.length; i++) {
        if (maps[i][0].some(function(k){ return t.indexOf(k) !== -1; }))
          return maps[i][1];
      }
      return '';
    }

    var feuillageVal  = _mapSel(itFeuillage, [
      [['persistant','toujours vert','sempervirent','evergreen'],        'Persistant'],
      [['caduc','décidu','deciduous','feuilles caduques'],               'Caduc'],
      [['semi-persistant','semi-caduc','semi persistant','semi-caduc'],  'Semi-persistant'],
      [['marcescent'],                                                    'Marcescent']
    ]);
    var portVal       = _mapSel(itPort, [
      [['érigé','dressé','upright','vertical','fastigié'],   'Érigé'],
      [['retombant','pendant','weeping','pleureur'],          'Retombant'],
      [['étalé','spreading','horizontal','prostré plat'],    'Étalé'],
      [['rampant','creeping','stolonifère'],                  'Rampant'],
      [['grimpant','climbing','liane','volubile','sarmenteux'],'Grimpant'],
      [['touffu','compact','bushy','buissonnant','dense'],    'Touffu']
    ]);
    var expositionVal = _mapSel(itSoleil, [
      [['plein soleil','plein sol','full sun','très ensoleillé'],  'Plein soleil'],
      [['mi-ombre','mi ombre','partial sun','demi-ombre','demi'],  'Mi-ombre'],
      [['ombre partielle','light shade','légère ombre'],            'Ombre partielle'],
      [['ombre','shade','ombragé'],                                  'Ombre complète']
    ]);
    var arrosageVal   = _mapSel(itEau, [
      [['faible','peu','rare','sécheresse','sec','drought','xérophile'],  'Faible (1x par mois)'],
      [['fréquent','abondant','important','copieux','humide','élevé'],    'Fréquent (2x par semaine)'],
      [['modéré','normal','regular','régulier','moyenne','moyen'],         'Modéré (1x par semaine)']
    ]);
    var toxPetsVal    = (itToxicite && /chat|chien|animal|félin|canin|pet|toxic|poison/i.test(itToxicite)) ? 'toxic' : '';

    // Inférence du type depuis les catégories Wikipedia + famille
    function _inferType(catList, fam) {
      var c = catList.join(' ').toLowerCase();
      var f = (fam || '').toLowerCase();
      if (/cactac|aizoac|crassula|sempervirum|succulent|plante grasse/i.test(f + ' ' + c)) return 'Succulente';
      if (/aromatique|condimentaire|lamiac|labiac|apiac|plante médicinal/i.test(f + ' ' + c)) return 'Herbe aromatique';
      if (/orchidac|orchid/i.test(f)) return "Plante d'intérieur";
      if (/fleur coupée|floriculture|cut flower/i.test(c)) return 'Fleur coupée';
      if (/plante.+intérieur|plante.+appartement|houseplant/i.test(c)) return "Plante d'intérieur";
      if (/\barbre\b|arbuste|ligneux|\bshrub\b|\btree\b/i.test(c)) return 'Arbre / Arbuste';
      if (/plante ornementale|plante de jardin|garden plant/i.test(c)) return 'Plante de jardin';
      if (/feuillage découpé|plante à feuillage/i.test(c)) return 'Feuillage';
      return '';
    }
    var typeVal = _inferType(cats, wdFamille || itFamille);

    // Invasif depuis les catégories Wikipedia
    var invasifVal = cats.some(function(c){ return /invasif|envahissant|invasive/i.test(c); });

    // Rempotage : champ infobox ou snippet textuel
    var itRempotage = _wikiField(wikitext, ['rempotage','repotting','empotage','rempotage_periode','rempotage_fréquence']);
    if (!itRempotage) {
      var _rIdx = wikitext.toLowerCase().indexOf('rempot');
      if (_rIdx !== -1) {
        itRempotage = wikitext.substring(_rIdx, _rIdx + 120)
          .replace(/\[\[|\]\]|\{\{|\}\}|<[^>]+>/g, '').split(/[.\n]/)[0].trim();
      }
    }

    // Substrat inféré par règles botaniques
    function _inferSubstrat(tv, fam, reg) {
      var f = (fam || '').toLowerCase();
      var r = (reg || '').toLowerCase();
      if (tv === 'Succulente' || /cactac|aizoac|crassula/i.test(f))
        return [{m:'Sable grossier',p:40},{m:'Terreau universel',p:30},{m:'Perlite',p:30}];
      if (/orchidac|orchid/i.test(f))
        return [{m:'Écorce de pin',p:70},{m:'Perlite',p:20},{m:'Sphaigne',p:10}];
      if (/polypodia|athyri|aspleniac|ptéridac/i.test(f))
        return [{m:'Terreau universel',p:50},{m:'Humus',p:30},{m:'Perlite',p:20}];
      if (tv === 'Herbe aromatique' && /méditerr|provenc|europe|france|afrique du nord/i.test(r))
        return [{m:'Terreau universel',p:50},{m:'Sable grossier',p:30},{m:'Gravier',p:20}];
      if (tv === 'Herbe aromatique')
        return [{m:'Terreau universel',p:60},{m:'Perlite',p:25},{m:'Humus',p:15}];
      if (tv === 'Arbre / Arbuste')
        return [{m:'Terreau universel',p:60},{m:'Compost',p:25},{m:'Sable grossier',p:15}];
      if (tv === "Plante d'intérieur")
        return [{m:'Terreau universel',p:60},{m:'Perlite',p:25},{m:'Humus',p:15}];
      if (tv === 'Plante de jardin')
        return [{m:'Terreau universel',p:65},{m:'Compost',p:25},{m:'Sable grossier',p:10}];
      return [];
    }
    var substratInfere = _inferSubstrat(typeVal, wdFamille || itFamille, wdRegion || itRegion);

    // 5. Remplir le formulaire
    var filled = [];

    var nomFr = _cleanWiki((sum.title || title) + '').toUpperCase();
    if (nomFr) { _sv('formNomFr', nomFr); filled.push('Nom'); }

    var nomLat = wdNomLat || _wikiField(wikitext, ['taxon','nom scientifique','espèce','binomial']);
    if (nomLat) { _sv('formNomLat', nomLat); filled.push('Nom latin'); }

    var famille = wdFamille || itFamille;
    if (famille) { _sv('formFamille', famille); filled.push('Famille'); }

    var region = wdRegion || itRegion;
    if (region) { _sv('formRegion', region); filled.push('Région'); }

    // Onglet Général
    var desc = sum.extract ? sum.extract.split('\n').filter(function(l){return l.trim().length > 20;})[0] || '' : '';
    if (desc) { _sv('formBesoins', desc.substring(0, 400)); filled.push('Description'); }
    if (itEnnemis)  { _sv('formEnnemis', itEnnemis); filled.push('Ennemis'); }

    // Onglet Botanique
    if (feuillageVal)  { _sv('formFeuillage', feuillageVal); filled.push('Feuillage'); }
    if (portVal)       { _sv('formPort', portVal); filled.push('Port'); }
    if (itHauteur)     { _sv('formHauteur', itHauteur); filled.push('Hauteur'); }
    if (itCouleur)     { _sv('formCouleur', itCouleur); filled.push('Couleur'); }
    if (itRusticite)   { _sv('formRusticite', itRusticite); filled.push('Rusticité'); }
    if (itFloraison)   { _sv('formFlTexte', itFloraison); filled.push('Floraison'); }
    if (toxPetsVal)    { _sv('formToxPets', toxPetsVal); filled.push('Toxicité animaux'); }
    if (itToxicite)    { _sv('formToxDetail', itToxicite); filled.push('Toxicité'); }
    if (itVisu1) { _sv('formVisu1', itVisu1); filled.push('Fleurs'); }
    if (itVisu2) { _sv('formVisu2', itVisu2); filled.push('Feuilles'); }
    if (itPrincipes)   { _sv('formPrincipes', itPrincipes); filled.push('Principes actifs'); }

    // Onglet Culture
    if (expositionVal) { _sv('formExposition', expositionVal); filled.push('Exposition'); }
    else if (itSoleil) { _sv('formExposition', itSoleil); filled.push('Exposition'); }
    if (arrosageVal)   { _sv('formArrosage', arrosageVal); filled.push('Arrosage'); }
    else if (itEau)    { _sv('formArrosage', itEau); filled.push('Arrosage'); }
    if (itHumidite)    { _sv('formHumidite', itHumidite); filled.push('Humidité'); }
    if (itTemperature) { _sv('formTemperature', itTemperature); filled.push('Température'); }
    if (itEngrais)     { _sv('formEngrais', itEngrais); filled.push('Engrais'); }

    // Catégorie, invasif, rempotage, substrat inférés
    if (typeVal)     { _sv('formType', typeVal); filled.push('Catégorie'); }
    if (invasifVal)  { _sc('formInvasive', true); filled.push('Invasif'); }
    if (itRempotage) { _sv('formRempotage', itRempotage); filled.push('Rempotage'); }
    if (substratInfere.length) { renderSubstratRows(substratInfere); filled.push('Substrat'); }

    // Image
    var img = sum.thumbnail && sum.thumbnail.source;
    if (img) { _sv('formImgUrl', img.replace(/\/\d+px-/, '/800px-')); filled.push('Image'); }

    if (!filled.length) {
      setAutoFillStatus('⚠️ Plante trouvée mais peu de données disponibles.', '');
    } else {
      setAutoFillStatus('✓ ' + filled.length + ' champs importés : ' + filled.join(', '), 'ok');
    }
    if (typeof switchFormTab === 'function') switchFormTab(0);

    // Enrichissement Gemini Flash si clé disponible.
    // Le prompt couvre TOUS les champs du formulaire (les infobox Wikipédia contiennent
    // rarement les données de culture) ; les menus déroulants reçoivent leurs valeurs
    // exactes pour pouvoir être sélectionnés, et la case « invasive » un booléen.
    // applyAIEnrichment() ne remplit ensuite que ce qui est encore vide.
    var _gKey = localStorage.getItem('herbier_gemini_key');
    if (_gKey) {
      setAutoFillStatus('🤖 Enrichissement IA en cours…', '');
      try {
        var _gPrompt = 'Tu es un expert botaniste et fleuriste professionnel. Voici une plante :\n'
          + '- Nom usuel : ' + _gv('formNomFr') + '\n'
          + '- Nom latin : '  + _gv('formNomLat') + '\n'
          + '- Famille : '    + _gv('formFamille') + '\n'
          + '- Catégorie : '  + _gv('formType') + '\n'
          + '- Région : '     + _gv('formRegion') + '\n'
          + '- Description : '+ _gv('formBesoins').substring(0, 300) + '\n\n'
          + 'Complète sa fiche botanique. Réponds UNIQUEMENT avec un objet JSON valide '
          + '(sans markdown, sans texte avant/après). Renseigne un MAXIMUM de clés — '
          + 'omets uniquement celles dont tu n\'es vraiment pas sûr. Pour les clés à '
          + 'valeurs imposées, recopie EXACTEMENT une des valeurs proposées :\n'
          + '{\n'
          + '"famille":"famille botanique en français (ex: Lamiacées)",\n'
          + '"type":"une valeur parmi : Fleur coupée / Feuillage / Plante d\'intérieur / Plante d\'extérieur / Plante de jardin / Plante bulbeuse / Plante acidophile / Herbe aromatique / Succulente / Arbre \\/ Arbuste / Autre",\n'
          + '"region":"origine géographique",\n'
          + '"besoins":"conseils de soin et conservation en 2-3 phrases",\n'
          + '"ennemis":"maladies et ravageurs principaux",\n'
          + '"feuillage":"une valeur parmi : Persistant / Caduc / Semi-persistant / Marcescent",\n'
          + '"port":"une valeur parmi : Érigé / Retombant / Étalé / Rampant / Grimpant / Touffu",\n'
          + '"hauteur":"ex: 30–60 cm",\n'
          + '"couleur":"couleur(s) dominante(s)",\n'
          + '"rusticite":"ex: Zone 7, -15°C",\n'
          + '"flTexte":"période de floraison, ex: Juin à août",\n'
          + '"toxPets":"safe ou toxic (pour chiens/chats)",\n'
          + '"toxDetail":"précisions toxicité animaux (symptômes, parties toxiques)",\n'
          + '"invasive":false,\n'
          + '"visu1":"reconnaissance visuelle — fleurs/inflorescence",\n'
          + '"visu2":"reconnaissance visuelle — feuilles/port",\n'
          + '"mnemonic":"astuce mnémotechnique courte",\n'
          + '"exposition":"une valeur parmi : Plein soleil / Mi-ombre / Ombre partielle / Ombre complète",\n'
          + '"arrosage":"une valeur parmi : Faible (1x par mois) / Modéré (1x par semaine) / Fréquent (2x par semaine)",\n'
          + '"humidite":"ex: 50–70%",\n'
          + '"temperature":"ex: 15–25°C",\n'
          + '"rempotage":"conseil bref",\n'
          + '"engrais":"ex: NPK équilibré, mars–sept.",\n'
          + '"substrat":[{"m":"matériau en français","p":60}],\n'
          + '"principes":"principes actifs / composés notables",\n'
          + '"prepa":"préparation pro avant mise en vase",\n'
          + '"tempIdeale":"ex: 4–8°C",\n'
          + '"tenueVase":"ex: 7–10 jours",\n'
          + '"conservation":"conseil conservation fleuriste",\n'
          + '"stockage":"conditions stockage idéales",\n'
          + '"precautions":"éthylène, courants d\'air, etc."\n'
          + '}';

        // Essai en cascade sur plusieurs modèles (disponibilité variable selon la clé/région)
        var _gModels = [
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'
        ];
        var _gData = null;
        var _gLastErr = '';
        var _gBody = JSON.stringify({ contents:[{parts:[{text:_gPrompt}]}],
          generationConfig:{temperature:0.2, maxOutputTokens:3000, responseMimeType:'application/json'} });
        for (var _mi = 0; _mi < _gModels.length; _mi++) {
          try {
            var _gRes = await _ft(_gModels[_mi] + '?key=' + encodeURIComponent(_gKey),
              { method:'POST', headers:{'Content-Type':'application/json'}, body: _gBody });
            var _gTry = await _gRes.json();
            if (_gTry.error && /not found|not supported/i.test(_gTry.error.message || '')) {
              _gLastErr = _gTry.error.message; continue; // modèle indisponible → essai suivant
            }
            var _gTryText = _gTry.candidates && _gTry.candidates[0] &&
              _gTry.candidates[0].content && _gTry.candidates[0].content.parts &&
              _gTry.candidates[0].content.parts[0] && _gTry.candidates[0].content.parts[0].text;
            _gData = _gTry; // conserve le meilleur résultat obtenu en cas d'échec total des autres
            if (!_gTry.error && _gTryText) break; // réponse exploitable → on s'arrête là
            if (!_gTry.error) _gLastErr = 'réponse vide (filtrée par Gemini ?)'; // sinon on tente le modèle suivant
          } catch(e3) { _gLastErr = e3.message || 'erreur réseau'; }
        }

        // Erreur API explicite (clé invalide, quota, etc.)
        if (!_gData || _gData.error) {
          var _gApiErr = (_gData && _gData.error && (_gData.error.message || _gData.error.status)) || _gLastErr || 'erreur inconnue';
          console.warn('Gemini API error:', _gApiErr);
          setAutoFillStatus('✓ ' + filled.length + ' champs Wikipedia · IA erreur : ' + _gApiErr, 'ok');
        } else {

        var _gText = (_gData.candidates && _gData.candidates[0] &&
          _gData.candidates[0].content && _gData.candidates[0].content.parts &&
          _gData.candidates[0].content.parts[0] && _gData.candidates[0].content.parts[0].text) || '';
        // Nettoyer les balises markdown que Gemini ajoute parfois
        var _gClean = _gText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        var _gJson = null;
        var _gParseErr = '';
        try { var _gM = _gClean.match(/\{[\s\S]*\}/); if (_gM) _gJson = JSON.parse(_gM[0]); }
        catch(e2) { _gParseErr = e2.message; }
        if (!_gJson) {
          var _dbg = 'début:«' + _gClean.substring(0, 80) + '» fin:«' + _gClean.slice(-80) + '» err:' + _gParseErr;
          console.warn('Gemini parse fail:', _dbg);
          setAutoFillStatus('✓ ' + filled.length + ' champs Wikipedia · IA parse fail — ' + _dbg, 'ok');
        }

        if (_gJson) {
          var _gFilled = applyAIEnrichment(_gJson);
          var _tot = filled.length + _gFilled.length;
          setAutoFillStatus('✓ ' + _tot + ' champs importés (' + filled.length + ' Wikipedia'
            + (_gFilled.length ? ' + ' + _gFilled.length + ' IA' : '') + ')'
            + (_gFilled.length ? ' · IA : ' + _gFilled.join(', ') : ''), 'ok');
        } else {
          // (message déjà affiché dans le bloc de debug ci-dessus)
        }
        } // fin else (!_gData.error)
      } catch(gErr) {
        console.warn('Gemini error', gErr);
        var _gErrMsg = gErr && gErr.name === 'AbortError' ? 'délai dépassé' : 'erreur réseau';
        setAutoFillStatus('✓ ' + filled.length + ' champs Wikipedia · IA indisponible (' + _gErrMsg + ').', 'ok');
      }
    }

  } catch(err) {
    console.warn('autoFill error', err);
    var msg = err && err.name === 'AbortError'
      ? '⏱ Délai dépassé. Vérifiez votre connexion et réessayez.'
      : '❌ Plante introuvable ou erreur réseau. Réessayez.';
    setAutoFillStatus(msg, 'err');
  }
}

// Fermer le dropdown si clic en dehors
document.addEventListener('click', function(e) {
  if (!e.target.closest('.autofill-suggest-wrap')) closeWikiDropdown();
});

function openEditDrawer(id) {
  const p = plants.find(item => item.id === id);
  if (!p) { showToast("Cette fiche n'existe plus."); return; }
  openDrawer('edit');
  {
    document.getElementById('drawerTitle').textContent = `Éditer ${p.nomFr}`;
    document.getElementById('formPlantId').value = p.id;
    _sv('formNomFr', p.nomFr);
    _sv('formNomLat', p.nomLat);
    _sv('formFamille', p.famille);
    _svSelect('formType', p.type);
    _sv('formRegion', p.region);
    _sv('formBesoins', p.besoins || p.description || '');
    _sv('formEnnemis', p.ennemis);
    _svSelect('formFeuillage', p.feuillage);
    _svSelect('formPort', p.port);
    _sv('formHauteur', p.hauteur);
    _sv('formCouleur', p.couleur);
    _sv('formRusticite', p.rusticite);
    _sv('formFlTexte', p.fl_texte);
    _svSelect('formToxPets', p.toxPets || (p.tox_anim ? 'toxic' : ''));
    _sv('formToxDetail', p.tox_detail || p.toxDetail || '');
    _sc('formInvasive', p.invasive);
    _sv('formVisu1', p.visu1);
    _sv('formVisu2', p.visu2);
    _sv('formMnemonic', p.mnemonic);
    _svSelect('formExposition', p.exposition || p.soleil || '');
    _svSelect('formArrosage', p.arrosage || p.eau || '');
    _sv('formHumidite', p.humidite);
    _sv('formTemperature', p.temperature);
    _sv('formRempotage', p.rempotage);
    _sv('formEngrais', p.engrais);
    renderSubstratRows(p.substrat);
    _sv('formImgUrl', p.imgUrl);
    _sv('formPrincipes', p.principes);
    _sv('formPrepa',       p.prepa      || p.pro_prep  || '');
    _sv('formTempIdeale',  p.tempIdeale || p.pro_temp  || '');
    _sv('formTenueVase',   p.tenueVase  || p.pro_tenue || '');
    _sv('formConservation',p.conservation||p.pro_cons  || '');
    _sv('formStockage',    p.stockage   || p.pro_stock || '');
    _sv('formPrecautions', p.precautions|| p.pro_prec  || '');
    switchFormTab(0);
  }
}

// Formulaire Soumission
function handleFormSubmit(e) {
  e.preventDefault();
  const id          = _gv('formPlantId');
  const nomFr       = _gv('formNomFr');
  const nomLat      = _gv('formNomLat');
  const famille     = _gv('formFamille');
  const type        = _gv('formType');
  const region      = _gv('formRegion');
  const besoins     = _gv('formBesoins');
  const ennemis     = _gv('formEnnemis');
  const feuillage   = _gv('formFeuillage');
  const port        = _gv('formPort');
  const hauteur     = _gv('formHauteur');
  const couleur     = _gv('formCouleur');
  const rusticite   = _gv('formRusticite');
  const fl_texte    = _gv('formFlTexte');
  const toxPets     = _gv('formToxPets');           // 'safe' | 'toxic' | ''
  const toxDetail   = _gv('formToxDetail');
  const invasive    = _gc('formInvasive');
  const visu1       = _gv('formVisu1');
  const visu2       = _gv('formVisu2');
  const mnemonic    = _gv('formMnemonic');
  const exposition  = _gv('formExposition');
  const arrosage    = _gv('formArrosage');
  const humidite    = _gv('formHumidite');
  const temperature = _gv('formTemperature');
  const rempotage   = _gv('formRempotage');
  const engrais     = _gv('formEngrais');
  const substrat    = readSubstratRows();            // Array [{m,p}]
  const imgUrl      = _gv('formImgUrl');
  const principes   = _gv('formPrincipes');
  const prepa       = _gv('formPrepa');
  const tempIdeale  = _gv('formTempIdeale');
  const tenueVase   = _gv('formTenueVase');
  const conservation= _gv('formConservation');
  const stockage    = _gv('formStockage');
  const precautions = _gv('formPrecautions');
  // Compat legacy : toxicite string dérivée de toxPets
  const toxicite = toxPets === 'toxic' ? (toxDetail || 'Toxique pour animaux') : 'Non toxique';
  // Compat legacy : soleil/eau = exposition/arrosage
  const soleil = exposition; const eau = arrosage;

  const newFields = { nomFr, nomLat, famille, type, region, besoins, description: besoins, ennemis,
    feuillage, port, hauteur, couleur, rusticite, fl_texte, visu1, visu2,
    toxPets, toxDetail, toxicite, invasive, mnemonic,
    exposition, arrosage, soleil, eau,
    humidite, temperature, rempotage, engrais, substrat, imgUrl, principes,
    prepa, tempIdeale, tenueVase, conservation, stockage, precautions };

  if (id) {
    const index = plants.findIndex(item => item.id === id);
    if (index !== -1) {
      plants[index] = { ...plants[index], ...newFields };
      showToast("Fiche botanique enrichie");
    }
  } else {
    const newPlant = { id: "p_" + Date.now(), ...newFields, inGarden: false };
    plants.push(newPlant);
    showToast("Nouveau spécimen recensé");
  }

  saveData();
  closeDrawer();
  renderCatalog();
}

// --- GÉNÉRATION D'ILLUSTRATION AVEC GEMINI / IMAGEN ---
async function generateAIImage() {
  const nom = document.getElementById('formNomFr').value || document.getElementById('formNomLat').value;
  if (!nom) {
    showToast("Veuillez d'abord saisir un nom de plante.");
    return;
  }

  // Réutilise la clé Gemini de la zone d'auto-remplissage (Imagen nécessite un projet Google facturé)
  const geminiKey = localStorage.getItem('herbier_gemini_key') || '';
  const query = encodeURIComponent(nom);
  const fallbackUrl = `https://loremflickr.com/800/600/${query},botanical,plant`;

  if (!geminiKey) {
    document.getElementById('formImgUrl').value = fallbackUrl;
    showToast("Pas de clé IA configurée : photo suggérée au hasard (voir « Enrichissement IA » ci-dessus).");
    return;
  }

  showToast("L'illustrateur royal dessine votre plante...");

  const promptText = `Professional, premium botanical illustration of ${nom}, oil painting style, natural soft lighting, warm beige canvas texture background, editorial aesthetics, luxury gardening catalog look.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${encodeURIComponent(geminiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: { prompt: promptText },
        parameters: { sampleCount: 1 }
      })
    });

    if (!response.ok) {
      throw new Error("Erreur de l'API Imagen.");
    }

    const result = await response.json();
    const base64Bytes = result.predictions?.[0]?.bytesBase64Encoded;
    if (base64Bytes) {
      const generatedUrl = `data:image/png;base64,${base64Bytes}`;
      document.getElementById('formImgUrl').value = generatedUrl;
      showToast("Illustration IA générée !");
    } else {
      throw new Error("Pas d'image reçue.");
    }
  } catch(e) {
    document.getElementById('formImgUrl').value = fallbackUrl;
    showToast("Génération IA indisponible (Imagen nécessite un compte Google facturé) : photo suggérée au hasard.");
  }
}

// --- SUPPRESSION AVEC DIALOG ET EXPONENTIELLE RETRY ---
var _confirmModalReturnFocus = null;
function triggerDelete(id) {
  deleteTargetId = id;
  _confirmModalReturnFocus = document.activeElement;
  document.getElementById('confirmModal').style.display = 'flex';
  document.body.classList.add('no-scroll');
  try { lenis.stop(); } catch(e) {}
  trapFocus(document.getElementById('confirmModal'));
  var btn = document.getElementById('confirmDeleteBtn');
  if (btn) btn.focus();
}

function closeConfirmModal() {
  releaseFocusTrap();
  document.getElementById('confirmModal').style.display = 'none';
  deleteTargetId = null;
  document.body.classList.remove('no-scroll');
  try { lenis.start(); } catch(e) {}
  if (_confirmModalReturnFocus && typeof _confirmModalReturnFocus.focus === 'function') {
    try { _confirmModalReturnFocus.focus(); } catch(e) {}
  }
  _confirmModalReturnFocus = null;
}

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
  if (!deleteTargetId) return;
  const idx = plants.findIndex(item => item.id === deleteTargetId);
  closeConfirmModal(); // remet deleteTargetId à null : l'index est déjà capturé
  if (idx === -1) return;
  const removed = plants.splice(idx, 1)[0];
  saveData();
  renderCatalog();
  // Suppression annulable : la fiche est restaurable pendant la durée du toast.
  showUndoToast("Spécimen retiré des registres", function () {
    plants.splice(Math.min(idx, plants.length), 0, removed);
    saveData();
    renderCatalog();
    showToast(removed.nomFr + " restaurée dans l'herbier");
  });
});

// --- COMPOSANTS DE NOTIFICATIONS ---
var _toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Toast avec action « Annuler » (utilisé par la suppression de fiche)
function showUndoToast(msg, onUndo) {
  const toast = document.getElementById('toast');
  toast.textContent = '';
  toast.appendChild(document.createTextNode(msg + ' '));
  const btn = document.createElement('button');
  btn.textContent = 'Annuler';
  btn.setAttribute('aria-label', 'Annuler la suppression');
  btn.style.cssText = 'margin-left:12px;background:var(--gold);border:none;color:#1F2D24;font-family:inherit;font-size:inherit;letter-spacing:inherit;text-transform:inherit;padding:4px 14px;border-radius:3px;cursor:pointer;font-weight:600;';
  btn.onclick = function () {
    clearTimeout(_toastTimer);
    toast.classList.remove('show');
    onUndo();
  };
  toast.appendChild(btn);
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 6000);
}

function scrollToCatalog() {
  const catalog = document.getElementById('plantCatalog');
  lenis.scrollTo(catalog, { offset: -90 });
}

/* ══ QUIZ / RÉVISION — logique ══ */
let quizOn=false, quizMode='fr', quizCur=null, quizAnswered=false, quizScore={ok:0,no:0}, lastQuizId=null, quizAsked=0;
function loadQuizScore(){try{const s=JSON.parse(localStorage.getItem('herbier_quiz_v1'));if(s&&typeof s.ok==='number'){quizScore=s;}}catch(e){}updateQuizScore();}
function saveQuizScore(){try{localStorage.setItem('herbier_quiz_v1',JSON.stringify(quizScore));}catch(e){}}
function updateQuizScore(){
  const t=quizScore.ok+quizScore.no;
  const a=document.getElementById('qsOk'),b=document.getElementById('qsNo'),c=document.getElementById('qsPc');
  if(a)a.textContent=quizScore.ok; if(b)b.textContent=quizScore.no;
  if(c)c.textContent=(t?Math.round(quizScore.ok/t*100):0)+'%';
}
function toggleQuizMode(){
  const willOpen=!quizOn;
  _closeAllPanels();
  if(willOpen){
    quizOn=true;
    document.body.classList.add('quiz-on');
    var b=document.getElementById('quizBtn'); if(b)b.classList.add('active');
    var sec=document.getElementById('quizSection'); if(sec)sec.style.display='block';
    try{lenis.stop();}catch(e){}
    var qs=document.getElementById('quizSubtitle'); if(qs&&plants.length)qs.textContent='Testez votre reconnaissance des '+plants.length+' espèces.';
    loadQuizScore(); populateQuizScope(); updateQuizErrBtn(); newQuestion();
    trapFocus(sec);
  } else { try{lenis.start();}catch(e){} }
}
function setQuizMode(m){ quizMode=m; ['fr','fam','lat','photo'].forEach(function(x){var el=document.getElementById('qm-'+x); if(el)el.classList.toggle('on',x===m);}); newQuestion(); }
function _qshuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a;}
function _qsample(a,n){return _qshuffle(a).slice(0,n);}
function newQuestion(){
  quizAnswered=false;
  const card=document.getElementById('quizCard'); if(!card)return;
  const pool=quizPool();
  if(!pool.length){ card.innerHTML='<div class="quiz-eyebrow">Aucune espèce dans cette catégorie.</div>'; return; }
  let p,tries=0; do{ p=pool[Math.floor(Math.random()*pool.length)]; tries++; }while(pool.length>1 && p.id===lastQuizId && tries<30);
  lastQuizId=p.id; quizCur=p; quizAsked++;
  // Les mauvaises réponses doivent venir du même périmètre (pool filtré par catégorie) que la question,
  // sinon le quiz devient trivial par élimination de style plutôt que par connaissance de la catégorie choisie.
  // Repli sur l'ensemble des plantes si le pool filtré est trop petit pour proposer 3 leurres.
  const distractorSrc = pool.length >= 4 ? pool : plants;
  const allNames=Array.from(new Set(distractorSrc.map(x=>x.nomFr)));
  const allLat=Array.from(new Set(distractorSrc.map(x=>x.nomLat)));
  const allFam=Array.from(new Set(distractorSrc.map(x=>x.famille)));
  let correct,pool2,eyebrow,qHTML='',sub='',photo=false;
  if(quizMode==='fam'){ correct=p.famille; pool2=allFam.filter(f=>f&&f!==correct); eyebrow='Quelle famille ?'; qHTML=esc(p.nomFr)+' <i>'+esc(p.nomLat)+'</i>'; }
  else if(quizMode==='lat'){ correct=p.nomLat; pool2=allLat.filter(f=>f&&f!==correct); eyebrow='Quel nom latin ?'; qHTML=esc(p.nomFr); sub=esc(p.famille); }
  else if(quizMode==='photo'){ correct=p.nomFr; pool2=allNames.filter(f=>f&&f!==correct); eyebrow='Quelle espèce ?'; photo=true; }
  else { correct=p.nomFr; pool2=allNames.filter(f=>f&&f!==correct); eyebrow='Quel nom français ?'; qHTML='<i>'+esc(p.nomLat)+'</i>'; sub=esc(p.famille); }
  const opts=_qshuffle([correct].concat(_qsample(pool2,3)));
  let html='<button class="btn-luxe quiz-close" onclick="toggleQuizMode()"><i class="fa-solid fa-xmark"></i> Fermer</button>';
  html+='<div class="quiz-count">Question '+quizAsked+'</div>';
  if(photo){ html+='<div class="quiz-photo" id="quizPhoto"><i class="fa-solid fa-leaf"></i></div>'; }
  html+='<div class="quiz-eyebrow">'+eyebrow+'</div>';
  if(qHTML){ html+='<div class="quiz-q">'+qHTML+'</div>'; }
  if(sub){ html+='<div class="quiz-sub">'+sub+'</div>'; }
  html+='<div class="quiz-opts">'+opts.map(function(o){return '<button class="quiz-opt" onclick="answerQuiz(this)">'+esc(o)+'</button>';}).join('')+'</div>';
  card.innerHTML=html;
  if(photo){ var _qseq=++_photoSeq.quiz; (p.imgUrl?Promise.resolve(p.imgUrl):fetchWiki(p.w1||p.nomLat).then(function(s){return s||fetchWiki(p.w2||p.nomLat);})).then(function(s){if(_qseq!==_photoSeq.quiz)return;var el=document.getElementById('quizPhoto');if(el&&s){el.style.backgroundImage='url('+s+')';el.innerHTML='';el.style.cursor='zoom-in';el.title='Agrandir';el.onclick=function(){openImgZoom(s);};}}); }
}
function answerQuiz(btn){
  if(quizAnswered)return; quizAnswered=true;
  let correct; if(quizMode==='fam')correct=quizCur.famille; else if(quizMode==='lat')correct=quizCur.nomLat; else correct=quizCur.nomFr;
  const chosen=btn.textContent.trim();
  document.querySelectorAll('.quiz-opt').forEach(function(o){ var t=o.textContent.trim(); if(t===correct)o.classList.add('good'); else if(o===btn)o.classList.add('bad'); else o.classList.add('dim'); });
  if(chosen===correct)quizScore.ok++; else quizScore.no++;
  try{ hdvTrackQuizResult(quizCur, chosen===correct); }catch(e){}
  saveQuizScore(); updateQuizScore();
}

/* ══ Erreurs de quiz — alimentent le mode « Réviser mes erreurs » et la répétition
   espacée : une espèce ratée redevient prioritaire dans les flashcards (via le hook
   Leitner installé par extensions-v7.js), une espèce réussie sort de la liste. ══ */
function getQuizErrors(){ try{ var a=JSON.parse(localStorage.getItem('hdv_quiz_errors')); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function hdvTrackQuizResult(p, ok){
  if(!p||!p.id) return;
  var errs=getQuizErrors();
  var i=errs.indexOf(p.id);
  if(i>=0) errs.splice(i,1);
  if(!ok){ errs.unshift(p.id); if(errs.length>50) errs.length=50; }
  try{ localStorage.setItem('hdv_quiz_errors', JSON.stringify(errs)); }catch(e){}
  updateQuizErrBtn();
}
var quizErrOnly=false;
function toggleQuizErrMode(){
  quizErrOnly=!quizErrOnly;
  var b=document.getElementById('quizErrBtn'); if(b)b.classList.toggle('active',quizErrOnly);
  newQuestion();
}
function updateQuizErrBtn(){
  var b=document.getElementById('quizErrBtn'); if(!b) return;
  var n=getQuizErrors().filter(function(id){ return plants.some(function(p){return p.id===id;}); }).length;
  var c=document.getElementById('quizErrCount'); if(c)c.textContent=n;
  b.style.display=n?'inline-flex':'none';
  if(!n&&quizErrOnly){ quizErrOnly=false; b.classList.remove('active'); }
}
function quizPool(){
  var sc=document.getElementById('quizScope'); var v=sc?sc.value:'';
  var base=v?plants.filter(function(p){return p.type===v;}):plants;
  if(quizErrOnly){
    var errs=getQuizErrors();
    var onlyErr=base.filter(function(p){ return errs.indexOf(p.id)>=0; });
    if(onlyErr.length) return onlyErr;
  }
  return base;
}
function populateQuizScope(){ var sc=document.getElementById('quizScope'); if(!sc)return; var types=Array.from(new Set(plants.map(function(p){return p.type;}).filter(Boolean))).sort(); sc.innerHTML='<option value="">Toutes les catégories</option>'+types.map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>';}).join(''); }
function resetQuizScore(){ quizScore={ok:0,no:0}; quizAsked=0; lastQuizId=null; saveQuizScore(); updateQuizScore(); if(typeof renderDash==='function')renderDash(); if(typeof showToast==='function')showToast('Compteurs du quiz réinitialisés'); }
function nextQuiz(){ newQuestion(); }

/* ══ CALENDRIER DES FLORAISONS — logique ══ */
const MONTHS_FR=['','Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const MONTHS_LONG=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
/* Floraisons indicatives par genre (hémisphère nord tempéré) — [début,fin], modifiable */
const GENUS_BLOOM={
 Achillea:[6,9],Agapanthus:[7,8],Allium:[5,6],Alstroemeria:[6,9],Amaranthus:[7,10],Ammi:[6,8],Anemone:[3,5],
 Antirrhinum:[6,9],Aquilegia:[5,6],Aster:[8,10],Astrantia:[6,8],Campanula:[6,8],Carthamus:[7,8],Celosia:[7,10],
 Centaurea:[6,8],Chrysanthemum:[9,11],Convallaria:[5,5],Cosmos:[7,10],Dahlia:[7,10],Delphinium:[6,8],Dianthus:[5,9],
 Echinops:[7,8],Eryngium:[6,9],Eustoma:[6,9],Freesia:[3,5],Gerbera:[5,10],Gladiolus:[7,9],Gomphrena:[7,10],
 Gypsophila:[6,8],Helianthus:[7,9],Helleborus:[1,3],Hippeastrum:[12,2],Hyacinthus:[3,4],Hydrangea:[6,8],Iris:[5,6],
 Lathyrus:[6,8],Lavandula:[6,8],Liatris:[7,9],Lilium:[6,8],Limonium:[7,9],Lysimachia:[6,8],Matthiola:[4,6],
 Muscari:[3,4],Narcissus:[2,4],Nerine:[9,11],Ornithogalum:[5,6],Paeonia:[5,6],Papaver:[5,6],Phlox:[6,8],
 Primula:[2,4],Prunus:[3,4],Ranunculus:[3,5],Rosa:[5,9],Rudbeckia:[7,9],Scabiosa:[6,9],Scilla:[3,4],Solidago:[8,10],
 Tagetes:[6,10],Tanacetum:[6,8],Trachelium:[7,9],Tulipa:[3,5],Veronica:[6,8],Viburnum:[4,5],Zantedeschia:[5,7],
 Zinnia:[7,10],Rhododendron:[4,6],Syringa:[4,5],Forsythia:[3,4],Hyacinthoides:[4,5]
};
let calOn=false, calMonth=0;
function bloomRange(p){
  if(p.mfd&&p.mff) return [p.mfd,p.mff];
  const g=(p.nomLat||'').split(' ')[0];
  return GENUS_BLOOM[g]||null;
}
function bloomsIn(p,m){
  const r=bloomRange(p); if(!r) return false;
  let [a,b]=r;
  if(a<=b) return m>=a&&m<=b;
  return m>=a||m<=b; /* chevauche le nouvel an (ex. déc–févr) */
}
function bloomLabel(p){
  const r=bloomRange(p); if(!r) return '';
  return MONTHS_FR[r[0]]+'–'+MONTHS_FR[r[1]];
}
function toggleCalMode(){
  const willOpen=!calOn;
  _closeAllPanels();
  if(willOpen){
    calOn=true;
    document.body.classList.add('cal-on');
    var b=document.getElementById('calBtn'); if(b)b.classList.add('active');
    var sec=document.getElementById('calSection'); if(sec)sec.style.display='block';
    try{lenis.stop();}catch(e){}
    renderCalGrid(); renderCalList();
    trapFocus(sec);
  } else { try{lenis.start();}catch(e){} }
}
function renderCalGrid(){
  const grid=document.getElementById('calGrid'); if(!grid)return;
  // Une seule passe sur les plantes (bloomRange par plante calculé une fois, pas 12 fois)
  let known=0; const counts=new Array(13).fill(0);
  plants.forEach(p=>{
    const r=bloomRange(p); if(!r) return;
    known++;
    let [a,b]=r;
    for(let m=1;m<=12;m++){ if(a<=b ? (m>=a&&m<=b) : (m>=a||m<=b)) counts[m]++; }
  });
  const note=document.getElementById('calNote');
  if(note) note.innerHTML='Floraisons indicatives — '+known+' espèces renseignées sur '+plants.length+'. <em>Affinez via l\'éditeur de chaque fiche.</em>';
  let html='';
  for(let m=1;m<=12;m++){
    html+='<div class="cal-month'+(calMonth===m?' on':'')+'" onclick="selectCalMonth('+m+')"><div class="cm-n">'+MONTHS_FR[m]+'</div><div class="cm-c">'+counts[m]+'</div></div>';
  }
  grid.innerHTML=html;
}
function selectCalMonth(m){
  calMonth=(calMonth===m?0:m);
  // Pas besoin de recalculer les 12 compteurs : seule la sélection change, on bascule juste la classe active
  var grid=document.getElementById('calGrid');
  if(grid){ Array.from(grid.children).forEach(function(cell,i){ cell.classList.toggle('on', calMonth===(i+1)); }); }
  renderCalList();
}
function renderCalList(){
  const list=document.getElementById('calList'); if(!list)return;
  if(!calMonth){ list.innerHTML='<div class="cal-empty">Sélectionnez un mois pour voir les espèces en floraison.</div>'; return; }
  const items=plants.filter(p=>bloomsIn(p,calMonth)).sort((a,b)=>a.nomFr.localeCompare(b.nomFr));
  if(!items.length){ list.innerHTML='<div class="cal-empty">Aucune floraison renseignée en '+MONTHS_LONG[calMonth]+'.</div>'; return; }
  list.innerHTML=items.map(p=>'<div class="cal-item" onclick="gotoPlant(\''+p.id+'\')"><div><div class="ci-n">'+esc(p.nomFr)+'</div><div class="ci-l">'+esc(p.nomLat)+' · '+esc(p.famille)+'</div></div><div class="ci-r">'+bloomLabel(p)+'</div></div>').join('');
}
function gotoPlant(id){
  if(calOn) toggleCalMode();
  const el=document.getElementById('section-'+id);
  if(el){ try{lenis.scrollTo(el,{offset:-90});}catch(e){ el.scrollIntoView({behavior:'smooth'}); } }
}

/* ══ IMPRESSION A4 — génère 4 fiches/page puis lance l'impression ══ */
function buildPrint(){
  const area=document.getElementById('printArea'); if(!area)return;
  const list=plants.slice();
  let html='';
  for(let i=0;i<list.length;i+=4){
    html+='<div class="pg">';
    for(let j=i;j<i+4;j++){
      if(j<list.length){
        const p=list[j];
        html+='<div class="pcard">'+
          '<div class="pc-h"><span>'+esc(p.nomFr)+'</span><small>'+esc(p.type)+'</small></div>'+
          '<div class="pc-b">'+
          '<div class="pc-row"><b>Identité</b><span><i>'+esc(p.nomLat)+'</i> — '+esc(p.famille)+'</span></div>'+
          '<div class="pc-row"><b>Origine</b><span>'+esc(p.region)+'</span></div>'+
          '<div class="pc-row"><b>Conserv.</b><span>'+esc(p.besoins)+'</span></div>'+
          '<div class="pc-row"><b>Sensib.</b><span>'+esc(p.ennemis)+'</span></div>'+
          '<div class="pc-row"><b>Reconn.</b><span>'+esc(p.visu1)+' ; '+esc(p.visu2)+'</span></div>'+
          '</div></div>';
      } else {
        html+='<div class="pcard empty"></div>';
      }
    }
    html+='</div>';
  }
  area.innerHTML=html;
  window.print();
}

/* ══ TABLEAU DE BORD — logique ══ */
let dashOn=false;
function toggleDashMode(){
  const willOpen=!dashOn;
  _closeAllPanels();
  if(willOpen){
    dashOn=true;
    document.body.classList.add('dash-on');
    var b=document.getElementById('dashBtn'); if(b)b.classList.add('active');
    var sec=document.getElementById('dashSection'); if(sec)sec.style.display='block';
    try{lenis.stop();}catch(e){}
    renderDash();
    trapFocus(sec);
  } else { try{lenis.start();}catch(e){} }
}
function renderDash(){
  const fams=new Set(plants.map(p=>p.famille)); 
  const adopt=plants.filter(p=>p.inGarden===true).length;
  const tox=plants.filter(plantIsToxic).length;
  let qs={ok:0,no:0}; try{const s=JSON.parse(localStorage.getItem('herbier_quiz_v1'));if(s)qs=s;}catch(e){}
  const qt=qs.ok+qs.no, qpc=qt?Math.round(qs.ok/qt*100):0;
  const stats=[
    ['fa-seedling',plants.length,'Espèces'],
    ['fa-sitemap',fams.size,'Familles'],
    ['fa-heart',adopt,'Adoptées'],
    ['fa-triangle-exclamation',tox,'Toxiques'],
    ['fa-trophy',qpc+'%','Maîtrise']
  ];
  const ds=document.getElementById('dashStats');
  if(ds)ds.innerHTML=stats.map(s=>'<div class="dash-stat"><div class="ds-ico"><i class="fa-solid '+s[0]+'"></i></div><div class="ds-num">'+s[1]+'</div><div class="ds-lbl">'+s[2]+'</div></div>').join('');
  // catégories
  const byCat={}; plants.forEach(p=>{const t=p.type||'Autre';byCat[t]=(byCat[t]||0)+1;});
  const cats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]); const max=cats.length?cats[0][1]:1;
  const dc=document.getElementById('dashCats');
  if(dc)dc.innerHTML=cats.map(c=>'<div class="dash-cat"><div class="dc-n">'+esc(c[0])+'</div><div class="dc-bar"><div class="dc-fill" style="width:'+Math.round(c[1]/max*100)+'%"></div></div><div class="dc-c">'+c[1]+'</div></div>').join('');
  // maîtrise
  const dm=document.getElementById('dashMastery');
  if(dm)dm.innerHTML='<div class="dm-txt"><b>'+qs.ok+'</b> réussites · <b>'+qs.no+'</b> manquées sur <b>'+qt+'</b> questions</div><div class="dm-bar"><div class="dm-fill" style="width:'+qpc+'%"></div></div><div class="dm-txt">Taux de réussite : <b>'+qpc+'%</b></div><button class="btn-luxe" style="margin-top:16px" onclick="resetQuizScore()"><i class="fa-solid fa-rotate-left"></i> Réinitialiser les compteurs</button>';
}

function openImgZoom(src){ if(!src)return; var z=document.getElementById('imgZoom'),i=document.getElementById('imgZoomImg'); if(i)i.src=src; if(z)z.classList.add('open'); }
function closeImgZoom(){ var z=document.getElementById('imgZoom'); if(z)z.classList.remove('open'); }

/* ══ FICHE DÉTAIL — modale complète, URL partageable (#plante=id) ══ */
function _pdRow(label, val){ return val ? '<div class="tech-item"><span class="tech-label">'+label+'</span><span class="tech-val">'+esc(val)+'</span></div>' : ''; }
function plantDetailURL(id){ return location.href.split('#')[0] + '#plante=' + encodeURIComponent(id); }
function openPlantDetail(id){
  const p = plants.find(x => x.id === id);
  if (!p || typeof window.openModalHTML !== 'function') return;
  const soins  = p.besoins || p.description || '';
  const exposi = p.exposition || p.soleil || '';
  const arrosa = p.arrosage || p.eau || '';
  const fPrepa = p.prepa || p.pro_prep || '', fTempI = p.tempIdeale || p.pro_temp || '',
        fTenue = p.tenueVase || p.pro_tenue || '', fCons = p.conservation || p.pro_cons || '',
        fPrec  = p.precautions || p.pro_prec || '';
  const subBar = mkSubstratBar(p.substrat);
  let h = '<span class="plant-family">'+esc(p.famille)+'</span>'
    + '<h2 class="v7-h" style="margin-top:2px">'+esc(p.nomFr)+'</h2>'
    + '<div class="v7-sub"><i>'+esc(p.nomLat)+'</i>'+(p.type?' · '+esc(p.type):'')+'</div>'
    + mkV5Tags(p)
    + '<div class="pd-photo" id="pdPhoto"><i class="fa-solid fa-leaf"></i></div>'
    + (soins ? '<p class="pd-desc">'+esc(soins)+'</p>' : '')
    + '<div class="pd-grid">'
    + _pdRow('Origine', p.region)
    + _pdRow('Reconnaissance — fleurs', p.visu1)
    + _pdRow('Reconnaissance — feuilles', p.visu2)
    + _pdRow('Feuillage', p.feuillage) + _pdRow('Port', p.port)
    + _pdRow('Hauteur', p.hauteur) + _pdRow('Couleur', p.couleur)
    + _pdRow('Rusticité', p.rusticite) + _pdRow('Floraison', p.fl_texte)
    + _pdRow('☀️ Exposition', exposi) + _pdRow('💧 Arrosage', arrosa)
    + _pdRow('💨 Humidité', p.humidite) + _pdRow('🌡️ Température', p.temperature)
    + _pdRow('🪴 Rempotage', p.rempotage) + _pdRow('🌿 Engrais', p.engrais)
    + _pdRow('🧪 Principes actifs', p.principes)
    + (subBar ? '<div class="tech-item" style="grid-column:1/-1"><span class="tech-label">🪨 Substrat conseillé</span>'+subBar+'</div>' : '')
    + '</div>'
    + (p.ennemis ? '<div class="pd-sec"><b><i class="fa-solid fa-bug-slash"></i> Sensibilités &amp; ennemis</b>'+esc(p.ennemis)+'</div>' : '')
    + ((fPrepa||fTempI||fTenue||fCons||fPrec) ? '<div class="pd-sec"><b><i class="fa-solid fa-scissors"></i> Fiche fleuriste</b>'
        + (fPrepa?'<div><strong>Préparation :</strong> '+esc(fPrepa)+'</div>':'')
        + (fTempI?'<div><strong>Température :</strong> '+esc(fTempI)+'</div>':'')
        + (fTenue?'<div><strong>Tenue en vase :</strong> '+esc(fTenue)+'</div>':'')
        + (fCons ?'<div><strong>Conservation :</strong> '+esc(fCons)+'</div>':'')
        + (fPrec ?'<div><strong>Précautions :</strong> '+esc(fPrec)+'</div>':'')
      + '</div>' : '')
    + '<div class="pd-actions">'
    + '<button class="btn-luxe '+(p.inGarden?'active':'')+'" onclick="toggleGardenStatus(\''+p.id+'\');openPlantDetail(\''+p.id+'\')"><i class="fa-solid fa-heart"></i> '+(p.inGarden?'Adoptée':'Adopter')+'</button>'
    + '<button class="btn-luxe" onclick="closeModal();openEditDrawer(\''+p.id+'\')"><i class="fa-solid fa-pen-to-square"></i> Modifier</button>'
    + '<button class="btn-luxe" onclick="sharePlant(\''+p.id+'\')"><i class="fa-solid fa-share-nodes"></i> Partager</button>'
    + '<button class="btn-luxe" onclick="closeModal();gotoPlant(\''+p.id+'\')"><i class="fa-solid fa-location-dot"></i> Voir au catalogue</button>'
    + '</div>';
  openModalHTML(h);
  try { history.replaceState(null, '', '#plante=' + encodeURIComponent(p.id)); } catch (e) {}
  // Photo asynchrone : image utilisateur prioritaire, sinon Wikimedia
  var _pdSeq = ++_photoSeq.pd;
  (p.imgUrl ? Promise.resolve(p.imgUrl)
            : fetchWiki(p.w1 || p.nomLat).then(function (s) { return s || fetchWiki(p.w2 || p.nomLat); }))
    .then(function (s) {
      if (_pdSeq !== _photoSeq.pd) return;
      var el = document.getElementById('pdPhoto');
      if (el && s) { el.style.backgroundImage = 'url(' + s + ')'; el.innerHTML = ''; el.onclick = function () { openImgZoom(s); }; }
    });
}
// Routage au chargement : #plante=<id> ouvre directement la fiche (URL partagée)
function openDetailFromHash(){
  var m = (location.hash || '').match(/plante=([^&]+)/);
  if (!m) return;
  var id = decodeURIComponent(m[1]);
  if (plants.some(function (p) { return p.id === id; })) openPlantDetail(id);
}

/* ===================================================================
   V6 — AMÉLIORATIONS (additif) : gestion robuste des overlays + hover
   Appelé depuis window.onload (voir plus haut), donc défini globalement.
   =================================================================== */
function initV6Enhancements(){
  // 1) Touche Échap : ferme l'élément ouvert le plus prioritaire, sans conflit.
  //    Handler unique pour toute l'app (consolidé — voir audit perf : évitait 4 listeners keydown séparés).
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape' && e.keyCode !== 27) return;
    var zoom = document.getElementById('imgZoom');
    if (zoom && zoom.classList.contains('open')) { try{closeImgZoom();}catch(_){ } return; }
    var v7m = document.getElementById('v7-modal');
    if (v7m && v7m.classList.contains('open')) { if (typeof window.closeModal === 'function') window.closeModal(); return; }
    var modal = document.getElementById('confirmModal');
    if (modal && modal.style.display === 'flex') { try{closeConfirmModal();}catch(_){ } return; }
    var drawer = document.getElementById('plantDrawer');
    if (drawer && drawer.classList.contains('open')) { try{closeDrawer();}catch(_){ } return; }
    var mnav = document.getElementById('mobileNav');
    if (mnav && mnav.classList.contains('open')) { try{closeMobileNav();}catch(_){ } return; }
    if (document.body.classList.contains('search-open')) { document.body.classList.remove('search-open'); return; }
    if (typeof flashMode !== 'undefined' && flashMode) { try{toggleFlashMode();}catch(_){ } return; }
    if (typeof quizOn !== 'undefined' && quizOn)       { try{toggleQuizMode();}catch(_){ }  return; }
    if (typeof calOn  !== 'undefined' && calOn)        { try{toggleCalMode();}catch(_){ }   return; }
    if (typeof dashOn !== 'undefined' && dashOn)       { try{toggleDashMode();}catch(_){ }  return; }
    if (typeof careOn !== 'undefined' && careOn)       { try{toggleCareMode();}catch(_){ }  return; }
  });

  // 2) Hover organique (souris fine uniquement → 0 coût sur iPhone tactile) :
  //    léger soulèvement « liquide » des visuels, en complément du reflet CSS.
  var fine = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (fine && typeof gsap !== 'undefined') {
    document.addEventListener('mouseover', function(e){
      var m = e.target.closest && e.target.closest('.scrolly-media');
      if (m && !m._lgHover){ m._lgHover = true; gsap.to(m,{y:-6,duration:.6,ease:'power3.out',overwrite:'auto'}); }
    });
    document.addEventListener('mouseout', function(e){
      var m = e.target.closest && e.target.closest('.scrolly-media');
      if (m && m._lgHover && !(e.relatedTarget && m.contains(e.relatedTarget))){
        m._lgHover = false; gsap.to(m,{y:0,duration:.7,ease:'power3.out',overwrite:'auto'});
      }
    });
  }
}

/* Menu principal responsive — mêmes fonctions sur mobile, tablette et ordinateur. */
function openMobileNav(){
  var m=document.getElementById('mobileNav');
  if(m){ m.removeAttribute('inert'); m.classList.add('open'); m.setAttribute('aria-hidden','false'); }
  var b=document.getElementById('burgerBtn');
  if(b){ b.setAttribute('aria-expanded','true'); b.setAttribute('aria-label','Fermer le menu principal'); }
  document.body.classList.add('no-scroll');
  try { lenis.stop(); } catch(e) {}
  trapFocus(m);
}
function closeMobileNav(){
  var m=document.getElementById('mobileNav');
  if(m){ m.classList.remove('open'); m.setAttribute('aria-hidden','true'); m.setAttribute('inert',''); }
  var b=document.getElementById('burgerBtn');
  if(b){ b.setAttribute('aria-expanded','false'); b.setAttribute('aria-label','Ouvrir le menu principal'); }
  document.body.classList.remove('no-scroll');
  /* Le bouton déclencheur doit être de nouveau visible avant que le piège
     restitue le focus ; sinon Chromium refuse de focaliser l'élément caché. */
  releaseFocusTrap();
  try { lenis.start(); } catch(e) {}
}
function toggleMobileNav(){
  var m=document.getElementById('mobileNav');
  if(m && m.classList.contains('open')) closeMobileNav(); else openMobileNav();
}
/* Échap sur le menu mobile : géré par le handler unique d'initV6Enhancements() */

/* Compatibilité : la recherche est désormais toujours visible à toutes les largeurs. */
(function(){
  window.toggleSearchPop=function(){
    var i=document.getElementById('searchInput');
    if(i) try{ i.focus(); }catch(e){}
  };
  var ic=document.querySelector('.search-wrapper i');
  if(ic){
    ic.removeAttribute('role');
    ic.removeAttribute('tabindex');
    ic.removeAttribute('aria-label');
  }
  document.body.classList.remove('search-open');
})();

// --- PWA : enregistrement du service worker (hors-ligne complet + mises à jour fiables) ---
// Ne s'active qu'en http(s) — ouvert en file:// le site fonctionne comme avant, sans SW.
// Quand un nouveau worker est installé alors qu'une version précédente contrôle déjà la page,
// on propose « Mettre à jour » ; le clic envoie SKIP_WAITING au worker en attente, et le
// changement de contrôleur déclenche UN seul rechargement (jamais à la première installation,
// jamais en boucle).
function showSwUpdateToast(worker) {
  const toast = document.getElementById('toast');
  if (!toast) { worker.postMessage({ type: 'SKIP_WAITING' }); return; }
  toast.textContent = '';
  toast.appendChild(document.createTextNode('Une nouvelle version de Carnet Botanique est disponible. '));
  const btn = document.createElement('button');
  btn.id = 'swUpdateBtn';
  btn.textContent = 'Mettre à jour';
  btn.setAttribute('aria-label', 'Mettre à jour Carnet Botanique et recharger la page');
  btn.style.cssText = 'margin-left:12px;background:var(--gold);border:none;color:#1F2D24;font-family:inherit;font-size:inherit;letter-spacing:inherit;text-transform:inherit;padding:4px 14px;border-radius:3px;cursor:pointer;font-weight:600;';
  btn.onclick = function () {
    btn.disabled = true;
    btn.textContent = 'Mise à jour…';
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
  toast.appendChild(btn);
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 15000);
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', function () {
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // Premier install (aucun contrôleur avant) : pas de rechargement.
      // Mise à jour : un seul rechargement, le drapeau refreshing coupe toute boucle.
      if (refreshing || !hadController) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function propose(worker) {
        if (worker && navigator.serviceWorker.controller) showSwUpdateToast(worker);
      }
      propose(reg.waiting); // un worker attendait déjà depuis une visite précédente
      reg.addEventListener('updatefound', function () {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed') propose(nw);
        });
      });
      // Vérification explicite : les navigateurs ne re-vérifient pas toujours sw.js
      // à chaque navigation ; sans cela un visiteur en ligne pourrait ne jamais voir
      // la mise à jour. Au chargement puis toutes les heures.
      reg.update().catch(function () {});
      setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
    }).catch(function (e) { console.warn('SW non enregistré', e); });
  });
}
