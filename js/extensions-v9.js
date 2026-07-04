/* v9 : Suivi de l'arrosage par exemplaire (specimens individuels) */
(function(){
  function lg(k,d){try{var v=JSON.parse(localStorage.getItem(k));return v==null?d:v;}catch(e){return d;}}
  function ls(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function fr(){return (window.hdvLang||'fr')!=='en';}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function tst(m){try{if(typeof window.showToast==='function')window.showToast(m);}catch(e){}}
  var KEY='hdv_specimens_v1';
  function store(){return lg(KEY,{});}
  function save(s){ls(KEY,s);}
  function uid(){return 's'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  function adopted(){try{return window.plants.filter(function(p){return p.inGarden===true;});}catch(e){return [];}}
  function ensure(pid){var s=store();if(!s[pid]||!s[pid].length){var j=(window.journal&&window.journal[pid])||{};s[pid]=[{id:uid(),label:'',zone:j.zone||'',every:j.waterEvery||0,last:j.lastWater||''}];save(s);}return s;}
  function specs(pid){return ensure(pid)[pid];}
  function specDue(sp){if(!sp.every||sp.every<=0)return false;if(!sp.last)return true;return (Date.now()-new Date(sp.last).getTime())>=sp.every*86400000;}
  function syncJournal(pid){try{var arr=specs(pid);var ev=arr.map(function(x){return x.every;}).filter(function(n){return n>0;});var la=arr.map(function(x){return x.last;}).filter(Boolean);var minE=ev.length?Math.min.apply(null,ev):0;var maxL=la.length?la.sort().slice(-1)[0]:'';if(!window.journal)window.journal={};if(!window.journal[pid])window.journal[pid]={entries:[],zone:'',waterEvery:0,lastWater:''};window.journal[pid].waterEvery=minE;window.journal[pid].lastWater=maxL;ls('hdv_journal',window.journal);}catch(e){}}
  var origWaterDue=window.waterDue;
  window.waterDue=function(id){var s=store();if(s[id]&&s[id].length)return s[id].some(specDue);if(typeof origWaterDue==='function')return origWaterDue(id);return false;};
  function doAdd(pid){var s=ensure(pid);s[pid].push({id:uid(),label:'',zone:'',every:(s[pid][0]&&s[pid][0].every)||0,last:''});save(s);syncJournal(pid);window.openReminders();}
  function doRemove(pid,sid){var s=ensure(pid);if(s[pid].length<=1){tst(fr()?'Au moins un exemplaire requis':'At least one specimen required');return;}s[pid]=s[pid].filter(function(x){return x.id!==sid;});save(s);syncJournal(pid);window.openReminders();}
  function doSet(pid,sid,field,val){var s=ensure(pid);var sp=s[pid].filter(function(x){return x.id===sid;})[0];if(!sp)return;if(field==='every')sp.every=parseInt(val,10)||0;else sp[field]=val;save(s);syncJournal(pid);if(field==='every')window.openReminders();}
  function doWater(pid,sid){var s=ensure(pid);var sp=s[pid].filter(function(x){return x.id===sid;})[0];if(!sp)return;sp.last=new Date().toISOString();save(s);syncJournal(pid);window.openReminders();try{if(window.checkReminders)window.checkReminders();}catch(e){}tst(fr()?'Arrosage enregistre':'Watering logged');}
  function doWaterAll(pid){var s=ensure(pid);var now=new Date().toISOString();s[pid].forEach(function(sp){sp.last=now;});save(s);syncJournal(pid);window.openReminders();try{if(window.checkReminders)window.checkReminders();}catch(e){}tst(fr()?'Tous arroses':'All watered');}
  function fmtDate(iso){if(!iso)return fr()?'jamais':'never';try{return new Date(iso).toLocaleDateString(fr()?'fr-FR':'en-GB',{day:'2-digit',month:'short'});}catch(e){return String(iso).slice(0,10);}}
  window.openReminders=function(){
    var F=fr();var list=adopted();
    var h='<h2 class="v7-h">'+(F?"Rappels d'arrosage":'Watering reminders')+'</h2>';
    h+='<div class="v7-actions-row"><button class="btn-luxe" onclick="window.enableNotif()"><i class="fa-solid fa-bell"></i> '+(F?'Activer les notifications':'Enable notifications')+'</button></div>';
    if(!list.length){h+='<div class="v7-empty">'+(F?'Adoptez des plantes (mode Jardin) pour suivre leur arrosage.':'Adopt plants (Garden mode) to track watering.')+'</div>';openModalHTML(h);if(window.__v8RemExtras)setTimeout(window.__v8RemExtras,0);return;}
    h+='<p class="sp-help">'+(F?'Ajoutez un exemplaire par plante physique : chacun a son emplacement, son rythme et son suivi.':'Add one specimen per physical plant: each has its own location, rhythm and tracking.')+'</p>';
    list.forEach(function(p){
      var arr=specs(p.id);var dc=arr.filter(specDue).length;
      h+='<div class="sp-group">';
      h+='<div class="sp-g-head"><span class="sp-g-name">'+esc(p.nomFr)+' <small>x '+arr.length+'</small>'+(dc?'<span class="sp-due-tag">'+dc+(F?' a arroser':' due')+'</span>':'')+'</span>';
      h+='<button class="btn-luxe sp-mini" data-sp-act="waterall" data-pid="'+p.id+'"><i class="fa-solid fa-droplet"></i> '+(F?'Tout arroser':'Water all')+'</button>';
      h+='<button class="btn-luxe sp-mini" data-sp-act="add" data-pid="'+p.id+'"><i class="fa-solid fa-plus"></i> '+(F?'Exemplaire':'Specimen')+'</button></div>';
      arr.forEach(function(sp){
        var due=specDue(sp);
        h+='<div class="sp-row '+(due?'due':'')+'">';
        h+='<input class="sp-label sp-edit" data-pid="'+p.id+'" data-sid="'+sp.id+'" data-field="label" value="'+esc(sp.label)+'" placeholder="'+(F?'Nom (ex. Salon)':'Name (e.g. Living room)')+'">';
        h+='<input class="sp-zone sp-edit" data-pid="'+p.id+'" data-sid="'+sp.id+'" data-field="zone" value="'+esc(sp.zone)+'" placeholder="'+(F?'Emplacement':'Location')+'">';
        h+='<span class="sp-int"><label>'+(F?'tous les':'every')+'</label><input class="sp-num sp-edit" type="number" min="0" data-pid="'+p.id+'" data-sid="'+sp.id+'" data-field="every" value="'+(sp.every||'')+'"> '+(F?'j':'d')+'</span>';
        h+='<span class="sp-last">'+(F?'dernier : ':'last: ')+fmtDate(sp.last)+'</span>';
        h+='<button class="btn-luxe sp-mini'+(due?'':' sp-ok')+'" data-sp-act="water" data-pid="'+p.id+'" data-sid="'+sp.id+'"><i class="fa-solid fa-droplet"></i> '+(due?(F?'Arroser':'Water'):'OK')+'</button>';
        h+='<button class="sp-x" data-sp-act="remove" data-pid="'+p.id+'" data-sid="'+sp.id+'" title="'+(F?'Supprimer':'Remove')+'"><i class="fa-solid fa-xmark"></i></button>';
        h+='</div>';
      });
      h+='</div>';
    });
    openModalHTML(h);
    // Réinjecte les boutons v8 (Export .ics / Jardin PDF / Partage QR) que le remplacement
    // de openReminders par cette version v9 faisait disparaître.
    if(window.__v8RemExtras)setTimeout(window.__v8RemExtras,0);
  };
  document.addEventListener('click',function(e){var b=e.target.closest?e.target.closest('[data-sp-act]'):null;if(!b)return;var act=b.getAttribute('data-sp-act'),pid=b.getAttribute('data-pid'),sid=b.getAttribute('data-sid');if(act==='add')doAdd(pid);else if(act==='waterall')doWaterAll(pid);else if(act==='water')doWater(pid,sid);else if(act==='remove')doRemove(pid,sid);});
  document.addEventListener('change',function(e){var t=e.target;if(!t||!t.classList||!t.classList.contains('sp-edit'))return;doSet(t.getAttribute('data-pid'),t.getAttribute('data-sid'),t.getAttribute('data-field'),t.value);});
  try{var stl=document.createElement('style');stl.textContent='.sp-help{opacity:.7;font-size:.86rem;margin:4px 0 14px;}.sp-group{border:1px solid rgba(127,127,127,.25);border-radius:14px;padding:14px;margin:12px 0;}.sp-g-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}.sp-g-name{font-weight:700;font-size:1.05rem;flex:1;min-width:140px;}.sp-g-name small{opacity:.55;font-weight:500;margin-left:4px;}.sp-due-tag{display:inline-block;font-size:.68rem;padding:2px 8px;border-radius:999px;background:#c0392b;color:#fff;margin-left:8px;}.btn-luxe.sp-mini{padding:6px 12px;font-size:.8rem;}.sp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 10px;border-radius:10px;margin:6px 0;background:rgba(127,127,127,.08);}.sp-row.due{background:rgba(212,160,80,.20);}.sp-row input{padding:5px 9px;border:1px solid rgba(127,127,127,.3);border-radius:8px;background:transparent;color:inherit;font-family:inherit;}.sp-row input.sp-label{font-weight:600;min-width:110px;flex:1;}.sp-row input.sp-zone{min-width:100px;flex:1;}.sp-row input.sp-num{width:60px;}.sp-int{font-size:.85rem;opacity:.85;display:inline-flex;align-items:center;gap:5px;}.sp-last{font-size:.78rem;opacity:.65;min-width:92px;}.btn-luxe.sp-ok{opacity:.55;}.sp-x{background:transparent;border:none;color:inherit;opacity:.45;cursor:pointer;font-size:1rem;padding:4px 6px;}.sp-x:hover{opacity:1;color:#c0392b;}';document.head.appendChild(stl);}catch(e){}
})();
