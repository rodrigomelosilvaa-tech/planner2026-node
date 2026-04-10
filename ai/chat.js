'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const createToolExecutor = require('./tools');

const MAX_TURNS   = 10;
const MAX_HISTORY = 20;

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function buildSystemPrompt(categories, todayISO, amanha, weekKey) {
  const d = new Date(todayISO + 'T12:00:00');
  const diaLabel = DIAS_SEMANA[d.getDay() === 0 ? 6 : d.getDay() - 1] || '';

  const catsText = categories.length
    ? categories.map(c => `  - ID: ${c.id} | ${c.icone || ''} ${c.nome}`).join('\n')
    : '  (nenhuma categoria cadastrada)';

  return `Você é um assistente pessoal integrado ao Planner 2026.

DATA E TEMPO:
- Hoje é ${diaLabel}, ${todayISO}
- Amanhã: ${amanha}
- Semana atual começa em: ${weekKey} (segunda-feira)

CATEGORIAS DISPONÍVEIS DO USUÁRIO:
${catsText}

MAPEAMENTO DE DIAS DA SEMANA (use no campo "dias" das rotinas):
  0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo

REGRAS IMPORTANTES:
- Responda SEMPRE em português brasileiro
- Se o usuário pedir para criar/editar/deletar algo, use as ferramentas disponíveis
- Se não souber o ID de um item para atualizar ou deletar, chame list_items primeiro para buscá-lo
- Para adicionar um evento único no planner (não recorrente), use create_semana_item com a data exata
- Para tarefas recorrentes nos mesmos dias toda semana, use create_rotina
- Seja direto e conciso. Confirme as ações realizadas em 1-2 frases
- Ao listar itens, formate de forma legível com bullet points`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── FACTORY: registerChatRoutes(app, db, helpers) ─────────────────────────────
module.exports = function registerChatRoutes(app, db, helpers) {
  const { dbAll, requireLogin, getWeekKey, todayStr } = helpers;
  const { TOOL_DEFINITIONS, executeTool } = createToolExecutor(db, helpers);

  // Verifica se a API key está configurada
  const apiKeyOk = !!process.env.ANTHROPIC_API_KEY;
  if (!apiKeyOk) {
    console.warn('⚠️  ANTHROPIC_API_KEY não configurada. Chat IA desativado.');
  }

  let client = null;
  if (apiKeyOk) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // ── POST /api/chat ──────────────────────────────────────────────────────────
  app.post('/api/chat', requireLogin, async (req, res) => {
    if (!client) {
      return res.status(503).json({
        reply: 'O assistente IA não está configurado. Adicione a variável ANTHROPIC_API_KEY no arquivo .env e reinicie o servidor.',
        actionsPerformed: false
      });
    }

    const uid = req.session.userId;
    const userMessage = (req.body.message || '').trim();
    if (!userMessage) return res.status(400).json({ error: 'Mensagem vazia' });

    try {
      // Contexto dinâmico
      const categories = await dbAll('SELECT id, nome, cor, icone FROM categoria WHERE user_id = ?', [uid]);
      const today  = todayStr();
      const amanha = addDays(today, 1);
      const wk     = getWeekKey(today);
      const systemPrompt = buildSystemPrompt(categories, today, amanha, wk);

      // Histórico da sessão
      if (!req.session.chatHistory) req.session.chatHistory = [];
      const history = [...req.session.chatHistory];

      // Adiciona mensagem do usuário
      history.push({ role: 'user', content: userMessage });

      // Agentic loop
      let finalText = '';
      let turnCount = 0;
      let actionsPerformed = false;

      while (turnCount < MAX_TURNS) {
        turnCount++;

        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system:     systemPrompt,
          tools:      TOOL_DEFINITIONS,
          messages:   history
        });

        // Registra turno do assistente no histórico
        history.push({ role: 'assistant', content: response.content });

        if (response.stop_reason === 'end_turn') {
          finalText = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
          break;
        }

        if (response.stop_reason === 'tool_use') {
          actionsPerformed = true;
          const toolResults = [];

          for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            try {
              const result = await executeTool(block.name, block.input, uid);
              toolResults.push({
                type:        'tool_result',
                tool_use_id: block.id,
                content:     JSON.stringify(result)
              });
            } catch (err) {
              toolResults.push({
                type:        'tool_result',
                tool_use_id: block.id,
                content:     JSON.stringify({ error: err.message }),
                is_error:    true
              });
            }
          }

          history.push({ role: 'user', content: toolResults });
          continue;
        }

        // stop_reason inesperado
        finalText = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('') || 'Não consegui processar essa solicitação.';
        break;
      }

      if (!finalText) {
        finalText = 'Ação concluída.';
      }

      // Salva histórico trimado na sessão (excluindo tool_result que inflam demais)
      const cleanHistory = history.filter((m, i) => {
        // Remove mensagens de tool_result (user com array de content)
        if (m.role === 'user' && Array.isArray(m.content)) return false;
        // Remove respostas do assistente que só têm tool_use (sem texto)
        if (m.role === 'assistant' && Array.isArray(m.content) && m.content.every(b => b.type === 'tool_use')) return false;
        return true;
      });
      req.session.chatHistory = cleanHistory.slice(-MAX_HISTORY);

      res.json({ reply: finalText, actionsPerformed });

    } catch (err) {
      console.error('[chat] Erro:', err.message);
      const msg = err.status === 401
        ? 'Chave de API inválida. Verifique ANTHROPIC_API_KEY no .env.'
        : 'Ocorreu um erro ao processar sua mensagem. Tente novamente.';
      res.status(500).json({ reply: msg, actionsPerformed: false });
    }
  });

  // ── POST /api/chat/clear ────────────────────────────────────────────────────
  app.post('/api/chat/clear', requireLogin, (req, res) => {
    req.session.chatHistory = [];
    res.json({ ok: true });
  });
};
