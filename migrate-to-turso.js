'use strict';
// Script de migração: SQLite local → Turso
// Uso: node migrate-to-turso.js

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@libsql/client');
const path = require('path');

const LOCAL_DB = path.join(__dirname, 'app.db');

// Ordem respeita dependências de FK
const TABLES = [
  'user',
  'counter',
  'kanban_coluna',
  'categoria',
  'rotina',
  'backlog',
  'imprevisto',
  'semana',
  'revisao',
];

function localAll(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function escape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  // Escapa aspas simples
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function migrate() {
  console.log('──────────────────────────────────────────');
  console.log('Migração SQLite → Turso');
  console.log('Origem:', LOCAL_DB);
  console.log('Destino:', process.env.TURSO_URL);
  console.log('──────────────────────────────────────────\n');

  // Abre banco local
  const local = new sqlite3.Database(LOCAL_DB);

  // Conecta Turso
  const turso = createClient({
    url:       process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
  });

  // Testa conexão
  await turso.execute('SELECT 1');
  console.log('✓ Turso conectado\n');

  let totalInseridos = 0;

  for (const table of TABLES) {
    let rows;
    try {
      rows = await localAll(local, `SELECT * FROM ${table}`);
    } catch (e) {
      console.log(`⚠ Tabela "${table}" não encontrada localmente, pulando.`);
      continue;
    }

    if (!rows.length) {
      console.log(`  ${table}: vazia, pulando.`);
      continue;
    }

    console.log(`→ Migrando ${table} (${rows.length} registros)...`);
    let ok = 0, erros = 0;

    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => escape(row[c]));
      const sql  = `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')})`;
      try {
        await turso.execute({ sql, args: [] });
        ok++;
      } catch (e) {
        erros++;
        console.log(`  ✗ Erro em ${table} (id=${row.id || row.user_id}): ${e.message}`);
      }
    }

    console.log(`  ✓ ${ok} inseridos${erros ? `, ${erros} erros` : ''}`);
    totalInseridos += ok;
  }

  console.log('\n──────────────────────────────────────────');
  console.log(`Migração concluída! Total: ${totalInseridos} registros.`);
  console.log('──────────────────────────────────────────');

  local.close();
  process.exit(0);
}

migrate().catch(err => {
  console.error('\n✗ Erro fatal:', err.message);
  process.exit(1);
});
