// Planner 2026 — app.js v5

// ── STATE ─────────────────────────────────────
var S = {
  dragging: false,
  page: 'planner', weekOffset: 0, calMonth: new Date(),
  categorias: [], rotina: [], backlog: [], imprevistos: [],
  semana: {}, rotinaDone: {},
  calBulkDone: {}, // rotinaDone por semana para o calendário
  blFilter: 'all', blWeekOnly: false,
  revisao: {}, drag: null, weekKey: '',
  cardCtx: null,
  kanbanCols: []
};

// ── EMOJIS ────────────────────────────────────
var EMOJIS = [
  '😀','😎','🤔','💡','🔥','⭐','✅','❌','⚡','🎯',
  '📋','📌','📅','📊','📈','📝','🗓️','🔔','🔕','🔒',
  '💪','🏃','🧘','🍎','💊','🏋️','🚴','⚽','🎾','🏊',
  '🙏','❤️','💍','👨‍👩‍👧','🏠','🌿','🌞','🌙','⚓','🌐',
  '💰','💳','📦','🏗️','🗣️','🎧','📖','✏️','🔍','🧠',
  '🌍','✈️','🚗','🏖️','🏔️','🎉','🎊','🏆','🥇','🎁',
  '⚠️','🚨','🛑','✔️','🔄','↩️','🔗','📎','🖇️','📐'
];

var TIMES=['06:00','06:30','07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00',
  '18:00','19:00','19:30','20:00','21:00'];
var DAYS=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

// ── INIT ──────────────────────────────────────
async function init() {
  applyTheme(localStorage.getItem('theme') || 'dark');
  await loadAll();
  setWeekKey();
  buildEmojiPicker();
  populateRotCatFilter();
  var urlP = new URLSearchParams(window.location.search); renderPage(urlP.get('page') || 'planner');
  updateBadges();
}

async function loadAll() {
  var r = await Promise.all([
    api('GET','/api/categorias'), api('GET','/api/rotina'),
    api('GET','/api/backlog'),    api('GET','/api/imprevistos'),
    api('GET','/api/kanban/colunas')
  ]);
  S.categorias  = r[0] || [];
  S.rotina      = r[1] || [];
  S.backlog     = r[2] || [];
  S.imprevistos = r[3] || [];
  S.kanbanCols  = r[4] || [];
}

// ── API ───────────────────────────────────────
async function api(method, url, body) {
  try {
    var opts = {method:method, headers:{'Content-Type':'application/json'}};
    if (body !== undefined) opts.body = JSON.stringify(body);
    var res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return null; }
    if (!res.ok) { console.error('API', res.status, url); return null; }
    return res.json();
  } catch(e) { console.error(e); return null; }
}

// ── THEME ─────────────────────────────────────
function setTheme(t) { localStorage.setItem('theme', t); applyTheme(t); }
function applyTheme(t) {
  var html = document.documentElement;
  if (t === 'system') {
    html.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', t);
  }
  document.querySelectorAll('.theme-btn').forEach(function(b){ b.classList.remove('active'); });
  var el = document.getElementById('tb-' + t);
  if (el) el.classList.add('active');
}

// ── WEEK ──────────────────────────────────────
function getWeekDates(off) {
  if (off === undefined) off = S.weekOffset;
  var now = new Date(), day = now.getDay();
  var mon = new Date(now);
  mon.setDate(now.getDate() + (day===0?-6:1-day) + off*7);
  var arr = [];
  for (var i=0;i<7;i++){var d=new Date(mon);d.setDate(mon.getDate()+i);arr.push(d);}
  return arr;
}
function getWeekKey(off) {
  if (off===undefined) off=S.weekOffset;
  return getWeekDates(off)[0].toISOString().slice(0,10);
}
function getWeekNum(d) {
  var dt=new Date(d); dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  var w1=new Date(dt.getFullYear(),0,4);
  return 1+Math.round(((dt-w1)/86400000-3+(w1.getDay()+6)%7)/7);
}
function setWeekKey() {
  S.weekKey = getWeekKey();
  var dates = getWeekDates();
  var f = function(d){return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};
  var el = document.getElementById('tb-wlbl');
  if (el) el.textContent = 'Semana '+getWeekNum(dates[0])+'  ·  '+f(dates[0])+' – '+f(dates[6]);
}
async function prevWeek(){S.weekOffset--;setWeekKey();await loadSemana();renderPlanner();}
async function nextWeek(){S.weekOffset++;setWeekKey();await loadSemana();renderPlanner();}
async function goToday(){S.weekOffset=0;setWeekKey();await loadSemana();renderPlanner();}
async function loadSemana() {
  var r = await Promise.all([
    api('GET','/api/semanas/'+S.weekKey),
    api('GET','/api/rotina_done/'+S.weekKey)
  ]);
  S.semana = r[0]||{}; S.rotinaDone = r[1]||{};
}

// ── ROTINA DATE FILTER ─────────────────────────
function rotinaAtivaNaData(r, dataISO) {
  if (r.ativo === false) return false;
  var d = dataISO ? dataISO.slice(0,10) : new Date().toISOString().slice(0,10);
  if (r.data_inicio && r.data_inicio.length >= 10 && d < r.data_inicio) return false;
  if (r.data_fim && r.data_fim.length >= 10 && d > r.data_fim) return false;
  return true;
}

function itemAtivoNoSlot(it, dayIndex, weekMonday) {
  if (it.ativo === false || it.concluido === true || it.resolvido === true) return false;
  
  var mon = new Date(weekMonday + 'T12:00:00');
  var slotDate = new Date(mon);
  slotDate.setDate(mon.getDate() + dayIndex);
  var slotISO = slotDate.toISOString().slice(0,10);

  // Se tiver período definido
  if (it.data_inicio && it.data_inicio.length >= 10 && slotISO < it.data_inicio) return false;
  if (it.data_fim && it.data_fim.length >= 10 && slotISO > it.data_fim) return false;

  // Se tiver recorrência (dias específicos)
  if (it.dias && it.dias.length > 0) {
    return it.dias.indexOf(dayIndex) >= 0;
  }
  
  // Se for Execução Única (sem dias)
  if (!it.dias || it.dias.length === 0) {
    if (it.data_inicio && it.data_fim) return true; // período já validado acima
    // Âncora: data_inicio (slot do planner) tem prioridade sobre prazo
    var anchor = (it.data_inicio && it.data_inicio.length >= 10) ? it.data_inicio : (it.prazo || it.data);
    if (anchor) {
      var todayISO = new Date().toISOString().slice(0,10);
      // Vencido → exibir no dia de hoje até ser concluído
      if (anchor < todayISO) return slotISO === todayISO;
      return anchor === slotISO;
    }
  }

  return false;
}

// Item está agendado no planner se tiver horário E data de início definidos
function isScheduled(item) {
  if (!item || item.concluido || item.resolvido) return false;
  return !!(item.horario && item.data_inicio);
}

function findSlot(horario){
  if(!horario) return null;
  var best = null;
  for(var i=0; i<TIMES.length; i++){
    if(TIMES[i] <= horario) best = TIMES[i];
    else break;
  }
  return best;
}

// ── NAV ───────────────────────────────────────
function goTo(page) {
  S.page = page;
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  var pg = document.getElementById('page-'+page);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.sb-link').forEach(function(l){
    l.classList.toggle('active', l.dataset.page===page);
  });
  var labels = {planner:'Planner Semanal',calendario:'Calendário',kanban:'Quadro Kanban',backlog:'Backlog',
    rotina:'Rotina',categorias:'Categorias',imprevistos:'Imprevistos',revisao:'Revisão Semanal'};
  var ctx = document.getElementById('tb-ctx');
  if (ctx) ctx.textContent = labels[page]||page;
  var wnav = document.getElementById('tb-wnav');
  if (wnav) wnav.style.display = page==='planner'?'flex':'none';
  renderPage(page);
}
function renderPage(p) {
  var map = {
    planner:renderPlanner, calendario:renderCalendario, kanban:renderKanban,
    backlog:renderBacklog, rotina:renderRotinaPage,
    categorias:renderCategorias, imprevistos:renderImpPg, revisao:renderRevisao
  };
  if (map[p]) map[p]();
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('collapsed');}
function openAddModal() {
  var map = {
    planner:function(){openCardModal(null,'semana',null,null);},
    backlog:function(){openCardModal(null,'backlog',null,null);},
    rotina:function(){openCardModal(null,'rotina',null,null);},
    imprevistos:function(){openCardModal(null,'imprevisto',null,null);},
    categorias:function(){openCatModal(null);}
  };
  if (map[S.page]) map[S.page]();
}

// ── CAT HELPERS ───────────────────────────────
function getCat(id){return S.categorias.find(function(c){return c.id===id;})||{nome:id||'—',cor:'#888',icone:'•'};}
function catColor(id){return getCat(id).cor;}
function catName(id){return getCat(id).nome;}
function catIcon(id){return getCat(id).icone;}

// ── PLANNER ───────────────────────────────────
async function renderPlanner() {
  if(!S.weekKey) setWeekKey();
  await loadSemana();
  buildGrade();
  buildBLMini();
}

function buildGrade() {
  var dates=getWeekDates(), todayD=new Date(); todayD.setHours(0,0,0,0);
  var hdr=document.getElementById('grade-hdr'); if(!hdr) return;
  hdr.innerHTML='<div class="gh-empty"></div>';
  dates.forEach(function(d,i){
    var isT=d.getTime()===todayD.getTime();
    var div=document.createElement('div');
    div.className='gh-day'+(isT?' is-today':'');
    div.innerHTML='<div class="gh-name">'+DAYS[i]+'</div><div class="gh-date">'+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'</div>';
    hdr.appendChild(div);
  });
  var body=document.getElementById('grade-body'); body.innerHTML='';
  TIMES.forEach(function(time){
    var tl=document.createElement('div'); tl.className='g-time'; tl.textContent=time; body.appendChild(tl);
    for(var d=0;d<7;d++){
      var key=d+'_'+time.replace(':','');
      var isT=dates[d].getTime()===todayD.getTime();
      var cell=document.createElement('div');
      cell.className='g-cell'+(isT?' is-today':'');
      cell.dataset.key=key;

      // Rotinas recorrentes
      S.rotina.filter(function(it){
        return findSlot(it.horario)===time && itemAtivoNoSlot(it, d, S.weekKey);
      }).sort(function(a, b) {
        var ha = a.horario || '00:00', hb = b.horario || '00:00';
        return ha < hb ? -1 : ha > hb ? 1 : 0;
      }).forEach(function(it){
        var rdKey = it.id+'_'+d;
        var state = S.rotinaDone[rdKey];
        if(state==='removed'){
          var chip=document.createElement('div');
          chip.className='blk-removed';
          chip.title='Clique para restaurar: '+(it.titulo||it.texto);
          chip.innerHTML='<span class="blk-removed-title">↩ '+(it.titulo||it.texto)+'</span>';
          (function(itemId,dayIdx){
            chip.onclick=async function(){
              delete S.rotinaDone[itemId+'_'+dayIdx];
              await api('POST','/api/rotina_done/'+S.weekKey,S.rotinaDone);
              buildGrade();
            };
          })(it.id,d);
          cell.appendChild(chip);
          return;
        }
        cell.appendChild(makeBlk(Object.assign({}, it, {
          id:rdKey, done:state==='done'||it.concluido,
          _isRotina:true, _rId:it.id, _day:d
        }), key));
      });

      // Backlog agendado no planner (execução única com horário)
      S.backlog.filter(function(b){
        return !b.concluido && findSlot(b.horario)===time && itemAtivoNoSlot(b, d, S.weekKey);
      }).sort(function(a, b) {
        var ha = a.horario || '00:00', hb = b.horario || '00:00';
        return ha < hb ? -1 : ha > hb ? 1 : 0;
      }).forEach(function(it){
        var rdKey = 'bl_'+it.id+'_'+d;
        var state = S.rotinaDone[rdKey];
        if(state==='removed'){
          var chip=document.createElement('div');
          chip.className='blk-removed';
          chip.title='Clique para restaurar: '+(it.titulo||it.texto);
          chip.innerHTML='<span class="blk-removed-title">↩ '+(it.titulo||it.texto)+'</span>';
          (function(itemId,dayIdx){
            chip.onclick=async function(){
              delete S.rotinaDone['bl_'+itemId+'_'+dayIdx];
              await api('POST','/api/rotina_done/'+S.weekKey,S.rotinaDone);
              buildGrade();
            };
          })(it.id,d);
          cell.appendChild(chip);
          return;
        }
        cell.appendChild(makeBlk(Object.assign({}, it, {
          id:rdKey, done:state==='done'||it.concluido,
          _isRotina:true, _isBacklog:true, _rId:it.id, _day:d
        }), key));
      });

      // Itens customizados (S.semana) — usa diretamente a chave da célula
      var cellItems = (S.semana[key] || []).slice();
      cellItems.sort(function(a, b) {
        var ha = a.horario || '00:00', hb = b.horario || '00:00';
        if (ha !== hb) return ha < hb ? -1 : 1;
        var da = a.data_item || a.prazo || a.data || '';
        var db = b.data_item || b.prazo || b.data || '';
        return da < db ? -1 : da > db ? 1 : 0;
      });
      cellItems.forEach(function(item){ cell.appendChild(makeBlk(item,key)); });

      var ad=document.createElement('div'); ad.className='g-cell-add';
      var ab=document.createElement('button'); ab.className='g-cell-add-btn'; ab.textContent='+ adicionar';
      (function(k,t,di){ab.onclick=function(){openCardModal(null,'semana',k,t,di);};})(key,time,d);
      ad.appendChild(ab); cell.appendChild(ad);

      (function(k,t){
        cell.addEventListener('dragover',function(e){ e.preventDefault();e.stopPropagation(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave',function(e){ if(!cell.contains(e.relatedTarget)){ cell.classList.remove('drag-over'); } });
        cell.addEventListener('drop',async function(e){ e.preventDefault();e.stopPropagation(); cell.classList.remove('drag-over'); if(S.drag){await dropItem(S.drag,k,t);S.drag=null;} });
      })(key,time);
      body.appendChild(cell);
    }
  });
}

function makeBlk(item, cellKey) {
  var div=document.createElement('div');
  var color=catColor(item.categoria_id);
  div.className='blk'+(item.done?' is-done':'')+' draggable-blk';
  div.style.background=color+'1a';
  div.style.borderLeftColor=color;
  var cl=item.checklist||[]; var clDone=cl.filter(function(x){return x.done;}).length;
  var clBadge=cl.length?('<span class="blk-icons"> ☑ '+clDone+'/'+cl.length+'</span>'):'';
  var commBadge=(item.comentarios&&item.comentarios.length)?('<span class="blk-icons"> 💬'+item.comentarios.length+'</span>'):'';
  var vincBadge=(item.vinculos&&item.vinculos.length)?('<span class="blk-icons"> 🔗'+item.vinculos.length+'</span>'):'';
  var typeTag = '';
  if (item.tipo === 'rotina' || item._isRotina) {
    typeTag = '<span class="blk-tag" style="background:rgba(52,152,219,.2);color:#3498db" title="Rotina Replicada">🔄 Rotina</span>';
  } else {
    typeTag = '<span class="blk-tag" style="background:rgba(155,89,182,.15);color:#9b59b6" title="Execução Única">📌 Única</span>';
  }
  
  var deadlineTag='', alertStyle='';
  var pz = item.prazo || item.data;
  if(pz && !item.done){
    var today = new Date(); today.setHours(0,0,0,0);
    var target = new Date(pz + 'T12:00:00'); target.setHours(0,0,0,0);
    var diff = (target - today) / (1000*60*60*24);
    
    if(diff <= 1){ // Hoje, amanhã ou atrasado
      var isVencido = diff < 0;
      deadlineTag = '<span class="blk-tag" style="color:#ff4d4d; font-weight:bold" title="item critico e risco: '+pz+'">❓</span>';
      alertStyle = 'background: rgba(255, 77, 77, 0.15) !important; border-left: 3px solid #ff4d4d !important;';
    } else if(diff <= 3){
      deadlineTag = '<span class="blk-tag" style="color:var(--amber); font-weight:bold" title="Prazo próximo: '+pz+'">⌛</span>';
    } else {
      deadlineTag = '<span class="blk-tag" style="color:var(--gold); opacity:.7" title="Prazo: '+pz+'">⌛</span>';
    }
  }

  var horarioTag = item.horario ? '<span class="blk-horario">'+item.horario+'</span>' : '';
  div.innerHTML='<div class="blk-t">'+(item.titulo||item.texto)+'</div>'
    +'<div class="blk-meta">'
    +horarioTag
    +'<span class="blk-id">'+(item._isRotina?item._rId:item.id)+'</span>'
    +'<span class="blk-tag">'+catIcon(item.categoria_id)+'</span>'
    +typeTag+deadlineTag+clBadge+commBadge+vincBadge
    +'</div>'
    +'<div class="blk-acts">'
    +'<button class="blk-act a-done" title="Concluir">✓</button>'
    +'<button class="blk-act a-del" title="Remover">✕</button>'
    +'</div>';
  
  if(alertStyle) div.style.cssText += alertStyle;

  div.onclick=function(e){
    if(e.target.classList.contains('blk-act')) return;
    if(item._isRotina){
      var real = S.rotina.find(function(r){return r.id===item._rId;}) || S.backlog.find(function(b){return b.id===item._rId;});
      openCardModal(real||item, item.tipo==='rotina'?'rotina':'backlog', cellKey, null);
    } else {
      openCardModal(item, 'semana', cellKey, null);
    }
  };

  div.querySelector('.a-done').onclick=async function(e){
    e.stopPropagation();
    if(item._isRotina){
      var rKey = item._isBacklog ? 'bl_'+item._rId+'_'+item._day : item._rId+'_'+item._day;
      var ns=item.done?undefined:'done';
      if(ns) S.rotinaDone[rKey]=ns; else delete S.rotinaDone[rKey];
      item.done=!item.done;
      await api('POST','/api/rotina_done/'+S.weekKey,S.rotinaDone);
      // Para backlog: marcar concluido ao dar ✓ (remove do planner na próxima renderização)
      if(item._isBacklog && item.done){
        var blItem=S.backlog.find(function(b){return b.id===item._rId;});
        if(blItem){blItem.concluido=true;await api('PUT','/api/backlog/'+item._rId,{concluido:true});}
        buildGrade(); buildBLMini(); updateBadges();
      }
    } else {
      item.done=!item.done;
      await api('PUT','/api/semanas/'+S.weekKey+'/item/'+item.id,{done:item.done});
    }
    div.classList.toggle('is-done',item.done);
  };

  div.querySelector('.a-del').onclick=async function(e){
    e.stopPropagation();
    if(item._isRotina){
      var delKey = item._isBacklog ? 'bl_'+item._rId+'_'+item._day : item._rId+'_'+item._day;
      S.rotinaDone[delKey]='removed';
      await api('POST','/api/rotina_done/'+S.weekKey,S.rotinaDone);
      buildGrade();
    } else {
      await api('DELETE','/api/semanas/'+S.weekKey+'/item/'+item.id);
      if(S.semana[cellKey]) S.semana[cellKey]=S.semana[cellKey].filter(function(i){return i.id!==item.id;});
    }
    div.remove();
  };

  div.draggable=true;
  div.addEventListener('dragstart',function(e){ S.drag={item:item,fromKey:cellKey}; div.classList.add('dragging'); });
  div.addEventListener('dragend',function(){ div.classList.remove('dragging'); });
  return div;
}

async function dropItem(drag,toKey,toTime){
  var item=drag.item, fromKey=drag.fromKey;
  if(fromKey===toKey) return;
  if(fromKey==='backlog'){
    var ni=Object.assign({},item,{horario:toTime,done:false});
    delete ni._isRotina; delete ni._rId; delete ni._day;
    var created=await api('POST','/api/semanas/'+S.weekKey+'/item',{cell_key:toKey,item:ni});
    if(created){S.semana[toKey]=S.semana[toKey]||[];S.semana[toKey].push(created);}
  } else if(item._isRotina){
    var rReal=S.rotina.find(function(r){return r.id===item._rId;})||item;
    var copy={titulo:rReal.titulo,categoria_id:rReal.categoria_id,tipo:'unica',
      horario:toTime,done:false,descricao:rReal.descricao||'',
      comentarios:[],checklist:[],vinculos:[]};
    var cr=await api('POST','/api/semanas/'+S.weekKey+'/item',{cell_key:toKey,item:copy});
    if(cr){S.semana[toKey]=S.semana[toKey]||[];S.semana[toKey].push(cr);buildGrade();}
  } else {
    var moved=await api('POST','/api/semanas/'+S.weekKey+'/move',{from_key:fromKey,to_key:toKey,item_id:item.id});
    if(moved&&moved.ok){
      S.semana[fromKey]=(S.semana[fromKey]||[]).filter(function(i){return i.id!==item.id;});
      S.semana[toKey]=S.semana[toKey]||[]; S.semana[toKey].push(moved.item);
    }
  }
  buildGrade();
}

// ── PR PAINEL ─────────────────────────────────
function switchPrTab(name,btn){
  document.querySelectorAll('.pr-panel').forEach(function(p){p.classList.remove('active');});
  var panel=document.getElementById('pr-'+name); if(panel) panel.classList.add('active');
  document.querySelectorAll('.pr-tab').forEach(function(t){t.classList.remove('active');});
  if(btn) btn.classList.add('active');
  var map={bl:buildBLMini, rot:buildRotMini, imp:buildImpMini, stats:buildStats};
  if(map[name]) map[name]();
}

// ── BACKLOG MINI ──────────────────────────────
function buildBLMini(){
  var fw=document.getElementById('pr-filter'), lw=document.getElementById('pr-bl-list');
  if(!fw||!lw) return;
  fw.innerHTML='';
  var tog=document.createElement('button');
  tog.className='filter-btn'+(S.blWeekOnly?' active':'');
  tog.textContent=S.blWeekOnly?'📅 Esta sem.':'📅 Todos';
  tog.onclick=function(){S.blWeekOnly=!S.blWeekOnly;buildBLMini();};
  fw.appendChild(tog);
  fw.appendChild(mkFBtn('Todos','all'));
  S.categorias.forEach(function(c){fw.appendChild(mkFBtn(c.icone+' '+c.nome,c.id));});
  renderBLMiniList(lw);
}
function mkFBtn(lbl,val){
  var btn=document.createElement('button');
  btn.className='filter-btn'+(S.blFilter===val?' active':'');
  btn.textContent=lbl;
  btn.onclick=function(){S.blFilter=val;buildBLMini();};
  return btn;
}
function renderBLMiniList(wrap){
  wrap.innerHTML='';
  var _unused=null; // isScheduled(task) usado inline abaixo
  var mon=getWeekDates()[0], sun=getWeekDates()[6];
  var tasks=S.backlog.filter(function(t){
    if(t.concluido) return false;
    if(S.blFilter!=='all'&&t.categoria_id!==S.blFilter) return false;
    if(S.blWeekOnly){if(!t.prazo) return false; var d=new Date(t.prazo+'T12:00'); return d>=mon&&d<=sun;}
    return true;
  });
  tasks.sort(function(a,b){
    var u={h:0,m:1,l:2};
    if(u[a.urgencia]!==u[b.urgencia]) return u[a.urgencia]-u[b.urgencia];
    if(a.prazo&&b.prazo) return new Date(a.prazo)-new Date(b.prazo);
    return a.prazo?-1:b.prazo?1:0;
  });
  if(!tasks.length){wrap.innerHTML='<div class="pr-empty">Nenhuma tarefa</div>';return;}
  var uL={h:'Urgente',m:'Esta sem.',l:'Aguardar'};
  tasks.forEach(function(task){
    var cat=getCat(task.categoria_id), noPrazo=!task.prazo;
    var inPlanner = isScheduled(task);
    var dateStr=task.prazo?new Date(task.prazo+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'—';
    var el=document.createElement('div');
    el.className='bl-mini'+(noPrazo?' no-prazo':'')+(inPlanner?' in-planner':'');
    el.draggable=true;
    el.innerHTML='<div class="bm-t"><span class="bm-dot" style="background:'+cat.cor+'"></span>'
      +'<span class="bm-title-text">'+task.titulo+(noPrazo?'<span class="no-prazo-badge" style="margin-left:4px">sem prazo</span>':'')+'</span>'
      +(inPlanner?'<span class="bm-planned-badge" title="Agendado no calendário">📅</span>':'')
      +'</div>'
      +'<div class="bm-meta">'
      +'<span class="bm-id">'+task.id+'</span>'
      +'<span style="font-family:var(--font-m);font-size:8px;color:'+(noPrazo?'var(--amber)':'var(--text3)')+'">'+dateStr+'</span>'
      +'<span class="urg-tag u-'+(task.urgencia||'m')+'">'+uL[task.urgencia]+'</span>'
      +'<span class="cat-tag" style="background:'+cat.cor+';color:#000">'+cat.icone+'</span>'
      +'</div>'
      +'<button class="bm-ck" title="Concluir">✓</button>';
    el.onclick=function(e){
      if(e.target.classList.contains('bm-ck')) return;
      openCardModal(task,'backlog',null,null);
    };
    el.querySelector('.bm-ck').onclick=async function(e){
      e.stopPropagation();
      task.concluido=!task.concluido;
      await api('PUT','/api/backlog/'+task.id,{concluido:task.concluido});
      buildBLMini(); updateBadges(); buildStats();
    };
    el.addEventListener('dragstart',function(){S.drag={item:Object.assign({},task),fromKey:'backlog'};el.classList.add('dragging');});
    el.addEventListener('dragend',function(){el.classList.remove('dragging');});
    wrap.appendChild(el);
  });
}

// ── ROTINA MINI ───────────────────────────────
function buildRotMini(){
  var wrap=document.getElementById('pr-rot-list'); if(!wrap) return;
  wrap.innerHTML='';
  var today=new Date().toISOString().slice(0,10);
  var ativos=S.rotina.filter(function(r){return rotinaAtivaNaData(r,today);});
  ativos.forEach(function(r){
    var cat=getCat(r.categoria_id);
    var total=r.dias.length;
    var done=r.dias.filter(function(d){return S.rotinaDone[r.id+'_'+d]==='done';}).length;
    var el=document.createElement('div');
    el.className='rot-mini'+(done===total&&total>0?' all-done':'');
    el.innerHTML='<span class="rm-dot" style="background:'+cat.cor+'"></span>'
      +'<span class="rm-title">'+r.titulo+'</span>'
      +'<span class="rm-pct">'+done+'/'+total+'</span>';
    el.onclick=function(){openCardModal(r,'rotina',null,null);};
    wrap.appendChild(el);
  });
  if(!ativos.length)
    wrap.innerHTML='<div class="pr-empty">Nenhuma rotina ativa hoje</div>';
}

// ── IMP MINI ──────────────────────────────────
function buildImpMini(){
  var formEl=document.getElementById('pr-imp-form');
  var listEl=document.getElementById('pr-imp-list');
  if(!formEl||!listEl) return;
  var monday=getWeekDates()[0].toISOString().slice(0,10);
  formEl.innerHTML='<textarea class="field-ta" id="imp-mini-ta" rows="2" placeholder="Imprevisto..." style="font-size:11.5px"></textarea>'
    +'<div style="display:flex;gap:5px;margin-top:5px">'
    +'<select class="field-sel" id="imp-mini-urg" style="font-size:9px;flex:1">'
    +'<option value="h">🔴 Urgente</option><option value="m" selected>🟡 Esta semana</option><option value="l">🟢 Aguardar</option>'
    +'</select>'
    +'<input class="field-in" id="imp-mini-data" type="date" value="'+monday+'" style="font-size:9px;width:120px">'
    +'<button class="btn-p" style="padding:4px 10px;font-size:9px" onclick="addImpMini()">+</button>'
    +'</div>';
  listEl.innerHTML='';
  var pending=S.imprevistos.filter(function(i){return !i.resolvido;}).slice(0,8);
  if(!pending.length){listEl.innerHTML='<div class="pr-empty">Nenhum imprevisto aberto ✓</div>';return;}
  pending.forEach(function(imp){
    var el=document.createElement('div'); el.className='imp-mini-item';
    var vincStr='';
    if(imp.vinculos&&imp.vinculos.length){
      vincStr='<div style="font-family:var(--font-m);font-size:8px;color:var(--gold);margin-top:2px">'
        +'🔗 '+imp.vinculos.map(function(v){return v.id;}).join(', ')+'</div>';
    }
    el.innerHTML='<div style="flex:1;min-width:0">'
      +'<div style="display:flex;align-items:center;gap:5px">'
      +'<span style="font-size:10px;font-family:var(--font-m);color:var(--gold)">'+imp.id+'</span>'
      +'<span style="font-size:11px;color:var(--text2)">'+imp.texto+'</span>'
      +'</div>'
      +vincStr
      +'</div>'
      +'<button class="imp-mini-del btn-d" style="font-size:9px;padding:3px 6px;flex-shrink:0" title="Excluir">✕</button>';
    el.onclick=function(e){
      if(e.target.classList.contains('imp-mini-del')) return;
      openCardModal(imp,'imprevisto',null,null);
    };
    el.querySelector('.imp-mini-del').onclick=async function(e){
      e.stopPropagation();
      if(!await siteConfirm('Excluir imprevisto "'+imp.texto+'"?')) return;
      await api('DELETE','/api/imprevistos/'+imp.id);
      S.imprevistos=S.imprevistos.filter(function(i){return i.id!==imp.id;});
      buildImpMini(); updateBadges();
    };
    listEl.appendChild(el);
  });
}
async function addImpMini(){
  var ta=document.getElementById('imp-mini-ta');
  var texto=(ta?ta.value:'').trim(); if(!texto) return;
  var urgencia=(document.getElementById('imp-mini-urg')||{value:'m'}).value;
  var data=(document.getElementById('imp-mini-data')||{value:''}).value||new Date().toISOString().slice(0,10);
  var created=await api('POST','/api/imprevistos',{texto:texto,urgencia:urgencia,data:data});
  if(created){S.imprevistos.unshift(created);if(ta)ta.value='';buildImpMini();updateBadges();}
}

// ── STATS ─────────────────────────────────────
function buildStats(){
  var wrap=document.getElementById('pr-stats-list'); if(!wrap) return;
  wrap.innerHTML='<div style="font-family:var(--font-m);font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Progresso da semana</div>';
  var cm={};
  S.categorias.forEach(function(c){cm[c.id]={nome:c.nome,cor:c.cor,total:0,done:0};});
  var today=new Date().toISOString().slice(0,10);
  S.rotina.forEach(function(r){
    if(!cm[r.categoria_id]) return;
    r.dias.forEach(function(d){
      if(!itemAtivoNoSlot(r, d, S.weekKey)) return;
      var st=S.rotinaDone[r.id+'_'+d]; if(st==='removed') return;
      cm[r.categoria_id].total++;
      if(st==='done') cm[r.categoria_id].done++;
    });
  });
  S.backlog.filter(function(t){
    // contar apenas backlog com prazo nesta semana
    if(!t.prazo) return false;
    var dates=getWeekDates();
    var d=new Date(t.prazo+'T12:00');
    return d>=dates[0]&&d<=dates[6];
  }).forEach(function(t){
    if(!cm[t.categoria_id]) return;
    cm[t.categoria_id].total++;
    if(t.concluido) cm[t.categoria_id].done++;
  });
  Object.values(S.semana).forEach(function(items){
    (items||[]).forEach(function(it){
      if(!cm[it.categoria_id]) return;
      cm[it.categoria_id].total++;
      if(it.done) cm[it.categoria_id].done++;
    });
  });
  var hasAny=false;
  Object.entries(cm).forEach(function(e){
    var id=e[0],c=e[1]; if(!c.total) return;
    hasAny=true;
    var pct=Math.round(c.done/c.total*100);
    wrap.innerHTML+='<div class="stat-row"><div class="stat-lbl">'+c.nome+'</div>'
      +'<div class="stat-bar"><div class="stat-fill" style="width:'+pct+'%;background:'+c.cor+'"></div></div>'
      +'<div class="stat-pct">'+c.done+'/'+c.total+'</div></div>';
  });
  if(!hasAny) wrap.innerHTML+='<div class="pr-empty">Sem dados para exibir esta semana</div>';
}

// ── CARD MODAL ────────────────────────────────
function openCardModal(item, source, cellKey, defaultTime, dayIndex) {
  var isNew = !item;
  var modal = document.getElementById('card-overlay');
  if (!modal) return;

  // Preencher categorias
  var catSel = document.getElementById('cm-cat');
  catSel.innerHTML = S.categorias.map(function(c){
    return '<option value="'+c.id+'">'+(c.icone||'')+'  '+c.nome+'</option>';
  }).join('');

  // Kanban: popular colunas dinamicamente
  var kanbanSel = document.getElementById('cm-kanban-col');
  if(kanbanSel){
    kanbanSel.innerHTML = '<option value="">⬜ Inbox (sem etapa)</option>'
      + S.kanbanCols.map(function(c){return '<option value="'+c.id+'">'+c.titulo+'</option>';}).join('');
  }

  // Dias checklist
  var diasWrap = document.getElementById('cm-dias-check');
  var diasNome=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  diasWrap.innerHTML=diasNome.map(function(dn,i){
    return '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text2);cursor:pointer">'
      +'<input type="checkbox" value="'+i+'" class="cm-dia-ck"> '+dn+'</label>';
  }).join('');

  var todayISO = new Date().toISOString().slice(0,10);

  if (isNew) {
    document.getElementById('cm-id').textContent = 'Novo card';
    document.getElementById('cm-title').value = '';
    catSel.value = S.categorias[0]?S.categorias[0].id:'';
    document.getElementById('cm-tipo').value = source==='rotina'?'rotina':'unica';
    document.getElementById('cm-urg').value = 'm';
    // Prazo = hoje + 7 dias (sempre)
    var prazoDefault = new Date(); prazoDefault.setDate(prazoDefault.getDate()+7);
    document.getElementById('cm-prazo').value = prazoDefault.toISOString().slice(0,10);
    document.getElementById('cm-horario').value = defaultTime||'';
    // Se criando do planner: data_inicio = data do slot clicado, horario já vem pelo defaultTime
    if (source === 'semana' && dayIndex !== undefined) {
      var wdSlot = getWeekDates();
      var slotDate = wdSlot[dayIndex] ? wdSlot[dayIndex].toISOString().slice(0,10) : '';
      document.getElementById('cm-data-inicio').value = slotDate;
    } else {
      document.getElementById('cm-data-inicio').value = '';
    }
    document.getElementById('cm-data-fim').value = '';
    document.getElementById('cm-desc').value = '';
    document.getElementById('cm-checklist-items').innerHTML = '';
    document.getElementById('cm-comments').innerHTML = '';
    document.getElementById('cm-vinculos-list').innerHTML = '';
    if(kanbanSel) kanbanSel.value = '';
  } else {
    var editItem = item;
    if(source==='rotina_blk' && item._rId){
      var rOrig = S.rotina.find(function(r){return r.id===item._rId;});
      if(rOrig){ editItem = Object.assign({}, rOrig, {_isRotina:true,_rId:item._rId,_day:item._day,done:item.done,id:rOrig.id}); source='rotina'; }
    }
    document.getElementById('cm-id').textContent = editItem.id || (editItem._rId||'');
    document.getElementById('cm-title').value = editItem.titulo||editItem.texto||'';
    catSel.value = editItem.categoria_id||'';
    // source='rotina' garante tipo='rotina' independente do campo armazenado
    document.getElementById('cm-tipo').value = (source==='rotina') ? 'rotina' : (editItem.tipo||'unica');
    document.getElementById('cm-urg').value = editItem.urgencia||'m';
    document.getElementById('cm-prazo').value = editItem.prazo||editItem.data||editItem.data_inicio||todayISO;
    document.getElementById('cm-horario').value = editItem.horario||'';
    document.getElementById('cm-data-inicio').value = editItem.data_inicio||'';
    document.getElementById('cm-data-fim').value = editItem.data_fim||'';
    document.getElementById('cm-desc').value = editItem.descricao||'';
    renderCmChecklist(editItem.checklist||[]);
    renderCmComments(editItem.comentarios||[]);
    renderCmVinculos(editItem.vinculos||[]);
    if(kanbanSel) kanbanSel.value = editItem.kanban_coluna_id||'';
    var isRotina = source==='rotina' || editItem.tipo==='rotina' || editItem._isRotina;
    if(editItem.dias && Array.isArray(editItem.dias)){
      document.querySelectorAll('.cm-dia-ck').forEach(function(ck){
        ck.checked = editItem.dias.indexOf(parseInt(ck.value)) >= 0;
      });
    }
    item = editItem;
  }

  // Mostrar campos corretos por tipo
  var tipoVal = document.getElementById('cm-tipo').value;
  var isRotinaSource = source==='rotina';
  toggleRotinaDiasUI(tipoVal==='rotina');
  toggleKanbanUI(!isRotinaSource && tipoVal!=='rotina');
  document.getElementById('cm-tipo').onchange=function(){
    toggleRotinaDiasUI(this.value==='rotina');
    toggleKanbanUI(!isRotinaSource && this.value!=='rotina');
  };

  setTimeout(function(){autoResize(document.getElementById('cm-title'));},50);
  S.cardCtx = {item:item, source:source, cellKey:cellKey, defaultTime:defaultTime, dayIndex:dayIndex, isNew:isNew};

  // Mostrar botão "Remover do Planner" apenas para itens existentes agendados (não rotinas)
  var unschedBtn = document.getElementById('cm-unschedule-btn');
  if(unschedBtn){
    var showUnsched = !isNew && source !== 'rotina' &&
      !!(item && (item.data_inicio || item.horario));
    unschedBtn.style.display = showUnsched ? '' : 'none';
  }

  switchCmTab('detalhes', document.querySelector('.cm-tab[data-tab="detalhes"]'));
  document.getElementById('cm-saved-msg').textContent='';
  modal.classList.add('open');
  setTimeout(function(){document.getElementById('cm-title').focus();},80);
}

function toggleRotinaDiasUI(isRotina){
  var el = document.getElementById('cm-dias-check-row');
  if(el) el.style.display = isRotina ? 'block' : 'none';
}
function toggleKanbanUI(show){
  var el = document.getElementById('cm-kanban-row');
  if(el) el.style.display = show ? '' : 'none';
}

function closeCardModal(){
  document.getElementById('card-overlay').classList.remove('open');
  S.cardCtx=null;
}

async function unscheduleCard(){
  var ctx = S.cardCtx; if(!ctx || ctx.isNew) return;
  var item = ctx.item, source = ctx.source;
  if(source === 'rotina') return;

  if(source === 'backlog'){
    // Zera apenas os campos de agendamento; prazo (deadline) é mantido
    var patch = {data_inicio: null, data_fim: null, horario: null};
    Object.assign(item, patch);
    await api('PUT', '/api/backlog/'+item.id, patch);
  } else if(source === 'imprevisto'){
    var patchi = {data_inicio: null, data_fim: null, horario: null};
    Object.assign(item, patchi);
    await api('PUT', '/api/imprevistos/'+item.id, patchi);
  } else if(source === 'semana'){
    // Itens semana: deletar do planner e criar como backlog sem agendamento
    await api('DELETE', '/api/semanas/'+S.weekKey+'/item/'+item.id);
    Object.keys(S.semana).forEach(function(k){
      S.semana[k]=(S.semana[k]||[]).filter(function(i){return i.id!==item.id;});
    });
    var blPayload = {
      titulo: item.titulo||item.texto||'',
      categoria_id: item.categoria_id||null,
      urgencia: item.urgencia||'m',
      prazo: item.prazo||null,
      descricao: item.descricao||'',
      checklist: item.checklist||[],
      comentarios: item.comentarios||[],
      vinculos: item.vinculos||[],
      kanban_coluna_id: item.kanban_coluna_id||null
    };
    var newBL = await api('POST', '/api/backlog', blPayload);
    if(newBL) S.backlog.push(newBL);
  }

  buildGrade(); buildBLMini(); buildImpMini();
  if(S.page==='backlog') renderBacklog();
  if(S.page==='kanban') renderKanban();
  updateBadges();
  closeCardModal();
}

function switchCmTab(name,btn){
  document.querySelectorAll('.cm-tab-pane').forEach(function(p){p.classList.remove('active');});
  var pane=document.getElementById('cm-pane-'+name); if(pane) pane.classList.add('active');
  document.querySelectorAll('.cm-tab').forEach(function(t){t.classList.remove('active');});
  if(btn) btn.classList.add('active');
  else { var b=document.querySelector('.cm-tab[data-tab="'+name+'"]'); if(b) b.classList.add('active'); }
}

async function saveCardModal(){
  var ctx=S.cardCtx; if(!ctx) return;
  var titulo=document.getElementById('cm-title').value.trim();
  if(!titulo){siteAlert('Digite o título');return;}
  var cat=document.getElementById('cm-cat').value;
  var tipo=document.getElementById('cm-tipo').value;
  var urg=document.getElementById('cm-urg').value;
  var prazo=document.getElementById('cm-prazo').value||null;
  var isRotina=tipo==='rotina';
  var horario=document.getElementById('cm-horario').value||null;
  var desc=document.getElementById('cm-desc').value;
  var checklist=gatherChecklist();
  var dias=Array.from(document.querySelectorAll('.cm-dia-ck:checked')).map(function(c){return parseInt(c.value);});
  var dataInicio=document.getElementById('cm-data-inicio').value||null;
  var dataFim=document.getElementById('cm-data-fim').value||null;
  var kanbanColId=(document.getElementById('cm-kanban-col')||{value:''}).value||null;
  var source=ctx.source;

  var payload={titulo:titulo,texto:titulo,categoria_id:cat,tipo:tipo,urgencia:urg,
      prazo:prazo,data:prazo,horario:horario,descricao:desc,checklist:checklist,dias:dias,
      data_inicio:dataInicio,data_fim:dataFim,kanban_coluna_id:kanbanColId};

  if(ctx.isNew){
    if(source==='backlog'){
      var created=await api('POST','/api/backlog',payload);
      if(created){S.backlog.push(created);renderBacklog();buildBLMini();}
    } else if(source==='semana'){
      if(tipo==='rotina'){
        var crR=await api('POST','/api/rotina',Object.assign(payload,{ativo:true}));
        if(crR){S.rotina.push(crR); buildGrade();}
      } else {
        // Execução única → criar como item de backlog; data_inicio = data do slot
        var cellKey2=ctx.cellKey;
        if(!cellKey2){var t2=horario?horario.replace(':',''):'0900';cellKey2='0_'+t2;}
        var slotDayIdx = ctx.dayIndex !== undefined ? ctx.dayIndex : parseInt((cellKey2||'0').split('_')[0]);
        var wd2 = getWeekDates();
        var dataItem = wd2[slotDayIdx] ? wd2[slotDayIdx].toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
        // data_inicio = data do slot (âncora no planner); prazo vem do formulário (hoje+7)
        payload.data_inicio = dataItem;
        payload.data_fim = null;
        var crBL = await api('POST','/api/backlog', payload);
        if(crBL){S.backlog.push(crBL);buildGrade();buildBLMini();if(S.page==='backlog')renderBacklog();}
      }
    } else if(source==='rotina'){
      var cr2=await api('POST','/api/rotina',Object.assign(payload,{ativo:true}));
      if(cr2){S.rotina.push(cr2);if(S.page==='rotina')renderRotinaPage();buildGrade();}
    } else if(source==='imprevisto'){
      var cr3=await api('POST','/api/imprevistos',payload);
      if(cr3){S.imprevistos.unshift(cr3);if(S.page==='imprevistos')renderImpPg();buildImpMini();}
    }
  } else {
    var item=ctx.item;
    Object.assign(item,payload);
    if(source==='backlog'){
      await api('PUT','/api/backlog/'+item.id,payload);
      renderBacklog();
    } else if(source==='semana'){
      if(tipo==='rotina'){
        // Migrar de item de semana para rotina global
        await api('DELETE','/api/semanas/'+S.weekKey+'/item/'+item.id);
        var crRM=await api('POST','/api/rotina',Object.assign(payload,{ativo:true}));
        if(crRM){S.rotina.push(crRM); loadSemana().then(buildGrade);}
      } else {
        await api('PUT','/api/semanas/'+S.weekKey+'/item/'+item.id,payload);
        var freshSemana=await api('GET','/api/semanas/'+S.weekKey);
        if(freshSemana) S.semana=freshSemana;
        buildGrade();
      }
    } else if(source==='rotina'){
      payload.ativo=item.ativo!==undefined?item.ativo:true;
      await api('PUT','/api/rotina/'+item.id,payload);
      var freshR=await api('GET','/api/rotina');
      if(freshR) S.rotina=freshR;
      if(S.page==='rotina') renderRotinaPage();
    } else if(source==='imprevisto'){
      await api('PUT','/api/imprevistos/'+item.id,payload);
      var idx2=S.imprevistos.findIndex(function(i){return i.id===item.id;});
      if(idx2>=0) Object.assign(S.imprevistos[idx2],payload);
      if(S.page==='imprevistos') renderImpPg();
    }
    buildGrade(); buildBLMini(); buildRotMini(); buildImpMini();
  }
  // Atualizar kanban se visível (etapa pode ter mudado)
  if(S.page==='kanban') renderKanban();
  updateBadges();
  buildStats();
  closeCardModal();
}

// ── CHECKLIST ─────────────────────────────────
function renderCmChecklist(items){
  var wrap=document.getElementById('cm-checklist-items'); if(!wrap) return;
  wrap.innerHTML='';
  items.forEach(function(it){
    var div=document.createElement('div'); div.className='checklist-item';
    div.innerHTML='<div class="cl-ck'+(it.done?' done':'')+'">✓</div>'
      +'<input class="cl-text'+(it.done?' done':'')+'" value="'+it.texto.replace(/"/g,'&quot;')+'">'
      +'<button class="cl-del">✕</button>';
    div.querySelector('.cl-ck').onclick=function(){
      it.done=!it.done;
      div.querySelector('.cl-ck').classList.toggle('done',it.done);
      div.querySelector('.cl-text').classList.toggle('done',it.done);
    };
    div.querySelector('.cl-text').oninput=function(){it.texto=this.value;};
    div.querySelector('.cl-del').onclick=function(){div.remove();};
    wrap.appendChild(div);
  });
}
function gatherChecklist(){
  var items=[];
  document.querySelectorAll('#cm-checklist-items .checklist-item').forEach(function(div){
    var txt=div.querySelector('.cl-text').value.trim();
    var done=div.querySelector('.cl-ck').classList.contains('done');
    if(txt) items.push({texto:txt,done:done});
  });
  return items;
}
function addChecklistItem(){
  var inp=document.getElementById('cm-cl-input'); if(!inp) return;
  var txt=inp.value.trim(); if(!txt) return;
  var wrap=document.getElementById('cm-checklist-items'); if(!wrap) return;
  var it={texto:txt,done:false};
  var div=document.createElement('div'); div.className='checklist-item';
  div.innerHTML='<div class="cl-ck">✓</div>'
    +'<input class="cl-text" value="'+txt.replace(/"/g,'&quot;')+'">'
    +'<button class="cl-del">✕</button>';
  div.querySelector('.cl-ck').onclick=function(){
    it.done=!it.done;
    div.querySelector('.cl-ck').classList.toggle('done',it.done);
    div.querySelector('.cl-text').classList.toggle('done',it.done);
  };
  div.querySelector('.cl-text').oninput=function(){it.texto=this.value;};
  div.querySelector('.cl-del').onclick=function(){div.remove();};
  wrap.appendChild(div);
  inp.value='';
}

// ── COMENTÁRIOS ───────────────────────────────
function renderCmComments(comments){
  var wrap=document.getElementById('cm-comments'); if(!wrap) return;
  wrap.innerHTML='';
  comments.forEach(function(c){
    var div=document.createElement('div'); div.className='comment-item';
    div.innerHTML='<div class="comment-ts">'+c.ts+'</div>'
      +'<div class="comment-text">'+c.texto+'</div>';
    wrap.appendChild(div);
  });
}
async function addCardComment(){
  var inp=document.getElementById('cm-comment-input'); if(!inp) return;
  var texto=inp.value.trim(); if(!texto) return;
  var ctx=S.cardCtx; if(!ctx||ctx.isNew) return;
  var item=ctx.item;
  var url='';
  if(ctx.source==='backlog')    url='/api/backlog/'+item.id+'/comentario';
  else if(ctx.source==='imprevisto') url='/api/imprevistos/'+item.id+'/comentario';
  else if(ctx.source==='semana') url='/api/semanas/'+S.weekKey+'/item/'+item.id+'/comentario';
  else if(ctx.source==='rotina') url='/api/rotina/'+item.id+'/comentario';
  else if(ctx.source==='imprevisto') url='/api/imprevistos/'+item.id+'/comentario';
  if(!url) return;
  var c=await api('POST',url,{texto:texto});
  if(c){
    if(!item.comentarios) item.comentarios=[];
    item.comentarios.push(c);
    renderCmComments(item.comentarios);
    inp.value='';
  }
}

// ── VÍNCULOS ──────────────────────────────────
function renderCmVinculos(vinculos){
  var wrap=document.getElementById('cm-vinculos-list'); if(!wrap) return;
  wrap.innerHTML='';
  (vinculos||[]).forEach(function(v){
    var div=document.createElement('div'); div.className='vinculo-item';
    div.innerHTML='<span class="vinculo-id">'+v.id+'</span>'
      +'<span class="vinculo-title">'+v.titulo+'</span>'
      +'<span class="vinculo-tipo">'+v.tipo+'</span>'
      +'<button class="btn-icon" style="font-size:11px" onclick="removeVinculo(\''+v.id+'\')">✕</button>';
    wrap.appendChild(div);
  });
}
async function searchCards(q){
  var res=document.getElementById('cm-search-results'); if(!res) return;
  if(!q||q.length<2){res.classList.remove('open');return;}
  var data=await api('GET','/api/cards/search?q='+encodeURIComponent(q));
  if(!data||!data.length){res.classList.remove('open');return;}
  res.innerHTML='';
  data.forEach(function(item){
    var div=document.createElement('div'); div.className='search-result-item';
    div.innerHTML='<span class="sr-id">'+item.id+'</span><span class="sr-title">'+item.titulo+'</span>';
    div.onclick=function(){addVinculo(item);res.classList.remove('open');document.getElementById('cm-vinc-search').value='';};
    res.appendChild(div);
  });
  res.classList.add('open');
}
function addVinculo(item){
  var ctx=S.cardCtx; if(!ctx||!ctx.item) return;
  if(!ctx.item.vinculos) ctx.item.vinculos=[];
  if(ctx.item.vinculos.find(function(v){return v.id===item.id;})) return;
  ctx.item.vinculos.push(item);
  renderCmVinculos(ctx.item.vinculos);
}
function removeVinculo(id){
  var ctx=S.cardCtx; if(!ctx||!ctx.item) return;
  ctx.item.vinculos=(ctx.item.vinculos||[]).filter(function(v){return v.id!==id;});
  renderCmVinculos(ctx.item.vinculos);
}
async function createImpFromCard(){
  var ctx=S.cardCtx; if(!ctx||!ctx.item) return;
  if(ctx.isNew){siteAlert('Salve o card primeiro antes de criar um imprevisto vinculado.');return;}
  var desc = await sitePrompt('Descreva o imprevisto que impacta "'+ctx.item.titulo+'":', 'Imprevisto: '+ctx.item.titulo);
  if(!desc||!desc.trim()) return; // cancelou ou vazio
  var urg=(await sitePrompt('Urgência? (h=Urgente, m=Esta semana, l=Aguardar)','h')||'h').toLowerCase();
  if(['h','m','l'].indexOf(urg)<0) urg='h';
  var monday=getWeekDates()[0].toISOString().slice(0,10);
  var created=await api('POST','/api/imprevistos',{
    texto:desc.trim(), urgencia:urg, data:monday,
    vinculos:[{id:ctx.item.id,titulo:ctx.item.titulo,tipo:ctx.source}]
  });
  if(created){
    S.imprevistos.unshift(created);
    if(!ctx.item.vinculos) ctx.item.vinculos=[];
    ctx.item.vinculos.push({id:created.id,titulo:desc.trim(),tipo:'imprevisto'});
    renderCmVinculos(ctx.item.vinculos);
    // Salvar o vínculo no card de origem
    if(ctx.source==='backlog') await api('PUT','/api/backlog/'+ctx.item.id,{vinculos:ctx.item.vinculos});
    else if(ctx.source==='rotina') await api('PUT','/api/rotina/'+ctx.item.id,{vinculos:ctx.item.vinculos});
    else if(ctx.source==='semana') await api('PUT','/api/semanas/'+S.weekKey+'/item/'+ctx.item.id,{vinculos:ctx.item.vinculos});
    updateBadges(); buildImpMini();
    var msg=document.getElementById('cm-saved-msg');
    if(msg){msg.textContent='⚡ Imprevisto '+created.id+' criado e vinculado!';setTimeout(function(){msg.textContent='';},3000);}
  }
}

// ── BACKLOG PAGE ──────────────────────────────
function renderBacklog(){
  var filters=document.getElementById('bl-filters'); if(!filters) return;
  filters.innerHTML='';
  [['all','Todos'],['_np','⚠️ Sem prazo']].forEach(function(pair){
    var btn=document.createElement('button');
    btn.className='filter-btn'+(S.blFilter===pair[0]?' active':'');
    btn.textContent=pair[1];
    btn.onclick=function(){S.blFilter=pair[0];renderBacklog();};
    filters.appendChild(btn);
  });
  S.categorias.forEach(function(c){
    var btn=document.createElement('button');
    btn.className='filter-btn'+(S.blFilter===c.id?' active':'');
    btn.textContent=c.icone+' '+c.nome;
    btn.onclick=function(){S.blFilter=c.id;renderBacklog();};
    filters.appendChild(btn);
  });

  var searchQ=(document.getElementById('bl-search')||{value:''}).value.toLowerCase().trim();
  var urgF=(document.getElementById('bl-urg-filter')||{value:''}).value;
  var statusF=(document.getElementById('bl-status-filter')||{value:''}).value;

  var tbody=document.getElementById('bl-tbody'); if(!tbody) return;
  tbody.innerHTML='';
  var uL={h:'🔴',m:'🟡',l:'🟢'};
  S.backlog.filter(function(t){
    if(S.blFilter==='_np') return !t.prazo;
    if(S.blFilter!=='all'&&t.categoria_id!==S.blFilter) return false;
    if(urgF&&t.urgencia!==urgF) return false;
    if(statusF==='aberto'&&t.concluido) return false;
    if(statusF==='concluido'&&!t.concluido) return false;
    if(searchQ&&!t.titulo.toLowerCase().includes(searchQ)&&!t.id.toLowerCase().includes(searchQ)) return false;
    return true;
  }).forEach(function(task){
    var cat=getCat(task.categoria_id), noPrazo=!task.prazo;
    var inPlanner = isScheduled(task);
    var dateStr=task.prazo?new Date(task.prazo+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    var tr=document.createElement('tr');
    if(task.concluido) tr.classList.add('done-row');
    tr.innerHTML='<td class="td-check"><div class="chk'+(task.concluido?' done':'')+'">✓</div></td>'
      +'<td class="td-id">'+task.id+'</td>'
      +'<td class="td-title">'+(task.titulo||'')
        +(inPlanner?'<span class="td-planned-badge" title="Agendado no calendário">📅</span>':'')
        +(noPrazo?'<span class="no-prazo-badge" style="margin-left:6px">sem prazo</span>':'')
        +((task.checklist||[]).length?'<span style="font-family:var(--font-m);font-size:9px;color:var(--text3);margin-left:4px"> ☑'+(task.checklist.filter(function(c){return c.done;}).length)+'/'+task.checklist.length+'</span>':'')
        +((task.comentarios||[]).length?'<span style="font-family:var(--font-m);font-size:9px;color:var(--text3);margin-left:4px"> 💬'+task.comentarios.length+'</span>':'')
        +'</td>'
      +'<td><span class="cat-tag" style="background:'+cat.cor+';color:#000">'+cat.icone+' '+cat.nome+'</span></td>'
      +'<td><span class="urg-tag u-'+(task.urgencia||'m')+'">'+uL[task.urgencia]+'</span></td>'
      +'<td style="font-family:var(--font-m);font-size:10px;color:'+(noPrazo?'var(--amber)':'var(--text3)')+'">'+dateStr+'</td>'
      +'<td><div style="display:flex;gap:4px"><button class="btn-icon td-del" title="Excluir">🗑️</button></div></td>';
    tr.querySelector('.td-title').onclick=function(){openCardModal(task,'backlog',null,null);};
    tr.querySelector('.chk').onclick=async function(){
      task.concluido=!task.concluido;
      await api('PUT','/api/backlog/'+task.id,{concluido:task.concluido});
      renderBacklog(); updateBadges(); buildBLMini();
    };
    tr.querySelector('.td-del').onclick=async function(){
      if(!await siteConfirm('Excluir?')) return;
      await api('DELETE','/api/backlog/'+task.id);
      S.backlog=S.backlog.filter(function(b){return b.id!==task.id;});
      renderBacklog(); updateBadges(); buildBLMini();
    };
    tbody.appendChild(tr);
  });
  updateBadges();
}

// ── ROTINA PAGE ───────────────────────────────
function populateRotCatFilter(){
  var sel=document.getElementById('rot-cat-filter'); if(!sel) return;
  sel.innerHTML='<option value="">Categoria</option>';
  S.categorias.forEach(function(c){
    sel.innerHTML+='<option value="'+c.id+'">'+c.icone+' '+c.nome+'</option>';
  });
}

function renderRotinaPage(){
  populateRotCatFilter();
  var grid=document.getElementById('rot-grid'); if(!grid) return;
  var searchQ=(document.getElementById('rot-search')||{value:''}).value.toLowerCase().trim();
  var catF=(document.getElementById('rot-cat-filter')||{value:''}).value;
  var diaF=(document.getElementById('rot-dia-filter')||{value:''}).value;
  var statusF=(document.getElementById('rot-status-filter')||{value:''}).value;
  var today=new Date().toISOString().slice(0,10);

  grid.innerHTML='';
  var diasN=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  var filtered=S.rotina.filter(function(r){
    if(catF&&r.categoria_id!==catF) return false;
    if(diaF!==''&&r.dias.indexOf(parseInt(diaF))<0) return false;
    if(statusF==='ativo'&&!r.ativo) return false;
    if(statusF==='pausado'&&r.ativo) return false;
    if(searchQ&&!r.titulo.toLowerCase().includes(searchQ)&&!r.id.toLowerCase().includes(searchQ)) return false;
    return true;
  });

  filtered.forEach(function(r){
    var cat=getCat(r.categoria_id);
    var total=r.dias.length;
    var done=r.dias.filter(function(d){return S.rotinaDone[r.id+'_'+d]==='done';}).length;
    var isExpired=r.data_fim&&r.data_fim<today;
    var isAtiva=rotinaAtivaNaData(r,today);
    var card=document.createElement('div');
    card.className='rot-card'+(isExpired?' expired':'');
    var rangeInfo='';
    if(r.data_inicio) rangeInfo+='<span class="rot-range">Início: '+formatDate(r.data_inicio)+'</span>';
    if(r.data_fim)    rangeInfo+='<span class="rot-range'+(isExpired?' expired-lbl':'')+'">'+(isExpired?'⛔ Encerrou:':'Fim:')+'  '+formatDate(r.data_fim)+'</span>';
    card.innerHTML='<div class="rot-card-head">'
      +'<span class="rot-dot" style="background:'+cat.cor+'"></span>'
      +'<div style="flex:1">'
      +'<div class="rot-title'+(done===total&&total>0?' done':'')+(isExpired?' expired-title':'')+'">'+r.titulo+'</div>'
      +'<div class="rot-sub"><span class="rot-horario">'+r.horario+'</span>'
      +'<span class="rot-dias">'+r.dias.map(function(d){return diasN[d];}).join(', ')+'</span></div>'
      +'<div class="rot-sub">'+rangeInfo+'<span class="rot-id">'+r.id+'</span></div>'
      +'</div>'
      +'<span class="cat-tag" style="background:'+cat.cor+';color:#000">'+cat.icone+'</span>'
      +'</div>'
      +'<div class="rot-card-body">'
      +'<div style="font-family:var(--font-m);font-size:8px;color:var(--text3);letter-spacing:1px;margin-bottom:5px">ESTA SEMANA — '+done+'/'+total+'</div>'
      +'<div class="rot-week-dots" id="rwd-'+r.id+'"></div>'
      +'<div class="rot-card-acts">'
      +'<button class="btn-g rot-edit" style="font-size:9px;padding:5px 10px">✏️ Editar</button>'
      +'<button class="btn-d rot-del">🗑️</button>'
      +'<button class="btn-g rot-tog" style="font-size:9px;padding:5px 10px;color:'+(r.ativo?'var(--amber)':'var(--green)')+'">'+( r.ativo?'⏸ Pausar':'▶ Reativar')+'</button>'
      +'</div>'
      +'</div>';

    card.querySelector('.rot-card-head').onclick=function(){openCardModal(r,'rotina',null,null);};
    card.querySelector('.rot-edit').onclick=function(e){e.stopPropagation();openCardModal(r,'rotina',null,null);};
    card.querySelector('.rot-del').onclick=async function(e){
      e.stopPropagation();
      if(!await siteConfirm('Excluir rotina "'+r.titulo+'"?')) return;
      await api('DELETE','/api/rotina/'+r.id);
      S.rotina=S.rotina.filter(function(x){return x.id!==r.id;});
      renderRotinaPage(); buildGrade();
    };
    card.querySelector('.rot-tog').onclick=async function(e){
      e.stopPropagation();
      r.ativo=!r.ativo;
      await api('PUT','/api/rotina/'+r.id,{ativo:r.ativo});
      renderRotinaPage(); buildGrade();
    };

    // Seção dias: duas linhas — (1) checkboxes de agendamento, (2) dots de progresso desta semana
    var dw=card.querySelector('#rwd-'+r.id);

    // Linha 1: Checkboxes que controlam quais dias a rotina está agendada
    var ckRow=document.createElement('div');
    ckRow.className='rot-ck-row';
    for(var d2=0;d2<7;d2++){
      (function(day){
        var lbl=document.createElement('label');
        lbl.className='rot-ck-lbl';
        lbl.title=(r.dias.indexOf(day)>=0?'Remover ':'Adicionar ')+diasN[day]+' da rotina';
        var ck=document.createElement('input');
        ck.type='checkbox';
        ck.checked=r.dias.indexOf(day)>=0;
        ck.className='rot-ck-inp';
        ck.onclick=function(e){e.stopPropagation();};
        ck.onchange=async function(e){
          e.stopPropagation();
          var newDias=r.dias.slice();
          if(this.checked){if(newDias.indexOf(day)<0)newDias.push(day);}
          else{newDias=newDias.filter(function(x){return x!==day;});}
          newDias.sort(function(a,b){return a-b;});
          // Atualizar estado local (r e S.rotina apontam para o mesmo objeto)
          r.dias=newDias;
          var idx=S.rotina.findIndex(function(x){return x.id===r.id;});
          if(idx>=0) S.rotina[idx].dias=newDias;
          // Salvar APENAS os dias no servidor — NÃO enviar data_inicio
          // (enviar data_inicio do objeto local pode re-introduzir valores ruins)
          await api('PUT','/api/rotina/'+r.id,{dias:newDias});
          // Reconstruir grade com o estado local atualizado
          buildGrade();
          // Atualizar calendário se visível
          if(S.page==='calendario') renderCalendario();
          // Atualizar dot visual
          var dotEl=dw.querySelector('.rwd-dot[data-day="'+day+'"]');
          if(dotEl){
            dotEl.classList.toggle('na',!this.checked);
            dotEl.style.pointerEvents=this.checked?'':'none';
          }
          lbl.title=(newDias.indexOf(day)>=0?'Remover ':'Adicionar ')+diasN[day]+' da rotina';
        };
        var span=document.createElement('span');
        span.textContent=diasN[day];
        span.className='rot-ck-label';
        lbl.appendChild(ck);
        lbl.appendChild(span);
        ckRow.appendChild(lbl);
      })(d2);
    }
    dw.appendChild(ckRow);

    // Linha 2: Dots de progresso desta semana
    var dotRow=document.createElement('div');
    dotRow.className='rot-dot-row';
    for(var d=0;d<7;d++){
      (function(day){
        var rel=r.dias.indexOf(day)>=0;
        var st=S.rotinaDone[r.id+'_'+day];
        var isDone=st==='done', isRem=st==='removed';
        var dot=document.createElement('div');
        dot.className='rwd rwd-dot'+(isDone?' done':'')+(!rel?' na':'')+(isRem?' removed':'');
        dot.dataset.day=day;
        dot.textContent=diasN[day];
        dot.title=!rel?'Não agendado':isDone?'✓ Feito nesta semana':isRem?'Pulado':'+Marcar como feito';
        if(rel&&!isRem){
          dot.onclick=async function(e){
            e.stopPropagation();
            var ns=isDone?undefined:'done';
            if(ns) S.rotinaDone[r.id+'_'+day]=ns; else delete S.rotinaDone[r.id+'_'+day];
            isDone=!isDone;
            dot.classList.toggle('done',isDone);
            await api('POST','/api/rotina_done/'+S.weekKey,S.rotinaDone);
            buildRotMini(); buildStats();
          };
        }
        dotRow.appendChild(dot);
      })(d);
    }
    dw.appendChild(dotRow);
    grid.appendChild(card);
  });
  if(!filtered.length)
    grid.innerHTML='<div style="padding:32px;color:var(--text3);font-family:var(--font-m);font-size:10px">Nenhuma rotina encontrada.</div>';
}

// ── CATEGORIAS ────────────────────────────────
function renderCategorias(){
  var grid=document.getElementById('cats-grid'); if(!grid) return;
  grid.innerHTML='';
  S.categorias.forEach(function(cat){
    var card=document.createElement('div'); card.className='cat-card';
    card.innerHTML='<div class="cat-icon-big" style="background:'+cat.cor+'22">'+cat.icone+'</div>'
      +'<div class="cat-info"><div class="cat-name">'+cat.nome+'</div>'
      +'<div class="cat-cor" style="display:flex;align-items:center;gap:4px">'
      +'<span style="background:'+cat.cor+';width:10px;height:10px;border-radius:50%;display:inline-block"></span>'
      +'<span style="color:var(--text3);font-size:11px">'+(cat.total_cards||0)+' cards associados</span></div></div>'
      +'<div class="cat-acts"><button class="btn-icon cat-del">🗑️</button></div>';
    card.onclick=function(e){if(!e.target.classList.contains('cat-del'))openCatModal(cat);};
    card.querySelector('.cat-del').onclick=async function(e){
      e.stopPropagation();
      if(!await siteConfirm('Excluir categoria?')) return;
      await api('DELETE','/api/categorias/'+cat.id);
      S.categorias=S.categorias.filter(function(c){return c.id!==cat.id;});
      renderCategorias();
    };
    grid.appendChild(card);
  });
}

// ── CAT MODAL ─────────────────────────────────
var _catCtx=null;
function openCatModal(cat){
  _catCtx=cat;
  var t=document.getElementById('cat-modal-title');
  if(t) t.textContent=cat?'Editar Categoria':'Nova Categoria';
  document.getElementById('cat-nome').value=cat?cat.nome:'';
  document.getElementById('cat-icone').value=cat?cat.icone:'📌';
  document.getElementById('cat-cor-picker').value=cat?cat.cor:'#3498db';
  document.getElementById('cat-cor-txt').value=cat?cat.cor:'#3498db';
  document.getElementById('cat-overlay').classList.add('open');
  setTimeout(function(){document.getElementById('cat-nome').focus();},80);
}
function closeCatModal(){document.getElementById('cat-overlay').classList.remove('open');}
async function saveCatModal(){
  var nome=(document.getElementById('cat-nome').value||'').trim();
  if(!nome){siteAlert('Digite o nome');return;}
  var data={nome:nome,icone:document.getElementById('cat-icone').value,cor:document.getElementById('cat-cor-picker').value};
  if(_catCtx){
    await api('PUT','/api/categorias/'+_catCtx.id,data);
    Object.assign(_catCtx,data);
  } else {
    var created=await api('POST','/api/categorias',data);
    if(created) S.categorias.push(created);
  }
  closeCatModal(); renderCategorias();
}

// ── EMOJI PICKER ──────────────────────────────
function buildEmojiPicker(){
  var ep=document.getElementById('emoji-picker'); if(!ep) return;
  ep.innerHTML='<div class="emoji-grid">'+EMOJIS.map(function(e){
    return '<button type="button" class="emoji-btn" onclick="selectEmoji(\''+e+'\')">'+e+'</button>';
  }).join('')+'</div>';
}
function toggleEmojiPicker(e){
  if(e) e.stopPropagation();
  var ep=document.getElementById('emoji-picker');
  if(ep) ep.classList.toggle('open');
}
function selectEmoji(e){
  document.getElementById('cat-icone').value=e;
  document.getElementById('emoji-picker').classList.remove('open');
}

// ── IMPREVISTOS PAGE ──────────────────────────
function renderImpPg(){
  var list=document.getElementById('imp-list'); if(!list) return;
  var searchQ=(document.getElementById('imp-search')||{value:''}).value.toLowerCase().trim();
  var statusF=(document.getElementById('imp-status-filter')||{value:''}).value;
  list.innerHTML='';
  var uL={h:'🔴',m:'🟡',l:'🟢'};
  var filtered=S.imprevistos.filter(function(imp){
    if(statusF==='aberto'&&imp.resolvido) return false;
    if(statusF==='resolvido'&&!imp.resolvido) return false;
    if(searchQ&&!imp.texto.toLowerCase().includes(searchQ)&&!imp.id.toLowerCase().includes(searchQ)) return false;
    return true;
  });
  if(!filtered.length){
    list.innerHTML='<div style="padding:20px;font-family:var(--font-m);font-size:10px;color:var(--text3);text-align:center">Nenhum imprevisto encontrado ✓</div>';
    return;
  }
  filtered.forEach(function(imp){
    var el=document.createElement('div');
    el.className='imp-item'+(imp.resolvido?' resolved':'');
    el.innerHTML='<div class="ii-head">'
      +'<div class="ii-text">'+imp.texto+'</div>'
      +'<span class="ii-id">'+imp.id+'</span>'
      +'</div>'
      +'<div class="ii-meta">'
      +'<span class="ii-date">'+formatDate(imp.data)+'</span>'
      +'<span style="font-family:var(--font-m);font-size:9px;color:var(--text3)">'+uL[imp.urgencia]+'</span>'
      +(imp.vinculos&&imp.vinculos.length
        ? '<div class="ii-vinculos">🔗 Impacta: '+imp.vinculos.map(function(v){return '<span class="ii-vinc-chip">'+v.id+' '+v.titulo+'</span>';}).join(' ')+ '</div>'
        : '')
      +'</div>'
      +'<div class="ii-actions">'
      +'<button class="btn-g imp-tog" style="font-size:9px;padding:4px 8px">'+( imp.resolvido?'↩ Reabrir':'✓ Resolver')+'</button>'
      +'<button class="btn-d imp-del">✕</button>'
      +'</div>';
    el.onclick=function(e){
      if(e.target.classList.contains('imp-tog')||e.target.classList.contains('imp-del')) return;
      openCardModal(imp,'imprevisto',null,null);
    };
    el.querySelector('.imp-tog').onclick=async function(){
      imp.resolvido=!imp.resolvido;
      await api('PUT','/api/imprevistos/'+imp.id,{resolvido:imp.resolvido});
      renderImpPg(); updateBadges();
    };
    el.querySelector('.imp-del').onclick=async function(){
      if(!await siteConfirm('Excluir imprevisto?')) return;
      await api('DELETE','/api/imprevistos/'+imp.id);
      S.imprevistos=S.imprevistos.filter(function(i){return i.id!==imp.id;});
      renderImpPg(); updateBadges(); buildImpMini();
    };
    list.appendChild(el);
  });
  updateBadges();
}
async function addImpPg(){
  var ta=document.getElementById('imp-ta');
  var texto=(ta?ta.value:'').trim(); if(!texto) return;
  var urg=(document.getElementById('imp-urg')||{value:'m'}).value;
  var created=await api('POST','/api/imprevistos',{texto:texto,urgencia:urg,data:new Date().toISOString().slice(0,10)});
  if(created){S.imprevistos.unshift(created);if(ta)ta.value='';renderImpPg();updateBadges();buildImpMini();}
}

// ── REVISÃO ───────────────────────────────────
async function renderRevisao(){
  await loadSemana(); // garantir dados atualizados
  var rev=await api('GET','/api/revisoes/'+S.weekKey)||{};
  S.revisao=rev;

  // Label da semana
  var dates=getWeekDates();
  var f=function(d){return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};
  var lbl=document.getElementById('rev-week-lbl');
  if(lbl) lbl.textContent='Semana '+getWeekNum(dates[0])+' · '+f(dates[0])+' – '+f(dates[6]);

  // Stats grid
  buildRevStats();

  // Reflexão
  var form=document.getElementById('rev-form'); if(!form) return;
  var qs=[
    {key:'fez',lbl:'✅ O que executei esta semana?'},
    {key:'nao',lbl:'❌ O que não consegui e por quê?'},
    {key:'imp',lbl:'⚡ Imprevistos que impactaram o plano?'},
    {key:'mel',lbl:'🔄 O que farei diferente na próxima semana?'},
    {key:'kr', lbl:'🎯 Os OKRs ainda fazem sentido? Ajuste necessário?'}
  ];
  form.innerHTML=qs.map(function(q){
    return '<div class="rev-q"><div class="rev-ql">'+q.lbl+'</div>'
      +'<textarea class="field-ta rev-ta" id="rq-'+q.key+'" rows="3" placeholder="...">'+(rev[q.key]||'')+'</textarea></div>';
  }).join('');

  // Planos de ação
  buildPlanosAcao(rev.planos_acao||[]);

  // Preencher categorias no form de plano
  var pfCat=document.getElementById('pf-cat');
  if(pfCat){
    pfCat.innerHTML=S.categorias.map(function(c){return '<option value="'+c.id+'">'+c.icone+' '+c.nome+'</option>';}).join('');
  }
  // Default prazo = próxima segunda
  var pfPrazo=document.getElementById('pf-prazo');
  if(pfPrazo&&!pfPrazo.value) pfPrazo.value=getWeekDates(1)[0].toISOString().slice(0,10);
}

function buildRevStats(){
  var wrap=document.getElementById('rev-stats-grid'); if(!wrap) return;
  var today=new Date().toISOString().slice(0,10);
  var cm={};
  S.categorias.forEach(function(c){cm[c.id]={nome:c.nome,cor:c.cor,icone:c.icone,total:0,done:0};});

  S.rotina.forEach(function(r){
    if(!cm[r.categoria_id]) return;
    r.dias.forEach(function(d){
      if(!itemAtivoNoSlot(r, d, S.weekKey)) return;
      var st=S.rotinaDone[r.id+'_'+d]; if(st==='removed') return;
      cm[r.categoria_id].total++;
      if(st==='done') cm[r.categoria_id].done++;
    });
  });
  S.backlog.filter(function(t){
    if(!t.prazo) return false;
    var dates=getWeekDates(); var d=new Date(t.prazo+'T12:00');
    return d>=dates[0]&&d<=dates[6];
  }).forEach(function(t){
    if(!cm[t.categoria_id]) return;
    cm[t.categoria_id].total++; if(t.concluido) cm[t.categoria_id].done++;
  });
  Object.values(S.semana).forEach(function(items){
    (items||[]).forEach(function(it){
      if(!cm[it.categoria_id]) return;
      cm[it.categoria_id].total++; if(it.done) cm[it.categoria_id].done++;
    });
  });

  var totalAll=0,doneAll=0;
  Object.values(cm).forEach(function(c){totalAll+=c.total;doneAll+=c.done;});
  var pctTotal=totalAll?Math.round(doneAll/totalAll*100):0;
  wrap.innerHTML='<div class="rev-stats-summary">'
    +'<div class="rss-big">'+pctTotal+'<span style="font-size:16px">%</span></div>'
    +'<div class="rss-lbl">Conclusão geral da semana</div>'
    +'<div class="rss-sub">'+doneAll+' de '+totalAll+' atividades</div>'
    +'</div>'
    +'<div class="rev-stats-bars">';
  Object.entries(cm).forEach(function(e){
    var id=e[0],c=e[1]; if(!c.total) return;
    var pct=Math.round(c.done/c.total*100);
    wrap.innerHTML+='<div class="stat-row">'
      +'<div class="stat-lbl">'+c.icone+' '+c.nome+'</div>'
      +'<div class="stat-bar"><div class="stat-fill" style="width:'+pct+'%;background:'+c.cor+'"></div></div>'
      +'<div class="stat-pct">'+c.done+'/'+c.total+'</div>'
      +'</div>';
  });
  wrap.innerHTML+='</div>';
}

async function saveRevisao(){
  var d={};
  ['fez','nao','imp','mel','kr'].forEach(function(k){
    var el=document.getElementById('rq-'+k);
    d[k]=el?el.value:'';
  });
  // Preservar planos_acao
  if(S.revisao.planos_acao) d.planos_acao=S.revisao.planos_acao;
  await api('POST','/api/revisoes/'+S.weekKey,d);
  S.revisao=Object.assign(S.revisao,d);
  var msg=document.getElementById('rev-saved-msg');
  if(msg){msg.textContent='✅ Reflexão salva!';setTimeout(function(){msg.textContent='';},3000);}
}

function buildPlanosAcao(planos){
  var wrap=document.getElementById('rev-planos-list'); if(!wrap) return;
  wrap.innerHTML='';
  if(!planos.length){
    wrap.innerHTML='<div style="color:var(--text3);font-family:var(--font-m);font-size:10px;padding:12px 0">Nenhum plano de ação ainda.</div>';
    return;
  }
  var uL={h:'🔴',m:'🟡',l:'🟢'};
  planos.forEach(function(p){
    var cat=getCat(p.categoria_id||'');
    var el=document.createElement('div'); el.className='plano-item'+(p.concluido?' concluido':'');
    el.innerHTML='<div class="plano-ck'+(p.concluido?' done':'')+'">✓</div>'
      +'<div class="plano-body">'
      +'<div class="plano-titulo">'+p.titulo+'</div>'
      +'<div class="plano-meta">'
      +'<span class="plano-id">'+p.id+'</span>'
      +(p.prazo?'<span class="plano-prazo">📅 '+formatDate(p.prazo)+'</span>':'')
      +'<span style="font-family:var(--font-m);font-size:9px">'+uL[p.urgencia||'m']+'</span>'
      +'<span class="cat-tag" style="background:'+cat.cor+';color:#000;font-size:9px">'+cat.icone+'</span>'
      +(p.promovido?'<span style="font-family:var(--font-m);font-size:9px;color:var(--green)">📌 no backlog</span>':'')
      +'</div>'
      +'</div>'
      +'<button class="btn-d plano-del" style="font-size:9px;padding:4px 8px">✕</button>';
    el.querySelector('.plano-ck').onclick=async function(){
      p.concluido=!p.concluido;
      await api('PUT','/api/revisoes/'+S.weekKey+'/plano/'+p.id,{concluido:p.concluido});
      el.classList.toggle('concluido',p.concluido);
      el.querySelector('.plano-ck').classList.toggle('done',p.concluido);
    };
    el.querySelector('.plano-del').onclick=async function(e){
      e.stopPropagation();
      if(!await siteConfirm('Excluir plano?')) return;
      await api('DELETE','/api/revisoes/'+S.weekKey+'/plano/'+p.id);
      S.revisao.planos_acao=(S.revisao.planos_acao||[]).filter(function(x){return x.id!==p.id;});
      buildPlanosAcao(S.revisao.planos_acao||[]);
    };
    wrap.appendChild(el);
  });
}

function openNovoPlano(){
  var form=document.getElementById('rev-plano-form');
  if(form) form.style.display=form.style.display==='none'?'block':'none';
}
function fecharNovoPlano(){
  var form=document.getElementById('rev-plano-form');
  if(form){form.style.display='none';document.getElementById('pf-titulo').value='';}
}
async function salvarPlano(){
  var titulo=(document.getElementById('pf-titulo').value||'').trim();
  if(!titulo){siteAlert('Digite a ação');return;}
  var cat=(document.getElementById('pf-cat')||{value:''}).value;
  var prazo=(document.getElementById('pf-prazo')||{value:''}).value||null;
  var urg=(document.getElementById('pf-urg')||{value:'m'}).value;
  var created=await api('POST','/api/revisoes/'+S.weekKey+'/plano',{titulo:titulo,categoria_id:cat,prazo:prazo,urgencia:urg});
  if(created){
    if(!S.revisao.planos_acao) S.revisao.planos_acao=[];
    S.revisao.planos_acao.push(created);
    buildPlanosAcao(S.revisao.planos_acao);
    fecharNovoPlano();
  }
}
async function promoverParaBacklog(){
  var titulo=(document.getElementById('pf-titulo').value||'').trim();
  if(!titulo){siteAlert('Digite a ação primeiro');return;}
  var cat=(document.getElementById('pf-cat')||{value:''}).value;
  var prazo=(document.getElementById('pf-prazo')||{value:''}).value||null;
  var urg=(document.getElementById('pf-urg')||{value:'m'}).value;
  // Criar plano
  var created=await api('POST','/api/revisoes/'+S.weekKey+'/plano',{titulo:titulo,categoria_id:cat,prazo:prazo,urgencia:urg,promovido:true});
  if(created){
    if(!S.revisao.planos_acao) S.revisao.planos_acao=[];
    S.revisao.planos_acao.push(created);
    // Também criar no backlog
    var blItem=await api('POST','/api/backlog',{titulo:titulo,categoria_id:cat,urgencia:urg,prazo:prazo,tipo:'unica',
      descricao:'Promovido da revisão semanal '+S.weekKey,checklist:[],comentarios:[],vinculos:[]});
    if(blItem){
      S.backlog.push(blItem);
      siteAlert('✅ Plano criado e adicionado ao Backlog como '+blItem.id+'!');
    }
    buildPlanosAcao(S.revisao.planos_acao);
    fecharNovoPlano();
    updateBadges();
  }
}

// ── CALENDÁRIO ────────────────────────────────
async function renderCalendario(){
  var yr=S.calMonth.getFullYear(), mo=S.calMonth.getMonth();
  var el=document.getElementById('cal-lbl');
  if(el) el.textContent=S.calMonth.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

  // Calcular todas as semanas do mês
  var weekKeys=getMonthWeekKeys(yr,mo);
  // Buscar rotinaDone em bulk
  var bulkDone=await api('POST','/api/rotina_done_bulk',{weeks:weekKeys});
  S.calBulkDone=bulkDone||{};

  // Legenda de categorias com rotina ativa
  buildCalLegend();

  var grid=document.getElementById('cal-grid'); if(!grid) return;
  grid.innerHTML='';
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(function(d){grid.innerHTML+='<div class="cal-dow">'+d+'</div>';});
  var fd=new Date(yr,mo,1), sd=fd.getDay(), dim=new Date(yr,mo+1,0).getDate();
  var todayD=new Date(); todayD.setHours(0,0,0,0);

  for(var i=0;i<sd;i++){
    var p=new Date(yr,mo,-sd+i+1);
    grid.innerHTML+='<div class="cal-day other"><div class="cal-dn">'+p.getDate()+'</div></div>';
  }
  for(var day=1;day<=dim;day++){
    (function(d){
      var dt=new Date(yr,mo,d);
      var isT=dt.getTime()===todayD.getTime(), dow=dt.getDay();
      var di=dow===0?6:dow-1; // 0=Seg...6=Dom (para rotina)
      var div=document.createElement('div');
      div.className='cal-day'+(isT?' is-today':'');

      // Calcular semana desta data
      var dtISO=dt.toISOString().slice(0,10);
      var wk=getDateWeekKey(dt);
      var rdForWeek=S.calBulkDone[wk]||{};

      // Rotinas ativas neste dia
      var activeCats=[];
      var removedCount=0, doneCount=0, totalCount=0;
      S.rotina.filter(function(r){
        if(!r.ativo) return false;
        if(r.dias.indexOf(di)<0) return false;
        if(r.data_inicio&&dtISO<r.data_inicio) return false;
        if(r.data_fim&&dtISO>r.data_fim) return false;
        return true;
      }).forEach(function(r){
        totalCount++;
        var rdKey=r.id+'_'+di;
        var state=rdForWeek[rdKey];
        if(state==='removed'){removedCount++;return;}
        if(state==='done') doneCount++;
        if(activeCats.indexOf(r.categoria_id)<0) activeCats.push(r.categoria_id);
      });

      // Backlog vencendo neste dia
      var blCount=0;

      div.innerHTML='<div class="cal-dn">'+d+'</div>';

      // Dots de categoria
      if(activeCats.length){
        var dd=document.createElement('div');
        dd.style.cssText='display:flex;flex-wrap:wrap;gap:2px;margin-top:2px';
        activeCats.slice(0,6).forEach(function(cid){
          dd.innerHTML+='<span class="cal-dot" style="background:'+catColor(cid)+'" title="'+catName(cid)+'"></span>';
        });
        div.appendChild(dd);
      }

      // Badge backlog
      if(blCount>0){
        var bl=document.createElement('div');
        bl.className='cal-bl-badge';
        bl.textContent='📌'+blCount;
        div.appendChild(bl);
      }

      // Indicador de progresso
      if(totalCount>0){
        var activeTotal=totalCount-removedCount;
        var pct=activeTotal>0?Math.round(doneCount/activeTotal*100):0;
        var pi=document.createElement('div');
        pi.className='cal-progress';
        pi.innerHTML='<div class="cal-prog-fill" style="width:'+pct+'%"></div>';
        div.appendChild(pi);
      }

      div.onclick=function(){
        var tDow=todayD.getDay(), tMon=new Date(todayD);
        tMon.setDate(todayD.getDate()+(tDow===0?-6:1-tDow));
        var dtDow=dt.getDay(), wMon=new Date(dt);
        wMon.setDate(dt.getDate()+(dtDow===0?-6:1-dtDow));
        S.weekOffset=Math.round((wMon-tMon)/(7*86400000));
        setWeekKey(); // atualiza S.weekKey e o label da topbar
        goTo('planner');
      };
      grid.appendChild(div);
    })(day);
  }
}

function buildCalLegend(){
  var legend=document.getElementById('cal-legend'); if(!legend) return;
  var today=new Date().toISOString().slice(0,10);
  var cats=[];
  S.rotina.filter(function(r){return rotinaAtivaNaData(r,today);}).forEach(function(r){
    if(cats.indexOf(r.categoria_id)<0) cats.push(r.categoria_id);
  });
  legend.innerHTML=cats.map(function(cid){
    return '<span class="cal-legend-item"><span class="cal-dot" style="background:'+catColor(cid)+'"></span>'+catName(cid)+'</span>';
  }).join('');
}

function getMonthWeekKeys(yr, mo){
  var keys=[];
  var d=new Date(yr,mo,1);
  while(d.getMonth()===mo){
    var wk=getDateWeekKey(d);
    if(keys.indexOf(wk)<0) keys.push(wk);
    d.setDate(d.getDate()+7);
  }
  // Adicionar última semana se necessário
  var last=new Date(yr,mo+1,0);
  var lastWk=getDateWeekKey(last);
  if(keys.indexOf(lastWk)<0) keys.push(lastWk);
  return keys;
}

function getDateWeekKey(d){
  var dow=d.getDay();
  var mon=new Date(d);
  mon.setDate(d.getDate()+(dow===0?-6:1-dow));
  return mon.toISOString().slice(0,10);
}

function calPrev(){S.calMonth.setMonth(S.calMonth.getMonth()-1);renderCalendario();}
function calNext(){S.calMonth.setMonth(S.calMonth.getMonth()+1);renderCalendario();}

// ── BADGES ────────────────────────────────────
function updateBadges(){
  var b1=S.backlog.filter(function(b){return !b.concluido&&b.urgencia==='h';}).length;
  var b2=S.imprevistos.filter(function(i){return !i.resolvido;}).length;
  var e1=document.getElementById('bdg-bl'), e2=document.getElementById('bdg-imp');
  if(e1) e1.textContent=b1||'';
  if(e2) e2.textContent=b2||'';
}

// ── UTILS ─────────────────────────────────────
function autoResize(el){
  if(!el) return;
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}

function formatDate(iso){
  if(!iso) return '—';
  try{
    return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
  }catch(e){return iso;}
}

// ── KEYBOARD + CLICK OUTSIDE ──────────────────
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    closeCardModal(); closeCatModal();
    var ep=document.getElementById('emoji-picker'); if(ep) ep.classList.remove('open');
    var sr=document.getElementById('cm-search-results'); if(sr) sr.classList.remove('open');
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
    if(document.getElementById('card-overlay').classList.contains('open')) saveCardModal();
  }
  if(e.key==='Enter'&&e.target.id==='cm-cl-input') addChecklistItem();
  if(e.key==='Enter'&&e.target.id==='cm-comment-input') addCardComment();
});

document.addEventListener('click',function(e){
  // Fechar emoji picker ao clicar fora
  var ep=document.getElementById('emoji-picker');
  var btn=document.getElementById('emoji-toggle-btn');
  if(ep&&ep.classList.contains('open')&&!ep.contains(e.target)&&e.target!==btn){
    ep.classList.remove('open');
  }
  // Fechar search results ao clicar fora
  var sr=document.getElementById('cm-search-results');
  if(sr&&sr.classList.contains('open')&&!sr.contains(e.target)&&e.target.id!=='cm-vinc-search'){
    sr.classList.remove('open');
  }
});

document.getElementById('card-overlay').onclick=function(e){
  if(e.target===document.getElementById('card-overlay')) closeCardModal();
};
document.getElementById('cat-overlay').onclick=function(e){
  if(e.target===document.getElementById('cat-overlay')) closeCatModal();
};

document.addEventListener('DOMContentLoaded',function(){
  var p=document.getElementById('cat-cor-picker'), t=document.getElementById('cat-cor-txt');
  if(p&&t){
    p.oninput=function(){t.value=p.value;};
    t.oninput=function(){if(/^#[0-9a-f]{6}$/i.test(t.value))p.value=t.value;};
  }
});

// ── KANBAN ────────────────────────────────────
async function renderKanban() {
  var board = document.getElementById('kanban-board'); if(!board) return;
  board.innerHTML = '';
  
  var groupCat = document.getElementById('kanban-group-cat').checked;
  var backlog = S.backlog.filter(function(t){ return !t.concluido; });
  var imprevistos = S.imprevistos.filter(function(i){ return !i.resolvido; });
  
  // Se houver agrupamento, criamos as raias (categorias)
  if(groupCat) {
    // Pegamos apenas categorias que têm itens ou todas? Vamos pegar todas as categorias que o usuário possui.
    S.categorias.forEach(function(cat) {
      var raia = document.createElement('div'); raia.className = 'kanban-raia';
      raia.innerHTML = '<div class="kanban-raia-title">'+cat.icone+' '+cat.nome+'</div>';
      var colsWrap = document.createElement('div'); colsWrap.className = 'kanban-raia-cols';
      
      S.kanbanCols.forEach(function(col) {
        var colList = document.createElement('div');
        colList.className = 'kb-raia-col-list';
        colList.dataset.colId = col.id;
        colList.dataset.catId = cat.id;
        
        // Filtramos itens do backlog e imprevistos que casam com esta coluna E categoria
        var items = backlog.filter(function(t){ return t.kanban_coluna_id == col.id && t.categoria_id == cat.id; })
              .concat(imprevistos.filter(function(i){ return i.kanban_coluna_id == col.id && i.categoria_id == cat.id; }));
        
        renderKanbanCardsInList(items, colList);
        setupKanbanDropZone(colList, col.id, cat.id);
        colsWrap.appendChild(colList);
      });
      raia.appendChild(colsWrap);
      board.appendChild(raia);
    });
    
    // Raia "Sem Categoria"
    var raiaNone = document.createElement('div'); raiaNone.className = 'kanban-raia';
    raiaNone.innerHTML = '<div class="kanban-raia-title">⚪ Sem Categoria</div>';
    var colsWrapNone = document.createElement('div'); colsWrapNone.className = 'kanban-raia-cols';
    S.kanbanCols.forEach(function(col) {
      var colList = document.createElement('div');
      colList.className = 'kb-raia-col-list';
      colList.dataset.colId = col.id;
      
      var items = backlog.filter(function(t){ return t.kanban_coluna_id == col.id && !t.categoria_id; })
            .concat(imprevistos.filter(function(i){ return i.kanban_coluna_id == col.id && !i.categoria_id; }));
      
      renderKanbanCardsInList(items, colList);
      setupKanbanDropZone(colList, col.id, null);
      colsWrapNone.appendChild(colList);
    });
    raiaNone.appendChild(colsWrapNone);
    board.appendChild(raiaNone);

  } else {
    // Layout padrão de colunas
    S.kanbanCols.forEach(function(col) {
      var colEl = document.createElement('div');
      colEl.className = 'kanban-col';
      colEl.dataset.colId = col.id;
      
      var colHead = document.createElement('div');
      colHead.className = 'kanban-col-head';
      colHead.innerHTML = '<span class="kb-col-drag-handle" style="cursor:grab;color:var(--text3);margin-right:6px;font-size:14px" title="Mover Coluna">⠿</span>'
               + '<input class="kanban-col-title" value="'+col.titulo+'">'
               + '<div style="display:flex;align-items:center;gap:4px">'
               + '<span class="kanban-col-count" id="kb-count-'+col.id+'">0</span>'
               + '<button class="btn-icon" style="font-size:10px" onclick="deleteKanbanColumn('+col.id+')">✕</button>'
               + '</div>';
      
      var titleInp = colHead.querySelector('.kanban-col-title');
      titleInp.onblur = function(){ saveColumnTitle(col.id, this.value); };
      titleInp.onkeydown = function(e){ if(e.key==='Enter') this.blur(); };

      var dragHandle = colHead.querySelector('.kb-col-drag-handle');
      dragHandle.onmousedown = function() { colEl.draggable = true; };
      
      var listEl = document.createElement('div');
      listEl.className = 'kanban-col-list';
      listEl.dataset.colId = col.id;
      
      var items = backlog.filter(function(t){ return t.kanban_coluna_id == col.id; })
            .concat(imprevistos.filter(function(i){ return i.kanban_coluna_id == col.id; }));
      
      colHead.querySelector('.kanban-col-count').textContent = items.length;
      renderKanbanCardsInList(items, listEl);
      setupKanbanDropZone(listEl, col.id);
      
      var addBtn = document.createElement('button');
      addBtn.className = 'kanban-add-card';
      addBtn.textContent = '+ Adicionar Item';
      addBtn.onclick = (function(colId){ return function(){
        openCardModal(null, 'backlog', null, null, null);
        var sel = document.getElementById('cm-kanban-col');
        if(sel) sel.value = colId;
        if(S.cardCtx) S.cardCtx.kanban_coluna_id = colId;
      }; })(col.id);
      
      colEl.appendChild(colHead);
      colEl.appendChild(listEl);
      colEl.appendChild(addBtn);
      
      // Drag colunas
      colEl.ondragstart = function(e){ e.stopPropagation(); S.dragCol = col.id; e.dataTransfer.effectAllowed = 'move'; };
      colEl.ondragover = function(e){ e.preventDefault(); };
      colEl.ondragend = function(e){ colEl.draggable = false; S.dragCol = null; };
      colEl.ondrop = function(e){ e.preventDefault(); if(S.dragCol && S.dragCol !== col.id) { moveKanbanColumn(S.dragCol, col.id); S.dragCol=null; } };

      board.appendChild(colEl);
    });
    
    // Coluna "Sem Coluna / Inbox"
    var itemsInbox = backlog.filter(function(t){ return !t.kanban_coluna_id; })
            .concat(imprevistos.filter(function(i){ return !i.kanban_coluna_id; }));
    if(itemsInbox.length > 0) {
      var colInbox = document.createElement('div');
      colInbox.className = 'kanban-col';
      colInbox.innerHTML = '<div class="kanban-col-head"><div class="kanban-col-title">📥 Inbox / Outros</div>'
                 + '<span class="kanban-col-count">'+itemsInbox.length+'</span></div>';
      var listInbox = document.createElement('div');
      listInbox.className = 'kanban-col-list';
      renderKanbanCardsInList(itemsInbox, listInbox);
      setupKanbanDropZone(listInbox, null);
      colInbox.appendChild(listInbox);
      board.insertBefore(colInbox, board.firstChild);
    }
  }
}

function renderKanbanCardsInList(items, listEl) {
  items.forEach(function(item) {
    var cat = getCat(item.categoria_id);
    var card = document.createElement('div');
    card.className = 'kb-card';
    card.draggable = true;
    var source = item.texto !== undefined ? 'imprevisto' : 'backlog';
    card.innerHTML = '<div class="kb-card-t">'+(item.titulo || item.texto)
            + (isScheduled(item) ? ' <span class="bm-planned-badge" title="Agendado no calendário">📅</span>' : '')
            + '</div>'
            + '<div class="kb-card-meta">'
            + '<span class="kb-card-id">'+item.id+'</span>'
            + '<span class="cat-tag" style="background:'+cat.cor+';color:#000">'+cat.icone+'</span>'
            + (item.urgencia ? '<span class="urg-tag u-'+item.urgencia+'"></span>' : '')
            + '</div>';
    
    card.onclick = function(){ openCardModal(item, source, null, null); };
    card.ondragstart = function(e){ e.stopPropagation(); S.dragCard = {item:item, source:source}; card.classList.add('dragging'); };
    card.ondragend = function(e){ e.stopPropagation(); card.classList.remove('dragging'); };
    listEl.appendChild(card);
  });
}

function setupKanbanDropZone(listEl, colId, catId) {
  listEl.ondragover = function(e){ e.preventDefault(); e.stopPropagation(); listEl.classList.add('drag-over'); };
  listEl.ondragleave = function(e){ e.stopPropagation(); listEl.classList.remove('drag-over'); };
  listEl.ondrop = async function(e){
    e.preventDefault();
    e.stopPropagation();
    listEl.classList.remove('drag-over');
    if(S.dragCard) {
      var it = S.dragCard.item;
      var src = S.dragCard.source;
      it.kanban_coluna_id = colId;
      if(catId !== undefined) it.categoria_id = catId;
      
      var url = src === 'backlog' ? '/api/backlog/'+it.id : '/api/imprevistos/'+it.id;
      await api('PUT', url, {kanban_coluna_id: colId, categoria_id: it.categoria_id});
      
      S.dragCard = null;
      renderKanban();
    }
  };
}

async function addNewKanbanColumn() {
  var t = await sitePrompt('Título da nova coluna:');
  if(!t) return;
  var col = await api('POST', '/api/kanban/colunas', {titulo: t});
  if(col) {
    S.kanbanCols.push(col);
    renderKanban();
  }
}

async function saveColumnTitle(id, val) {
  await api('PUT', '/api/kanban/colunas/'+id, {titulo: val});
  var c = S.kanbanCols.find(function(x){return x.id===id;});
  if(c) c.titulo = val;
}

async function deleteKanbanColumn(id) {
  if(!await siteConfirm('Certeza que deseja excluir esta coluna? Os cards voltarão para o Inbox.')) return;
  await api('DELETE', '/api/kanban/colunas/'+id);
  S.kanbanCols = S.kanbanCols.filter(function(c){return c.id!==id;});
  S.backlog.forEach(function(b){ if(b.kanban_coluna_id==id) b.kanban_coluna_id=null; });
  S.imprevistos.forEach(function(i){ if(i.kanban_coluna_id==id) i.kanban_coluna_id=null; });
  renderKanban();
}

async function moveKanbanColumn(idFrom, idTo) {
  var idxFrom = S.kanbanCols.findIndex(function(c){return c.id===idFrom;});
  var idxTo = S.kanbanCols.findIndex(function(c){return c.id===idTo;});
  if(idxFrom < 0 || idxTo < 0 || idxFrom === idxTo) return;
  
  var col = S.kanbanCols.splice(idxFrom, 1)[0];
  S.kanbanCols.splice(idxTo, 0, col);
  
  // Salvar nova ordem (simplificado)
  S.kanbanCols.forEach(async function(c, i){
    c.ordem = i;
    await api('PUT', '/api/kanban/colunas/'+c.id, {ordem: i});
  });
  renderKanban();
}

// ── START ─────────────────────────────────────

// ── ORDENAÇÃO ────────────────────────────────
var sortOrder = {};
async function sortTable(listType, key) {
  var dir = sortOrder[listType+'_'+key] === 'asc' ? 'desc' : 'asc';
  sortOrder[listType+'_'+key] = dir;
  
  var targetArray = null;
  if(listType === 'backlog') targetArray = S.backlog;
  else if(listType === 'imprevistos') targetArray = S.imprevistos;
  
  if(!targetArray) return;
  
  targetArray.sort(function(a, b) {
    var va = a[key] || '';
    var vb = b[key] || '';
    if(key==='prazo'||key==='data') { va = va || '9999-99-99'; vb = vb || '9999-99-99'; }
    if(va < vb) return dir === 'asc' ? -1 : 1;
    if(va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  
  if(listType === 'backlog') renderBacklog();
  else if(listType === 'imprevistos') renderImpPg();
}

init();

// ── CUSTOM MODALS ──────────────────────────────
function getSiteDialog() {
  var overlay = document.getElementById('dialog-overlay');
  if(!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'dialog-overlay';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = '<div class="modal" id="dialog-modal" style="width:340px; text-align:center; padding:24px;">' +
      '<h3 id="dialog-title" style="margin-top:0; margin-bottom:12px; font-family:var(--font-m); font-weight:600; font-size:20px; color:var(--text1)">Aviso</h3>' +
      '<div id="dialog-msg" style="margin-bottom:18px; font-size:14px; color:var(--text2); line-height:1.5;"></div>' +
      '<input type="text" id="dialog-input" class="field-in" style="display:none; margin-bottom:18px; text-align:center; width:100%">' +
      '<div style="display:flex; gap:12px; justify-content:center;">' +
        '<button class="btn-g" id="dialog-cancel" style="display:none; padding:8px 16px; flex:1">Cancelar</button>' +
        '<button class="btn-p" id="dialog-ok" style="padding:8px 16px; flex:1">Confirmar</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);
  }
  return {
    overlay: overlay,
    title: overlay.querySelector('#dialog-title'),
    msg: overlay.querySelector('#dialog-msg'),
    input: overlay.querySelector('#dialog-input'),
    btnCancel: overlay.querySelector('#dialog-cancel'),
    btnOk: overlay.querySelector('#dialog-ok')
  };
}

function showDialog(title, msg, defaultVal, isConfirm, callback) {
  var d = getSiteDialog();
  d.title.textContent = title;
  d.msg.textContent = msg;
  
  if(defaultVal !== undefined && defaultVal !== null) {
    d.input.style.display = 'block';
    d.input.value = defaultVal;
  } else {
    d.input.style.display = 'none';
    d.input.value = '';
  }
  
  if(isConfirm) {
    d.btnCancel.style.display = 'block';
  } else {
    d.btnCancel.style.display = 'none';
  }
  
  d.overlay.style.display = 'flex';
  setTimeout(function(){
      if(defaultVal !== undefined && defaultVal !== null) d.input.focus();
      else d.btnOk.focus();
  }, 50);
  
  d.btnOk.onclick = function() {
    d.overlay.style.display = 'none';
    if(callback) callback(true, d.input.value);
  };
  d.btnCancel.onclick = function() {
    d.overlay.style.display = 'none';
    if(callback) callback(false, null);
  };
}

window.siteAlert = function(msg) {
  console.log('[siteAlert]', msg);
  return new Promise(function(resolve){ showDialog('Aviso', msg, null, false, function(){ resolve(); }); });
};
window.siteConfirm = function(msg) {
  return new Promise(function(resolve){ showDialog('Confirmação', msg, null, true, function(res){ resolve(res); }); });
};
window.sitePrompt = function(msg, def) {
  return new Promise(function(resolve){ showDialog('Entrada de Dados', msg, def || '', true, function(res, val){ resolve(res ? val : null); }); });
};
