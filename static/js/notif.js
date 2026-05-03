// ── NOTIFICAÇÕES & CONFIGURAÇÕES ──────────────

var _notifTimer = null;
var _notifFired = {};   // key → timestamp (anti-duplo)

// ── Sons via Web Audio API ────────────────────
var SONS = {
  sino: function(ctx) {
    // Bell: sine wave com decay
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1047, ctx.currentTime); // C6
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.2);
  },
  duplo: function(ctx) {
    // Dois sinos
    [0, 0.35].forEach(function(delay) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.45, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.7);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.7);
    });
  },
  suave: function(ctx) {
    // Arpejo suave: três notas
    [523, 659, 784].forEach(function(freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      var t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t); osc.stop(t + 0.6);
    });
  },
  urgente: function(ctx) {
    // Beep urgente: 3 pulsos rápidos
    for (var i = 0; i < 3; i++) {
      (function(idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = 960;
        var t = ctx.currentTime + idx * 0.22;
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.setValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.14);
      })(i);
    }
  },
  pop: function(ctx) {
    // Pop suave: burst rápido
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.45, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }
};

function tocarSom(tipo) {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var fn = SONS[tipo] || SONS.sino;
    fn(ctx);
    // Fecha o contexto após uso para liberar recursos
    setTimeout(function() { try { ctx.close(); } catch(e) {} }, 2500);
  } catch(e) { console.warn('[Notif] Falha no som:', e); }
}

// ── Checker de alarmes ────────────────────────
function notifInit() {
  clearInterval(_notifTimer);
  if (!S.config || !S.config.notif_ativas) return;
  _notifTimer = setInterval(notifCheck, 30000);
  notifCheck();
}

function notifCheck() {
  if (!S.config || !S.config.notif_ativas) return;
  if (Notification.permission !== 'granted') return;

  var agora    = new Date();
  var aviso    = (S.config.notif_minutos || 5) * 60 * 1000;
  var janela   = 60 * 1000; // 1 min de tolerância
  var todayISO = localDateISO(agora);
  var itens    = [];

  (S.rotina     || []).forEach(function(it) { if (it.horario && (it.data_inicio === todayISO || it.data_fim === todayISO)) itens.push({ id:'r'+it.id, titulo:it.titulo, horario:it.horario }); });
  (S.backlog    || []).forEach(function(it) { if (it.horario && (it.data_inicio === todayISO || it.prazo === todayISO)) itens.push({ id:'b'+it.id, titulo:it.titulo, horario:it.horario }); });
  (S.imprevistos|| []).forEach(function(it) { if (it.horario && it.data_inicio === todayISO) itens.push({ id:'i'+it.id, titulo:it.titulo, horario:it.horario }); });

  itens.forEach(function(it) {
    var parts = (it.horario || '').split(':');
    if (parts.length < 2) return;
    var itemDate = new Date(agora);
    itemDate.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    var diff = itemDate.getTime() - agora.getTime();
    if (diff < 0 || diff > aviso + janela) return;

    var key = it.id + '_' + it.horario;
    if (_notifFired[key]) return;
    _notifFired[key] = Date.now();

    var minFalta = Math.round(diff / 60000);
    var msg = minFalta <= 1 ? 'Agora: ' + it.titulo : 'Em ' + minFalta + ' min: ' + it.titulo;
    notifDisparar(it.titulo, msg);
  });

  // ── Alertas por data_fim / prazo ──────────────
  // Regra: se tiver data_fim E estiver no planner → alerta por data_fim (prioridade)
  //        se não tiver data_fim → usa prazo como fallback
  // O alerta dispara uma vez por dia quando a data de vencimento é hoje
  var todasListas = [
    { lista: S.rotina      || [], prefixo: 'rd' },
    { lista: S.backlog     || [], prefixo: 'bd' },
    { lista: S.imprevistos || [], prefixo: 'id' }
  ];

  todasListas.forEach(function(grupo) {
    grupo.lista.forEach(function(it) {
      if (it.concluido || it.resolvido) return;

      var dataAlerta = null;
      var tipoAlerta = null;

      var noPlanner = !!(it.horario && it.data_inicio);

      if (it.data_fim && it.data_fim.length >= 10 && noPlanner) {
        // Prioridade 1: data_fim, somente se estiver no planner
        dataAlerta = it.data_fim;
        tipoAlerta = 'data_fim';
      } else if (!it.data_fim && (it.prazo || it.data)) {
        // Prioridade 2: prazo (sem necessidade de estar no planner)
        dataAlerta = it.prazo || it.data;
        tipoAlerta = 'prazo';
      }

      if (!dataAlerta || dataAlerta.length < 10) return;

      // Só alerta se a data de vencimento for hoje
      if (dataAlerta !== todayISO) return;

      var key = grupo.prefixo + it.id + '_' + dataAlerta;
      if (_notifFired[key]) return;
      _notifFired[key] = Date.now();

      var titulo = it.titulo || it.texto || 'Item sem título';
      var label  = tipoAlerta === 'data_fim' ? 'Encerra hoje' : 'Prazo hoje';
      var msg    = label + ': ' + titulo;
      notifDisparar('⏰ ' + label, msg);
    });
  });

  // Limpar entradas antigas
  var cutoff = Date.now() - 2 * 60 * 60 * 1000;
  Object.keys(_notifFired).forEach(function(k) { if (_notifFired[k] < cutoff) delete _notifFired[k]; });
}

function notifDisparar(titulo, body) {
  if (S.config && S.config.notif_som) {
    tocarSom(S.config.notif_som_tipo || 'sino');
  }

  if (Notification.permission === 'granted') {
    var opts = { body: body, icon: '/static/img/icon-192.png', badge: '/static/img/icon-72.png', tag: 'planner-' + titulo, vibrate: [200, 100, 200] };
    if (navigator.serviceWorker && window._swReg) {
      window._swReg.showNotification('Planner 2026', opts);
    } else {
      new Notification('Planner 2026', opts);
    }
  }
}

// ── Página de Configurações ───────────────────
function renderConfiguracoes() {
  var cfg  = S.config || {};
  var el   = function(id) { return document.getElementById(id); };

  // Toggle principal
  var ativa = el('cfg-notif-ativa');
  if (ativa) ativa.checked = !!cfg.notif_ativas;

  // Antecedência
  var min = el('cfg-notif-min');
  if (min) min.value = String(cfg.notif_minutos || 5);

  // Som ativo
  var som = el('cfg-notif-som');
  if (som) som.checked = cfg.notif_som == null ? true : !!cfg.notif_som;

  // Tipo de som
  var somTipo = el('cfg-notif-som-tipo');
  if (somTipo) somTipo.value = cfg.notif_som_tipo || 'sino';

  // Mostrar/ocultar row de tipo de som
  var rowTipo = el('cfg-row-som-tipo');
  if (rowTipo) rowTipo.style.display = som && som.checked ? '' : 'none';

  // Desabilitar corpo se notif desativas
  var body = el('cfg-notif-body');
  if (body) body.classList.toggle('cfg-notif-disabled', !cfg.notif_ativas);

  cfgAtualizarStatus();

  // ── Planos de ação ──────────────────────────
  var planosAtivo = el('cfg-planos-ativo');
  if (planosAtivo) planosAtivo.checked = cfg.planos_notif_ativo == null ? true : !!cfg.planos_notif_ativo;

  var planosFreq = el('cfg-planos-freq');
  if (planosFreq) planosFreq.value = cfg.planos_notif_freq || 'daily';

  var planosEstilo = el('cfg-planos-estilo');
  if (planosEstilo) planosEstilo.value = cfg.planos_notif_estilo || 'popup';

  // Checkboxes de dias
  var diasSalvos = [];
  try { diasSalvos = JSON.parse(cfg.planos_notif_dias || '[0,1,2,3,4,5,6]'); } catch(e) { diasSalvos = [0,1,2,3,4,5,6]; }
  var diasWrap = el('cfg-planos-dias');
  if (diasWrap) {
    diasWrap.querySelectorAll('input[type=checkbox]').forEach(function(ck) {
      ck.checked = diasSalvos.indexOf(Number(ck.value)) !== -1;
    });
  }

  var planosBody = el('cfg-planos-body');
  if (planosBody) planosBody.classList.toggle('cfg-notif-disabled', !cfg.planos_notif_ativo && cfg.planos_notif_ativo != null);
}

async function cfgSavePlanosNotif() {
  var el = function(id) { return document.getElementById(id); };
  var ativo  = el('cfg-planos-ativo');
  var freq   = el('cfg-planos-freq');
  var estilo = el('cfg-planos-estilo');
  var diasWrap = el('cfg-planos-dias');

  var dias = [];
  if (diasWrap) diasWrap.querySelectorAll('input[type=checkbox]').forEach(function(ck) {
    if (ck.checked) dias.push(Number(ck.value));
  });
  if (!dias.length) dias = [0,1,2,3,4,5,6]; // fallback: todos os dias

  var data = {
    planos_notif_ativo:  ativo  ? (ativo.checked  ? 1 : 0) : 1,
    planos_notif_freq:   freq   ? freq.value   : 'daily',
    planos_notif_estilo: estilo ? estilo.value : 'popup',
    planos_notif_dias:   dias
  };

  if (!S.config) S.config = {};
  Object.assign(S.config, data);

  // Atualizar estado visual do card
  var body = el('cfg-planos-body');
  if (body) body.classList.toggle('cfg-notif-disabled', !data.planos_notif_ativo);

  await api('PUT', '/api/config', data);
  var msg = el('cfg-planos-saved');
  if (msg) { msg.textContent = '✓ Salvo'; setTimeout(function(){ msg.textContent=''; }, 2000); }

  // Resetar dismissal para que nova config entre em vigor imediatamente
  localStorage.removeItem('planos-popup-dismissed');
}

function cfgAtualizarStatus() {
  var txt = document.getElementById('cfg-notif-status-txt');
  var btn = document.getElementById('cfg-notif-perm-btn');
  if (!txt) return;

  if (!('Notification' in window)) {
    txt.textContent = 'Seu navegador não suporta notificações';
    txt.className = 'cfg-status-err';
    return;
  }

  var perm = Notification.permission;
  if (perm === 'granted') {
    txt.textContent = '✓ Permissão concedida — notificações ativas';
    txt.className = 'cfg-status-ok';
    if (btn) btn.style.display = 'none';
  } else if (perm === 'denied') {
    txt.textContent = '✕ Permissão bloqueada. Habilite nas configurações do navegador.';
    txt.className = 'cfg-status-err';
    if (btn) btn.style.display = 'none';
  } else {
    txt.textContent = '⚠ Permissão necessária para receber notificações';
    txt.className = 'cfg-status-warn';
    if (btn) btn.style.display = S.config && S.config.notif_ativas ? 'inline-flex' : 'none';
  }
}

async function cfgToggleNotif(checked) {
  S.config.notif_ativas = checked ? 1 : 0;
  await api('PUT', '/api/config', { notif_ativas: S.config.notif_ativas });

  var body = document.getElementById('cfg-notif-body');
  if (body) body.classList.toggle('cfg-notif-disabled', !checked);

  if (checked && Notification.permission === 'default') {
    cfgPedirPermissao();
  } else if (checked && Notification.permission === 'granted') {
    notifInit();
  } else if (!checked) {
    clearInterval(_notifTimer);
  }
  cfgAtualizarStatus();
}

async function cfgSaveMinutos(val) {
  S.config.notif_minutos = Number(val);
  await api('PUT', '/api/config', { notif_minutos: S.config.notif_minutos });
}

async function cfgSaveSom(checked) {
  S.config.notif_som = checked ? 1 : 0;
  await api('PUT', '/api/config', { notif_som: S.config.notif_som });
  // Mostrar/ocultar seletor de tipo
  var rowTipo = document.getElementById('cfg-row-som-tipo');
  if (rowTipo) rowTipo.style.display = checked ? '' : 'none';
}

async function cfgSaveSomTipo(tipo) {
  S.config.notif_som_tipo = tipo;
  await api('PUT', '/api/config', { notif_som_tipo: tipo });
}

function cfgPreviewSom() {
  var tipo = (S.config && S.config.notif_som_tipo) || 'sino';
  var sel = document.getElementById('cfg-notif-som-tipo');
  if (sel) tipo = sel.value; // usa valor atual do select mesmo antes de salvar
  tocarSom(tipo);
}

async function cfgPedirPermissao() {
  var result = await Notification.requestPermission();
  if (result === 'granted') {
    notifInit();
    setTimeout(function() {
      notifDisparar('Planner 2026', 'Notificações ativadas com sucesso!');
    }, 600);
  }
  cfgAtualizarStatus();
}
