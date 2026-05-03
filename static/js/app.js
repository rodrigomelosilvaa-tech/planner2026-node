// Planner 2026 — app.js v5

// ── STATE ─────────────────────────────────────
var S = {
  dragging: false,
  page: 'planner', weekOffset: 0, calMonth: new Date(),
  categorias: [], rotina: [], backlog: [], imprevistos: [],
  semana: {}, rotinaDone: {}, rotinaOverrides: {},
  gcal:  { connected: false, calendars: [], selectedIds: [], events: [] },
  mscal: { connected: false, calendars: [], selectedIds: [], events: [] },
  calBulkDone: {}, // rotinaDone por semana para o calendário
  blFilter: 'all', blWeekOnly: false,
  revisao: {}, revisaoWeekKey: null, aiScope: 'general',
  drag: null, weekKey: '',
  cardCtx: null,
  kanbanCols: [],
  canvasBoards: [],
  canvasCurrentBoard: null,
  canvasNotes: [],
  canvasShapes: [],
  canvasTool: 'select',
  canvasZoom: 1.0,
  canvasSelectedEl: null,
  canvasShapeSubTool: 'rect',
  canvasPenColor: '#ffffff',
  canvasPenWidth: 3,
  config: { notif_ativas: 0, notif_minutos: 5, notif_som: 1 }
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
    api('GET','/api/kanban/colunas'), api('GET','/api/canvas/boards'),
    api('GET','/api/config')
  ]);
  S.categorias    = r[0] || [];
  S.rotina        = r[1] || [];
  S.backlog       = r[2] || [];
  S.imprevistos   = r[3] || [];
  S.kanbanCols    = r[4] || [];
  S.canvasBoards  = r[5] || [];
  if (r[6]) S.config = r[6];
  // Start notification checker after data loaded
  notifInit();
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
function localDateISO(d) {
  var dt = d || new Date();
  var y = dt.getFullYear();
  var m = String(dt.getMonth()+1).padStart(2,'0');
  var day = String(dt.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

function getWeekDates(off) {
  if (off === undefined) off = S.weekOffset;
  var now = new Date(), day = now.getDay();
  var mon = new Date(now);
  mon.setDate(now.getDate() + (day===0?-6:1-day) + off*7);
  mon.setHours(12, 0, 0, 0); // meio-dia evita fuso deslocar o dia no toISOString()
  var arr = [];
  for (var i=0;i<7;i++){var d=new Date(mon);d.setDate(mon.getDate()+i);arr.push(d);}
  return arr;
}
function getWeekKey(off) {
  if (off===undefined) off=S.weekOffset;
  return localDateISO(getWeekDates(off)[0]);
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
async function goToday(){S.weekOffset=0;S.mobilePlannerDay=undefined;setWeekKey();await loadSemana();renderPlanner();}
async function loadSemana() {
  var r = await Promise.all([
    api('GET','/api/semanas/'+S.weekKey),
    api('GET','/api/rotina_done/'+S.weekKey),
    api('GET','/api/semanas/'+S.weekKey+'/overrides')
  ]);
  S.semana          = r[0]||{};
  S.rotinaDone      = r[1]||{};
  S.rotinaOverrides = r[2]||{};
}

// ── ROTINA DATE FILTER ─────────────────────────
function rotinaAtivaNaData(r, dataISO) {
  if (r.ativo === false) return false;
  var d = dataISO ? dataISO.slice(0,10) : localDateISO();
  if (r.data_inicio && r.data_inicio.length >= 10 && d < r.data_inicio) return false;
  if (r.data_fim && r.data_fim.length >= 10 && d > r.data_fim) return false;
  return true;
}

function itemAtivoNoSlot(it, dayIndex, weekMonday) {
  if (it.ativo === false || it.concluido === true || it.resolvido === true) return false;
  
  var mon = new Date(weekMonday + 'T12:00:00');
  var slotDate = new Date(mon);
  slotDate.setDate(mon.getDate() + dayIndex);
  var slotISO = localDateISO(slotDate);

  // Se tiver período definido
  if (it.data_inicio && it.data_inicio.length >= 10 && slotISO < it.data_inicio) return false;
  if (it.data_fim && it.data_fim.length >= 10 && slotISO > it.data_fim) return false;

  // Se tiver recorrência (dias específicos)
  if (it.dias && it.dias.length > 0) {
    if(it.dias.indexOf(dayIndex) < 0) return false;
    // Verificar intervalo de semanas (a cada X semanas)
    var iv = it.intervalo_semanas||1;
    if(iv > 1 && it.data_inicio){
      var refMon = new Date(it.data_inicio+'T12:00:00');
      // Alinhar refMon para segunda-feira da semana de data_inicio
      var dow = refMon.getDay(); if(dow===0) dow=7;
      refMon.setDate(refMon.getDate() - (dow-1));
      var curMon = new Date(weekMonday+'T12:00:00');
      var diffWeeks = Math.round((curMon - refMon) / (7*24*3600*1000));
      if(diffWeeks < 0 || diffWeeks % iv !== 0) return false;
    }
    return true;
  }
  
  // Se for Execução Única (sem dias)
  if (!it.dias || it.dias.length === 0) {
    if (it.data_inicio && it.data_fim) return true; // período já validado acima
    // Se tem data_inicio explícita: fica fixo naquele dia, sem mover para hoje
    if (it.data_inicio && it.data_inicio.length >= 10) {
      return slotISO === it.data_inicio;
    }
    // prazo é apenas indicador de alerta — nunca determina onde o item aparece no planner
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
  // Sync bottom nav
  document.querySelectorAll('.bn-item[data-page]').forEach(function(b){
    b.classList.toggle('active', b.dataset.page===page);
  });
  var labels = {planner:'Planner Semanal',calendario:'Calendário',kanban:'Quadro Kanban',backlog:'To Do',
    rotina:'Rotina',categorias:'Categorias',imprevistos:'Imprevistos',revisao:'Revisão Semanal',
    canvas:'Notas / Canvas',configuracoes:'Configurações'};
  var ctx = document.getElementById('tb-ctx');
  if (ctx) ctx.textContent = labels[page]||page;
  var wnav = document.getElementById('tb-wnav');
  if (wnav) wnav.style.display = page==='planner'?'flex':'none';
  // Close sidebar on mobile when navigating
  if(window.innerWidth<=680) closeMobileSidebar();
  renderPage(page);
}
function renderPage(p) {
  var map = {
    planner:renderPlanner, calendario:renderCalendario, kanban:renderKanban,
    backlog:renderBacklog, rotina:renderRotinaPage,
    categorias:renderCategorias, imprevistos:renderImpPg, revisao:renderRevisao,
    canvas:renderCanvas,
    configuracoes:renderConfiguracoes
  };
  if (map[p]) map[p]();
}
function toggleSidebar(){
  var sb=document.getElementById('sidebar');
  if(window.innerWidth<=680){
    sb.classList.toggle('mobile-open');
    var bd=document.getElementById('mobile-backdrop');
    if(bd) bd.classList.toggle('active',sb.classList.contains('mobile-open'));
  } else {
    sb.classList.toggle('collapsed');
  }
}
function toggleMobileSidebar(){
  var sb=document.getElementById('sidebar');
  var open=!sb.classList.contains('mobile-open');
  sb.classList.toggle('mobile-open',open);
  var bd=document.getElementById('mobile-backdrop');
  if(bd) bd.classList.toggle('active',open);
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('mobile-open');
  var bd=document.getElementById('mobile-backdrop'); if(bd) bd.classList.remove('active');
}
function toggleRightSidebar(){
  var pr=document.getElementById('planner-right');
  var layout=document.querySelector('.planner-layout');
  var btn=document.getElementById('pr-collapse-btn');
  if(!pr) return;
  var isCollapsed=pr.classList.toggle('collapsed');
  if(layout) layout.classList.toggle('right-collapsed',isCollapsed);
  if(btn) btn.textContent=isCollapsed?'»':'«';
  if(btn) btn.title=isCollapsed?'Expandir painel':'Recolher painel';
  localStorage.setItem('rightSidebarCollapsed', isCollapsed?'1':'0');
}
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

// ── CALENDÁRIOS EXTERNOS ─────────────────────
function isoToLocalHM(isoStr){
  if(!isoStr) return null;
  var d=new Date(isoStr);
  return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
function isoToLocalDate(isoStr){
  if(!isoStr) return null;
  var d=new Date(isoStr);
  return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0');
}
function hmAddMinutes(hm,mins){
  if(!hm) return null;
  var p=hm.split(':'), h=parseInt(p[0]), m=parseInt(p[1])+mins;
  h+=Math.floor(m/60); m=m%60;
  return (h%24).toString().padStart(2,'0')+':'+m.toString().padStart(2,'0');
}
function processExtEvents(rawEvents){
  return (rawEvents||[]).map(function(e){
    if(e.allDay) return Object.assign({},e,{date:e.start.substring(0,10),startTime:null,endTime:null});
    return Object.assign({},e,{date:isoToLocalDate(e.start),startTime:isoToLocalHM(e.start),endTime:isoToLocalHM(e.end)});
  });
}
function getActiveExtEvents(){
  var evts=[];
  if(S.gcal.connected)  evts=evts.concat(S.gcal.events);
  if(S.mscal.connected) evts=evts.concat(S.mscal.events);
  return evts;
}
function getExtEventsForCell(dayISO, time){
  return getActiveExtEvents().filter(function(e){
    return !e.allDay && e.startTime && e.date===dayISO && findSlot(e.startTime)===time;
  });
}
function hasExtConflict(plannerHorario, plannerHorarioFim, dayISO){
  if(!plannerHorario||!dayISO) return false;
  var piEnd=plannerHorarioFim||hmAddMinutes(plannerHorario,30);
  return getActiveExtEvents().some(function(e){
    if(e.allDay||!e.startTime||e.date!==dayISO) return false;
    var eeEnd=e.endTime||hmAddMinutes(e.startTime,30);
    return plannerHorario<eeEnd && piEnd>e.startTime;
  });
}

async function loadExternalCals(){
  var status=await api('GET','/api/cal/status');
  if(!status) return;
  S.gcal.connected  = !!status.google;
  S.mscal.connected = !!status.microsoft;

  // Fetch calendar lists (to show checkboxes in panel)
  var calListLoads=[
    S.gcal.connected  ? api('GET','/api/gcal/calendars')  : Promise.resolve(null),
    S.mscal.connected ? api('GET','/api/mscal/calendars') : Promise.resolve(null)
  ];
  var calLists=await Promise.all(calListLoads);
  if(calLists[0]){
    S.gcal.connected  = !!calLists[0].connected;
    // Preserve existing list if API returned empty (graceful degradation)
    if((calLists[0].calendars||[]).length) S.gcal.calendars=calLists[0].calendars;
    // Remove selectedIds that no longer exist
    var gcalIds=S.gcal.calendars.map(function(c){return c.id;});
    S.gcal.selectedIds=S.gcal.selectedIds.filter(function(id){return gcalIds.indexOf(id)>=0;});
  }
  if(calLists[1]){
    S.mscal.connected  = !!calLists[1].connected;
    if((calLists[1].calendars||[]).length) S.mscal.calendars=calLists[1].calendars;
    var msIds=S.mscal.calendars.map(function(c){return c.id;});
    S.mscal.selectedIds=S.mscal.selectedIds.filter(function(id){return msIds.indexOf(id)>=0;});
  }

  // Fetch events only for selected calendars
  var dates=getWeekDates();
  var start=localDateISO(dates[0]), end=localDateISO(dates[6]);
  var gcalEvents=[], msEvents=[];

  if(S.gcal.connected && S.gcal.selectedIds.length>0){
    var gcalLoads=S.gcal.selectedIds.map(function(id){
      return api('GET','/api/gcal/events?calendarId='+encodeURIComponent(id)+'&start='+start+'&end='+end);
    });
    var gcalResults=await Promise.all(gcalLoads);
    gcalResults.forEach(function(r){ if(r&&r.events) gcalEvents=gcalEvents.concat(r.events); });
  }
  if(S.mscal.connected && S.mscal.selectedIds.length>0){
    var msLoads=S.mscal.selectedIds.map(function(id){
      return api('GET','/api/mscal/events?calendarId='+encodeURIComponent(id)+'&start='+start+'&end='+end);
    });
    var msResults=await Promise.all(msLoads);
    msResults.forEach(function(r){ if(r&&r.events) msEvents=msEvents.concat(r.events); });
  }

  S.gcal.events  = processExtEvents(gcalEvents);
  S.mscal.events = processExtEvents(msEvents);
  buildCalPanel();
  buildGrade();
}

async function syncExternalCals(){
  var btn=document.getElementById('cal-sync-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Sincronizando...';}
  await loadExternalCals();
  if(btn){btn.disabled=false;btn.textContent='🔄 Sincronizar agora';}
}

function oauthPopup(url, successMsg, errorMsg, callback){
  window.open(url,'_calAuth','width=600,height=700,menubar=no,toolbar=no,status=no');
  function handler(e){
    if(e.data===successMsg||e.data===errorMsg||e.data===successMsg.replace('connected','noconfig')||e.data===errorMsg.replace('error','noconfig')){
      window.removeEventListener('message',handler);
      if(e.data===successMsg) callback(true);
      else if(e.data.endsWith('_noconfig')) siteAlert('⚙️ Calendário não configurado no servidor. Adicione as variáveis de ambiente.');
      else callback(false);
    }
  }
  window.addEventListener('message',handler);
}
function connectGoogle(){
  oauthPopup('/auth/google','gcal_connected','gcal_error',function(ok){
    if(ok){loadExternalCals();siteAlert('✅ Google Calendar conectado!');}
    else siteAlert('❌ Erro ao conectar Google Calendar.');
  });
}
function connectMicrosoft(){
  oauthPopup('/auth/microsoft','mscal_connected','mscal_error',function(ok){
    if(ok){loadExternalCals();siteAlert('✅ Microsoft Calendar conectado!');}
    else siteAlert('❌ Erro ao conectar Microsoft Calendar.');
  });
}
async function disconnectGoogle(){
  await api('POST','/auth/google/disconnect');
  S.gcal.connected=false; S.gcal.events=[]; S.gcal.calendars=[]; S.gcal.selectedIds=[];
  buildCalPanel(); buildGrade();
}
async function disconnectMicrosoft(){
  await api('POST','/auth/microsoft/disconnect');
  S.mscal.connected=false; S.mscal.events=[]; S.mscal.calendars=[]; S.mscal.selectedIds=[];
  buildCalPanel(); buildGrade();
}

function buildCalPanel(){
  var wrap=document.getElementById('pr-cal-list'); if(!wrap) return;
  wrap.innerHTML='';

  function calSection(provider, title, icon, color){
    var sp=S[provider];
    var sec=document.createElement('div'); sec.className='cal-ext-section';
    var hdr='<div class="cal-ext-hdr"><span style="color:'+color+'">'+icon+' '+title+'</span>'
      +(sp.connected?'<span class="cal-ext-badge" style="background:'+color+'20;color:'+color+'">● conectado</span>':'')+'</div>';
    var body='';
    if(!sp.connected){
      var fn=provider==='gcal'?'connectGoogle':'connectMicrosoft';
      body='<button class="btn-g" style="width:100%;margin-top:6px;font-size:11px" onclick="'+fn+'()">Conectar '+title+'</button>';
    } else {
      if(!sp.calendars.length){
        body='<div style="font-size:10px;color:var(--text3);margin:6px 0">Carregando calendários...</div>';
      } else {
        sp.calendars.forEach(function(cal){
          var checked=sp.selectedIds.indexOf(cal.id)>=0?' checked':'';
          var safeId=cal.id.replace(/'/g,"\\'");
          var calColor=cal.color||color;
          body+='<label class="cal-toggle-row">'
            +'<input type="checkbox"'+checked+' onchange="toggleCalendar(\''+provider+'\',\''+safeId+'\',this.checked)">'
            +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+cal.name.replace(/"/g,'&quot;')+'">'+cal.name+'</span>'
            +(cal.primary?'<span style="font-size:8px;color:'+calColor+';margin-left:4px;flex-shrink:0">★</span>':'')
            +'</label>';
        });
        body+='<div style="font-size:9px;color:var(--text3);margin:4px 0 8px">'+sp.selectedIds.length+' de '+sp.calendars.length+' calendário(s) ativo(s)</div>';
      }
      var fn2=provider==='gcal'?'disconnectGoogle':'disconnectMicrosoft';
      body+='<button class="btn-d" style="font-size:9px;padding:3px 8px;width:100%" onclick="'+fn2+'()">Desconectar</button>';
    }
    sec.innerHTML=hdr+body;
    wrap.appendChild(sec);
  }

  calSection('gcal','Google Calendar','🗓️','#4285f4');
  calSection('mscal','Microsoft / Outlook','📆','#0078d4');

  var syncBtn=document.createElement('button');
  syncBtn.id='cal-sync-btn'; syncBtn.className='btn-g';
  syncBtn.style.cssText='width:100%;margin-top:14px;font-size:11px';
  syncBtn.innerHTML='🔄 Sincronizar agora';
  syncBtn.onclick=syncExternalCals;
  wrap.appendChild(syncBtn);

  var leg=document.createElement('div');
  leg.style.cssText='margin-top:14px;font-size:10px;color:var(--text3);line-height:1.6';
  leg.innerHTML='<b style="color:var(--text2)">Por padrão nenhum calendário externo é exibido.</b><br>'
    +'Marque os calendários desejados acima.<br><br>'
    +'<span style="color:var(--amber);font-weight:600">⚠️ Conflito</span> — indicado no card quando há sobreposição de horário com evento externo.';
  wrap.appendChild(leg);
}
async function toggleCalendar(provider, calId, checked){
  var sp=S[provider];
  if(checked){
    if(sp.selectedIds.indexOf(calId)<0) sp.selectedIds.push(calId);
  } else {
    sp.selectedIds=sp.selectedIds.filter(function(id){return id!==calId;});
  }
  buildCalPanel(); // update counter immediately
  await loadExternalCals();
}

// ── PLANNER ───────────────────────────────────
async function renderPlanner() {
  if(!S.weekKey) setWeekKey();
  await loadSemana();
  buildGrade();
  buildBLMini();
  loadExternalCals(); // async, re-renders when done
  checkPlanosPopup(); // mostra popup de planos pendentes se houver
}

function makeAlldayItem(it, source, dayIdx) {
  var color = catColor(it.categoria_id);
  var mini = document.createElement('div');
  mini.className = 'allday-item' + (it.done || it.concluido ? ' is-done' : '');
  mini.draggable = (source === 'backlog');
  mini.style.borderLeftColor = color;
  mini.style.background = color + '22';
  mini.innerHTML = '<span class="allday-item-t">' + (it.titulo||it.texto||'—') + '</span>'
    + '<div class="allday-acts">'
    + '<button class="allday-act a-done" title="Concluir">✓</button>'
    + '<button class="allday-act a-del" title="Remover">✕</button>'
    + '</div>';

  if(source === 'backlog') {
    mini.addEventListener('dragstart', function(){ S.drag={item:it,fromKey:'allday'}; mini.classList.add('dragging'); });
    mini.addEventListener('dragend', function(){ mini.classList.remove('dragging'); });
  }

  mini.querySelector('.allday-item-t').onclick = function(){
    if(source==='rotina'){
      var real = S.rotina.find(function(r){return r.id===it.id;});
      openCardModal(real||it, 'rotina', null, null, dayIdx);
    } else {
      openCardModal(it, 'backlog', null, null, dayIdx);
    }
  };

  mini.querySelector('.a-done').onclick = async function(e){
    e.stopPropagation();
    if(source === 'rotina'){
      var rdKey = it.id+'_'+dayIdx;
      var ns = S.rotinaDone[rdKey]==='done' ? undefined : 'done';
      if(ns) S.rotinaDone[rdKey]=ns; else delete S.rotinaDone[rdKey];
      await api('POST','/api/rotina_done/'+S.weekKey, S.rotinaDone);
    } else {
      it.concluido = !it.concluido;
      await api('PUT','/api/backlog/'+it.id, {concluido:it.concluido});
      updateBadges(); buildBLMini();
    }
    buildGrade();
  };

  mini.querySelector('.a-del').onclick = async function(e){
    e.stopPropagation();
    if(source === 'rotina'){
      var rdKey2 = it.id+'_'+dayIdx;
      S.rotinaDone[rdKey2] = 'removed';
      await api('POST','/api/rotina_done/'+S.weekKey, S.rotinaDone);
    } else {
      // Remove do planner: limpa data_inicio (volta para backlog sem data)
      var patch = {data_inicio:null, data_fim:null};
      Object.assign(it, patch);
      await api('PUT','/api/backlog/'+it.id, patch);
      buildBLMini();
    }
    buildGrade();
  };

  return mini;
}

function buildGrade() {
  var dates=getWeekDates(), todayD=new Date(); todayD.setHours(12,0,0,0);
  var hdr=document.getElementById('grade-hdr'); if(!hdr) return;
  hdr.innerHTML='<div class="gh-empty"></div>';
  dates.forEach(function(d,i){
    var isT=d.getTime()===todayD.getTime();
    var div=document.createElement('div');
    div.className='gh-day'+(isT?' is-today':'');
    div.innerHTML='<div class="gh-name">'+DAYS[i]+'</div><div class="gh-date">'+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'</div>';
    hdr.appendChild(div);
  });

  // Mobile day strip
  var strip=document.getElementById('mobile-day-strip');
  if(strip){
    strip.innerHTML='';
    var todayIdx=dates.findIndex(function(d){return d.getTime()===todayD.getTime();});
    dates.forEach(function(d,i){
      var isT=d.getTime()===todayD.getTime();
      var btn=document.createElement('button');
      btn.className='mds-day'+(isT?' is-today':'');
      btn.dataset.day=i;
      btn.innerHTML='<span class="mds-name">'+DAYS[i]+'</span>'
        +'<span class="mds-date">'+d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'</span>';
      (function(di){btn.onclick=function(){mobileDaySelect(di);};})(i);
      strip.appendChild(btn);
    });
    if(S.mobilePlannerDay===undefined) S.mobilePlannerDay=todayIdx>=0?todayIdx:0;
  }

  var body=document.getElementById('grade-body'); body.innerHTML='';

  // ── Linha "Dia todo" ─────────────────────────────────────────────────
  // Verifica se existe pelo menos 1 item sem horário agendado na semana
  var alldayTotalItems=0;
  var alldayRow=document.createElement('div'); alldayRow.className='g-allday-row';
  var alldayLbl=document.createElement('div'); alldayLbl.className='g-allday-label'; alldayLbl.textContent='Dia todo';
  alldayRow.appendChild(alldayLbl);
  for(var ad=0;ad<7;ad++){
    (function(dayIdx){
      var slotDate=dates[dayIdx];
      var slotISO=localDateISO(slotDate);
      var adCell=document.createElement('div'); adCell.className='g-allday-cell';
      adCell.dataset.day=dayIdx;
      adCell.addEventListener('dragover',function(e){e.preventDefault();adCell.classList.add('drag-over');});
      adCell.addEventListener('dragleave',function(e){if(!adCell.contains(e.relatedTarget))adCell.classList.remove('drag-over');});
      adCell.addEventListener('drop',async function(e){
        e.preventDefault(); adCell.classList.remove('drag-over');
        if(S.drag && (S.drag.fromKey==='backlog'||S.drag.fromKey==='allday')){
          // Apenas atualiza data_inicio, sem horario
          var adPatch={data_inicio:slotISO,horario:null};
          var adReal=S.backlog.find(function(b){return b.id===S.drag.item.id;});
          if(adReal) Object.assign(adReal,adPatch);
          await api('PUT','/api/backlog/'+S.drag.item.id,adPatch);
          S.drag=null; buildGrade(); buildBLMini();
        }
      });

      // Backlog agendado sem horário neste dia (usa data_inicio como âncora exata)
      S.backlog.filter(function(b){
        if(b.concluido||b.horario||!b.data_inicio) return false;
        if(b.data_fim) return slotISO>=b.data_inicio&&slotISO<=b.data_fim;
        return b.data_inicio===slotISO;
      }).forEach(function(it){
        alldayTotalItems++;
        var mini=makeAlldayItem(it, 'backlog', dayIdx);
        adCell.appendChild(mini);
      });
      // Rotinas sem horário neste dia — exige data_inicio preenchida
      S.rotina.filter(function(r){
        if(r.horario || !r.data_inicio) return false;
        return itemAtivoNoSlot(r, dayIdx, S.weekKey);
      }).forEach(function(it){
        var rdKey=it.id+'_'+dayIdx;
        var state=S.rotinaDone[rdKey];
        if(state==='removed') return;
        alldayTotalItems++;
        var mini=makeAlldayItem(Object.assign({},it,{done:state==='done'}), 'rotina', dayIdx);
        adCell.appendChild(mini);
      });
      // Eventos externos de dia todo
      getActiveExtEvents().filter(function(e){return e.allDay&&e.date===slotISO;}).forEach(function(ee){
        alldayTotalItems++;
        var ev=document.createElement('div');
        ev.className='ext-event ext-event-allday ext-event-'+ee.source;
        ev.title=ee.title+' ('+ee.source+')';
        ev.textContent=(ee.source==='google'?'🗓️':'📆')+' '+ee.title;
        adCell.appendChild(ev);
      });
      alldayRow.appendChild(adCell);
    })(ad);
  }
  // Só adiciona a linha se houver itens (inclui externos)
  if(alldayTotalItems>0) body.appendChild(alldayRow);
  // ─────────────────────────────────────────────────────────────────────

  TIMES.forEach(function(time){
    var tl=document.createElement('div'); tl.className='g-time'; tl.textContent=time; body.appendChild(tl);
    for(var d=0;d<7;d++){
      var key=d+'_'+time.replace(':','');
      var isT=dates[d].getTime()===todayD.getTime();
      var dayISO=localDateISO(dates[d]);
      var cell=document.createElement('div');
      cell.className='g-cell'+(isT?' is-today':'');
      cell.dataset.key=key;
      cell.dataset.day=d;

      // Rotinas recorrentes (com suporte a overrides de horário)
      S.rotina.filter(function(it){
        var ovk = it.id+'_'+d;
        var ov  = S.rotinaOverrides[ovk]||{};
        var efHorario = ov.horario || it.horario;
        return findSlot(efHorario)===time && itemAtivoNoSlot(it, d, S.weekKey);
      }).sort(function(a, b) {
        var ovA = S.rotinaOverrides[a.id+'_'+d]||{}, ovB = S.rotinaOverrides[b.id+'_'+d]||{};
        var ha = ovA.horario||a.horario||'00:00', hb = ovB.horario||b.horario||'00:00';
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
        var ov = S.rotinaOverrides[rdKey]||{};
        var hasOv = Object.keys(ov).length > 0;
        var efH = ov.horario || it.horario;
        cell.appendChild(makeBlk(Object.assign({}, it, ov, {
          id:rdKey, done:state==='done'||it.concluido,
          _isRotina:true, _rId:it.id, _day:d,
          _hasOverride:hasOv, _overrideFields:ov,
          _extConflict: hasExtConflict(efH, it.horario_fim, dayISO)
        }), key));
      });

      // Rotinas injetadas (movidas de outro dia via drag cross-day)
      Object.keys(S.rotinaOverrides).forEach(function(ovKey){
        var ov=S.rotinaOverrides[ovKey];
        if(!ov._injected) return;
        var li=ovKey.lastIndexOf('_');
        var rId=ovKey.substring(0,li);
        var ovDay=parseInt(ovKey.substring(li+1));
        if(ovDay!==d) return;
        var it=S.rotina.find(function(r){return r.id===rId;});
        if(!it) return;
        var efHorario=ov.horario||it.horario;
        if(findSlot(efHorario)!==time) return;
        var state=S.rotinaDone[ovKey];
        if(state==='removed') return;
        cell.appendChild(makeBlk(Object.assign({},it,ov,{
          id:ovKey,done:state==='done'||it.concluido,
          _isRotina:true,_rId:it.id,_day:d,
          _hasOverride:true,_overrideFields:ov,
          _extConflict:hasExtConflict(efHorario,it.horario_fim,dayISO)
        }),key));
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
          _isRotina:true, _isBacklog:true, _rId:it.id, _day:d,
          _extConflict: hasExtConflict(it.horario, it.horario_fim, dayISO)
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
      cellItems.forEach(function(item){ cell.appendChild(makeBlk(Object.assign({},item,{_extConflict:hasExtConflict(item.horario,item.horario_fim,dayISO)}),key)); });

      // Eventos externos com horário nesta célula
      getExtEventsForCell(dayISO, time).forEach(function(ee){
        var ev=document.createElement('div');
        ev.className='ext-event ext-event-'+ee.source;
        ev.title=ee.title+(ee.startTime?' ('+ee.startTime+(ee.endTime?'-'+ee.endTime:'')+')':'')+' — '+ee.source;
        ev.innerHTML='<span class="ext-event-icon">'+(ee.source==='google'?'🗓️':'📆')+'</span>'
          +'<span class="ext-event-title">'+ee.title+'</span>'
          +(ee.startTime?'<span class="ext-event-time">'+ee.startTime+(ee.endTime?'–'+ee.endTime:'')+'</span>':'');
        cell.appendChild(ev);
      });

      var ad=document.createElement('div'); ad.className='g-cell-add';
      var ab=document.createElement('button'); ab.className='g-cell-add-btn'; ab.textContent='+ adicionar';
      (function(k,t,di){ab.onclick=function(){openCardModal(null,'semana',k,t,di);};})(key,time,d);
      ad.appendChild(ab); cell.appendChild(ad);

      (function(k,t,c){
        c.addEventListener('dragover',function(e){ e.preventDefault();e.stopPropagation(); c.classList.add('drag-over'); });
        c.addEventListener('dragleave',function(e){ if(!c.contains(e.relatedTarget)){ c.classList.remove('drag-over'); } });
        c.addEventListener('drop',async function(e){ e.preventDefault();e.stopPropagation(); c.classList.remove('drag-over'); if(S.drag){await dropItem(S.drag,k,t);S.drag=null;} });
      })(key,time,cell);
      body.appendChild(cell);
    }
  });

  // Apply mobile day filter after all cells are built
  if(window.innerWidth<=680) mobileDaySelect(S.mobilePlannerDay!==undefined?S.mobilePlannerDay:0);
}

function mobileDaySelect(n) {
  S.mobilePlannerDay=n;
  // Update strip button states
  document.querySelectorAll('.mds-day').forEach(function(btn){
    btn.classList.toggle('active',parseInt(btn.dataset.day)===n);
  });
  if(window.innerWidth>680) return;
  // Show only selected day column in grade
  document.querySelectorAll('#grade-body .g-cell').forEach(function(c){
    c.style.display=parseInt(c.dataset.day)===n?'':'none';
  });
  document.querySelectorAll('.g-allday-row .g-allday-cell').forEach(function(c){
    c.style.display=parseInt(c.dataset.day)===n?'':'none';
  });
  // Scroll selected day pill into view
  var activeBtn=document.querySelector('.mds-day.active');
  if(activeBtn) activeBtn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}

function findLinkedItem(id, tipo){
  if(!tipo||tipo==='backlog'||tipo==='todo') return S.backlog.find(function(b){return b.id===id;});
  if(tipo==='imprevisto') return S.imprevistos.find(function(i){return i.id===id;});
  if(tipo==='rotina') return S.rotina.find(function(r){return r.id===id;});
  return null;
}
function isLinkedItemComplete(item, tipo){
  if(!item) return false;
  if(tipo==='imprevisto') return !!item.resolvido;
  return !!item.concluido;
}
function getDepAlerts(vinculos){
  var r={blocked:false,blockedBy:[],sucede:false,sucedeItems:[],hasAntecede:false};
  (vinculos||[]).forEach(function(v){
    var dep=v.dep||'relacionado';
    if(dep==='bloqueado_por'){
      var li=findLinkedItem(v.id,v.tipo);
      if(!isLinkedItemComplete(li,v.tipo)){r.blocked=true;r.blockedBy.push(v);}
    } else if(dep==='sucede'){
      var li2=findLinkedItem(v.id,v.tipo);
      if(!isLinkedItemComplete(li2,v.tipo)){r.sucede=true;r.sucedeItems.push(v);}
    } else if(dep==='antecede'||dep==='relacionado'||dep==='bloqueia'){
      r.hasAntecede=true;
    }
  });
  return r;
}

function makeBlk(item, cellKey) {
  var div=document.createElement('div');
  var color=catColor(item.categoria_id);
  var urgClass = (!item.done && item.urgencia && item.urgencia!=='m') ? ' urg-'+item.urgencia : '';
  div.className='blk'+(item.done?' is-done':'')+' draggable-blk'+(item._hasOverride?' has-override':'')+urgClass;
  div.style.background=color+'1a';
  div.style.borderLeftColor=color;
  var cl=item.checklist||[]; var clDone=cl.filter(function(x){return x.done;}).length;
  var clBadge=cl.length?('<span class="blk-icons"> ☑ '+clDone+'/'+cl.length+'</span>'):'';
  var commBadge=(item.comentarios&&item.comentarios.length)?('<span class="blk-icons"> 💬'+item.comentarios.length+'</span>'):'';
  var depA=getDepAlerts(item.vinculos);
  var vincBadge='';
  if(item.vinculos&&item.vinculos.length){
    if(depA.blocked) vincBadge='<span class="blk-icons" style="color:#e74c3c" title="Bloqueado por dependência pendente">⛔'+item.vinculos.length+'</span>';
    else if(depA.sucede) vincBadge='<span class="blk-icons" style="color:var(--amber)" title="Tem dependência pendente (sucede)">⚠️'+item.vinculos.length+'</span>';
    else vincBadge='<span class="blk-icons"> 🔗'+item.vinculos.length+'</span>';
  }
  var typeTag = '';
  if (item._isBacklog) {
    typeTag = '<span class="blk-tag" style="background:rgba(46,204,113,.15);color:#2ecc71" title="To Do Agendado">☑️ To Do</span>';
  } else if (item.tipo === 'rotina' || item._isRotina) {
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

  var durMins = (item.horario && item.horario_fim) ? calcDurMinutes(item.horario, item.horario_fim) : 0;
  var durTag = durMins > 0 ? '<span class="blk-dur">'+formatDur(durMins)+'</span>' : '';
  var horarioTag = item.horario ? '<span class="blk-horario">'+item.horario+(item.horario_fim?'–'+item.horario_fim:'')+'</span>' : '';

  // Dependency alert tags
  var depTag='';
  if(!item.done){
    if(depA.blocked){
      var bNames=depA.blockedBy.map(function(v){return v.id;}).join(', ');
      depTag='<span class="blk-tag" style="background:rgba(231,76,60,.15);color:#e74c3c;font-weight:600" title="Bloqueado por: '+bNames+'. Conclua o item dependente antes.">⛔ Bloqueado</span>';
      if(!alertStyle) alertStyle='border-left:3px solid #e74c3c !important;background:rgba(231,76,60,.08) !important;';
    } else if(depA.sucede){
      var sNames=depA.sucedeItems.map(function(v){return v.id;}).join(', ');
      depTag='<span class="blk-tag" style="background:rgba(243,156,18,.12);color:var(--amber)" title="Sucede: '+sNames+'. Item anterior ainda pendente — risco de dependência.">⚠️ Dep. pendente</span>';
    } else if(depA.hasAntecede){
      depTag='<span class="blk-tag" style="background:rgba(52,152,219,.1);color:#3498db;opacity:.8" title="Habilita ou está relacionado a outros itens">⏩ Habilitador</span>';
    }
  }

  var overrideTag = item._hasOverride
    ? '<span class="blk-tag blk-override-tag" title="Horário ajustado só para este dia">✏️</span>'
    : '';

  var conflictTag = (item._extConflict && !item.done)
    ? '<span class="blk-tag blk-conflict-tag" title="Conflito com evento do calendário externo">⚠️ Conflito</span>'
    : '';
  if(item._extConflict && !item.done && !alertStyle)
    alertStyle='outline:2px solid var(--amber) !important;outline-offset:-2px;';

  div.innerHTML='<div class="blk-t">'+(item.titulo||item.texto)+'</div>'
    +'<div class="blk-meta">'
    +horarioTag+durTag
    +'<span class="blk-id">'+(item._isRotina?item._rId:item.id)+'</span>'
    +'<span class="blk-tag">'+catIcon(item.categoria_id)+'</span>'
    +typeTag+overrideTag+deadlineTag+depTag+conflictTag+clBadge+commBadge+vincBadge
    +'</div>'
    +'<div class="blk-acts">'
    +'<button class="blk-act a-done" title="Concluir">✓</button>'
    +'<button class="blk-act a-del" title="Remover">✕</button>'
    +'</div>';

  if(alertStyle) div.style.cssText += alertStyle;

  div.onclick=function(e){
    if(e.target.classList.contains('blk-act')) return;
    if(item._isRotina){
      // Passa o blkItem com _day e _hasOverride preservados
      openCardModal(item, 'rotina_blk', cellKey, null);
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
      // Para backlog: só auto-conclui se for item de DIA ÚNICO (sem data_fim ou data_fim === data_inicio)
      // Itens multi-dia permanecem ativos nos demais dias — o usuário conclui manualmente no backlog
      if(item._isBacklog && item.done){
        var blItem=S.backlog.find(function(b){return b.id===item._rId;});
        if(blItem){
          var _multiDay=blItem.data_fim && blItem.data_fim!==blItem.data_inicio;
          if(!_multiDay){
            blItem.concluido=true;
            await api('PUT','/api/backlog/'+item._rId,{concluido:true});
          }
        }
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
  if(fromKey==='backlog'||fromKey==='allday'){
    // Atualiza o item de backlog: define data_inicio = data do slot e horario = horário do slot
    var toDay=parseInt(toKey.split('_')[0]);
    var slotDate=getWeekDates()[toDay];
    var slotISO=slotDate?localDateISO(slotDate):null;
    var patch={horario:toTime,data_inicio:slotISO};
    // Atualiza o item REAL em S.backlog (não a cópia do dragstart)
    var realItem=S.backlog.find(function(b){return b.id===item.id;});
    if(realItem) Object.assign(realItem,patch);
    await api('PUT','/api/backlog/'+item.id,patch);
    buildBLMini();
  } else if(item._isBacklog){
    // Backlog item já posicionado no planner — mover para outro dia/horário atualizando data_inicio
    var toDay2=parseInt(toKey.split('_')[0]);
    var slotDate2=getWeekDates()[toDay2];
    var slotISO2=slotDate2?localDateISO(slotDate2):null;
    var patchBL={horario:toTime,data_inicio:slotISO2};
    var realBLItem=S.backlog.find(function(b){return b.id===item._rId;});
    if(realBLItem) Object.assign(realBLItem,patchBL);
    await api('PUT','/api/backlog/'+item._rId,patchBL);
    buildBLMini();
  } else if(item._isRotina && !item._isBacklog){
    var fromDay=item._day;
    var toDay=parseInt(toKey.split('_')[0]);
    if(fromDay===toDay){
      // Mesmo dia, horário diferente → override de horário
      var ovKey=item._rId+'_'+fromDay;
      var ovRes=await api('POST','/api/semanas/'+S.weekKey+'/override',{key:ovKey,fields:{horario:toTime}});
      if(ovRes&&ovRes.ok) S.rotinaOverrides[ovKey]=Object.assign(S.rotinaOverrides[ovKey]||{},{horario:toTime});
    } else {
      // Dia diferente → remove do dia original + injeta no novo dia
      var doneKey=item._rId+'_'+fromDay;
      S.rotinaDone[doneKey]='removed';
      await api('POST','/api/rotina_done/'+S.weekKey,S.rotinaDone);
      var injKey=item._rId+'_'+toDay;
      var injHorario=toTime||item.horario||'09:00';
      var injRes=await api('POST','/api/semanas/'+S.weekKey+'/override',{
        key:injKey, fields:{horario:injHorario,_injected:1,_fromDay:fromDay}
      });
      if(injRes&&injRes.ok){
        S.rotinaOverrides[injKey]=Object.assign(S.rotinaOverrides[injKey]||{},{
          horario:injHorario,_injected:1,_fromDay:fromDay
        });
      }
    }
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
  var map={bl:buildBLMini, rot:buildRotMini, imp:buildImpMini, stats:buildStats, cal:buildCalPanel};
  if(map[name]) map[name]();
}

// ── BACKLOG MINI ──────────────────────────────
function buildBLMini(){
  var fw=document.getElementById('pr-filter'), lw=document.getElementById('pr-bl-list');
  if(!fw||!lw) return;
  fw.innerHTML='';
  var filterActive=S.blWeekOnly||(S.blFilter&&S.blFilter!=='all');
  var tog=document.createElement('button');
  tog.className='filter-btn'+(S.blWeekOnly?' active filter-on':'');
  tog.textContent=S.blWeekOnly?'📅 Esta sem.':'📅 Todos';
  tog.onclick=function(){S.blWeekOnly=!S.blWeekOnly;buildBLMini();};
  fw.appendChild(tog);
  fw.appendChild(mkFBtn('Todos','all'));
  S.categorias.forEach(function(c){fw.appendChild(mkFBtn(c.icone+' '+c.nome,c.id));});
  renderBLMiniList(lw);
}
function mkFBtn(lbl,val){
  var btn=document.createElement('button');
  var isActive=S.blFilter===val;
  btn.className='filter-btn'+(isActive?' active':'')+(isActive&&val!=='all'?' filter-on':'');
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
    if(S.blFilter!=='all'&&String(t.categoria_id)!==String(S.blFilter)) return false;
    if(S.blWeekOnly){if(!t.prazo) return false; var d=new Date(t.prazo+'T12:00'); return d>=mon&&d<=sun;}
    return true;
  });
  tasks.sort(function(a,b){
    var u={h:0,m:1,l:2};
    if(u[a.urgencia]!==u[b.urgencia]) return u[a.urgencia]-u[b.urgencia];
    if(a.prazo&&b.prazo) return new Date(a.prazo)-new Date(b.prazo);
    return a.prazo?-1:b.prazo?1:0;
  });
  if(!tasks.length){
    var emptyMsg=filterActive?'Nenhum item com este filtro':'Nenhuma tarefa no To Do';
    wrap.innerHTML='<div class="ui-empty"><div class="ui-empty-icon">☑️</div><div class="ui-empty-msg">'+emptyMsg+'</div></div>';
    return;
  }
  var uL={h:'Urgente',m:'Normal',l:'Baixo'};
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
  var today=localDateISO();
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
    wrap.innerHTML='<div class="ui-empty"><div class="ui-empty-icon">🔄</div><div class="ui-empty-msg">Nenhuma rotina ativa hoje</div></div>';
}

// ── IMP MINI ──────────────────────────────────
function buildImpMini(){
  var formEl=document.getElementById('pr-imp-form');
  var listEl=document.getElementById('pr-imp-list');
  if(!formEl||!listEl) return;
  var monday=localDateISO(getWeekDates()[0]);
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
  if(!pending.length){listEl.innerHTML='<div class="ui-empty"><div class="ui-empty-icon">✅</div><div class="ui-empty-msg">Nenhum imprevisto aberto</div></div>';return;}
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
  var data=(document.getElementById('imp-mini-data')||{value:''}).value||localDateISO();
  var created=await api('POST','/api/imprevistos',{texto:texto,urgencia:urgencia,data:data});
  if(created){S.imprevistos.unshift(created);if(ta)ta.value='';buildImpMini();updateBadges();}
}

// ── STATS ─────────────────────────────────────
function buildStats(){
  var wrap=document.getElementById('pr-stats-list'); if(!wrap) return;
  wrap.innerHTML='<div style="font-family:var(--font-m);font-size:9px;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Progresso da semana</div>';
  var cm={};
  S.categorias.forEach(function(c){cm[c.id]={nome:c.nome,cor:c.cor,total:0,done:0};});
  var today=localDateISO();
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
  if(!hasAny) wrap.innerHTML+='<div class="ui-empty"><div class="ui-empty-icon">📊</div><div class="ui-empty-msg">Sem dados para exibir esta semana</div></div>';
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

  var todayISO = localDateISO();

  if (isNew) {
    document.getElementById('cm-id').textContent = 'Novo card';
    document.getElementById('cm-title').value = '';
    catSel.value = S.categorias[0]?S.categorias[0].id:'';
    document.getElementById('cm-tipo').value = source==='rotina'?'rotina':'unica';
    document.getElementById('cm-urg').value = 'm';
    // Prazo = hoje + 7 dias (sempre)
    var prazoDefault = new Date(); prazoDefault.setDate(prazoDefault.getDate()+7);
    document.getElementById('cm-prazo').value = localDateISO(prazoDefault);
    document.getElementById('cm-horario').value = defaultTime||'';
    document.getElementById('cm-horario-fim').value = '';
    document.getElementById('cm-duracao').textContent = '';
    var ivEl=document.getElementById('cm-intervalo'); if(ivEl) ivEl.value=1;
    // Se criando do planner: data_inicio = data do slot clicado, horario já vem pelo defaultTime
    if (source === 'semana' && dayIndex !== undefined) {
      var wdSlot = getWeekDates();
      var slotDate = wdSlot[dayIndex] ? localDateISO(wdSlot[dayIndex]) : '';
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
      if(item._isBacklog){
        // Backlog item projetado no planner — resolve o registro real em S.backlog
        var bOrig=S.backlog.find(function(b){return b.id===item._rId;});
        if(bOrig){
          editItem=Object.assign({},bOrig,{
            _isRotina:true,_isBacklog:true,_rId:item._rId,_day:item._day,
            done:item.done,id:bOrig.id
          });
          source='backlog';
        }
      } else {
        var rOrig=S.rotina.find(function(r){return r.id===item._rId;});
        if(rOrig){
          editItem=Object.assign({},rOrig,{
            _isRotina:true,_rId:item._rId,_day:item._day,
            _hasOverride:item._hasOverride||false,
            done:item.done,id:rOrig.id
          });
          source='rotina';
        }
      }
    }
    document.getElementById('cm-id').textContent = editItem.id || (editItem._rId||'');
    document.getElementById('cm-title').value = editItem.titulo||editItem.texto||'';
    catSel.value = editItem.categoria_id||'';
    // source='rotina' garante tipo='rotina' independente do campo armazenado
    document.getElementById('cm-tipo').value = (source==='rotina') ? 'rotina' : (editItem.tipo||'unica');
    document.getElementById('cm-urg').value = editItem.urgencia||'m';
    document.getElementById('cm-prazo').value = editItem.prazo||editItem.data||'';
    document.getElementById('cm-horario').value = editItem.horario||'';
    document.getElementById('cm-horario-fim').value = editItem.horario_fim||'';
    updateDuracao();
    var ivEl2=document.getElementById('cm-intervalo'); if(ivEl2) ivEl2.value=editItem.intervalo_semanas||1;
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
  var oldState = isNew ? null : {
    titulo: (item&&(item.titulo||item.texto))||'',
    urgencia: (item&&item.urgencia)||'m',
    data_inicio: (item&&item.data_inicio)||null,
    prazo: (item&&(item.prazo||item.data))||null
  };
  S.cardCtx = {item:item, source:source, cellKey:cellKey, defaultTime:defaultTime, dayIndex:dayIndex, isNew:isNew, oldState:oldState};

  // Gerar rodapé dinamicamente
  var foot = document.getElementById('cm-foot');
  var isRotinaInstance = !isNew && source==='rotina' && item._isRotina && !item._isBacklog && (item._day !== undefined);
  var delBtn = isNew ? '' : '<button class="cm-delete-btn" onclick="deleteCardPrompt()" title="Excluir este item">🗑️ Excluir</button>';
  if(foot){
    if(isRotinaInstance){
      foot.innerHTML =
        '<button class="btn-p" onclick="saveOverride()">💾 Salvar só esta ocorrência</button>'
       +'<button class="btn-g" onclick="saveCardModal()">🔄 Salvar rotina inteira</button>'
       +(item._hasOverride?'<button class="btn-d" style="font-size:10px;padding:6px 12px" onclick="revertOverride()">↩️ Reverter ao original</button>':'')
       +'<button class="btn-g" onclick="closeCardModal()">Cancelar</button>'
       +'<div style="font-family:var(--font-m);font-size:9px;color:var(--text3)" id="cm-saved-msg"></div>'
       +delBtn;
    } else {
      var showUnsched = !isNew && source !== 'rotina' && !!(item && (item.data_inicio || item.horario));
      foot.innerHTML =
        '<button class="btn-p" onclick="saveCardModal()">💾 Salvar</button>'
       +'<button class="btn-g" onclick="closeCardModal()">Cancelar</button>'
       +'<button class="btn-d cm-unschedule-btn" id="cm-unschedule-btn" onclick="unscheduleCard()" title="Remove datas e horário — item volta ao To Do sem agendamento" style="display:'+(showUnsched?'':'none')+'">📤 Remover do Planner</button>'
       +'<div style="font-family:var(--font-m);font-size:9px;color:var(--text3)" id="cm-saved-msg"></div>'
       +delBtn;
    }
  }

  switchCmTab('detalhes', document.querySelector('.cm-tab[data-tab="detalhes"]'));
  var smEl = document.getElementById('cm-saved-msg'); if(smEl) smEl.textContent='';
  modal.classList.add('open');
  setTimeout(function(){document.getElementById('cm-title').focus();},80);
}

function toggleRotinaDiasUI(isRotina){
  var el = document.getElementById('cm-dias-check-row');
  if(el) el.style.display = isRotina ? 'block' : 'none';
  var ir = document.getElementById('cm-intervalo-row');
  if(ir) ir.style.display = isRotina ? 'flex' : 'none';
}
function toggleKanbanUI(show){
  var el = document.getElementById('cm-kanban-row');
  if(el) el.style.display = show ? '' : 'none';
}

function closeCardModal(){
  document.getElementById('card-overlay').classList.remove('open');
  S.cardCtx=null;
}

// ── DELETE / ARCHIVE CARD ─────────────────────
function _resolveDeleteCtx(){
  var ctx=S.cardCtx; if(!ctx||ctx.isNew) return null;
  var item=ctx.item, source=ctx.source;
  // Backlog items projected in planner open as 'rotina_blk' with _isBacklog
  if(source==='rotina_blk'){
    source = item._isBacklog ? 'backlog' : 'rotina';
  }
  // Effective ID: backlog items use _rId as the real backlog ID
  var effectiveId = (source==='backlog' && item._isBacklog) ? item._rId
                  : (source==='rotina'  && item._rId)       ? item._rId
                  : item.id;
  return {item:item, source:source, effectiveId:effectiveId};
}

function deleteCardPrompt(){
  var r=_resolveDeleteCtx(); if(!r) return;
  var item=r.item, source=r.source;
  var titulo=(item.titulo||item.texto||item.id)||'este item';
  var isRotina=source==='rotina';
  var canArchive=(source==='backlog'||source==='rotina');

  var titleEl=document.getElementById('delete-item-title');
  var warnEl=document.getElementById('delete-rotina-warn');
  var inp=document.getElementById('delete-confirm-input');
  var btn=document.getElementById('delete-confirm-btn');
  var archBtn=document.getElementById('delete-archive-btn');

  if(titleEl) titleEl.textContent=titulo;
  if(warnEl)  warnEl.style.display=isRotina?'':'none';
  if(inp)    { inp.value=''; inp.classList.remove('valid'); }
  if(btn)     btn.disabled=true;
  if(archBtn) archBtn.style.display=canArchive?'':'none';

  document.getElementById('delete-overlay').classList.add('open');
  setTimeout(function(){if(inp) inp.focus();},80);
}

function onDeleteInput(val){
  var ok=(val.trim().toLowerCase()==='excluir');
  var btn=document.getElementById('delete-confirm-btn');
  var inp=document.getElementById('delete-confirm-input');
  if(btn) btn.disabled=!ok;
  if(inp) inp.classList.toggle('valid',ok);
}

function closeDeleteModal(){
  document.getElementById('delete-overlay').classList.remove('open');
}

async function confirmDeleteCard(){
  var inp=document.getElementById('delete-confirm-input');
  if(!inp||inp.value.trim().toLowerCase()!=='excluir') return;
  var r=_resolveDeleteCtx(); if(!r) return;
  var item=r.item, source=r.source, id=r.effectiveId;

  closeDeleteModal();
  closeCardModal();

  if(source==='rotina'){
    await api('DELETE','/api/rotina/'+id);
    S.rotina=S.rotina.filter(function(x){return x.id!==id;});
  } else if(source==='backlog'){
    await api('DELETE','/api/backlog/'+id);
    S.backlog=S.backlog.filter(function(x){return x.id!==id;});
  } else if(source==='semana'){
    await api('DELETE','/api/semanas/'+S.weekKey+'/item/'+id);
  } else if(source==='imprevisto'){
    await api('DELETE','/api/imprevistos/'+id);
    S.imprevistos=S.imprevistos.filter(function(x){return x.id!==id;});
  }

  await renderPlanner();
  siteAlert('🗑️ Item excluído.');
}

async function confirmArchiveCard(){
  var r=_resolveDeleteCtx(); if(!r) return;
  var source=r.source, id=r.effectiveId;
  if(source!=='backlog'&&source!=='rotina') return;

  closeDeleteModal();
  closeCardModal();

  if(source==='rotina'){
    await api('PUT','/api/rotina/'+id+'/arquivar');
    S.rotina=S.rotina.filter(function(x){return x.id!==id;});
  } else if(source==='backlog'){
    await api('PUT','/api/backlog/'+id+'/arquivar');
    S.backlog=S.backlog.filter(function(x){return x.id!==id;});
  }

  await renderPlanner();
  siteAlert('📦 Item arquivado.');
}

async function saveOverride(){
  var ctx=S.cardCtx; if(!ctx||!ctx.item) return;
  var item=ctx.item;
  if(!item._rId||item._day===undefined) return;
  var r=S.rotina.find(function(x){return x.id===item._rId;});
  if(!r) return;
  var fields={};
  var hor=(document.getElementById('cm-horario')||{}).value||'';
  var horFim=(document.getElementById('cm-horario-fim')||{}).value||'';
  var cat=(document.getElementById('cm-cat')||{}).value||null;
  if(hor!==(r.horario||''))          fields.horario=hor||null;
  if(horFim!==(r.horario_fim||''))   fields.horario_fim=horFim||null;
  if(cat && cat!==r.categoria_id)    fields.categoria_id=cat;
  if(!Object.keys(fields).length){
    toast('Nenhuma alteração detectada para esta ocorrência','info',2500);
    closeCardModal(); return;
  }
  var ovKey=item._rId+'_'+item._day;
  var res=await api('POST','/api/semanas/'+S.weekKey+'/override',{key:ovKey,fields:fields});
  if(res&&res.ok){
    S.rotinaOverrides[ovKey]=Object.assign(S.rotinaOverrides[ovKey]||{},fields);
    buildGrade();
    toast('✅ Ajuste salvo só para esta ocorrência','success',2500);
    closeCardModal();
  }
}

async function revertOverride(){
  var ctx=S.cardCtx; if(!ctx||!ctx.item) return;
  var item=ctx.item;
  if(!item._rId||item._day===undefined) return;
  var ovKey=item._rId+'_'+item._day;
  await api('DELETE','/api/semanas/'+S.weekKey+'/override/'+ovKey);
  delete S.rotinaOverrides[ovKey];
  buildGrade();
  closeCardModal();
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
  if(name==='historico' && S.cardCtx && S.cardCtx.item && !S.cardCtx.isNew){
    var hItem=S.cardCtx.item;
    var hId=hItem.id||hItem._rId||null;
    var hTipo=S.cardCtx.source||'backlog';
    if(hId) loadCardHistory(String(hId),hTipo);
  }
}

function calcDurMinutes(h1, h2) {
  if(!h1||!h2) return 0;
  var p1=h1.split(':').map(Number), p2=h2.split(':').map(Number);
  return (p2[0]*60+p2[1]) - (p1[0]*60+p1[1]);
}
function formatDur(m) {
  if(!m||m<=0) return '';
  return m>=60 ? Math.floor(m/60)+'h'+(m%60?' '+m%60+'min':'') : m+'min';
}
function updateDuracao() {
  var h1=(document.getElementById('cm-horario')||{value:''}).value;
  var h2=(document.getElementById('cm-horario-fim')||{value:''}).value;
  var el=document.getElementById('cm-duracao'); if(!el) return;
  var m=calcDurMinutes(h1,h2);
  el.textContent=m>0?'('+formatDur(m)+')':'';
}

async function saveCardModal(){
  var ctx=S.cardCtx; if(!ctx) return;
  var titulo=document.getElementById('cm-title').value.trim();
  if(!titulo){
    var ti=document.getElementById('cm-title');
    if(ti){ti.style.outline='2px solid #e74c3c';ti.focus();setTimeout(function(){ti.style.outline='';},1800);}
    toast('Digite o título do item','error',2500);
    return;
  }
  var _savBtn=document.querySelector('#cm-foot .btn-p');
  if(_savBtn){_savBtn._orig=_savBtn.textContent;_savBtn.textContent='⏳ Salvando…';_savBtn.classList.add('btn-saving');}
  var _restoreBtn=function(){if(_savBtn){_savBtn.textContent=_savBtn._orig||'💾 Salvar';_savBtn.classList.remove('btn-saving');}};
  try{
  var cat=document.getElementById('cm-cat').value;
  var tipo=document.getElementById('cm-tipo').value;
  var urg=document.getElementById('cm-urg').value;
  var prazo=document.getElementById('cm-prazo').value||null;
  var isRotina=tipo==='rotina';
  var horario=document.getElementById('cm-horario').value||null;
  var horarioFim=document.getElementById('cm-horario-fim').value||null;
  var desc=document.getElementById('cm-desc').value;
  var checklist=gatherChecklist();
  var dias=Array.from(document.querySelectorAll('.cm-dia-ck:checked')).map(function(c){return parseInt(c.value);});
  var dataInicio=document.getElementById('cm-data-inicio').value||null;
  var dataFim=document.getElementById('cm-data-fim').value||null;
  var kanbanColId=(document.getElementById('cm-kanban-col')||{value:''}).value||null;
  var intervaloSemanas=parseInt((document.getElementById('cm-intervalo')||{value:'1'}).value)||1;
  var source=ctx.source;

  var payload={titulo:titulo,texto:titulo,categoria_id:cat,tipo:tipo,urgencia:urg,
      prazo:prazo,data:prazo,horario:horario,horario_fim:horarioFim,descricao:desc,checklist:checklist,dias:dias,
      data_inicio:dataInicio,data_fim:dataFim,kanban_coluna_id:kanbanColId,intervalo_semanas:intervaloSemanas};

  // Capturar mudanças para histórico (somente edições)
  var _histItemId=null, _histTipo=source;
  var _histChanges=[];
  if(!ctx.isNew && ctx.oldState && ctx.item){
    var _old=ctx.oldState, _itm=ctx.item;
    _histItemId=_itm.id||_itm._rId||null;
    var _urgLabels={h:'Urgente',m:'Normal',l:'Baixo'};
    if(titulo!==_old.titulo) _histChanges.push({acao:'Título alterado',detalhe:'"'+_old.titulo+'" → "'+titulo+'"'});
    if(urg!==_old.urgencia) _histChanges.push({acao:'Prioridade alterada',detalhe:(_urgLabels[_old.urgencia]||_old.urgencia)+' → '+(_urgLabels[urg]||urg)});
    if(dataInicio!==_old.data_inicio) _histChanges.push({acao:'Data de início alterada',detalhe:(_old.data_inicio||'—')+' → '+(dataInicio||'—')});
    if(prazo!==_old.prazo) _histChanges.push({acao:'Prazo alterado',detalhe:(_old.prazo||'—')+' → '+(prazo||'—')});
  }

  if(ctx.isNew){
    if(source==='backlog'){
      var created=await api('POST','/api/backlog',payload);
      if(created){S.backlog.push(created);renderBacklog();buildBLMini();await recordHistory(created.id,'backlog','Criado',titulo);}
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
        var dataItem = wd2[slotDayIdx] ? localDateISO(wd2[slotDayIdx]) : localDateISO();
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
    // Busca referência real em S.backlog/rotina/imprevistos para garantir limpeza de campos
    if(source==='backlog'){
      var realBL=S.backlog.find(function(b){return b.id===item.id;});
      if(realBL) item=realBL;
    } else if(source==='rotina'){
      var realRot=S.rotina.find(function(r){return r.id===item.id;});
      if(realRot) item=realRot;
    } else if(source==='imprevisto'){
      var realImp=S.imprevistos.find(function(i){return i.id===item.id;});
      if(realImp) item=realImp;
    }
    Object.assign(item,payload);
    if(source==='backlog'){
      if(tipo === 'rotina'){
        // Mudou de backlog → rotina: deletar do backlog, criar em rotina
        await api('DELETE','/api/backlog/'+item.id);
        S.backlog=S.backlog.filter(function(b){return b.id!==item.id;});
        var migrR=await api('POST','/api/rotina',Object.assign({},payload,{ativo:true}));
        if(migrR) S.rotina.push(migrR);
        renderBacklog(); buildBLMini();
        if(S.page==='rotina') renderRotinaPage();
      } else {
        await api('PUT','/api/backlog/'+item.id,payload);
        renderBacklog();
        buildGrade();
        buildBLMini();
      }
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
      if(tipo !== 'rotina'){
        // Mudou de rotina → backlog: deletar da tabela rotina, criar em backlog
        await api('DELETE','/api/rotina/'+item.id);
        S.rotina=S.rotina.filter(function(r){return r.id!==item.id;});
        var migrPayload=Object.assign({},payload,{tipo:tipo});
        delete migrPayload.ativo; delete migrPayload.dias; delete migrPayload.intervalo_semanas;
        var migrated=await api('POST','/api/backlog',migrPayload);
        if(migrated) S.backlog.push(migrated);
        if(S.page==='rotina') renderRotinaPage();
        renderBacklog(); buildBLMini();
      } else {
        payload.ativo=item.ativo!==undefined?item.ativo:true;
        await api('PUT','/api/rotina/'+item.id,payload);
        var freshR=await api('GET','/api/rotina');
        if(freshR) S.rotina=freshR;
        if(S.page==='rotina') renderRotinaPage();
      }
    } else if(source==='imprevisto'){
      await api('PUT','/api/imprevistos/'+item.id,payload);
      var idx2=S.imprevistos.findIndex(function(i){return i.id===item.id;});
      if(idx2>=0) Object.assign(S.imprevistos[idx2],payload);
      if(S.page==='imprevistos') renderImpPg();
    }
    buildGrade(); buildBLMini(); buildRotMini(); buildImpMini();
    // Gravar histórico de mudanças
    if(_histItemId && _histChanges.length){
      for(var _hi=0;_hi<_histChanges.length;_hi++){
        await recordHistory(_histItemId,_histTipo,_histChanges[_hi].acao,_histChanges[_hi].detalhe);
      }
    }
  }
  // Atualizar kanban se visível (etapa pode ter mudado)
  if(S.page==='kanban') renderKanban();
  updateBadges();
  buildStats();
  toast('💾 Salvo com sucesso','success',2000);
  closeCardModal();
  }catch(e){ _restoreBtn(); throw e; }
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
var DEP_INFO = {
  relacionado:   {icon:'🔗', label:'Relacionado',   style:'color:var(--text3)'},
  antecede:      {icon:'⏩', label:'Antecede',       style:'color:#3498db'},
  sucede:        {icon:'⏪', label:'Sucede',          style:'color:var(--amber)'},
  bloqueia:      {icon:'🚫', label:'Bloqueia',       style:'color:#e67e22'},
  bloqueado_por: {icon:'⛔', label:'Bloqueado por',  style:'color:#e74c3c;font-weight:600'}
};
function renderCmVinculos(vinculos){
  var wrap=document.getElementById('cm-vinculos-list'); if(!wrap) return;
  wrap.innerHTML='';
  if(!vinculos||!vinculos.length){
    wrap.innerHTML='<div style="font-size:11px;color:var(--text3);padding:8px 0">Nenhum vínculo adicionado.</div>';
    return;
  }
  (vinculos||[]).forEach(function(v){
    var dep=v.dep||'relacionado';
    var di=DEP_INFO[dep]||DEP_INFO.relacionado;
    var isBlocked=dep==='bloqueado_por';
    var isSucede=dep==='sucede';
    var alertHint='';
    if(isBlocked) alertHint='<span style="font-size:9px;color:#e74c3c;margin-left:4px" title="Este item está bloqueado por este vínculo">⚠️ bloqueante</span>';
    if(isSucede)  alertHint='<span style="font-size:9px;color:var(--amber);margin-left:4px" title="Este item depende do outro para ser concluído">⚠️ pendente</span>';
    var div=document.createElement('div'); div.className='vinculo-item';
    div.style.cssText='display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border)';
    div.innerHTML='<span class="vinculo-id" style="font-family:var(--font-m);font-size:9px;color:var(--text3)">'+v.id+'</span>'
      +'<span style="'+di.style+';font-size:10px;white-space:nowrap">'+di.icon+' '+di.label+'</span>'
      +'<span class="vinculo-title" style="flex:1;font-size:12px">'+v.titulo+'</span>'
      +alertHint
      +'<button class="btn-icon" style="font-size:11px;flex-shrink:0" onclick="removeVinculo(\''+v.id+'\')">✕</button>';
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
  var depSel=document.getElementById('cm-dep-tipo');
  var dep=depSel?depSel.value:'relacionado';
  ctx.item.vinculos.push({id:item.id,titulo:item.titulo,tipo:item.tipo,dep:dep});
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
  var monday=localDateISO(getWeekDates()[0]);
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
  var uL={h:'🔴 Urgente',m:'🟡 Normal',l:'🟢 Baixo'};
  var noFilter=!searchQ&&!urgF&&!statusF&&S.blFilter==='all';
  var filtered=S.backlog.filter(function(t){
    if(S.blFilter==='_np') return !t.prazo;
    if(S.blFilter!=='all'&&String(t.categoria_id)!==String(S.blFilter)) return false;
    if(urgF&&t.urgencia!==urgF) return false;
    if(statusF==='aberto'&&t.concluido) return false;
    if(statusF==='concluido'&&!t.concluido) return false;
    if(searchQ&&!t.titulo.toLowerCase().includes(searchQ)&&!t.id.toLowerCase().includes(searchQ)) return false;
    return true;
  });
  filtered.forEach(function(task){
    var cat=getCat(task.categoria_id), noPrazo=!task.prazo;
    var inPlanner = isScheduled(task);
    var dateStr=task.prazo?new Date(task.prazo+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    var tr=document.createElement('tr');
    tr.dataset.id=task.id;
    if(task.concluido) tr.classList.add('done-row');

    // Dependency alerts for To Do rows
    var taskDepA=!task.concluido?getDepAlerts(task.vinculos):{blocked:false,sucede:false,hasAntecede:false,blockedBy:[],sucedeItems:[]};
    var depBadge='';
    if(taskDepA.blocked){
      var bNames=taskDepA.blockedBy.map(function(v){return v.id;}).join(', ');
      depBadge='<span style="font-family:var(--font-m);font-size:9px;color:#e74c3c;margin-left:6px;font-weight:600" title="Bloqueado por: '+bNames+'">⛔ Bloqueado</span>';
      tr.style.cssText='background:rgba(231,76,60,.05);';
    } else if(taskDepA.sucede){
      var sNames=taskDepA.sucedeItems.map(function(v){return v.id;}).join(', ');
      depBadge='<span style="font-family:var(--font-m);font-size:9px;color:var(--amber);margin-left:6px" title="Sucede '+sNames+' — item anterior ainda pendente">⚠️ Dep. pendente</span>';
    } else if(taskDepA.hasAntecede){
      depBadge='<span style="font-family:var(--font-m);font-size:9px;color:#3498db;margin-left:6px;opacity:.8" title="Habilita ou está relacionado a outros itens">⏩ Habilitador</span>';
    }

    tr.innerHTML='<td class="td-drag" title="Arrastar para reordenar">'+(noFilter?'⠿':'')+'</td>'
      +'<td class="td-check"><div class="chk'+(task.concluido?' done':'')+'">✓</div></td>'
      +'<td class="td-id">'+task.id+'</td>'
      +'<td class="td-title">'+(task.titulo||'')
        +(inPlanner?'<span class="td-planned-badge" title="Agendado no calendário">📅</span>':'')
        +(noPrazo?'<span class="no-prazo-badge" style="margin-left:6px">sem prazo</span>':'')
        +depBadge
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
      await recordHistory(task.id,'backlog',task.concluido?'Concluído':'Reaberto','');
      renderBacklog(); updateBadges(); buildBLMini();
    };
    tr.querySelector('.td-del').onclick=async function(){
      if(!await siteConfirm('Excluir?')) return;
      await api('DELETE','/api/backlog/'+task.id);
      S.backlog=S.backlog.filter(function(b){return b.id!==task.id;});
      renderBacklog(); updateBadges(); buildBLMini();
    };
    // Drag-to-reorder (only when no filter active)
    if(noFilter){
      tr.draggable=true;
      tr.addEventListener('dragstart',function(e){
        S._blDrag=task.id;
        tr.classList.add('bl-dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('bl-reorder','1');
      });
      tr.addEventListener('dragend',function(){
        tr.classList.remove('bl-dragging');
        document.querySelectorAll('#bl-tbody tr.bl-drag-over').forEach(function(r){r.classList.remove('bl-drag-over');});
      });
      tr.addEventListener('dragover',function(e){
        if(!S._blDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        tbody.querySelectorAll('.bl-drag-over').forEach(function(r){r.classList.remove('bl-drag-over');});
        if(S._blDrag!==task.id) tr.classList.add('bl-drag-over');
      });
      tr.addEventListener('dragleave',function(){tr.classList.remove('bl-drag-over');});
      tr.addEventListener('drop',async function(e){
        e.preventDefault();
        tr.classList.remove('bl-drag-over');
        var dragId=S._blDrag; S._blDrag=null;
        if(!dragId||dragId===task.id) return;
        var draggedItem=S.backlog.find(function(b){return b.id===dragId;});
        if(!draggedItem) return;
        // Remove from current position and insert before target
        S.backlog=S.backlog.filter(function(b){return b.id!==dragId;});
        var targetIdx=S.backlog.findIndex(function(b){return b.id===task.id;});
        if(targetIdx<0) S.backlog.push(draggedItem); else S.backlog.splice(targetIdx,0,draggedItem);
        // Assign new ordems and save
        var saves=[];
        S.backlog.forEach(function(b,i){
          var newO=i*10;
          if((b.ordem||0)!==newO){b.ordem=newO;saves.push(api('PUT','/api/backlog/'+b.id,{ordem:newO}));}
        });
        await Promise.all(saves);
        renderBacklog();
      });
    }
    tbody.appendChild(tr);
  });
  updateBadges();
}

// ── ROTINA PAGE ───────────────────────────────
function populateRotCatFilter(){
  var sel=document.getElementById('rot-cat-filter'); if(!sel) return;
  var prev=sel.value;
  sel.innerHTML='<option value="">Categoria</option>';
  S.categorias.forEach(function(c){
    sel.innerHTML+='<option value="'+c.id+'">'+c.icone+' '+c.nome+'</option>';
  });
  if(prev) sel.value=prev;
}

function renderRotinaPage(){
  populateRotCatFilter();
  var grid=document.getElementById('rot-grid'); if(!grid) return;
  var searchQ=(document.getElementById('rot-search')||{value:''}).value.toLowerCase().trim();
  var catF=(document.getElementById('rot-cat-filter')||{value:''}).value;
  var diaF=(document.getElementById('rot-dia-filter')||{value:''}).value;
  var statusF=(document.getElementById('rot-status-filter')||{value:''}).value;
  var today=localDateISO();

  grid.innerHTML='';
  var diasN=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  var filtered=S.rotina.filter(function(r){
    if(catF&&String(r.categoria_id)!==String(catF)) return false;
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
  var uL={h:'🔴 Urgente',m:'🟡 Normal',l:'🟢 Baixo'};
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
  var created=await api('POST','/api/imprevistos',{texto:texto,urgencia:urg,data:localDateISO()});
  if(created){S.imprevistos.unshift(created);if(ta)ta.value='';renderImpPg();updateBadges();buildImpMini();}
}

// ── REVISÃO ───────────────────────────────────
async function renderRevisao(){
  await loadSemana();
  var targetWk = S.revisaoWeekKey || S.weekKey;
  var aiWk     = S.aiScope==='general' ? '_geral' : targetWk;
  var results = await Promise.all([
    api('GET','/api/revisoes/'+targetWk),
    api('GET','/api/revisoes'),
    api('GET','/api/revisoes/analise?wk='+aiWk)
  ]);
  var rev   = results[0] || {};
  var lista = results[1] || [];
  var aiSaved = results[2] && results[2].analise_ia ? results[2].analise_ia : null;
  S.revisao = rev;

  buildRevisaoHistory(lista, targetWk);
  renderRevisaoWeek(targetWk, rev);

  var pfCat=document.getElementById('pf-cat');
  if(pfCat){
    pfCat.innerHTML=S.categorias.map(function(c){return '<option value="'+c.id+'">'+c.icone+' '+c.nome+'</option>';}).join('');
  }
  var pfPrazo=document.getElementById('pf-prazo');
  if(pfPrazo&&!pfPrazo.value) pfPrazo.value=localDateISO(getWeekDates(1)[0]);

  // Mostrar análise salva se existir
  renderAnaliseIA(aiSaved);
}

function buildRevisaoHistory(lista, selectedWk){
  var hist=document.getElementById('rev-history-list');
  if(!hist) return;
  // Badge da semana atual
  var curBadge=document.getElementById('rev-current-badge');
  var curItem=lista.find(function(r){return r.week_key===S.weekKey;});
  if(curBadge) curBadge.textContent=curItem&&curItem.planos_ativos?curItem.planos_ativos+'':'' ;
  // Marcar botão semana atual como ativo
  var curBtn=document.getElementById('rev-current-btn');
  if(curBtn) curBtn.classList.toggle('active', !S.revisaoWeekKey || S.revisaoWeekKey===S.weekKey);

  // Filtrar semanas anteriores (excluir semana atual)
  var anteriores=lista.filter(function(r){return r.week_key!==S.weekKey;});
  if(!anteriores.length){
    hist.innerHTML='<div style="color:var(--text3);font-size:10px;font-family:var(--font-m);padding:8px 4px">Nenhuma revisão anterior.</div>';
    return;
  }
  hist.innerHTML=anteriores.map(function(r){
    var d=new Date(r.week_key+'T12:00');
    var lbl=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    var isActive=r.week_key===selectedWk && S.revisaoWeekKey;
    return '<button class="rev-week-item'+(isActive?' active':'')+'" onclick="selectRevisaoWeek(\''+r.week_key+'\')">'
      +'<span class="rwi-label">'+lbl+'</span>'
      +(r.planos_ativos?'<span class="rwi-badge">'+r.planos_ativos+'</span>':'')
      +'</button>';
  }).join('');
}

async function selectRevisaoWeek(wk){
  S.revisaoWeekKey = wk;
  var targetWk = wk || S.weekKey;
  var aiWk     = S.aiScope==='general' ? '_geral' : targetWk;
  var results = await Promise.all([
    api('GET','/api/revisoes/'+targetWk),
    api('GET','/api/revisoes/analise?wk='+aiWk)
  ]);
  S.revisao = results[0] || {};
  var aiSaved = results[1] && results[1].analise_ia ? results[1].analise_ia : null;

  document.querySelectorAll('.rev-week-item').forEach(function(btn){btn.classList.remove('active');});
  var curBtn=document.getElementById('rev-current-btn');
  if(!wk && curBtn) curBtn.classList.add('active');

  renderRevisaoWeek(targetWk, S.revisao);
  renderAnaliseIA(aiSaved);
}

function renderRevisaoWeek(wk, rev){
  // Label
  var d0=new Date(wk+'T12:00');
  var d6=new Date(d0); d6.setDate(d6.getDate()+6);
  var f=function(d){return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});};
  var lbl=document.getElementById('rev-week-lbl');
  var wnum=getWeekNum(d0);
  if(lbl) lbl.textContent='Semana '+wnum+' · '+f(d0)+' – '+f(d6);

  // Stats (só para semana atual com dados carregados)
  if(wk===S.weekKey) buildRevStats();
  else {
    var sg=document.getElementById('rev-stats-grid');
    if(sg) sg.innerHTML='<div style="color:var(--text3);font-size:10px;font-family:var(--font-m)">Estatísticas disponíveis apenas para a semana atual.</div>';
  }

  // Reflexão
  var isCurrentWk = wk===S.weekKey;
  var form=document.getElementById('rev-form'); if(!form) return;
  var qs=[
    {key:'fez',lbl:'✅ O que executei esta semana?'},
    {key:'nao',lbl:'❌ O que não consegui e por quê?'},
    {key:'imp',lbl:'⚡ Imprevistos que impactaram o plano?'},
    {key:'mel',lbl:'🔄 O que farei diferente na próxima semana?'},
    {key:'kr', lbl:'🎯 Os OKRs ainda fazem sentido? Ajuste necessário?'}
  ];
  form.innerHTML=qs.map(function(q){
    var val=rev[q.key]||'';
    if(!isCurrentWk && !val) return '<div class="rev-q"><div class="rev-ql">'+q.lbl+'</div><div style="color:var(--text3);font-size:10px;font-family:var(--font-m);padding:6px 0">—</div></div>';
    return '<div class="rev-q"><div class="rev-ql">'+q.lbl+'</div>'
      +(isCurrentWk
        ? '<textarea class="field-ta rev-ta" id="rq-'+q.key+'" rows="3" placeholder="...">'+val+'</textarea>'
        : '<div class="rev-readonly-txt">'+(val||'<em style="opacity:.5">Não preenchido</em>')+'</div>')
      +'</div>';
  }).join('');

  // Mostrar/ocultar botão salvar e "novo plano" conforme editable
  var saveBtn=document.getElementById('rev-save-btn');
  var novoPBtn=document.getElementById('rev-novo-plano-btn');
  if(saveBtn) saveBtn.style.display=isCurrentWk?'':'none';
  if(novoPBtn) novoPBtn.style.display=isCurrentWk?'':'none';

  // Planos de ação
  buildPlanosAcao(rev.planos_acao||[], wk, isCurrentWk);
}

function buildRevStats(){
  var wrap=document.getElementById('rev-stats-grid'); if(!wrap) return;
  var today=localDateISO();
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
  if(S.revisao.planos_acao) d.planos_acao=S.revisao.planos_acao;
  await api('POST','/api/revisoes/'+S.weekKey,d);
  S.revisao=Object.assign(S.revisao,d);
  var msg=document.getElementById('rev-saved-msg');
  if(msg){msg.textContent='✅ Reflexão salva!';setTimeout(function(){msg.textContent='';},3000);}
  // Atualizar badge no histórico
  var lista=await api('GET','/api/revisoes')||[];
  buildRevisaoHistory(lista, S.weekKey);
}

function buildPlanosAcao(planos, wk, isEditable){
  if(wk===undefined) wk=S.weekKey;
  if(isEditable===undefined) isEditable=true;
  var wrap=document.getElementById('rev-planos-list'); if(!wrap) return;
  wrap.innerHTML='';
  if(!planos.length){
    wrap.innerHTML='<div style="color:var(--text3);font-family:var(--font-m);font-size:10px;padding:12px 0">Nenhum plano de ação ainda.</div>';
    return;
  }
  var uL={h:'🔴 Urgente',m:'🟡 Normal',l:'🟢 Baixo'};
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
      +(isEditable?'<button class="btn-d plano-del" style="font-size:9px;padding:4px 8px">✕</button>':'');
    if(isEditable){
      el.querySelector('.plano-ck').onclick=async function(){
        p.concluido=!p.concluido;
        await api('PUT','/api/revisoes/'+wk+'/plano/'+p.id,{concluido:p.concluido});
        el.classList.toggle('concluido',p.concluido);
        el.querySelector('.plano-ck').classList.toggle('done',p.concluido);
      };
      el.querySelector('.plano-del').onclick=async function(e){
        e.stopPropagation();
        if(!await siteConfirm('Excluir plano?')) return;
        await api('DELETE','/api/revisoes/'+wk+'/plano/'+p.id);
        S.revisao.planos_acao=(S.revisao.planos_acao||[]).filter(function(x){return x.id!==p.id;});
        buildPlanosAcao(S.revisao.planos_acao||[], wk, isEditable);
      };
    }
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
      siteAlert('✅ Plano criado e adicionado ao To Do como '+blItem.id+'!');
    }
    buildPlanosAcao(S.revisao.planos_acao);
    fecharNovoPlano();
    updateBadges();
  }
}

// ── ANÁLISE DE IA ─────────────────────────────
function renderAnaliseIA(saved){
  var result=document.getElementById('rev-ai-result');
  if(!result) return;
  if(!saved){result.innerHTML='';return;}
  var dt=saved.gerado_em?new Date(saved.gerado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  var scopeLbl=saved.scope==='general'?'Geral':'Semana específica';
  result.innerHTML='<div class="rev-ai-meta">'+scopeLbl+(dt?' · '+dt:'')
    +' <button class="rev-ai-regen" onclick="analisarIA(true)" title="Gerar nova análise">↺ Regerar</button></div>'
    +'<div class="rev-ai-text">'+markdownToHtml(saved.text)+'</div>'
    +'<button class="btn-p rev-ai-plano-btn" onclick="gerarPlanoIA()" style="width:100%;margin-top:10px;font-size:11px">📋 Adicionar como Plano de Ação</button>';
}

async function analisarIA(force){
  var scope = S.aiScope || 'general';
  var aiWk  = scope==='general' ? '_geral' : (S.revisaoWeekKey||S.weekKey);
  var weekKeys = scope==='week' ? [S.revisaoWeekKey||S.weekKey] : null;

  // Se não forçar, verificar se já tem análise salva
  if(!force){
    var saved=await api('GET','/api/revisoes/analise?wk='+aiWk);
    if(saved&&saved.analise_ia){
      renderAnaliseIA(saved.analise_ia);
      return;
    }
  }

  var loading=document.getElementById('rev-ai-loading');
  var result=document.getElementById('rev-ai-result');
  var btn=document.querySelector('.rev-ai-btn');
  if(loading) loading.style.display='flex';
  if(result) result.innerHTML='';
  if(btn){btn.disabled=true;btn.textContent='⏳ Analisando...';}
  try{
    var res=await api('POST','/api/revisoes/analyze',{scope:scope,weekKeys:weekKeys});
    if(res&&res.analysis){
      renderAnaliseIA({text:res.analysis,gerado_em:new Date().toISOString(),scope:scope});
    } else if(res){
      if(result) result.innerHTML='<div style="color:var(--red);font-size:11px">'+(res.error||'Erro desconhecido')+'</div>';
    }
  }catch(e){
    if(result) result.innerHTML='<div style="color:var(--red);font-size:11px">Erro ao gerar análise.</div>';
  }finally{
    if(loading) loading.style.display='none';
    if(btn){btn.disabled=false;btn.textContent='✨ Analisar com IA';}
  }
}

function markdownToHtml(text){
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/#{1,3} (.+)/g,'<div class="rev-ai-h">$1</div>')
    .replace(/\n- (.+)/g,'<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs,'<ul>$1</ul>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');
}

// ── GERAR PLANO DE AÇÃO COM IA ─────────────────
async function gerarPlanoIA(){
  var scope = S.aiScope || 'general';
  var weekKeys = scope==='week' ? [S.revisaoWeekKey||S.weekKey] : null;
  // Passar texto da análise como contexto extra
  var analiseEl=document.querySelector('#rev-ai-result .rev-ai-text');
  var analiseTexto=analiseEl?analiseEl.innerText:'';

  var btn=document.querySelector('.rev-ai-plano-btn');
  var resultEl=document.getElementById('rev-ai-result');
  if(btn){btn.disabled=true;btn.textContent='⏳ Gerando plano...';}
  try{
    var res=await api('POST','/api/revisoes/gerar-plano',{scope:scope,weekKeys:weekKeys,analiseTexto:analiseTexto});
    if(!res){
      // api() retornou null = erro HTTP
      if(resultEl) resultEl.innerHTML+='<div class="rev-ai-err">❌ Erro de conexão ao gerar plano. Tente novamente.</div>';
      return;
    }
    if(res.error){
      if(resultEl) resultEl.innerHTML+='<div class="rev-ai-err">❌ '+res.error+'</div>';
      return;
    }
    if(!res.acoes||!res.acoes.length){
      if(resultEl) resultEl.innerHTML+='<div class="rev-ai-err">⚠️ A IA não retornou ações. Tente regerar a análise primeiro.</div>';
      return;
    }
    abrirModalPlanoIA(res.acoes, res.proximaSemana);
  }catch(e){
    if(resultEl) resultEl.innerHTML+='<div class="rev-ai-err">❌ Erro inesperado: '+e.message+'</div>';
  }finally{
    if(btn){btn.disabled=false;btn.textContent='📋 Adicionar como Plano de Ação';}
  }
}

var _planoIASugestoes=[];
var _planoIASemana='';

function abrirModalPlanoIA(acoes, proximaSemana){
  _planoIASugestoes=acoes.map(function(a,i){return Object.assign({},a,{_idx:i});});
  _planoIASemana=proximaSemana||'';
  var urg={h:'🔴 Alta',m:'🟡 Média',l:'🟢 Baixa'};
  var d=new Date(proximaSemana+'T12:00');
  var semLbl=proximaSemana?d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'';

  var modal=document.getElementById('plano-ia-modal');
  var ov=document.getElementById('plano-ia-overlay');
  if(!modal) return;
  document.getElementById('plano-ia-semana').textContent='Semana de '+semLbl;
  renderPlanoIALista();
  modal.classList.add('open');
  if(ov) ov.style.display='block';
}

function renderPlanoIALista(){
  var wrap=document.getElementById('plano-ia-lista');
  if(!wrap) return;
  var urg={h:'🔴 Alta',m:'🟡 Média',l:'🟢 Baixa'};
  wrap.innerHTML='';
  _planoIASugestoes.forEach(function(a){
    var el=document.createElement('div');
    el.className='pia-item';
    el.dataset.idx=a._idx;
    el.innerHTML='<div class="pia-item-head">'
      +'<select class="pia-urg field-sel" data-idx="'+a._idx+'" onchange="planoIAEditUrg('+a._idx+',this.value)">'
      +'<option value="h"'+(a.urgencia==='h'?' selected':'')+'>🔴 Alta</option>'
      +'<option value="m"'+(a.urgencia==='m'||!a.urgencia?' selected':'')+'>🟡 Média</option>'
      +'<option value="l"'+(a.urgencia==='l'?' selected':'')+'>🟢 Baixa</option>'
      +'</select>'
      +'<button class="pia-del" onclick="planoIARemover('+a._idx+')" title="Remover esta ação">✕</button>'
      +'</div>'
      +'<input class="field-in pia-titulo" value="'+escHtml(a.titulo||'')+'" oninput="planoIAEditTitulo('+a._idx+',this.value)" placeholder="Ação">'
      +(a.descricao?'<div class="pia-desc">'+escHtml(a.descricao)+'</div>':'')
      +'<input class="field-in pia-prazo" type="date" value="'+(a.prazo||_planoIASemana)+'" onchange="planoIAEditPrazo('+a._idx+',this.value)">';
    wrap.appendChild(el);
  });
  if(!_planoIASugestoes.length){
    wrap.innerHTML='<div style="color:var(--text3);font-size:11px;text-align:center;padding:20px">Nenhuma ação. Clique em ✕ para remover ou cancele.</div>';
  }
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function planoIARemover(idx){ _planoIASugestoes=_planoIASugestoes.filter(function(a){return a._idx!==idx;}); renderPlanoIALista(); }
function planoIAEditTitulo(idx,v){ var a=_planoIASugestoes.find(function(x){return x._idx===idx;}); if(a) a.titulo=v; }
function planoIAEditUrg(idx,v){ var a=_planoIASugestoes.find(function(x){return x._idx===idx;}); if(a) a.urgencia=v; }
function planoIAEditPrazo(idx,v){ var a=_planoIASugestoes.find(function(x){return x._idx===idx;}); if(a) a.prazo=v; }

function fecharModalPlanoIA(){
  var modal=document.getElementById('plano-ia-modal');
  var ov=document.getElementById('plano-ia-overlay');
  if(modal) modal.classList.remove('open');
  if(ov) ov.style.display='none';
}

async function confirmarPlanoIA(){
  if(!_planoIASugestoes.length){fecharModalPlanoIA();return;}
  // Criar planos na semana SEGUINTE (usa _planoIASemana como week_key da próxima semana)
  var targetWk=_planoIASemana||S.weekKey;
  var btn=document.getElementById('plano-ia-confirmar');
  if(btn){btn.disabled=true;btn.textContent='⏳ Criando...';}
  var criados=0;
  for(var i=0;i<_planoIASugestoes.length;i++){
    var a=_planoIASugestoes[i];
    if(!(a.titulo||'').trim()) continue;
    await api('POST','/api/revisoes/'+targetWk+'/plano',{
      titulo:a.titulo.trim(),
      urgencia:a.urgencia||'m',
      prazo:a.prazo||targetWk,
      descricao:a.descricao||''
    });
    criados++;
  }
  if(btn){btn.disabled=false;btn.textContent='✅ Criar Planos';}
  fecharModalPlanoIA();
  toast('✅ '+criados+' plano'+(criados!==1?'s':'')+' criado'+(criados!==1?'s':'')+' para a próxima semana!','success');
}

// ── PLANOS POPUP ──────────────────────────────
var _planosPopupDismissed = false;

async function checkPlanosPopup(){
  var cfg = S.config || {};
  // Checar se lembrete está ativo
  if(cfg.planos_notif_ativo === 0) return;

  // Checar se hoje é um dia configurado
  var diasCfg = [];
  try { diasCfg = JSON.parse(cfg.planos_notif_dias || '[0,1,2,3,4,5,6]'); } catch(e){ diasCfg=[0,1,2,3,4,5,6]; }
  var hoje = new Date().getDay(); // 0=dom
  if(diasCfg.length && diasCfg.indexOf(hoje)===-1) return;

  // Checar frequência
  var freq = cfg.planos_notif_freq || 'daily';
  var dismissed = localStorage.getItem('planos-popup-dismissed');
  if(freq==='weekly' && dismissed===S.weekKey) return;
  if(freq==='daily'  && dismissed===new Date().toDateString()) return;
  // freq==='always' → nunca bloqueia
  if(_planosPopupDismissed) return;

  var ativos = await api('GET','/api/planos-ativos')||[];
  if(!ativos.length) return;

  var estilo = cfg.planos_notif_estilo || 'popup';
  var uL={h:'🔴',m:'🟡',l:'🟢'};
  var listHtml = ativos.slice(0,5).map(function(p){
    return '<div class="popup-plano-item">'
      +'<span class="popup-plano-urg">'+(uL[p.urgencia||'m'])+'</span>'
      +'<span class="popup-plano-titulo">'+p.titulo+'</span>'
      +(p.prazo?'<span class="popup-plano-prazo">'+formatDate(p.prazo)+'</span>':'')
      +'</div>';
  }).join('');
  if(ativos.length>5) listHtml+='<div style="color:var(--text3);font-size:10px;font-family:var(--font-m);padding:4px 0">...e mais '+(ativos.length-5)+' pendentes</div>';

  if(estilo==='popup'){
    var list=document.getElementById('planos-popup-list');
    if(list) list.innerHTML=listHtml;
    var popup=document.getElementById('planos-popup');
    if(popup) popup.style.display='flex';
    document.getElementById('planos-popup-banner') && (document.getElementById('planos-popup-banner').style.display='none');
  } else if(estilo==='banner'){
    _mostrarPlanosBanner(ativos.length, listHtml);
  } else if(estilo==='badge'){
    _mostrarPlanosBadge(ativos.length);
  }
}

function _mostrarPlanosBanner(total, listHtml){
  var banner=document.getElementById('planos-banner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='planos-banner';
    banner.className='planos-banner';
    document.querySelector('.main-wrap').prepend(banner);
  }
  banner.innerHTML='<span class="pb-icon">🎯</span>'
    +'<span class="pb-txt"><strong>'+total+' plano'+(total!==1?'s':'')+' pendente'+(total!==1?'s':'')+'</strong> desta semana</span>'
    +'<button class="pb-ver" onclick="goTo(\'revisao\')">Ver planos</button>'
    +'<button class="pb-dis" onclick="dismissPlanosPopup()">✕</button>';
  banner.style.display='flex';
}

function _mostrarPlanosBadge(total){
  var badge=document.getElementById('planos-badge');
  if(!badge){
    badge=document.createElement('div');
    badge.id='planos-badge';
    badge.className='planos-badge';
    badge.title='Planos de ação pendentes — clique para ver';
    badge.onclick=function(){ goTo('revisao'); };
    document.body.appendChild(badge);
  }
  badge.textContent='🎯 '+total;
  badge.style.display='flex';
}

function closePlanosPopup(){
  var popup=document.getElementById('planos-popup');
  if(popup) popup.style.display='none';
  var banner=document.getElementById('planos-banner');
  if(banner) banner.style.display='none';
}

function dismissPlanosPopup(){
  _planosPopupDismissed=true;
  var freq=(S.config&&S.config.planos_notif_freq)||'daily';
  if(freq==='weekly')      localStorage.setItem('planos-popup-dismissed', S.weekKey);
  else if(freq==='always') localStorage.setItem('planos-popup-dismissed', new Date().toDateString()); // always → dismiss só por hoje
  else                     localStorage.setItem('planos-popup-dismissed', new Date().toDateString()); // daily
  closePlanosPopup();
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
      var dtISO=localDateISO(dt);
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
  var today=localDateISO();
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
  return localDateISO(mon);
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
  updateAlertBadge();
}

function getAlerts(){
  var today=localDateISO();
  var seen=JSON.parse(localStorage.getItem('alertsSeen')||'[]');
  var alerts=[];
  S.backlog.forEach(function(t){
    if(t.concluido) return;
    var overdue=(t.prazo&&t.prazo<today);
    var scheduledLate=(t.horario&&t.data_inicio&&t.data_inicio<today);
    if(overdue||scheduledLate){
      if(seen.indexOf(t.id)<0) alerts.push({id:t.id,titulo:t.titulo||'',tipo:'backlog',data:t.prazo||t.data_inicio,item:t});
    }
  });
  S.imprevistos.forEach(function(i){
    if(i.resolvido) return;
    if(i.data&&i.data<today){
      if(seen.indexOf(i.id)<0) alerts.push({id:i.id,titulo:i.titulo||i.texto||'',tipo:'imprevisto',data:i.data,item:i});
    }
  });
  return alerts;
}

function updateAlertBadge(){
  var alerts=getAlerts();
  var badge=document.getElementById('alert-badge');
  var btn=document.getElementById('tb-alert-btn');
  if(!badge||!btn) return;
  if(alerts.length>0){
    badge.style.display='';
    badge.textContent=alerts.length;
    btn.classList.add('has-alerts');
  } else {
    badge.style.display='none';
    btn.classList.remove('has-alerts');
  }
}

function toggleAlerts(){
  var panel=document.getElementById('alerts-panel'); if(!panel) return;
  if(panel.style.display!=='none'){panel.style.display='none';return;}
  var alerts=getAlerts();
  if(!alerts.length){panel.innerHTML='<div class="alert-empty">Nenhum alerta pendente ✅</div>';panel.style.display='';return;}
  panel.innerHTML='<div class="alert-panel-title">⚠️ Itens em atraso</div>';
  alerts.forEach(function(a){
    var row=document.createElement('div'); row.className='alert-row';
    row.innerHTML='<div class="alert-row-info">'
      +'<span class="alert-row-tipo">'+(a.tipo==='backlog'?'📋':'⚡')+'</span>'
      +'<span class="alert-row-t">'+a.titulo+'</span>'
      +'<span class="alert-row-d">'+(a.data||'')+'</span>'
      +'</div>'
      +'<button class="alert-row-dismiss" title="Marcar como visto">✕</button>';
    row.querySelector('.alert-row-info').onclick=function(){
      panel.style.display='none';
      openCardModal(a.item,a.tipo,null,null);
    };
    row.querySelector('.alert-row-dismiss').onclick=function(e){
      e.stopPropagation();
      var seen=JSON.parse(localStorage.getItem('alertsSeen')||'[]');
      seen.push(a.id); localStorage.setItem('alertsSeen',JSON.stringify(seen));
      toggleAlerts(); toggleAlerts(); // re-render
    };
    panel.appendChild(row);
  });
  panel.style.display='';
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

// ── RESIZE: clear mobile cell hiding when going back to desktop ──────────
window.addEventListener('resize',function(){
  if(window.innerWidth>680){
    document.querySelectorAll('#grade-body .g-cell,.g-allday-row .g-allday-cell').forEach(function(c){
      c.style.display='';
    });
    closeMobileSidebar();
  } else if(S.page==='planner'){
    mobileDaySelect(S.mobilePlannerDay!==undefined?S.mobilePlannerDay:0);
  }
});

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
  // Fechar painel de alertas ao clicar fora
  var ap=document.getElementById('alerts-panel'), ab=document.getElementById('tb-alert-btn');
  if(ap&&ap.style.display!=='none'&&!ap.contains(e.target)&&e.target!==ab&&!(ab&&ab.contains(e.target))){
    ap.style.display='none';
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
  // Restaurar estado do painel direito
  if(localStorage.getItem('rightSidebarCollapsed')==='1'){
    var pr=document.getElementById('planner-right');
    var layout=document.querySelector('.planner-layout');
    var btn=document.getElementById('pr-collapse-btn');
    if(pr) pr.classList.add('collapsed');
    if(layout) layout.classList.add('right-collapsed');
    if(btn){btn.textContent='»';btn.title='Expandir painel';}
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

// ── TOAST SYSTEM ──────────────────────────────
function toast(msg, type, duration){
  var container=document.getElementById('toast-container');
  if(!container){
    container=document.createElement('div');
    container.id='toast-container';
    document.body.appendChild(container);
  }
  var t=document.createElement('div');
  t.className='toast toast-'+(type||'info');
  t.textContent=msg;
  var dismiss=function(){
    t.classList.remove('toast-show');
    setTimeout(function(){if(t.parentNode) t.remove();},300);
  };
  t.onclick=dismiss;
  container.appendChild(t);
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ t.classList.add('toast-show'); });
  });
  setTimeout(dismiss, duration||3800);
}

window.siteAlert = function(msg) {
  // Mensagens de notificação → toast não-bloqueante
  if(/^[\u{2705}\u{274C}\u{1F4E6}\u{1F5D1}⚠ℹ✔\u{1F504}\u{1F4BE}]/u.test(msg) || msg.startsWith('✅') || msg.startsWith('❌') || msg.startsWith('📦') || msg.startsWith('🗑') || msg.startsWith('⚠️') || msg.startsWith('⚙️') || msg.startsWith('💾')){
    var type='info';
    if(msg.startsWith('✅')||msg.startsWith('💾')) type='success';
    else if(msg.startsWith('❌')) type='error';
    else if(msg.startsWith('⚠️')||msg.startsWith('🗑')) type='warn';
    toast(msg,type);
    return Promise.resolve();
  }
  return new Promise(function(resolve){ showDialog('Aviso', msg, null, false, function(){ resolve(); }); });
};
window.siteConfirm = function(msg) {
  return new Promise(function(resolve){ showDialog('Confirmação', msg, null, true, function(res){ resolve(res); }); });
};
window.sitePrompt = function(msg, def) {
  return new Promise(function(resolve){ showDialog('Entrada de Dados', msg, def || '', true, function(res, val){ resolve(res ? val : null); }); });
};

// ── CANVAS / NOTAS ────────────────────────────

var CANVAS_NOTE_COLORS = ['#fde68a','#fca5a5','#93c5fd','#86efac','#d8b4fe','#fed7aa','#f0fdf4'];
var CANVAS_CTX_MENU = null; // context menu DOM ref
var _cvPan = { active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 };
var _cvSpacePan = false;
var _cvDrag = { active: false, startX: 0, startY: 0, ghost: null };
var _cvPen = { drawing: false, points: [], el: null };

async function renderCanvas() {
  var boardsList = document.getElementById('canvas-boards-list');
  var empty      = document.getElementById('canvas-empty');
  var surface    = document.getElementById('canvas-surface');
  var vtoolbar   = document.getElementById('canvas-vtoolbar');
  if (!boardsList) return;

  if (!S.canvasCurrentBoard && S.canvasBoards.length > 0) {
    S.canvasCurrentBoard = S.canvasBoards[0];
  }

  boardsList.innerHTML = S.canvasBoards.map(function(b) {
    var active = S.canvasCurrentBoard && S.canvasCurrentBoard.id === b.id;
    return '<div class="canvas-board-tab' + (active ? ' active' : '') + '">'
      + '<span class="cbt-lbl" onclick="canvasSelectBoard(' + b.id + ')">' + (b.titulo||'Board') + '</span>'
      + '<button class="cbt-rename" onclick="canvasRenameBoard(' + b.id + ')" title="Renomear">&#x270E;</button>'
      + '<button class="cbt-del" onclick="canvasDeleteBoard(' + b.id + ')" title="Excluir">&#x2715;</button>'
      + '</div>';
  }).join('');

  if (!S.canvasCurrentBoard) {
    if (empty) empty.style.display = 'flex';
    if (surface) surface.style.display = 'none';
    if (vtoolbar) vtoolbar.style.visibility = 'hidden';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (surface) surface.style.display = 'block';
  if (vtoolbar) vtoolbar.style.visibility = 'visible';

  var results = await Promise.all([
    api('GET', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/notes'),
    api('GET', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/shapes')
  ]);
  S.canvasNotes  = results[0] || [];
  S.canvasShapes = results[1] || [];
  canvasRenderAll();
  canvasApplyZoom();
  canvasBindSurfaceEvents();
  canvasUpdateParkingBadge();
  // Close parking panel when switching boards
  var pp = document.getElementById('cv-parking-panel');
  if (pp) pp.classList.remove('cv-park-open');
}

function canvasRenderAll() {
  var surface = document.getElementById('canvas-surface');
  if (!surface) return;
  surface.innerHTML = '';
  // Re-add pen SVG overlay
  var penSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  penSvg.id = 'canvas-pen-svg';
  penSvg.setAttribute('style', 'position:absolute;top:0;left:0;width:3200px;height:2400px;pointer-events:none;z-index:50;overflow:visible');
  surface.appendChild(penSvg);

  S.canvasNotes.forEach(function(note) {
    if (note.note_type === 'card')  surface.appendChild(canvasMakeCard(note));
    else if (note.note_type === 'table') surface.appendChild(canvasMakeTable(note));
    else surface.appendChild(canvasMakeNote(note));
  });
  S.canvasShapes.forEach(function(shape) {
    if (shape.tipo === 'pen')     surface.appendChild(canvasMakePen(shape));
    else if (shape.tipo === 'frame')   surface.appendChild(canvasMakeFrame(shape));
    else if (shape.tipo === 'comment') surface.appendChild(canvasMakeComment(shape));
    else if (shape.tipo === 'emoji')   surface.appendChild(canvasEmojiEl(shape));
    else surface.appendChild(canvasMakeShape(shape));
  });
}

// ── Context Menu ──────────────────────────────
function canvasShowCtxMenu(x, y, items) {
  canvasHideCtxMenu();
  var menu = document.createElement('div');
  menu.id = 'canvas-ctx-menu';
  menu.className = 'canvas-ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  items.forEach(function(item) {
    if (item === '-') {
      var sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      return;
    }
    var row = document.createElement('button');
    row.className = 'ctx-item' + (item.danger ? ' ctx-danger' : '');
    row.innerHTML = '<span class="ctx-icon">' + item.icon + '</span>' + item.label;
    row.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    row.addEventListener('click', function() { canvasHideCtxMenu(); item.action(); });
    menu.appendChild(row);
  });
  document.body.appendChild(menu);
  CANVAS_CTX_MENU = menu;
  // Adjust if out of viewport
  var r = menu.getBoundingClientRect();
  if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + 'px';
  if (r.bottom > window.innerHeight) menu.style.top  = (y - r.height) + 'px';
}

function canvasHideCtxMenu() {
  if (CANVAS_CTX_MENU) { CANVAS_CTX_MENU.remove(); CANVAS_CTX_MENU = null; }
}

// ── Floating action bar ───────────────────────
function canvasShowActionBar(el, actions) {
  document.querySelectorAll('.canvas-action-bar').forEach(function(b){ b.remove(); });
  var bar = document.createElement('div');
  bar.className = 'canvas-action-bar';
  actions.forEach(function(a) {
    var btn = document.createElement('button');
    btn.className = 'cab-btn' + (a.danger ? ' cab-danger' : '');
    btn.title = a.label;
    btn.innerHTML = a.icon;
    btn.addEventListener('mousedown', function(e){ e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener('click', function(e){ e.stopPropagation(); a.action(); });
    bar.appendChild(btn);
  });
  el.appendChild(bar);
}

function canvasHideActionBars() {
  document.querySelectorAll('.canvas-action-bar').forEach(function(b){ b.remove(); });
}

// ── Sticky Note ──────────────────────────────
function canvasMakeNote(note) {
  var isDoc = (note.note_type === 'doc');
  if (note.note_type === 'card') return canvasMakeCard(note);
  if (isDoc) return canvasMakeDoc(note);

  var el = document.createElement('div');
  el.className = 'canvas-note';
  el.dataset.nid = note.id;
  el.style.left       = (note.pos_x   || 80)  + 'px';
  el.style.top        = (note.pos_y   || 80)  + 'px';
  el.style.width      = (note.largura || 220)  + 'px';
  el.style.height     = (note.altura  || 160)  + 'px';
  el.style.background = note.cor || CANVAS_NOTE_COLORS[0];
  if (note.parked) el.classList.add('cn-is-parked');

  var colorBtns = CANVAS_NOTE_COLORS.map(function(c) {
    return '<button class="cn-color-btn' + (note.cor===c?' active':'') + '" style="background:' + c + '" data-c="' + c
      + '" onclick="canvasChangeColor(' + note.id + ',\'' + c + '\')" title="' + c + '"></button>';
  }).join('');

  var linkBadge = '';
  if (note.card_id) {
    linkBadge = '<div class="cn-link-badge" title="Vinculado ao card ' + note.card_id + '" onclick="swal(\'Card: ' + note.card_id + '\')">&#128279;</div>';
  }

  el.innerHTML =
    '<div class="cn-header">'
      + '<div class="cn-drag-handle" title="Arrastar"><svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" opacity=".45"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg></div>'
      + '<div class="cn-color-btns">' + colorBtns + '</div>'
      + linkBadge
      + '<button class="cn-del" title="Excluir (Del)">×</button>'
      + '<div class="cn-parked-dot" title="Neste Board (veio do Parking Lot)"></div>'
    + '</div>'
    + '<div class="cn-body" contenteditable="true" spellcheck="false" data-placeholder="Digite sua nota aqui...">' + (note.conteudo || '') + '</div>'
    + '<div class="cn-resize-hint">⇲</div>';

  var body = el.querySelector('.cn-body');
  var delBtn = el.querySelector('.cn-del');

  body.addEventListener('keyup', function(e) { if (S.canvasSelectedEl && S.canvasSelectedEl.el === el) e.stopPropagation(); });
  body.addEventListener('blur', function() {
    var nc = body.innerHTML;
    if (nc !== note.conteudo) { note.conteudo = nc; api('PUT', '/api/canvas/notes/' + note.id, { conteudo: nc }); }
  });
  body.addEventListener('focus', function() { canvasShowFmtBar(); });

  delBtn.addEventListener('click', function(e) { e.stopPropagation(); canvasDeleteNote(note.id); });

  canvasBindDrag(el, el.querySelector('.cn-header'), note, 'note');
  canvasBindResize(el, note, 'note');

  el.addEventListener('mousedown', function(e) {
    if (e.target.closest('.cn-color-btn') || e.target === delBtn || e.target.closest('.cn-link-badge')) return;
    if (e.button !== 0) return;
    canvasDeselectAll();
    el.classList.add('cn-selected');
    S.canvasSelectedEl = { el: el, note: note, type: 'note' };
    
    var act = [
      { icon: '&#128279;', label: 'Vincular a Card', action: function(){ canvasLinkToCard(note); }, badge:true },
      { icon: '&#10064;', label: 'Duplicar', action: function(){ canvasDuplicateNote(note); } },
      { icon: '&#8593;', label: 'Frente',   action: function(){ canvasBringFront(el); } },
      { icon: '&#8595;', label: 'Atrás',    action: function(){ canvasSendBack(el); } },
      { icon: '&#10060;', label: 'Excluir', danger: true, action: function(){ canvasDeleteNote(note.id); } }
    ];
    canvasShowActionBar(el, act);
  });
  
  el.addEventListener('contextmenu', function(e) {
    if (e.target === body) return;
    e.preventDefault();
    canvasShowNoteCtxMenu(e.clientX, e.clientY, note, el);
  });
  
  return el;
}

// ── NEW TYPES (Doc, Card) ───────────────────────────
function canvasMakeDoc(note) {
  var el = document.createElement('div');
  el.className = 'cv-doc-note';
  el.dataset.nid = note.id;
  el.style.left   = (note.pos_x   || 80)  + 'px';
  el.style.top    = (note.pos_y   || 80)  + 'px';
  el.style.width  = (note.largura || 320)  + 'px';
  el.style.height = (note.altura  || 240)  + 'px';
  
  var parsed = { title: '', text: '', tags: [] };
  try { parsed = JSON.parse(note.conteudo || '{}'); } catch(e){}
  
  var badge = note.card_id ? '<div class="cvdn-link-badge" title="Vinculado ao card ' + note.card_id + '">&#128279;</div>' : '';

  el.innerHTML =
    '<div class="cvdn-topbar">'
      + '<div class="cvdn-icon">&#128196;</div>'
      + '<div class="cvdn-title" contenteditable="true" spellcheck="false">' + (parsed.title || '') + '</div>'
      + badge
      + '<button class="cvdn-del" title="Excluir">×</button>'
    + '</div>'
    + '<div class="cvdn-body" contenteditable="true" spellcheck="false">' + (parsed.text || '') + '</div>'
    + '<div class="cvdn-footer">'
      + (parsed.tags.length ? parsed.tags.map(t => '<span class="cvdn-tag">'+t+'</span>').join('') : '<span class="cvdn-tag">+ Add Tag</span>')
      + '<span class="cvdn-wcount">Doc</span>'
    + '</div>';

  var tb = el.querySelector('.cvdn-topbar');
  var bTitle = el.querySelector('.cvdn-title');
  var bBody = el.querySelector('.cvdn-body');
  var delBtn = el.querySelector('.cvdn-del');

  function save() {
    parsed.title = bTitle.innerText;
    parsed.text = bBody.innerHTML;
    var nc = JSON.stringify(parsed);
    if (nc !== note.conteudo) { note.conteudo = nc; api('PUT', '/api/canvas/notes/' + note.id, { conteudo: nc }); }
  }
  bTitle.addEventListener('blur', save);
  bBody.addEventListener('blur', save);
  
  [bTitle, bBody].forEach(e => e.addEventListener('keyup', function(ev) { if (S.canvasSelectedEl && S.canvasSelectedEl.el === el) ev.stopPropagation(); }));

  delBtn.addEventListener('click', function(e) { e.stopPropagation(); canvasDeleteNote(note.id); });

  canvasBindDrag(el, tb, note, 'note');
  canvasBindResize(el, note, 'note');

  el.addEventListener('mousedown', function(e) {
    if (e.target === bTitle || e.target === bBody || e.target === delBtn || e.target.closest('.cvdn-tag') || e.target.closest('.cvdn-link-badge')) return;
    if (e.button !== 0) return;
    canvasDeselectAll();
    el.classList.add('cn-selected');
    S.canvasSelectedEl = { el: el, note: note, type: 'note' };
    
    var act = [
      { icon: '&#128279;', label: 'Vincular a Card', action: function(){ canvasLinkToCard(note); } },
      { icon: '&#10064;', label: 'Duplicar', action: function(){ canvasDuplicateNote(note); } },
      { icon: '&#8593;', label: 'Frente',   action: function(){ canvasBringFront(el); } },
      { icon: '&#8595;', label: 'Atrás',    action: function(){ canvasSendBack(el); } },
      { icon: '&#10060;', label: 'Excluir', danger: true, action: function(){ canvasDeleteNote(note.id); } }
    ];
    canvasShowActionBar(el, act);
  });
  
  return el;
}

function canvasMakeCard(note) {
  var el = document.createElement('div');
  el.className = 'canvas-note cn-card';
  el.dataset.nid = note.id;
  el.style.left   = (note.pos_x   || 80)  + 'px';
  el.style.top    = (note.pos_y   || 80)  + 'px';
  el.style.width  = (note.largura || 260)  + 'px';
  el.style.height = (note.altura  || 140)  + 'px';
  
  var parsed = { tag: 'CARD', header: '', body: '', footer: '' };
  try { parsed = JSON.parse(note.conteudo || '{}'); } catch(e){}

  el.innerHTML =
    '<div class="cn-card-top-bar">'
      + '<div class="cn-drag-handle" title="Arrastar"><svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" opacity=".45"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg></div>'
      + '<div class="cn-card-label-tag" contenteditable="true" spellcheck="false">' + (parsed.tag || '') + '</div>'
      + '<button class="cn-del" title="Excluir">×</button>'
    + '</div>'
    + '<div class="cn-card-header" contenteditable="true" spellcheck="false" data-placeholder="Tít. do Card">' + (parsed.header || '') + '</div>'
    + '<div class="cn-card-body" contenteditable="true" spellcheck="false" data-placeholder="Conteúdo do card...">' + (parsed.body || '') + '</div>'
    + '<div class="cn-card-footer" contenteditable="true" spellcheck="false" data-placeholder="Rodapé (data, dono)">' + (parsed.footer || '') + '</div>';

  var topBar = el.querySelector('.cn-card-top-bar');
  var bTag = el.querySelector('.cn-card-label-tag');
  var bHead = el.querySelector('.cn-card-header');
  var bBody = el.querySelector('.cn-card-body');
  var bFoot = el.querySelector('.cn-card-footer');
  var delBtn = el.querySelector('.cn-del');

  function save() {
    parsed.tag = bTag.innerText; parsed.header = bHead.innerHTML; parsed.body = bBody.innerHTML; parsed.footer = bFoot.innerHTML;
    var nc = JSON.stringify(parsed);
    if (nc !== note.conteudo) { note.conteudo = nc; api('PUT', '/api/canvas/notes/' + note.id, { conteudo: nc }); }
  }
  [bTag, bHead, bBody, bFoot].forEach(e => {
    e.addEventListener('blur', save);
    e.addEventListener('keyup', function(ev) { if (S.canvasSelectedEl && S.canvasSelectedEl.el === el) ev.stopPropagation(); });
  });

  delBtn.addEventListener('click', function(e) { e.stopPropagation(); canvasDeleteNote(note.id); });

  canvasBindDrag(el, topBar, note, 'note');
  canvasBindResize(el, note, 'note');

  el.addEventListener('mousedown', function(e) {
    if (e.target === bTag || e.target === bHead || e.target === bBody || e.target === bFoot || e.target === delBtn) return;
    canvasDeselectAll();
    el.classList.add('cn-selected');
    S.canvasSelectedEl = { el: el, note: note, type: 'note' };
  });
  
  return el;
}

// ── NEW CANVAS FEATURES ─────────────────────────────────
function canvasFitAll() {
  if (!S.canvasCurrentBoard) return;
  var surface = document.getElementById('canvas-surface');
  var wrap = document.getElementById('canvas-surface-wrap');
  var els = Array.from(surface.children).filter(function(c) {
    return c.tagName !== 'SVG' && c.id !== 'canvas-empty' && c.style.display !== 'none';
  });
  if (els.length === 0) return;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  els.forEach(function(e) {
    var l = parseFloat(e.style.left) || 0;
    var t = parseFloat(e.style.top) || 0;
    var w = parseFloat(e.style.width) || e.offsetWidth;
    var h = parseFloat(e.style.height) || e.offsetHeight;
    if (l < minX) minX = l;
    if (t < minY) minY = t;
    if (l+w > maxX) maxX = l+w;
    if (t+h > maxY) maxY = t+h;
  });
  if (minX === Infinity) return;
  var pad = 40;
  var vw = wrap.clientWidth;
  var vh = wrap.clientHeight;
  var ew = (maxX - minX) + pad*2;
  var eh = (maxY - minY) + pad*2;
  var zoom = Math.min(vw/ew, vh/eh, 3);
  S.canvasZoom = Math.max(0.15, zoom);
  canvasApplyZoom();
  wrap.scrollLeft = ((minX - pad) * S.canvasZoom);
  wrap.scrollTop  = ((minY - pad) * S.canvasZoom);
}

function canvasToggleBgPicker() {
  var p = document.getElementById('cv-bg-panel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}
function canvasSetBg(bg) {
  var p = document.getElementById('canvas-surface-wrap');
  p.className = 'canvas-surface-wrap cv-bg-' + bg;
  document.querySelectorAll('.cv-bg-opt').forEach(function(el){ el.classList.remove('active'); });
  document.querySelector('.cv-bg-opt[data-bg="'+bg+'"]').classList.add('active');
}

function canvasSearchNotes(q) {
  var res = document.getElementById('cv-search-results');
  if (!q || q.length < 2 || !S.canvasCurrentBoard) { res.classList.remove('open'); return; }
  
  api('GET', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/search?q=' + encodeURIComponent(q)).then(function(data) {
    if (!data.length) {
      res.innerHTML = '<div class="cv-link-empty">Nenhuma nota encontrada.</div>';
    } else {
      res.innerHTML = data.map(function(d) {
        var t = d.conteudo || '';
        try { t = JSON.parse(d.conteudo).text || JSON.parse(d.conteudo).title || t; } catch(e){}
        t = t.replace(/<[^>]+>/g, '').substring(0, 40) + '...';
        return '<div class="cv-search-result-item" onclick="canvasGotoNote('+d.id+')">'
             + '<span class="cvsr-type">' + (d.note_type==='doc'?'&#128196;':'&#128221;') + '</span>'
             + '<span class="cvsr-text">' + t.replace(new RegExp(q,'gi'), function(m){ return '<mark>'+m+'</mark>'; }) + '</span>'
             + '</div>';
      }).join('');
    }
    res.classList.add('open');
  });
}

function canvasGotoNote(nid) {
  var el = document.querySelector('[data-nid="'+nid+'"]');
  if (!el) return;
  canvasDeselectAll();
  el.classList.add('cn-selected');
  S.canvasSelectedEl = { el: el, note: S.canvasNotes.find(function(m){return m.id===nid}), type: 'note' };
  
  var wrap = document.getElementById('canvas-surface-wrap');
  var l = parseFloat(el.style.left) || 0;
  var t = parseFloat(el.style.top) || 0;
  wrap.scrollLeft = (l * S.canvasZoom) - (wrap.clientWidth/2) + 100;
  wrap.scrollTop  = (t * S.canvasZoom) - (wrap.clientHeight/2) + 50;
  
  document.getElementById('cv-search-results').classList.remove('open');
}

var CANVAS_TEMPLATES = [
  { id: 't1', icon: '&#128221;', name: 'Nota Rápida', desc: 'Sticky note simples' },
  { id: 't2', icon: '&#128196;', name: 'Documentação', desc: 'Nota estruturada longa' },
  { id: 't3', icon: '&#128203;', name: 'Método / SOP', desc: 'Passo a passo rotina' },
  { id: 't4', icon: '&#128269;', name: 'Análise', desc: 'Problema, Causa, Ação' }
];

function canvasToggleTemplates() {
  document.querySelectorAll('.cvt-panel').forEach(function(p){ 
    if (p.id !== 'cvt-templates-panel') p.style.display = 'none'; 
  });
  var panel = document.getElementById('cvt-templates-panel');
  if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
  
  var list = document.getElementById('cvt-templates-list');
  list.innerHTML = CANVAS_TEMPLATES.map(function(t) {
    return '<div class="cvt-template-item" onclick="canvasUseTemplate(\''+t.id+'\')">'
      + '<div class="cvt-tm-icon">' + t.icon + '</div>'
      + '<div class="cvt-tm-info"><div class="cvt-tm-name">'+t.name+'</div><div class="cvt-tm-desc">'+t.desc+'</div></div>'
    + '</div>';
  }).join('');
  
  var btn = document.querySelector('.cvt-btn[data-tool="templates"]');
  var r = btn.getBoundingClientRect();
  panel.style.display = 'block';
  var ph = panel.offsetHeight;
  var maxTop = window.innerHeight - ph - 10;
  panel.style.top = Math.max(10, Math.min(r.top, maxTop)) + 'px';
  panel.style.left = (r.right + 10) + 'px';
}

function canvasUseTemplate(tid) {
  if (!S.canvasCurrentBoard) return;
  canvasToggleTemplates();
  
  var d = {
    pos_x: document.getElementById('canvas-surface-wrap').scrollLeft/S.canvasZoom + 50,
    pos_y: document.getElementById('canvas-surface-wrap').scrollTop/S.canvasZoom + 50
  };
  
  if (tid === 't1') {
    d.note_type = 'sticky'; d.conteudo = 'Nota nova...';
  } else if (tid === 't2') {
    d.note_type = 'doc'; d.largura = 400; d.altura = 350;
    d.conteudo = JSON.stringify({ title: 'Nova Documentação', text: '<h2>Visão Geral</h2><p>Escreva aqui...</p>', tags: ['DOC'] });
  } else if (tid === 't3') {
    d.note_type = 'doc'; d.largura = 350; d.altura = 400;
    d.conteudo = JSON.stringify({ title: 'Procedimento / SOP', text: '<ol><li>Primeiro passo</li><li>Segundo passo</li></ol>', tags: ['SOP'] });
  } else if (tid === 't4') {
    d.note_type = 'card'; d.largura = 300; d.altura = 250;
    d.conteudo = JSON.stringify({ tag: 'ANÁLISE', header: 'Nome da Análise', body: '<b>Problema:</b><br/><b>Causa:</b><br/><b>Ação:</b>', footer: new Date().toLocaleDateString() });
  }
  
  api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/notes', d).then(function(note) {
    S.canvasNotes.push(note);
    var el;
    if (note.note_type === 'doc') el = canvasMakeDoc(note);
    else if (note.note_type === 'card') el = canvasMakeCard(note);
    else el = canvasMakeNote(note);
    document.getElementById('canvas-surface').appendChild(el);
  });
}

// ── LINK CARD MODAL ──────────────────────────────────
function canvasLinkToCard(note) {
  var overlay = document.createElement('div');
  overlay.className = 'cv-link-modal-overlay';
  overlay.innerHTML =
    '<div class="cv-link-modal">'
      + '<div class="cv-link-modal-head">'
        + '<h3>Vincular a um Card</h3>'
        + '<button onclick="this.closest(\\\'.cv-link-modal-overlay\\\').remove()">&times;</button>'
      + '</div>'
      + '<div class="cv-link-modal-body">'
        + '<input type="text" class="cv-link-search-input" id="cv-link-input" placeholder="Buscar titulo ou ID do card...">'
        + '<div class="cv-link-results" id="cv-link-list"></div>'
      + '</div>'
    + '</div>';
  document.body.appendChild(overlay);
  var input = document.getElementById('cv-link-input');
  var list = document.getElementById('cv-link-list');
  input.focus();
  
  var doSearch = debounce(function() {
    var q = input.value;
    if (q.length < 2) return;
    api('GET', '/api/cards/search?q=' + encodeURIComponent(q)).then(function(res) {
      if (!res.length) { list.innerHTML = '<div class="cv-link-empty">Nenhum card encontrado</div>'; return; }
      list.innerHTML = res.map(function(r) {
        return '<div class="cv-link-result" onclick="canvasSaveCardLink('+note.id+', \''+r.id+'\')">'
          + '<span class="cv-lr-tipo '+r.tipo+'">' + r.tipo + '</span>'
          + '<span class="cv-lr-id">' + r.id + '</span>'
          + '<span class="cv-lr-title">' + r.titulo + '</span>'
        + '</div>';
      }).join('');
    });
  }, 300);
  input.addEventListener('input', doSearch);
}
window.canvasSaveCardLink = function(nid, cid) {
  var m = document.querySelector('.cv-link-modal-overlay');
  if(m) m.remove();
  var note = S.canvasNotes.find(function(n){ return n.id===parseFloat(nid); });
  if (note) {
    note.card_id = cid;
    api('PUT', '/api/canvas/notes/' + nid, { card_id: cid });
    toast('Nota vinculada ao card ' + cid);
    var el = document.querySelector('[data-nid="'+nid+'"]');
    if (el) {
      var head = el.querySelector('.cn-header') || el;
      if (!head.querySelector('.cn-link-badge')) head.innerHTML += ' <span class="cn-link-badge" title="Vinculado">&#128279;</span>';
    }
  }
};


function canvasShowNoteCtxMenu(cx, cy, note, el) {
  var parkLabel = note.parked ? '↩ Remover do Parking Lot' : '🅿 Adicionar ao Parking Lot';
  canvasShowCtxMenu(cx, cy, [
    { icon: '⧉', label: 'Duplicar', action: function(){ canvasDuplicateNote(note); } },
    { icon: '↑', label: 'Trazer à frente', action: function(){ canvasBringFront(el, note, 'note'); } },
    { icon: '↓', label: 'Enviar atrás', action: function(){ canvasSendBack(el, note, 'note'); } },
    '-',
    { icon: '🅿', label: parkLabel, action: function(){ canvasToggleParking(note, el); } },
    '-',
    { icon: '🗑', label: 'Excluir', danger: true, action: function(){ canvasDeleteNote(note.id); } }
  ]);
}

// ── Parking Lot ───────────────────────────────
function canvasToggleParking(note, el) {
  note.parked = note.parked ? 0 : 1;
  api('PUT', '/api/canvas/notes/' + note.id, { parked: note.parked });
  if (el) el.classList.toggle('cn-is-parked', !!note.parked);
  canvasUpdateParkingBadge();
  // If panel is open, re-render it
  var panel = document.getElementById('cv-parking-panel');
  if (panel && panel.classList.contains('cv-park-open')) canvasRenderParkingPanel();
}

function canvasUpdateParkingBadge() {
  var badge = document.getElementById('cv-parking-badge');
  if (!badge) return;
  var count = S.canvasNotes.filter(function(n){ return n.parked; }).length;
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

function canvasToggleParkingPanel() {
  var panel = document.getElementById('cv-parking-panel');
  if (!panel) return;
  var isOpen = panel.classList.toggle('cv-park-open');
  if (isOpen) canvasRenderParkingPanel();
}

function canvasRenderParkingPanel() {
  var body = document.getElementById('cv-park-body');
  if (!body) return;
  var parked = S.canvasNotes.filter(function(n){ return n.parked; });

  if (!parked.length) {
    body.innerHTML =
      '<div class="cv-park-empty">'
      + '<div style="font-size:42px;margin-bottom:10px">📋</div>'
      + '<p style="margin:0;font-size:13px;color:#8888aa">Nenhuma nota no Parking Lot</p>'
      + '<p style="margin:8px 0 0;font-size:11px;color:#33335a">Clique direito em qualquer nota<br>e escolha "🅿 Adicionar ao Parking Lot"</p>'
      + '</div>';
    return;
  }

  body.innerHTML = '';
  parked.forEach(function(note) {
    var card = document.createElement('div');
    card.className = 'cv-park-card';
    card.style.background = note.cor || '#fde68a';

    // Strip HTML for text preview
    var tmp = document.createElement('div');
    var rawContent = note.conteudo || '';
    // For card-type notes, extract header
    if (note.note_type === 'card') {
      try {
        var sec = JSON.parse(rawContent);
        rawContent = (sec.header || '') + ' ' + (sec.body || '');
      } catch(e) {}
    }
    tmp.innerHTML = rawContent;
    var txt = (tmp.innerText || tmp.textContent || '').trim().slice(0, 120) || '(sem texto)';

    card.innerHTML =
      '<div class="cv-park-card-bar">'
        + '<div class="cv-park-card-dot"></div>'
        + '<div class="cv-park-card-dot"></div>'
        + '<div class="cv-park-card-dot"></div>'
      + '</div>'
      + '<div class="cv-park-card-body">' + escapeHtml(txt) + '</div>'
      + '<div class="cv-park-card-actions">'
        + '<button class="cv-park-goto">↗ IR AO QUADRO</button>'
        + '<button class="cv-park-unpark" title="Remover do Parking">✕</button>'
      + '</div>';

    card.querySelector('.cv-park-goto').addEventListener('click', function(e) {
      e.stopPropagation();
      canvasToggleParkingPanel(); // close panel
      // Scroll/highlight the note on canvas
      var noteEl = document.querySelector('[data-nid="' + note.id + '"]');
      if (noteEl) {
        noteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        noteEl.classList.add('cn-selected');
        S.canvasSelectedEl = { el: noteEl, note: note, type: 'note' };
        noteEl.style.transition = 'outline .1s';
        noteEl.style.outline = '3px solid #a78bfa';
        setTimeout(function(){ noteEl.style.outline = ''; }, 1400);
      }
    });

    card.querySelector('.cv-park-unpark').addEventListener('click', function(e) {
      e.stopPropagation();
      var noteEl = document.querySelector('[data-nid="' + note.id + '"]');
      canvasToggleParking(note, noteEl);
    });

    body.appendChild(card);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Custom Card ──────────────────────────────
function canvasMakeCard(note) {
  var sections = {};
  try { sections = JSON.parse(note.conteudo || '{}'); } catch(e) {}
  var el = document.createElement('div');
  el.className = 'canvas-note cn-card';
  if (note.parked) el.classList.add('cn-is-parked');
  el.dataset.nid = note.id;
  el.style.left    = (note.pos_x   || 80)  + 'px';
  el.style.top     = (note.pos_y   || 80)  + 'px';
  el.style.width   = (note.largura || 280)  + 'px';
  el.style.height  = (note.altura  || 200)  + 'px';

  el.innerHTML =
    '<div class="cn-card-top-bar">'
      + '<div class="cn-drag-handle"><svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" opacity=".4"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg></div>'
      + '<span class="cn-card-label-tag">CARTÃO</span>'
      + '<div class="cn-parked-dot" title="No Parking Lot" style="margin-right:4px"></div>'
      + '<button class="cn-del" onclick="canvasDeleteNote(' + note.id + ')" title="Excluir">×</button>'
    + '</div>'
    + '<div class="cn-card-header cn-ce" contenteditable="true" data-section="header" spellcheck="false" data-placeholder="Título do cartão...">'
      + (sections.header || '') + '</div>'
    + '<div class="cn-card-body cn-ce" contenteditable="true" data-section="body" spellcheck="false" data-placeholder="Descrição, tarefas, links...">'
      + (sections.body || '') + '</div>'
    + '<div class="cn-card-footer cn-ce" contenteditable="true" data-section="footer" spellcheck="false" data-placeholder="Tags, responsável, data...">'
      + (sections.footer || '') + '</div>'
    + '<div class="cn-resize-hint">↘</div>';

  var handle = el.querySelector('.cn-drag-handle');
  canvasBindDrag(el, handle, note, 'note');
  canvasBindResize(el, note, 'note');

  el.querySelectorAll('.cn-ce').forEach(function(sec) {
    sec.addEventListener('focus', function() {
      canvasDeselectAll();
      canvasShowFmt(true);
      el.classList.add('cn-editing');
    });
    sec.addEventListener('blur',  function() {
      el.classList.remove('cn-editing');
      canvasSaveCardSections(note.id, el);
    });
    canvasBindFmtKeys(sec);
  });

  el.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    canvasShowNoteCtxMenu(e.clientX, e.clientY, note, el);
  });

  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    canvasDeselectAll();
    el.classList.add('cn-selected');
    S.canvasSelectedEl = { el: el, note: note, type: 'note' };
  });

  return el;
}

function canvasSaveCardSections(nid, el) {
  var sections = {};
  el.querySelectorAll('[data-section]').forEach(function(s) {
    sections[s.dataset.section] = s.innerHTML;
  });
  var json = JSON.stringify(sections);
  var note = S.canvasNotes.find(function(n){ return n.id === nid; });
  if (note) note.conteudo = json;
  api('PUT', '/api/canvas/notes/' + nid, { conteudo: json });
}

// ── Shape ─────────────────────────────────────
function canvasMakeShape(shape) {
  var el = document.createElement('div');
  el.className = 'cs-shape cs-' + (shape.tipo || 'rect');
  el.dataset.sid = shape.id;
  el.style.left   = (shape.pos_x   || 100) + 'px';
  el.style.top    = (shape.pos_y   || 100) + 'px';
  el.style.width  = (shape.largura || 160)  + 'px';
  el.style.height = (shape.altura  || 100)  + 'px';

  var fundo = shape.cor_fundo || '#3b82f6';
  var borda = shape.cor_borda || '#1d4ed8';
  var esp   = shape.espessura != null ? shape.espessura : 2;

  if (shape.tipo === 'circle') {
    el.style.background   = fundo;
    el.style.border       = esp + 'px solid ' + borda;
    el.style.borderRadius = '50%';
  } else if (shape.tipo === 'arrow') {
    el.style.overflow = 'visible';
    el.style.background = 'transparent';
    el.style.border = 'none';
  } else if (shape.tipo === 'diamond' || shape.tipo === 'triangle') {
    el.style.overflow = 'visible';
    el.style.background = 'transparent';
    el.style.border = 'none';
  } else if (shape.tipo === 'line') {
    el.style.overflow = 'visible';
    el.style.background = 'transparent';
    el.style.border = 'none';
  } else if (shape.tipo === 'text') {
    el.style.background = 'transparent';
    el.style.border = '1.5px dashed rgba(255,255,255,.15)';
    el.style.borderRadius = '0';
  } else { // rect
    el.style.background   = fundo;
    el.style.border       = esp + 'px solid ' + borda;
    el.style.borderRadius = '6px';
  }

  // SVG background for vector shapes
  if (shape.tipo === 'arrow') {
    var svgEl = document.createElement('div');
    svgEl.className = 'cs-svg-layer';
    svgEl.innerHTML = canvasMakeArrowSvg(shape.largura||160, shape.altura||60, fundo, borda, esp);
    el.appendChild(svgEl);
  } else if (shape.tipo === 'diamond') {
    var svgEl2 = document.createElement('div');
    svgEl2.className = 'cs-svg-layer';
    svgEl2.innerHTML = canvasMakeDiamondSvg(shape.largura||160, shape.altura||120, fundo, borda, esp);
    el.appendChild(svgEl2);
  } else if (shape.tipo === 'triangle') {
    var svgEl3 = document.createElement('div');
    svgEl3.className = 'cs-svg-layer';
    svgEl3.innerHTML = canvasMakeTriangleSvg(shape.largura||160, shape.altura||140, fundo, borda, esp);
    el.appendChild(svgEl3);
  } else if (shape.tipo === 'line') {
    var svgEl4 = document.createElement('div');
    svgEl4.className = 'cs-svg-layer';
    svgEl4.innerHTML = canvasMakeLineSvg(shape.largura||200, shape.altura||40, borda, esp);
    el.appendChild(svgEl4);
  }

  var label = document.createElement('div');
  label.className = 'cs-label';
  label.contentEditable = 'true';
  label.spellcheck = false;
  label.setAttribute('data-placeholder', 'Texto...');
  label.innerHTML = shape.texto || '';
  el.appendChild(label);

  label.addEventListener('blur', function() {
    shape.texto = label.innerHTML;
    api('PUT', '/api/canvas/shapes/' + shape.id, { texto: shape.texto });
  });
  label.addEventListener('focus', function() { canvasSelectShape(el, shape); canvasShowFmt(true); });
  canvasBindFmtKeys(label);

  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    canvasDeselectAll();
    canvasSelectShape(el, shape);
  });

  el.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    canvasShowShapeCtxMenu(e.clientX, e.clientY, shape, el);
  });

  el.addEventListener('dblclick', function(e) {
    if (e.target !== label) { label.focus(); canvasPlaceCursorEnd(label); }
  });

  canvasBindDrag(el, el, shape, 'shape');
  canvasBindResize(el, shape, 'shape');
  return el;
}

function canvasShowShapeCtxMenu(cx, cy, shape, el) {
  canvasShowCtxMenu(cx, cy, [
    { icon: '⧉', label: 'Duplicar', action: function(){ canvasDuplicateShape(shape); } },
    { icon: '↑', label: 'Trazer à frente', action: function(){ canvasBringFront(el, shape, 'shape'); } },
    { icon: '↓', label: 'Enviar atrás', action: function(){ canvasSendBack(el, shape, 'shape'); } },
    { icon: '🎨', label: 'Editar cores', action: function(){ canvasShowShapeFmt(shape); } },
    '-',
    { icon: '🗑', label: 'Excluir', danger: true, action: function(){ canvasDeleteShapeConfirm(shape.id); } }
  ]);
}

function canvasMakeArrowSvg(w, h, _fundo, borda, esp) {
  var uid = 'ah' + Math.random().toString(36).slice(2,6);
  var mid = Math.floor(h / 2);
  var lw  = Math.max(2, esp * 1.5);
  return '<svg width="' + w + '" height="' + h + '" style="display:block;overflow:visible">'
    + '<defs><marker id="' + uid + '" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">'
    + '<polygon points="0 0, 10 4, 0 8" fill="' + borda + '"/></marker></defs>'
    + '<line x1="4" y1="' + mid + '" x2="' + (w - 16) + '" y2="' + mid
    + '" stroke="' + borda + '" stroke-width="' + lw + '" stroke-linecap="round" marker-end="url(#' + uid + ')"/>'
    + '</svg>';
}

function canvasMakeDiamondSvg(w, h, fundo, borda, esp) {
  var hw = w/2, hh = h/2;
  return '<svg width="' + w + '" height="' + h + '" style="display:block">'
    + '<polygon points="' + hw + ',2 ' + (w-2) + ',' + hh + ' ' + hw + ',' + (h-2) + ' 2,' + hh + '"'
    + ' fill="' + fundo + '" stroke="' + borda + '" stroke-width="' + esp + '" stroke-linejoin="round"/>'
    + '</svg>';
}

// ── Selection & Deselect ──────────────────────
function canvasDeselectAll() {
  document.querySelectorAll('.cs-selected, .cn-selected').forEach(function(e){
    e.classList.remove('cs-selected','cn-selected');
  });
  canvasHideActionBars();
  S.canvasSelectedEl = null;
  canvasShowFmt(false);
  var sfmt = document.getElementById('ct-shape-fmt');
  if (sfmt) sfmt.style.display = 'none';
}

function canvasSelectShape(el, shape) {
  canvasDeselectAll();
  el.classList.add('cs-selected');
  S.canvasSelectedEl = { el: el, shape: shape, type: 'shape' };
  canvasShowShapeFmt(shape);

  // Floating action bar
  canvasShowActionBar(el, [
    { icon: '⧉', label: 'Duplicar', action: function(){ canvasDuplicateShape(shape); } },
    { icon: '↑', label: 'Frente', action: function(){ canvasBringFront(el, shape, 'shape'); } },
    { icon: '↓', label: 'Atrás',  action: function(){ canvasSendBack(el, shape, 'shape'); } },
    { icon: '🗑', label: 'Excluir', danger: true, action: function(){ canvasDeleteShapeConfirm(shape.id); } }
  ]);
}

function canvasShowFmt(show) {
  var g = document.getElementById('cv-fmt-bar');
  if (g) g.style.display = show ? 'flex' : 'none';
}

function canvasShowShapeFmt(shape) {
  var g = document.getElementById('ct-shape-fmt');
  if (!g) return;
  g.style.display = 'flex';
  var fundo = document.getElementById('ct-shape-fundo');
  var borda = document.getElementById('ct-shape-borda');
  var esp   = document.getElementById('ct-shape-esp');
  if (fundo) fundo.value = shape.cor_fundo || '#3b82f6';
  if (borda) borda.value = shape.cor_borda || '#1d4ed8';
  if (esp)   esp.value   = String(shape.espessura != null ? shape.espessura : 2);
}

// ── Z-index ───────────────────────────────────
function canvasBringFront(el) {
  var all = Array.from(el.parentElement ? el.parentElement.children : []);
  all.forEach(function(c){ c.style.zIndex = parseInt(c.style.zIndex||10) || 10; });
  var max = all.reduce(function(m, c){ return Math.max(m, parseInt(c.style.zIndex||10)); }, 10);
  el.style.zIndex = max + 1;
}

function canvasSendBack(el) {
  var all = Array.from(el.parentElement ? el.parentElement.children : []);
  all.forEach(function(c){ c.style.zIndex = parseInt(c.style.zIndex||10) || 10; });
  var min = all.reduce(function(m, c){ return Math.min(m, parseInt(c.style.zIndex||10)); }, 10);
  el.style.zIndex = Math.max(1, min - 1);
}

// ── Duplicate ─────────────────────────────────
async function canvasDuplicateNote(note) {
  if (!S.canvasCurrentBoard) return;
  var payload = {
    pos_x: (note.pos_x||80) + 24, pos_y: (note.pos_y||80) + 24,
    largura: note.largura, altura: note.altura,
    cor: note.cor, conteudo: note.conteudo, note_type: note.note_type
  };
  var copy = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/notes', payload);
  if (!copy) return;
  S.canvasNotes.push(copy);
  var surface = document.getElementById('canvas-surface');
  if (surface) surface.appendChild(copy.note_type === 'card' ? canvasMakeCard(copy) : canvasMakeNote(copy));
}

async function canvasDuplicateShape(shape) {
  if (!S.canvasCurrentBoard) return;
  var payload = {
    tipo: shape.tipo, pos_x: (shape.pos_x||100) + 24, pos_y: (shape.pos_y||100) + 24,
    largura: shape.largura, altura: shape.altura,
    cor_fundo: shape.cor_fundo, cor_borda: shape.cor_borda,
    espessura: shape.espessura, texto: shape.texto
  };
  var copy = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/shapes', payload);
  if (!copy) return;
  S.canvasShapes.push(copy);
  var surface = document.getElementById('canvas-surface');
  if (surface) surface.appendChild(canvasMakeShape(copy));
}

// ── Drag ──────────────────────────────────────
function canvasBindDrag(el, handle, obj, objType) {
  var isDragging = false;
  handle.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    if (e.target.contentEditable === 'true' || (e.target.closest && e.target.closest('[contenteditable]'))) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    var zoom   = S.canvasZoom || 1;
    var startX = e.clientX, startY = e.clientY;
    var origX  = parseFloat(el.style.left) || 0;
    var origY  = parseFloat(el.style.top)  || 0;
    el.classList.add('cn-dragging');
    el.style.zIndex = 500;

    function onMove(ev) {
      if (!isDragging) return;
      el.style.left = Math.max(0, origX + (ev.clientX - startX) / zoom) + 'px';
      el.style.top  = Math.max(0, origY + (ev.clientY - startY) / zoom) + 'px';
    }
    function onUp() {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove('cn-dragging');
      el.style.zIndex = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      var newX = Math.round(parseFloat(el.style.left));
      var newY = Math.round(parseFloat(el.style.top));
      if (newX !== obj.pos_x || newY !== obj.pos_y) {
        obj.pos_x = newX; obj.pos_y = newY;
        var ep = objType === 'shape' ? '/api/canvas/shapes/' : '/api/canvas/notes/';
        api('PUT', ep + obj.id, { pos_x: newX, pos_y: newY });
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function canvasBindResize(el, obj, objType) {
  if (!window.ResizeObserver) return;
  var timer = null;
  var ro = new ResizeObserver(function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      var w = Math.round(el.offsetWidth);
      var h = Math.round(el.offsetHeight);
      if (w === obj.largura && h === obj.altura) return;
      obj.largura = w; obj.altura = h;
      var ep = objType === 'shape' ? '/api/canvas/shapes/' : '/api/canvas/notes/';
      api('PUT', ep + obj.id, { largura: w, altura: h });
    }, 400);
  });
  ro.observe(el);
}

// ── Surface events ────────────────────────────
function canvasBindSurfaceEvents() {
  var surface = document.getElementById('canvas-surface');
  var wrap    = document.getElementById('canvas-surface-wrap');
  if (!surface || !wrap) return;

  // Remove old listeners
  if (surface._mdBound) surface.removeEventListener('mousedown', surface._mdBound);
  if (wrap._mdBound)    wrap.removeEventListener('mousedown', wrap._mdBound);

  // Click-to-deselect (select tool only)
  surface._clickBound && surface.removeEventListener('click', surface._clickBound);
  surface._clickBound = function(e) {
    canvasHideCtxMenu();
    if (S.canvasTool === 'select' && e.target === surface) canvasDeselectAll();
  };
  surface.addEventListener('click', surface._clickBound);

  // Drag-to-create on surface
  surface._mdBound = function(e) {
    if (e.button !== 0) return;
    var tool = S.canvasTool;
    if (tool === 'select' || tool === 'pan') return;
    // Only start drag when clicking the surface itself or the pen SVG
    var tgt = e.target;
    if (tgt !== surface && tgt.id !== 'canvas-pen-svg' && (!tgt.closest || tgt.closest('.canvas-note,.cv-doc-note,.cs-shape,.cv-frame,.cv-table,.cv-comment,.cv-emoji-sticker'))) return;

    if (tool === 'pen') {
      var sr = surface.getBoundingClientRect();
      var z  = S.canvasZoom || 1;
      canvasPenStart((e.clientX - sr.left) / z, (e.clientY - sr.top) / z);
      e.preventDefault(); e.stopPropagation(); return;
    }

    e.preventDefault(); e.stopPropagation();
    var rect = surface.getBoundingClientRect();
    var zoom = S.canvasZoom || 1;
    var sx = (e.clientX - rect.left) / zoom;
    var sy = (e.clientY - rect.top)  / zoom;

    var ghost = document.getElementById('canvas-drag-ghost');
    if (!ghost) { ghost = document.createElement('div'); ghost.id = 'canvas-drag-ghost'; ghost.className = 'canvas-ghost-rect'; surface.appendChild(ghost); }
    ghost.style.cssText = 'display:block;left:' + sx + 'px;top:' + sy + 'px;width:0;height:0';
    _cvDrag.active = true; _cvDrag.startX = sx; _cvDrag.startY = sy; _cvDrag.ghost = ghost;

    function onMove(ev) {
      if (!_cvDrag.active) return;
      var nr = surface.getBoundingClientRect();
      var nx = (ev.clientX - nr.left) / zoom, ny = (ev.clientY - nr.top) / zoom;
      ghost.style.left = Math.min(sx, nx) + 'px'; ghost.style.top = Math.min(sy, ny) + 'px';
      ghost.style.width = Math.abs(nx - sx) + 'px'; ghost.style.height = Math.abs(ny - sy) + 'px';
    }
    function onUp(ev) {
      if (!_cvDrag.active) return;
      _cvDrag.active = false; ghost.style.display = 'none';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      var nr = surface.getBoundingClientRect();
      var nx = (ev.clientX - nr.left) / zoom, ny = (ev.clientY - nr.top) / zoom;
      var w = Math.abs(nx - sx), h = Math.abs(ny - sy);
      if (w > 14 && h > 14) canvasAddAtPositionSized(Math.min(sx, nx), Math.min(sy, ny), w, h);
      else canvasAddAtPosition(Math.round(sx), Math.round(sy));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  surface.addEventListener('mousedown', surface._mdBound);

  // Pan via wrap (middle mouse / pan tool / spacebar)
  wrap._mdBound = function(e) {
    var isPan = S.canvasTool === 'pan' && e.button === 0;
    var isMid = e.button === 1;
    var isSpc = _cvSpacePan && e.button === 0;
    if (!isPan && !isMid && !isSpc) return;
    e.preventDefault();
    canvasPanStart(e, wrap);
  };
  wrap.addEventListener('mousedown', wrap._mdBound);
}

async function canvasAddAtPosition(x, y) {
  if (!S.canvasCurrentBoard) return;
  var tool = S.canvasTool;
  if      (tool === 'note')    await canvasAddNoteAt(x, y, 'sticky');
  else if (tool === 'doc')     await canvasAddNoteAt(x, y, 'doc');
  else if (tool === 'card')    await canvasAddNoteAt(x, y, 'card');
  else if (tool === 'table')   await canvasAddNoteAt(x, y, 'table');
  else if (tool === 'text')    await canvasAddShapeAt(x, y, 'text');
  else if (tool === 'shape')   await canvasAddShapeAt(x, y, S.canvasShapeSubTool || 'rect');
  else if (tool === 'frame')   await canvasAddShapeAt(x, y, 'frame');
  else if (tool === 'comment') await canvasAddShapeAt(x, y, 'comment');
  else if (['rect','circle','diamond','arrow','line','triangle','frame'].indexOf(tool) >= 0)
    await canvasAddShapeAt(x, y, tool);
  canvasSetTool('select');
}

async function canvasAddAtPositionSized(x, y, w, h) {
  if (!S.canvasCurrentBoard) return;
  var tool = S.canvasTool;
  if      (tool === 'note')  await canvasAddNoteAtSized(x, y, w, h, 'sticky');
  else if (tool === 'doc')   await canvasAddNoteAtSized(x, y, w, h, 'doc');
  else if (tool === 'card')  await canvasAddNoteAtSized(x, y, w, h, 'card');
  else if (tool === 'table') await canvasAddNoteAtSized(x, y, w, h, 'table');
  else if (tool === 'frame') await canvasAddShapeAtSized(x, y, w, h, 'frame');
  else if (tool === 'comment') await canvasAddShapeAt(x, y, 'comment'); // comments use default size
  else if (tool === 'shape') await canvasAddShapeAtSized(x, y, w, h, S.canvasShapeSubTool || 'rect');
  else if (['text','rect','circle','diamond','arrow','line','triangle'].indexOf(tool) >= 0)
    await canvasAddShapeAtSized(x, y, w, h, tool);
  canvasSetTool('select');
}

// ── Tool selection ────────────────────────────
function canvasSetTool(tool) {
  S.canvasTool = tool;
  document.querySelectorAll('.cvt-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  var wrap = document.getElementById('canvas-surface-wrap');
  if (wrap) {
    wrap.classList.remove('cv-pan-ready');
    if (tool === 'pan') { wrap.classList.add('cv-pan-ready'); }
    else if (tool === 'select') wrap.style.cursor = '';
    else if (tool === 'pen') wrap.style.cursor = 'crosshair';
    else wrap.style.cursor = 'crosshair';
  }
  // Show/hide pen format bar
  var penFmt = document.getElementById('cv-pen-fmt');
  if (penFmt) penFmt.style.display = (tool === 'pen') ? 'flex' : 'none';
  // Close subpanels unless triggered by their own tool
  if (tool !== 'shape' && tool !== 'emoji') {
    var ss = document.getElementById('cvt-shape-sub');
    var ep = document.getElementById('cvt-emoji-panel');
    if (ss) ss.style.display = 'none';
    if (ep) ep.style.display = 'none';
  }
  if (tool === 'select') canvasDeselectAll();
}

// ── Board management ──────────────────────────
async function canvasSelectBoard(bid) {
  canvasHideCtxMenu();
  S.canvasCurrentBoard = S.canvasBoards.find(function(b){ return b.id === bid; }) || null;
  await renderCanvas();
}

async function canvasNewBoard() {
  var titulo = await sitePrompt('Nome do novo board:', 'Novo Board');
  if (!titulo) return;
  var b = await api('POST', '/api/canvas/boards', { titulo: titulo });
  if (!b) return;
  S.canvasBoards.push(b);
  S.canvasCurrentBoard = b;
  await renderCanvas();
}

async function canvasRenameBoard(bid) {
  var b = S.canvasBoards.find(function(x){ return x.id === bid; });
  var titulo = await sitePrompt('Renomear board:', b ? b.titulo : '');
  if (!titulo) return;
  await api('PUT', '/api/canvas/boards/' + bid, { titulo: titulo });
  if (b) b.titulo = titulo;
  if (S.canvasCurrentBoard && S.canvasCurrentBoard.id === bid) S.canvasCurrentBoard.titulo = titulo;
  renderCanvas();
}

async function canvasDeleteBoard(bid) {
  var ok = await siteConfirm('Excluir este board e todos os seus elementos?');
  if (!ok) return;
  await api('DELETE', '/api/canvas/boards/' + bid);
  S.canvasBoards = S.canvasBoards.filter(function(b){ return b.id !== bid; });
  if (S.canvasCurrentBoard && S.canvasCurrentBoard.id === bid) S.canvasCurrentBoard = null;
  await renderCanvas();
}

// ── Notes CRUD ────────────────────────────────
async function canvasAddNoteAt(x, y, noteType) {
  var isCard  = noteType === 'card';
  var isTable = noteType === 'table';
  var defW = isCard ? 280 : isTable ? 280 : 220;
  var defH = isCard ? 200 : isTable ? 180 : 160;
  var note = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/notes', {
    pos_x: x - Math.floor(defW/2), pos_y: y - Math.floor(defH/2),
    cor: isCard ? '#1a2035' : CANVAS_NOTE_COLORS[0],
    largura: defW, altura: defH, note_type: noteType,
    conteudo: isTable ? JSON.stringify({grid:[['','',''],['','',''],['','','']]}) : ''
  });
  if (!note) return;
  S.canvasNotes.push(note);
  var surface = document.getElementById('canvas-surface');
  if (surface) {
    var el = isCard ? canvasMakeCard(note) : isTable ? canvasMakeTable(note) : canvasMakeNote(note);
    surface.appendChild(el);
    if (!isTable) {
      var body = el.querySelector('.cn-body, .cn-card-body, .cn-ce');
      if (body) setTimeout(function(){ body.focus(); canvasPlaceCursorEnd(body); }, 60);
    }
  }
}

async function canvasAddNoteAtSized(x, y, w, h, noteType) {
  var isCard  = noteType === 'card';
  var isTable = noteType === 'table';
  var note = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/notes', {
    pos_x: Math.round(x), pos_y: Math.round(y),
    cor: isCard ? '#1a2035' : CANVAS_NOTE_COLORS[0],
    largura: Math.max(isTable ? 200 : 150, Math.round(w)),
    altura:  Math.max(isTable ? 100 : 110, Math.round(h)),
    note_type: noteType,
    conteudo: isTable ? JSON.stringify({grid:[['','',''],['','',''],['','','']]}) : ''
  });
  if (!note) return;
  S.canvasNotes.push(note);
  var surface = document.getElementById('canvas-surface');
  if (surface) {
    var el = isCard ? canvasMakeCard(note) : isTable ? canvasMakeTable(note) : canvasMakeNote(note);
    surface.appendChild(el);
  }
}

async function canvasDeleteNote(nid) {
  await api('DELETE', '/api/canvas/notes/' + nid);
  S.canvasNotes = S.canvasNotes.filter(function(n){ return n.id !== nid; });
  var el = document.querySelector('[data-nid="' + nid + '"]');
  if (el) { el.style.transform = 'scale(0.8)'; el.style.opacity = '0'; el.style.transition = 'all .18s'; setTimeout(function(){ el.remove(); }, 180); }
}

async function canvasSaveNoteContent(nid, html) {
  var note = S.canvasNotes.find(function(n){ return n.id === nid; });
  if (note) note.conteudo = html;
  await api('PUT', '/api/canvas/notes/' + nid, { conteudo: html });
}

async function canvasChangeColor(nid, cor) {
  var note = S.canvasNotes.find(function(n){ return n.id === nid; });
  if (!note) return;
  note.cor = cor;
  var noteEl = document.querySelector('[data-nid="' + nid + '"]');
  if (noteEl) {
    noteEl.style.background = cor;
    noteEl.querySelectorAll('.cn-color-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.c === cor);
    });
  }
  await api('PUT', '/api/canvas/notes/' + nid, { cor: cor });
}

// ── Shapes CRUD ───────────────────────────────
async function canvasAddShapeAt(x, y, tipo) {
  var DEFS = {
    rect:     { largura:180, altura:110, cor_fundo:'#3b82f6', cor_borda:'#2563eb', espessura:0 },
    circle:   { largura:130, altura:130, cor_fundo:'#10b981', cor_borda:'#059669', espessura:0 },
    diamond:  { largura:170, altura:130, cor_fundo:'#f59e0b', cor_borda:'#d97706', espessura:2 },
    triangle: { largura:160, altura:140, cor_fundo:'#8b5cf6', cor_borda:'#7c3aed', espessura:2 },
    arrow:    { largura:200, altura: 60, cor_fundo:'#64748b', cor_borda:'#94a3b8', espessura:3 },
    line:     { largura:200, altura: 40, cor_fundo:'transparent', cor_borda:'#94a3b8', espessura:3 },
    text:     { largura:200, altura: 80, cor_fundo:'transparent', cor_borda:'transparent', espessura:0 },
    frame:    { largura:400, altura:300, cor_fundo:'transparent', cor_borda:'transparent', espessura:2 },
    comment:  { largura: 32, altura: 32, cor_fundo:'transparent', cor_borda:'transparent', espessura:0 }
  };
  var def = DEFS[tipo] || DEFS.rect;
  var shape = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/shapes',
    Object.assign({ tipo: tipo, pos_x: x - Math.floor(def.largura/2), pos_y: y - Math.floor(def.altura/2) }, def));
  if (!shape) return;
  S.canvasShapes.push(shape);
  var surface = document.getElementById('canvas-surface');
  if (surface) {
    var el;
    if      (tipo === 'frame')   el = canvasMakeFrame(shape);
    else if (tipo === 'comment') el = canvasMakeComment(shape);
    else el = canvasMakeShape(shape);
    surface.appendChild(el);
    if (tipo === 'comment') {
      el.classList.add('cv-open');
      var bub = el.querySelector('.cv-comment-bubble');
      if (bub) setTimeout(function(){ bub.focus(); }, 80);
    } else if (['text','rect','circle','diamond','triangle'].indexOf(tipo) >= 0) {
      var label = el.querySelector('.cs-label, .cv-frame-label');
      if (label) setTimeout(function(){ label.focus(); }, 60);
    }
  }
}

async function canvasAddShapeAtSized(x, y, w, h, tipo) {
  var DEFS = {
    rect:     { cor_fundo:'#3b82f6', cor_borda:'#2563eb', espessura:0 },
    circle:   { cor_fundo:'#10b981', cor_borda:'#059669', espessura:0 },
    diamond:  { cor_fundo:'#f59e0b', cor_borda:'#d97706', espessura:2 },
    triangle: { cor_fundo:'#8b5cf6', cor_borda:'#7c3aed', espessura:2 },
    arrow:    { cor_fundo:'#64748b', cor_borda:'#94a3b8', espessura:3 },
    line:     { cor_fundo:'transparent', cor_borda:'#94a3b8', espessura:3 },
    text:     { cor_fundo:'transparent', cor_borda:'transparent', espessura:0 },
    frame:    { cor_fundo:'transparent', cor_borda:'transparent', espessura:2 }
  };
  var def = DEFS[tipo] || DEFS.rect;
  var shape = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/shapes',
    Object.assign({ tipo: tipo, pos_x: Math.round(x), pos_y: Math.round(y),
                    largura: Math.max(20, Math.round(w)), altura: Math.max(20, Math.round(h)) }, def));
  if (!shape) return;
  S.canvasShapes.push(shape);
  var surface = document.getElementById('canvas-surface');
  if (surface) {
    var el = (tipo === 'frame') ? canvasMakeFrame(shape) : canvasMakeShape(shape);
    surface.appendChild(el);
  }
}

async function canvasDeleteShapeConfirm(sid) {
  await api('DELETE', '/api/canvas/shapes/' + sid);
  S.canvasShapes = S.canvasShapes.filter(function(s){ return s.id !== sid; });
  var el = document.querySelector('[data-sid="' + sid + '"]');
  if (el) { el.style.transform = 'scale(0.8)'; el.style.opacity = '0'; el.style.transition = 'all .18s'; setTimeout(function(){ el.remove(); }, 180); }
}

// Keep old canvasDeleteShape alias for keyboard handler
var canvasDeleteShape = canvasDeleteShapeConfirm;

function canvasShapeFmtColor(which, cor) {
  if (!S.canvasSelectedEl || S.canvasSelectedEl.type !== 'shape') return;
  var shape = S.canvasSelectedEl.shape;
  var el    = S.canvasSelectedEl.el;
  if (which === 'fundo') { shape.cor_fundo = cor; api('PUT', '/api/canvas/shapes/' + shape.id, { cor_fundo: cor }); }
  else                   { shape.cor_borda = cor; api('PUT', '/api/canvas/shapes/' + shape.id, { cor_borda: cor }); }
  var newEl = canvasMakeShape(shape);
  el.replaceWith(newEl);
  S.canvasSelectedEl = { el: newEl, shape: shape, type: 'shape' };
  newEl.classList.add('cs-selected');
}

function canvasShapeFmtEsp(val) {
  if (!S.canvasSelectedEl || S.canvasSelectedEl.type !== 'shape') return;
  var shape = S.canvasSelectedEl.shape;
  var el    = S.canvasSelectedEl.el;
  shape.espessura = Number(val);
  api('PUT', '/api/canvas/shapes/' + shape.id, { espessura: shape.espessura });
  var newEl = canvasMakeShape(shape);
  el.replaceWith(newEl);
  S.canvasSelectedEl = { el: newEl, shape: shape, type: 'shape' };
  newEl.classList.add('cs-selected');
}

// ── Text formatting ───────────────────────────
function canvasBindFmtKeys(el) {
  el.addEventListener('keydown', function(e) {
    if (!e.ctrlKey) return;
    if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
    if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
    if (e.key === 'u') { e.preventDefault(); document.execCommand('underline'); }
    if (e.key === 'k') { e.preventDefault(); canvasFmtLink(); }
  });
}

function canvasFmt(cmd) { document.execCommand(cmd, false, null); }

function canvasFmtSize(size) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) return;
  var span = document.createElement('span');
  span.style.fontSize = size + 'px';
  try { sel.getRangeAt(0).surroundContents(span); } catch(e) {}
}

function canvasFmtFont(family) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) return;
  var span = document.createElement('span');
  span.style.fontFamily = family;
  try { sel.getRangeAt(0).surroundContents(span); } catch(e) {}
}

function canvasFmtColor(color) { document.execCommand('foreColor', false, color); }
function canvasFmtBg(color)    { document.execCommand('hiliteColor', false, color); }

function canvasFmtLink() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    var text = prompt('Texto do link (nome exibido):');
    if (!text) return;
    var url = prompt('Cole a URL do link:');
    if (!url) return;
    if (!url.match(/^https?:\/\//i)) url = 'http://' + url;
    document.execCommand('insertHTML', false, '<a href="' + url + '" target="_blank">' + text + '</a>');
  } else {
    var url = prompt('Cole a URL para o texto selecionado:');
    if (url) {
      if (!url.match(/^https?:\/\//i)) url = 'http://' + url;
      document.execCommand('createLink', false, url);
      setTimeout(function() {
         var links = document.querySelectorAll('.cn-body a, .cvdn-body a, .cn-card-body a, .cv-tbl td a');
         links.forEach(function(l){ l.target = '_blank'; });
      }, 50);
    }
  }
}
function canvasPlaceCursorEnd(el) {
  var range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Zoom ──────────────────────────────────────
function canvasApplyZoom() {
  var surface = document.getElementById('canvas-surface');
  if (!surface) return;
  var z = S.canvasZoom;
  surface.style.transform       = 'scale(' + z + ')';
  surface.style.transformOrigin = 'top left';
  var lbl = document.getElementById('ct-zoom-label');
  if (lbl) lbl.textContent = Math.round(z * 100) + '%';
}

function canvasZoomChange(delta) {
  S.canvasZoom = Math.max(0.15, Math.min(3.0, +(S.canvasZoom + delta).toFixed(2)));
  canvasApplyZoom();
}

function canvasZoomReset() { S.canvasZoom = 1.0; canvasApplyZoom(); }

// ── Global listeners (once) ───────────────────
(function() {
  document.addEventListener('wheel', function(e) {
    var page = document.getElementById('page-canvas');
    if (!page || !page.classList.contains('active')) return;
    if (!e.ctrlKey) return;
    e.preventDefault();
    canvasZoomChange(e.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });

  document.addEventListener('click', function(e) {
    if (CANVAS_CTX_MENU && !CANVAS_CTX_MENU.contains(e.target)) canvasHideCtxMenu();
    // Close floating panels when clicking outside
    var ss = document.getElementById('cvt-shape-sub');
    var ep = document.getElementById('cvt-emoji-panel');
    if (ss && ss.style.display !== 'none' && !ss.contains(e.target) && e.target.id !== 'cvt-shape-btn' && !e.target.closest('#cvt-shape-btn')) ss.style.display = 'none';
    if (ep && ep.style.display !== 'none' && !ep.contains(e.target) && !e.target.closest('[data-tool="emoji"]')) ep.style.display = 'none';
  });

  document.addEventListener('keydown', function(e) {
    var page = document.getElementById('page-canvas');
    if (!page || !page.classList.contains('active')) return;
    var tag  = document.activeElement && document.activeElement.tagName;
    var isCE = document.activeElement && document.activeElement.contentEditable === 'true';
    if (e.key === 'Escape') { canvasHideCtxMenu(); canvasSetTool('select'); return; }
    // Spacebar = temporary pan
    if (e.code === 'Space' && !isCE && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      if (!_cvSpacePan) {
        _cvSpacePan = true;
        var wrap = document.getElementById('canvas-surface-wrap');
        if (wrap && S.canvasTool !== 'pan') { wrap.classList.add('cv-pan-ready'); }
      }
      e.preventDefault(); return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || isCE) return;
    var map = { v:'select', h:'pan', n:'note', c:'card', t:'text', s:'shape', p:'pen', f:'frame', e:'emoji', b:'table', m:'comment', r:'rect', o:'circle', d:'diamond', a:'arrow' };
    var k = map[e.key.toLowerCase()];
    if (k) {
      if (k === 'emoji') canvasToggleEmojiPicker();
      else if (k === 'shape') canvasToggleShapeSub();
      else canvasSetTool(k);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.canvasSelectedEl) {
      if (S.canvasSelectedEl.type === 'shape') canvasDeleteShapeConfirm(S.canvasSelectedEl.shape.id);
      else if (S.canvasSelectedEl.type === 'note') canvasDeleteNote(S.canvasSelectedEl.note.id);
    }
  });

  document.addEventListener('keyup', function(e) {
    if (e.code === 'Space' && _cvSpacePan) {
      _cvSpacePan = false;
      var wrap = document.getElementById('canvas-surface-wrap');
      if (wrap && S.canvasTool !== 'pan') { wrap.classList.remove('cv-pan-ready'); }
    }
  });
})();

// ── Pan ───────────────────────────────────────
function canvasPanStart(e, wrap) {
  _cvPan.active  = true;
  _cvPan.startX  = e.clientX;
  _cvPan.startY  = e.clientY;
  _cvPan.scrollX = wrap.scrollLeft;
  _cvPan.scrollY = wrap.scrollTop;
  wrap.classList.add('cv-panning');
  wrap.style.userSelect = 'none';

  function onMove(ev) {
    if (!_cvPan.active) return;
    wrap.scrollLeft = _cvPan.scrollX - (ev.clientX - _cvPan.startX);
    wrap.scrollTop  = _cvPan.scrollY - (ev.clientY - _cvPan.startY);
  }
  function onUp() {
    _cvPan.active = false;
    wrap.classList.remove('cv-panning');
    wrap.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Pen drawing ───────────────────────────────
function canvasPenStart(x, y) {
  var svg = document.getElementById('canvas-pen-svg');
  if (!svg) return;
  _cvPen.drawing = true;
  _cvPen.points  = [[x, y]];

  var ns = 'http://www.w3.org/2000/svg';
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('stroke', S.canvasPenColor || '#ffffff');
  path.setAttribute('stroke-width', S.canvasPenWidth || 3);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  path.setAttribute('d', 'M ' + x + ' ' + y);
  svg.appendChild(path);
  _cvPen.el = path;

  var surface = document.getElementById('canvas-surface');
  function onMove(ev) {
    if (!_cvPen.drawing || !surface) return;
    var rect = surface.getBoundingClientRect();
    var zoom = S.canvasZoom || 1;
    var nx = (ev.clientX - rect.left) / zoom;
    var ny = (ev.clientY - rect.top)  / zoom;
    _cvPen.points.push([nx, ny]);
    var pts = _cvPen.points;
    var d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = ((pts[i][0] + pts[i+1][0]) / 2).toFixed(1);
      var my = ((pts[i][1] + pts[i+1][1]) / 2).toFixed(1);
      d += ' Q ' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx + ' ' + my;
    }
    var last = pts[pts.length - 1];
    d += ' L ' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);
    path.setAttribute('d', d);
  }
  function onUp() {
    _cvPen.drawing = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    canvasPenSave(path, _cvPen.points.slice());
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

async function canvasPenSave(pathEl, pts) {
  if (!S.canvasCurrentBoard || pts.length < 2) { if (pathEl) pathEl.remove(); return; }
  var xs = pts.map(function(p){ return p[0]; });
  var ys = pts.map(function(p){ return p[1]; });
  var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys);
  var maxX = Math.max.apply(null, xs), maxY = Math.max.apply(null, ys);
  var rPts = pts.map(function(p){ return [p[0] - minX, p[1] - minY]; });
  var d = 'M ' + rPts[0][0].toFixed(1) + ' ' + rPts[0][1].toFixed(1);
  for (var i = 1; i < rPts.length - 1; i++) {
    var mx = ((rPts[i][0] + rPts[i+1][0]) / 2).toFixed(1);
    var my = ((rPts[i][1] + rPts[i+1][1]) / 2).toFixed(1);
    d += ' Q ' + rPts[i][0].toFixed(1) + ' ' + rPts[i][1].toFixed(1) + ' ' + mx + ' ' + my;
  }
  var last = rPts[rPts.length - 1];
  d += ' L ' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);

  if (pathEl) pathEl.remove();
  var shape = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/shapes', {
    tipo: 'pen',
    pos_x: Math.round(minX), pos_y: Math.round(minY),
    largura: Math.max(2, Math.round(maxX - minX)),
    altura:  Math.max(2, Math.round(maxY - minY)),
    cor_fundo: 'none', cor_borda: S.canvasPenColor || '#ffffff',
    espessura: S.canvasPenWidth || 3, texto: d
  });
  if (!shape) return;
  S.canvasShapes.push(shape);
  var surface = document.getElementById('canvas-surface');
  if (surface) surface.appendChild(canvasMakePen(shape));
}

// ── New element renderers ─────────────────────
function canvasMakePen(shape) {
  var el = document.createElement('div');
  el.className = 'cs-shape cs-pen';
  el.dataset.sid = shape.id;
  el.style.left   = (shape.pos_x || 0) + 'px';
  el.style.top    = (shape.pos_y || 0) + 'px';
  el.style.width  = Math.max(2, (shape.largura || 2)) + 'px';
  el.style.height = Math.max(2, (shape.altura  || 2)) + 'px';

  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width',  (shape.largura || 2) + 20);
  svg.setAttribute('height', (shape.altura  || 2) + 20);
  svg.setAttribute('style', 'overflow:visible;display:block');
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('d', shape.texto || '');
  path.setAttribute('stroke', shape.cor_borda || '#ffffff');
  path.setAttribute('stroke-width', shape.espessura || 3);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  svg.appendChild(path);
  el.appendChild(svg);

  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    canvasDeselectAll();
    el.classList.add('cs-selected');
    S.canvasSelectedEl = { el: el, shape: shape, type: 'shape' };
    canvasShowActionBar(el, [
      { icon: '⧉', label: 'Duplicar', action: function(){ canvasDuplicateShape(shape); } },
      { icon: '↑', label: 'Frente',   action: function(){ canvasBringFront(el); } },
      { icon: '↓', label: 'Atrás',    action: function(){ canvasSendBack(el); } },
      { icon: '🗑', label: 'Excluir', danger: true, action: function(){ canvasDeleteShapeConfirm(shape.id); } }
    ]);
  });
  el.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    canvasShowShapeCtxMenu(e.clientX, e.clientY, shape, el);
  });
  canvasBindDrag(el, el, shape, 'shape');
  return el;
}

function canvasMakeTriangleSvg(w, h, fundo, borda, esp) {
  var p = esp + 1;
  return '<svg width="' + w + '" height="' + h + '" style="display:block">'
    + '<polygon points="' + (w/2).toFixed(1) + ',' + p + ' ' + (w-p) + ',' + (h-p) + ' ' + p + ',' + (h-p) + '"'
    + ' fill="' + fundo + '" stroke="' + borda + '" stroke-width="' + esp + '" stroke-linejoin="round"/>'
    + '</svg>';
}

function canvasMakeLineSvg(w, h, borda, esp) {
  var mid = Math.floor(h / 2);
  return '<svg width="' + w + '" height="' + h + '" style="display:block;overflow:visible">'
    + '<line x1="4" y1="' + mid + '" x2="' + (w - 4) + '" y2="' + mid
    + '" stroke="' + borda + '" stroke-width="' + esp + '" stroke-linecap="round"/>'
    + '</svg>';
}

function canvasMakeFrame(shape) {
  var el = document.createElement('div');
  el.className = 'cv-frame';
  el.dataset.sid = shape.id;
  el.style.left   = (shape.pos_x   || 100) + 'px';
  el.style.top    = (shape.pos_y   || 100) + 'px';
  el.style.width  = (shape.largura || 400)  + 'px';
  el.style.height = (shape.altura  || 300)  + 'px';

  var dragBar = document.createElement('div');
  dragBar.className = 'cv-frame-drag';

  var label = document.createElement('div');
  label.className = 'cv-frame-label';
  label.contentEditable = 'true';
  label.spellcheck = false;
  label.setAttribute('data-placeholder', 'Quadro');
  label.innerHTML = shape.texto || '';
  label.addEventListener('blur', function() {
    shape.texto = label.innerHTML;
    api('PUT', '/api/canvas/shapes/' + shape.id, { texto: shape.texto });
  });
  label.addEventListener('mousedown', function(e){ e.stopPropagation(); });

  var del = document.createElement('button');
  del.className = 'cv-frame-del';
  del.innerHTML = 'x';
  del.addEventListener('click', function(e){ e.stopPropagation(); canvasDeleteShapeConfirm(shape.id); });

  el.appendChild(dragBar);
  el.appendChild(label);
  el.appendChild(del);

  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0 || e.target === label || e.target === del) return;
    canvasDeselectAll();
    el.classList.add('cs-selected');
    S.canvasSelectedEl = { el: el, shape: shape, type: 'shape' };
  });
  el.addEventListener('contextmenu', function(e) {
    if (e.target === label) return;
    e.preventDefault();
    canvasShowShapeCtxMenu(e.clientX, e.clientY, shape, el);
  });
  canvasBindDrag(el, dragBar, shape, 'shape');
  canvasBindResize(el, shape, 'shape');
  return el;
}

function canvasMakeTable(note) {
  var rows = 3, cols = 3;
  var grid = [];
  try {
    var parsed = JSON.parse(note.conteudo || 'null');
    if (parsed && parsed.grid) { grid = parsed.grid; rows = grid.length; cols = grid[0].length; }
  } catch(e) {}
  if (!grid.length) {
    for (var r0 = 0; r0 < rows; r0++) { grid.push([]); for (var c0 = 0; c0 < cols; c0++) grid[r0].push(''); }
  }

  var el = document.createElement('div');
  el.className = 'cv-table';
  el.dataset.nid = note.id;
  el.style.left   = (note.pos_x   || 80)  + 'px';
  el.style.top    = (note.pos_y   || 80)  + 'px';
  el.style.width  = (note.largura || 280)  + 'px';
  el.style.height = (note.altura  || 180)  + 'px';

  var topBar = document.createElement('div');
  topBar.className = 'cv-table-drag';
  topBar.innerHTML = '<span>TABELA</span>';
  var delBtn = document.createElement('button');
  delBtn.innerHTML = 'x'; delBtn.title = 'Excluir';
  delBtn.addEventListener('click', function(e){ e.stopPropagation(); canvasDeleteNote(note.id); });
  topBar.appendChild(delBtn);

  var wrap = document.createElement('div');
  wrap.className = 'cv-table-wrap';
  var table = document.createElement('table');
  table.className = 'cv-tbl';

  function saveGrid() {
    var ng = [];
    table.querySelectorAll('tr').forEach(function(tr) {
      var row = [];
      tr.querySelectorAll('td').forEach(function(td){ row.push(td.innerHTML); });
      ng.push(row);
    });
    var json = JSON.stringify({ grid: ng });
    note.conteudo = json;
    api('PUT', '/api/canvas/notes/' + note.id, { conteudo: json });
  }

  for (var r = 0; r < rows; r++) {
    var tr = document.createElement('tr');
    for (var c = 0; c < cols; c++) {
      var td = document.createElement('td');
      td.contentEditable = 'true'; td.spellcheck = false;
      td.innerHTML = (grid[r] && grid[r][c]) ? grid[r][c] : '';
      td.addEventListener('blur', saveGrid);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrap.appendChild(table);
  el.appendChild(topBar);
  el.appendChild(wrap);

  canvasBindDrag(el, topBar, note, 'note');
  canvasBindResize(el, note, 'note');
  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    canvasDeselectAll();
    el.classList.add('cn-selected');
    S.canvasSelectedEl = { el: el, note: note, type: 'note' };
  });
  el.addEventListener('contextmenu', function(e) {
    if (e.target.tagName === 'TD') return;
    e.preventDefault();
    canvasShowNoteCtxMenu(e.clientX, e.clientY, note, el);
  });
  return el;
}

function canvasMakeComment(shape) {
  var el = document.createElement('div');
  el.className = 'cv-comment';
  el.dataset.sid = shape.id;
  el.style.left = (shape.pos_x || 100) + 'px';
  el.style.top  = (shape.pos_y || 100) + 'px';

  var pin = document.createElement('div');
  pin.className = 'cv-comment-pin';
  pin.innerHTML = '<span>💬</span>';

  var bubble = document.createElement('div');
  bubble.className = 'cv-comment-bubble';
  bubble.contentEditable = 'true';
  bubble.spellcheck = false;
  bubble.innerHTML = shape.texto || '';
  bubble.addEventListener('blur', function() {
    shape.texto = bubble.innerHTML;
    api('PUT', '/api/canvas/shapes/' + shape.id, { texto: shape.texto });
  });
  bubble.addEventListener('mousedown', function(e){ e.stopPropagation(); });

  var del = document.createElement('button');
  del.className = 'cv-comment-del';
  del.innerHTML = 'x';
  del.addEventListener('click', function(e){ e.stopPropagation(); canvasDeleteShapeConfirm(shape.id); });

  el.appendChild(pin);
  el.appendChild(bubble);
  el.appendChild(del);

  pin.addEventListener('click', function(e) {
    e.stopPropagation();
    el.classList.toggle('cv-open');
    if (el.classList.contains('cv-open')) setTimeout(function(){ bubble.focus(); }, 50);
  });
  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0 || e.target === bubble) return;
    canvasDeselectAll();
    el.classList.add('cs-selected');
    S.canvasSelectedEl = { el: el, shape: shape, type: 'shape' };
  });
  el.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    canvasShowShapeCtxMenu(e.clientX, e.clientY, shape, el);
  });
  canvasBindDrag(el, pin, shape, 'shape');
  return el;
}

function canvasEmojiEl(shape) {
  var el = document.createElement('div');
  el.className = 'cv-emoji-sticker';
  el.dataset.sid = shape.id;
  el.style.left     = (shape.pos_x   || 100) + 'px';
  el.style.top      = (shape.pos_y   || 100) + 'px';
  el.style.fontSize = (shape.largura || 36) + 'px';
  el.textContent    = shape.texto || '😀';

  el.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    canvasDeselectAll();
    el.classList.add('cs-selected');
    S.canvasSelectedEl = { el: el, shape: shape, type: 'shape' };
    canvasShowActionBar(el, [
      { icon: '⧉', label: 'Duplicar', action: function(){ canvasDuplicateShape(shape); } },
      { icon: '↑', label: 'Frente',   action: function(){ canvasBringFront(el); } },
      { icon: '↓', label: 'Atrás',    action: function(){ canvasSendBack(el); } },
      { icon: '🗑', label: 'Excluir', danger: true, action: function(){ canvasDeleteShapeConfirm(shape.id); } }
    ]);
  });
  el.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    canvasShowShapeCtxMenu(e.clientX, e.clientY, shape, el);
  });
  canvasBindDrag(el, el, shape, 'shape');
  return el;
}

// ── Shapes submenu ────────────────────────────
function canvasToggleShapeSub() {
  var panel = document.getElementById('cvt-shape-sub');
  var ep    = document.getElementById('cvt-emoji-panel');
  if (!panel) return;
  if (ep) ep.style.display = 'none';
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    var btn = document.getElementById('cvt-shape-btn');
    if (btn) {
      var r = btn.getBoundingClientRect();
      var ph = panel.offsetHeight;
      var maxTop = window.innerHeight - ph - 10;
      panel.style.top = Math.max(10, Math.min(r.top, maxTop)) + 'px';
      panel.style.left = (r.right + 6) + 'px';
    }
    document.querySelectorAll('.cvt-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.tool === 'shape');
    });
  }
}

function canvasSelectShapeType(tipo) {
  S.canvasShapeSubTool = tipo;
  S.canvasTool = 'shape';
  document.querySelectorAll('.cvt-shape-item').forEach(function(b){
    b.classList.toggle('active', b.dataset.stype === tipo);
  });
  document.querySelectorAll('.cvt-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.tool === 'shape');
  });
  var panel = document.getElementById('cvt-shape-sub');
  if (panel) panel.style.display = 'none';
  var wrap = document.getElementById('canvas-surface-wrap');
  if (wrap) { wrap.classList.remove('cv-pan-ready'); wrap.style.cursor = 'crosshair'; }
  var penFmt = document.getElementById('cv-pen-fmt');
  if (penFmt) penFmt.style.display = 'none';
}

// ── Emoji picker ──────────────────────────────
function canvasInitEmojiGrid() {
  var grid = document.getElementById('cvt-emoji-grid');
  if (!grid || grid.children.length > 0) return;
  EMOJIS.forEach(function(emoji) {
    var btn = document.createElement('button');
    btn.className = 'cvt-emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', function(e){ e.stopPropagation(); canvasPlaceEmoji(emoji); });
    grid.appendChild(btn);
  });
}

function canvasToggleEmojiPicker() {
  canvasInitEmojiGrid();
  var panel = document.getElementById('cvt-emoji-panel');
  var ss    = document.getElementById('cvt-shape-sub');
  if (!panel) return;
  if (ss) ss.style.display = 'none';
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    var btn = document.querySelector('.cvt-btn[data-tool="emoji"]');
    if (btn) {
      var r = btn.getBoundingClientRect();
      var ph = panel.offsetHeight;
      var maxTop = window.innerHeight - ph - 10;
      panel.style.top = Math.max(10, Math.min(r.top, maxTop)) + 'px';
      panel.style.left = (r.right + 6) + 'px';
    }
  }
  document.querySelectorAll('.cvt-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.tool === 'emoji' && !isOpen);
  });
}

async function canvasPlaceEmoji(emoji) {
  if (!S.canvasCurrentBoard) return;
  var wrap = document.getElementById('canvas-surface-wrap');
  var zoom = S.canvasZoom || 1;
  var cx = ((wrap ? wrap.scrollLeft + wrap.clientWidth  / 2 : 400) / zoom) + (Math.random() - .5) * 80;
  var cy = ((wrap ? wrap.scrollTop  + wrap.clientHeight / 2 : 300) / zoom) + (Math.random() - .5) * 80;
  var shape = await api('POST', '/api/canvas/boards/' + S.canvasCurrentBoard.id + '/shapes', {
    tipo: 'emoji', pos_x: Math.round(cx - 18), pos_y: Math.round(cy - 18),
    largura: 36, altura: 36,
    cor_fundo: 'transparent', cor_borda: 'transparent', espessura: 0, texto: emoji
  });
  if (!shape) return;
  S.canvasShapes.push(shape);
  var surface = document.getElementById('canvas-surface');
  if (surface) surface.appendChild(canvasEmojiEl(shape));
  var panel = document.getElementById('cvt-emoji-panel');
  if (panel) panel.style.display = 'none';
  canvasSetTool('select');
}

// ── HISTÓRICO DE ITEMS ────────────────────────
async function recordHistory(itemId, itemTipo, acao, detalhe) {
  if(!itemId||!itemTipo||!acao) return;
  try { await api('POST','/api/historico',{item_id:String(itemId),item_tipo:itemTipo,acao:acao,detalhe:detalhe||''}); }
  catch(_) {}
}

async function loadCardHistory(itemId, itemTipo) {
  var wrap=document.getElementById('cm-historico-list'); if(!wrap) return;
  wrap.innerHTML='<div class="hist-loading">Carregando...</div>';
  var rows=await api('GET','/api/historico/'+encodeURIComponent(itemTipo)+'/'+encodeURIComponent(itemId));
  if(!rows||!rows.length){
    wrap.innerHTML='<div class="ui-empty"><div class="ui-empty-icon">🕐</div><div class="ui-empty-msg">Nenhum histórico registrado ainda</div></div>';
    return;
  }
  wrap.innerHTML=rows.map(function(r){
    var dt=r.criado?new Date(r.criado.replace(' ','T')).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
    return '<div class="hist-item">'
      +'<div class="hist-acao">'+r.acao+'</div>'
      +(r.detalhe?'<div class="hist-detalhe">'+r.detalhe+'</div>':'')
      +'<div class="hist-dt">'+dt+'</div>'
      +'</div>';
  }).join('');
}
