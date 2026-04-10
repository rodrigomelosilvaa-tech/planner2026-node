// Planner 2026 — AI Chat Panel
(function () {
  'use strict';

  var chatOpen = false;

  // ── Abrir/fechar painel ──────────────────────────────────────────────────
  function toggleChatPanel() {
    chatOpen = !chatOpen;
    var panel = document.getElementById('ai-chat-panel');
    if (!panel) return;
    panel.classList.toggle('open', chatOpen);
    if (chatOpen) {
      setTimeout(function () {
        var inp = document.getElementById('ai-chat-input');
        if (inp) inp.focus();
      }, 200);
    }
  }

  // ── Enviar mensagem ──────────────────────────────────────────────────────
  async function sendChatMessage() {
    var inp  = document.getElementById('ai-chat-input');
    var send = document.getElementById('ai-chat-send');
    if (!inp) return;
    var msg = inp.value.trim();
    if (!msg) return;

    inp.value = '';
    inp.style.height = '';
    appendMessage('user', msg);
    setLoading(true);

    try {
      var res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: msg })
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      var data = await res.json();
      appendMessage('assistant', data.reply || 'Sem resposta.');

      // Se a IA realizou ações (criou/editou itens), atualiza a UI
      if (data.actionsPerformed) {
        await refreshAppState();
      }
    } catch (e) {
      appendMessage('assistant', 'Desculpe, ocorreu um erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  // ── Atualizar estado da aplicação após ações da IA ───────────────────────
  async function refreshAppState() {
    try {
      var reqs = await Promise.all([
        fetch('/api/rotina').then(function (r) { return r.json(); }),
        fetch('/api/backlog').then(function (r) { return r.json(); }),
        fetch('/api/imprevistos').then(function (r) { return r.json(); })
      ]);

      // S é o estado global do app.js
      if (typeof S !== 'undefined') {
        S.rotina      = reqs[0] || S.rotina;
        S.backlog     = reqs[1] || S.backlog;
        S.imprevistos = reqs[2] || S.imprevistos;
      }

      // Re-carrega semana se estiver na página do planner
      if (typeof S !== 'undefined' && S.page === 'planner') {
        if (typeof loadSemana === 'function') await loadSemana();
        if (typeof buildGrade  === 'function') buildGrade();
      }

      // Re-renderiza página atual
      if (typeof renderPage === 'function' && typeof S !== 'undefined') {
        renderPage(S.page);
      }

      // Atualiza badges do sidebar
      if (typeof updateBadges === 'function') updateBadges();
    } catch (e) {
      // Falha silenciosa na atualização do estado
    }
  }

  // ── Enter envia, Shift+Enter quebra linha ────────────────────────────────
  function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  }

  // ── Limpar histórico ─────────────────────────────────────────────────────
  async function clearChatHistory() {
    try {
      await fetch('/api/chat/clear', { method: 'POST' });
    } catch (e) { /* ignora */ }
    var msgs = document.getElementById('ai-chat-messages');
    if (msgs) {
      msgs.innerHTML =
        '<div class="ai-msg ai-msg-assistant">' +
        '<span class="ai-msg-text">Conversa reiniciada. Como posso ajudar?</span>' +
        '</div>';
    }
  }

  // ── Adicionar mensagem na lista ──────────────────────────────────────────
  function appendMessage(role, text) {
    var msgs = document.getElementById('ai-chat-messages');
    if (!msgs) return;

    // Remove typing indicator se existir
    var typing = document.getElementById('ai-typing');
    if (typing) typing.remove();

    var div = document.createElement('div');
    div.className = 'ai-msg ai-msg-' + role;

    // Formata o texto: escapa HTML, depois aplica **bold** e quebras de linha
    var escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var formatted = escaped
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    div.innerHTML = '<span class="ai-msg-text">' + formatted + '</span>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Indicador de loading ─────────────────────────────────────────────────
  function setLoading(on) {
    var send = document.getElementById('ai-chat-send');
    var inp  = document.getElementById('ai-chat-input');
    if (send) send.disabled = on;
    if (inp)  inp.disabled  = on;

    var existing = document.getElementById('ai-typing');
    var msgs = document.getElementById('ai-chat-messages');

    if (on && !existing && msgs) {
      var dot = document.createElement('div');
      dot.id = 'ai-typing';
      dot.className = 'ai-msg ai-msg-assistant ai-typing';
      dot.innerHTML =
        '<span class="ai-msg-text">' +
        '<span class="ai-dot"></span>' +
        '<span class="ai-dot"></span>' +
        '<span class="ai-dot"></span>' +
        '</span>';
      msgs.appendChild(dot);
      msgs.scrollTop = msgs.scrollHeight;
    } else if (!on && existing) {
      existing.remove();
    }
  }

  // ── Expõe funções globalmente (handlers inline no EJS usam escopo global) ─
  window.toggleChatPanel  = toggleChatPanel;
  window.sendChatMessage  = sendChatMessage;
  window.handleChatKey    = handleChatKey;
  window.clearChatHistory = clearChatHistory;
})();
