'use strict';

// ── DEFINIÇÕES DAS FERRAMENTAS PARA O CLAUDE API ──────────────────────────────
const TOOL_DEFINITIONS = [
  {
    name: 'create_rotina',
    description: 'Cria uma nova rotina recorrente no planner. Use para tarefas que se repetem nos mesmos dias da semana.',
    input_schema: {
      type: 'object',
      properties: {
        titulo:       { type: 'string', description: 'Título da rotina' },
        dias:         { type: 'array', items: { type: 'integer' }, description: 'Dias da semana: 0=Segunda, 1=Terça, 2=Quarta, 3=Quinta, 4=Sexta, 5=Sábado, 6=Domingo' },
        horario:      { type: 'string', description: 'Horário no formato HH:MM, ex: "07:00"' },
        categoria_id: { type: 'string', description: 'ID da categoria (veja o contexto para os IDs disponíveis)' },
        data_inicio:  { type: 'string', description: 'Data de início ISO YYYY-MM-DD (opcional)' },
        data_fim:     { type: 'string', description: 'Data de término ISO YYYY-MM-DD (opcional, omitir para recorrência infinita)' },
        descricao:    { type: 'string', description: 'Descrição adicional (opcional)' }
      },
      required: ['titulo', 'dias']
    }
  },
  {
    name: 'update_rotina',
    description: 'Atualiza uma rotina existente por ID. Se não souber o ID, chame list_items(tipo="rotina") primeiro.',
    input_schema: {
      type: 'object',
      properties: {
        id:           { type: 'string', description: 'ID da rotina, ex: "PLAN-1-003"' },
        titulo:       { type: 'string' },
        horario:      { type: 'string', description: 'HH:MM' },
        dias:         { type: 'array', items: { type: 'integer' } },
        ativo:        { type: 'boolean' },
        categoria_id: { type: 'string' },
        data_inicio:  { type: 'string', description: 'YYYY-MM-DD' },
        data_fim:     { type: 'string', description: 'YYYY-MM-DD' },
        descricao:    { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_rotina',
    description: 'Deleta permanentemente uma rotina por ID. Se não souber o ID, chame list_items(tipo="rotina") primeiro.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID da rotina' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_semana_item',
    description: 'Adiciona um item pontual (não recorrente) ao planner semanal numa data e horário específicos. Aparece na grade do planner.',
    input_schema: {
      type: 'object',
      properties: {
        titulo:       { type: 'string', description: 'Título do item' },
        data:         { type: 'string', description: 'Data ISO YYYY-MM-DD do item' },
        horario:      { type: 'string', description: 'Horário HH:MM, ex: "14:00". Se não informado, o item fica sem horário.' },
        categoria_id: { type: 'string', description: 'ID da categoria (opcional)' },
        descricao:    { type: 'string', description: 'Descrição adicional (opcional)' }
      },
      required: ['titulo', 'data']
    }
  },
  {
    name: 'update_semana_item',
    description: 'Atualiza um item do planner semanal por ID. Se não souber o ID, chame list_items(tipo="semana", data="YYYY-MM-DD") primeiro.',
    input_schema: {
      type: 'object',
      properties: {
        id:           { type: 'string', description: 'ID do item, ex: "PLAN-1-010"' },
        titulo:       { type: 'string' },
        horario:      { type: 'string', description: 'HH:MM' },
        done:         { type: 'boolean' },
        categoria_id: { type: 'string' },
        descricao:    { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_semana_item',
    description: 'Remove um item do planner semanal por ID. Se não souber o ID, chame list_items(tipo="semana") primeiro.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID do item' }
      },
      required: ['id']
    }
  },
  {
    name: 'create_backlog',
    description: 'Cria um item no backlog (tarefas de longo prazo ainda não agendadas).',
    input_schema: {
      type: 'object',
      properties: {
        titulo:       { type: 'string', description: 'Título do item' },
        urgencia:     { type: 'string', enum: ['h', 'm', 'l'], description: 'h=Urgente/Hoje, m=Esta semana, l=Aguardar' },
        prazo:        { type: 'string', description: 'Data limite ISO YYYY-MM-DD (opcional)' },
        categoria_id: { type: 'string', description: 'ID da categoria (opcional)' },
        descricao:    { type: 'string', description: 'Descrição adicional (opcional)' }
      },
      required: ['titulo']
    }
  },
  {
    name: 'create_imprevisto',
    description: 'Registra um evento imprevisto/não planejado.',
    input_schema: {
      type: 'object',
      properties: {
        texto:        { type: 'string', description: 'Descrição do imprevisto' },
        urgencia:     { type: 'string', enum: ['h', 'm', 'l'], description: 'h=Urgente, m=Médio, l=Baixo' },
        data:         { type: 'string', description: 'Data ISO YYYY-MM-DD (padrão = hoje)' },
        categoria_id: { type: 'string', description: 'ID da categoria (opcional)' }
      },
      required: ['texto']
    }
  },
  {
    name: 'list_items',
    description: 'Lista itens existentes. Use para responder perguntas sobre o que está agendado, ou para encontrar IDs antes de atualizar/deletar.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['rotina', 'semana', 'backlog', 'imprevisto'],
          description: 'Tipo de item a listar'
        },
        data: {
          type: 'string',
          description: 'YYYY-MM-DD — filtrar por data específica (obrigatório quando tipo="semana" para mostrar itens de um dia)'
        }
      },
      required: ['tipo']
    }
  }
];

// ── EXECUTOR DAS FERRAMENTAS ───────────────────────────────────────────────────
function createToolExecutor(db, helpers) {
  const { dbRun, dbGet, dbAll, getWeekKey, nextPlanId, parseJ, getSemanaObj, todayStr } = helpers;

  // Calcula o índice do dia da semana (0=Segunda, ..., 6=Domingo) a partir de uma data ISO
  function dateToDow(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const js = d.getDay(); // 0=Domingo, 1=Segunda, ..., 6=Sábado
    return js === 0 ? 6 : js - 1; // Converter: 0=Segunda, ..., 6=Domingo
  }

  // Formata horário para cellKey (remove ':')
  function horarToCk(horario) {
    return horario ? horario.replace(':', '') : null;
  }

  // Busca um item em todas as semanas do usuário pelo ID
  async function findSemanaItemById(userId, itemId) {
    const semanas = await dbAll('SELECT * FROM semana WHERE user_id = ?', [userId]);
    for (const s of semanas) {
      const items = parseJ(s.items, {});
      for (const [ck, its] of Object.entries(items)) {
        if (ck.startsWith('_')) continue;
        const it = its.find(i => i.id === itemId);
        if (it) return { semana: s, items, ck, it };
      }
    }
    return null;
  }

  async function executeTool(toolName, input, userId) {
    switch (toolName) {

      // ── CREATE ROTINA ──────────────────────────────────────────────────
      case 'create_rotina': {
        const id = await nextPlanId(userId);
        await dbRun(
          `INSERT INTO rotina (id,user_id,titulo,categoria_id,horario,dias,ativo,tipo,data_inicio,data_fim,descricao,comentarios,checklist,vinculos)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, userId,
           input.titulo || '',
           input.categoria_id || null,
           input.horario || null,
           JSON.stringify(input.dias || []),
           1,
           'rotina',
           input.data_inicio || null,
           input.data_fim || null,
           input.descricao || '',
           '[]', '[]', '[]']
        );
        return { success: true, id, titulo: input.titulo, horario: input.horario, dias: input.dias };
      }

      // ── UPDATE ROTINA ──────────────────────────────────────────────────
      case 'update_rotina': {
        const r = await dbGet('SELECT * FROM rotina WHERE user_id = ? AND id = ?', [userId, input.id]);
        if (!r) return { success: false, error: `Rotina "${input.id}" não encontrada.` };
        const fields = [], vals = [];
        const sf = (col, val) => { fields.push(`${col} = ?`); vals.push(val); };
        if ('titulo'       in input) sf('titulo',       input.titulo);
        if ('categoria_id' in input) sf('categoria_id', input.categoria_id);
        if ('horario'      in input) sf('horario',      input.horario);
        if ('dias'         in input) sf('dias',         JSON.stringify(input.dias));
        if ('ativo'        in input) sf('ativo',        input.ativo ? 1 : 0);
        if ('data_inicio'  in input) sf('data_inicio',  input.data_inicio);
        if ('data_fim'     in input) sf('data_fim',     input.data_fim);
        if ('descricao'    in input) sf('descricao',    input.descricao);
        if (fields.length) {
          vals.push(input.id, userId);
          await dbRun(`UPDATE rotina SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
        }
        return { success: true, id: input.id, updated: Object.keys(input).filter(k => k !== 'id') };
      }

      // ── DELETE ROTINA ──────────────────────────────────────────────────
      case 'delete_rotina': {
        const r = await dbGet('SELECT titulo FROM rotina WHERE user_id = ? AND id = ?', [userId, input.id]);
        if (!r) return { success: false, error: `Rotina "${input.id}" não encontrada.` };
        await dbRun('DELETE FROM rotina WHERE user_id = ? AND id = ?', [userId, input.id]);
        // Limpa rotina_done nas semanas
        const semanas = await dbAll('SELECT * FROM semana WHERE user_id = ?', [userId]);
        for (const s of semanas) {
          const rd = parseJ(s.rotina_done, {});
          const keys = Object.keys(rd).filter(k => k.startsWith(input.id + '_'));
          if (keys.length) {
            keys.forEach(k => delete rd[k]);
            await dbRun('UPDATE semana SET rotina_done = ? WHERE id = ?', [JSON.stringify(rd), s.id]);
          }
        }
        return { success: true, deleted: input.id, titulo: r.titulo };
      }

      // ── CREATE SEMANA ITEM ─────────────────────────────────────────────
      case 'create_semana_item': {
        const weekKey = getWeekKey(input.data);
        const s = await getSemanaObj(userId, weekKey);
        const items = parseJ(s.items, {});
        const dow = dateToDow(input.data);

        let cellKey;
        if (input.horario) {
          cellKey = `${dow}_${horarToCk(input.horario)}`;
        } else {
          // Sem horário: usa célula especial por dia
          cellKey = `${dow}_sem_horario`;
        }

        const id = await nextPlanId(userId);
        const item = {
          id,
          titulo:      input.titulo || '',
          categoria_id:input.categoria_id || null,
          horario:     input.horario || null,
          data_item:   input.data,
          descricao:   input.descricao || '',
          comentarios: [],
          checklist:   [],
          vinculos:    [],
          done:        false
        };

        if (!items[cellKey]) items[cellKey] = [];
        items[cellKey].push(item);
        await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), s.id]);
        return { success: true, id, titulo: input.titulo, data: input.data, horario: input.horario, cellKey, weekKey };
      }

      // ── UPDATE SEMANA ITEM ─────────────────────────────────────────────
      case 'update_semana_item': {
        const found = await findSemanaItemById(userId, input.id);
        if (!found) return { success: false, error: `Item "${input.id}" não encontrado no planner.` };
        const { semana, items, it } = found;
        if ('titulo'       in input) it.titulo       = input.titulo;
        if ('horario'      in input) it.horario      = input.horario;
        if ('done'         in input) it.done         = input.done;
        if ('categoria_id' in input) it.categoria_id = input.categoria_id;
        if ('descricao'    in input) it.descricao    = input.descricao;
        await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), semana.id]);
        return { success: true, id: input.id, updated: Object.keys(input).filter(k => k !== 'id') };
      }

      // ── DELETE SEMANA ITEM ─────────────────────────────────────────────
      case 'delete_semana_item': {
        const found = await findSemanaItemById(userId, input.id);
        if (!found) return { success: false, error: `Item "${input.id}" não encontrado no planner.` };
        const { semana, items, ck } = found;
        items[ck] = items[ck].filter(i => i.id !== input.id);
        if (!items[ck].length) delete items[ck];
        await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), semana.id]);
        return { success: true, deleted: input.id };
      }

      // ── CREATE BACKLOG ─────────────────────────────────────────────────
      case 'create_backlog': {
        const id = await nextPlanId(userId);
        await dbRun(
          `INSERT INTO backlog (id,user_id,titulo,categoria_id,urgencia,prazo,tipo,concluido,criado,descricao,comentarios,checklist,vinculos,kanban_coluna_id,data_inicio,data_fim,dias)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, userId,
           input.titulo || '',
           input.categoria_id || null,
           input.urgencia || null,
           input.prazo || null,
           null, 0,
           todayStr(),
           input.descricao || '',
           '[]', '[]', '[]',
           null, null, null, '[]']
        );
        return { success: true, id, titulo: input.titulo, urgencia: input.urgencia };
      }

      // ── CREATE IMPREVISTO ──────────────────────────────────────────────
      case 'create_imprevisto': {
        const id = await nextPlanId(userId);
        await dbRun(
          `INSERT INTO imprevisto (id,user_id,texto,categoria_id,urgencia,data,resolvido,descricao,comentarios,checklist,vinculos,kanban_coluna_id,data_inicio,data_fim,dias)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, userId,
           input.texto || '',
           input.categoria_id || null,
           input.urgencia || null,
           input.data || todayStr(),
           0,
           '', '[]', '[]', '[]', null, null, null, '[]']
        );
        return { success: true, id, texto: input.texto };
      }

      // ── LIST ITEMS ─────────────────────────────────────────────────────
      case 'list_items': {
        if (input.tipo === 'rotina') {
          const rows = await dbAll('SELECT id,titulo,horario,dias,ativo,categoria_id,data_inicio,data_fim FROM rotina WHERE user_id = ? ORDER BY horario', [userId]);
          return rows.slice(0, 50).map(r => ({
            id: r.id,
            titulo: r.titulo,
            horario: r.horario,
            dias: parseJ(r.dias, []),
            ativo: r.ativo !== 0,
            categoria_id: r.categoria_id,
            data_inicio: r.data_inicio,
            data_fim: r.data_fim
          }));
        }

        if (input.tipo === 'backlog') {
          const rows = await dbAll('SELECT id,titulo,urgencia,prazo,concluido,categoria_id,criado FROM backlog WHERE user_id = ? AND concluido = 0 ORDER BY urgencia', [userId]);
          return rows.slice(0, 50).map(r => ({
            id: r.id,
            titulo: r.titulo,
            urgencia: r.urgencia,
            prazo: r.prazo,
            categoria_id: r.categoria_id
          }));
        }

        if (input.tipo === 'imprevisto') {
          const rows = await dbAll('SELECT id,texto,urgencia,data,resolvido,categoria_id FROM imprevisto WHERE user_id = ? ORDER BY id DESC', [userId]);
          return rows.slice(0, 50).map(r => ({
            id: r.id,
            texto: r.texto,
            urgencia: r.urgencia,
            data: r.data,
            resolvido: r.resolvido !== 0,
            categoria_id: r.categoria_id
          }));
        }

        if (input.tipo === 'semana') {
          if (input.data) {
            // Items de um dia específico
            const wk = getWeekKey(input.data);
            const s = await dbGet('SELECT * FROM semana WHERE user_id = ? AND week_key = ?', [userId, wk]);
            if (!s) return [];
            const itemsDict = parseJ(s.items, {});
            const d = new Date(input.data + 'T12:00:00');
            const js = d.getDay();
            const dow = js === 0 ? 6 : js - 1;
            const prefix = `${dow}_`;
            const result = [];
            for (const [ck, its] of Object.entries(itemsDict)) {
              if (!ck.startsWith('_') && ck.startsWith(prefix)) result.push(...its);
            }
            return result.slice(0, 50).map(it => ({
              id: it.id,
              titulo: it.titulo,
              horario: it.horario,
              done: it.done,
              categoria_id: it.categoria_id
            }));
          } else {
            // Items da semana atual
            const wk = getWeekKey(todayStr());
            const s = await dbGet('SELECT * FROM semana WHERE user_id = ? AND week_key = ?', [userId, wk]);
            if (!s) return [];
            const itemsDict = parseJ(s.items, {});
            const result = [];
            const diasNome = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
            for (const [ck, its] of Object.entries(itemsDict)) {
              if (ck.startsWith('_')) continue;
              const parts = ck.split('_');
              const diaLabel = diasNome[parseInt(parts[0])] || parts[0];
              for (const it of its) {
                result.push({ id: it.id, titulo: it.titulo, horario: it.horario, dia: diaLabel, done: it.done });
              }
            }
            return result.slice(0, 50);
          }
        }

        return { error: 'Tipo inválido.' };
      }

      default:
        return { error: `Ferramenta desconhecida: ${toolName}` };
    }
  }

  return { TOOL_DEFINITIONS, executeTool };
}

module.exports = createToolExecutor;
