// Planner 2026 — Node.js/Express v1 (convertido de Python/Flask)
'use strict';

const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const sqlite3  = require('sqlite3').verbose();
const path     = require('path');

// Carrega variáveis de ambiente do arquivo .env
require('dotenv').config();

// ── PASSWORD HELPERS ──────────────────────────
// Verifica hash no formato Werkzeug scrypt (Python) OU bcrypt (Node)
function checkPassword(password, hash) {
  if (hash.startsWith('scrypt:')) {
    // Formato Werkzeug: scrypt:N:r:p$salt$hexhash
    const parts = hash.split('$');
    if (parts.length !== 3) return false;
    const [method, salt, expected] = parts;
    const [, N, r, p] = method.split(':').map(Number);
    const dklen = expected.length / 2; // hex → bytes
    const maxmem  = 128 * N * r * 2;
    const derived = crypto.scryptSync(password, salt, dklen, { N, r, p, maxmem });
    return derived.toString('hex') === expected;
  }
  // Bcrypt (criado pelo Node)
  return bcrypt.compareSync(password, hash);
}

// Gera hash no formato Werkzeug scrypt (compatível com Python)
function hashPassword(password) {
  const saltBytes  = crypto.randomBytes(12);
  const salt       = saltBytes.toString('base64').slice(0, 16);
  const maxmem     = 128 * 32768 * 8 * 2;
  const derived    = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem });
  return `scrypt:32768:8:1$${salt}$${derived.toString('hex')}`;
}

const app = express();
const dbPath = path.isAbsolute(process.env.DB_PATH || 'app.db') 
  ? process.env.DB_PATH 
  : path.join(__dirname, process.env.DB_PATH || 'app.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados:', err.message);
  } else {
    console.log('--------------------------------------------------');
    console.log('BANCO DE DADOS CONECTADO');
    console.log('Caminho absoluto:', path.resolve(dbPath));
    console.log('--------------------------------------------------');
  }
});

// ── SQLITE HELPERS (Promise wrappers) ─────────
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { err ? reject(err) : resolve(row || null); });
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { err ? reject(err) : resolve(rows || []); });
  });
}
function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, err => { err ? reject(err) : resolve(); });
  });
}

// ── MIDDLEWARES ───────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'planner2026_secreta_padrao',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: false // Ajustado para false para garantir login sem HTTPS na Hostinger
  }
}));

// ── DB SCHEMA ─────────────────────────────────
async function createSchema() {
  await dbExec(`
    CREATE TABLE IF NOT EXISTS user (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nome          TEXT    NOT NULL,
      email         TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      is_admin      INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS counter (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES user(id),
      seq     INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS categoria (
      id      TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES user(id),
      nome    TEXT NOT NULL,
      cor     TEXT,
      icone   TEXT
    );
    CREATE TABLE IF NOT EXISTS rotina (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES user(id),
      titulo       TEXT NOT NULL,
      categoria_id TEXT,
      horario      TEXT,
      dias         TEXT,
      ativo        INTEGER DEFAULT 1,
      tipo         TEXT,
      data_inicio  TEXT,
      data_fim     TEXT,
      descricao    TEXT,
      comentarios  TEXT,
      checklist    TEXT,
      vinculos     TEXT
    );
    CREATE TABLE IF NOT EXISTS kanban_coluna (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES user(id),
      titulo  TEXT NOT NULL,
      ordem   INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS backlog (
      id               TEXT PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES user(id),
      titulo           TEXT NOT NULL,
      categoria_id     TEXT,
      urgencia         TEXT,
      prazo            TEXT,
      tipo             TEXT,
      concluido        INTEGER DEFAULT 0,
      criado           TEXT,
      descricao        TEXT,
      comentarios      TEXT,
      checklist        TEXT,
      vinculos         TEXT,
      kanban_coluna_id INTEGER REFERENCES kanban_coluna(id),
      data_inicio      TEXT,
      data_fim         TEXT,
      dias             TEXT
    );
    CREATE TABLE IF NOT EXISTS imprevisto (
      id               TEXT PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES user(id),
      texto            TEXT,
      categoria_id     TEXT,
      urgencia         TEXT,
      data             TEXT,
      resolvido        INTEGER DEFAULT 0,
      descricao        TEXT,
      comentarios      TEXT,
      checklist        TEXT,
      vinculos         TEXT,
      kanban_coluna_id INTEGER REFERENCES kanban_coluna(id),
      data_inicio      TEXT,
      data_fim         TEXT,
      dias             TEXT
    );
    CREATE TABLE IF NOT EXISTS semana (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES user(id),
      week_key    TEXT NOT NULL,
      items       TEXT DEFAULT '{}',
      rotina_done TEXT DEFAULT '{}',
      UNIQUE(user_id, week_key)
    );
    CREATE TABLE IF NOT EXISTS revisao (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES user(id),
      week_key       TEXT NOT NULL,
      salvo_em       TEXT,
      dados          TEXT DEFAULT '{}',
      planos_action  TEXT DEFAULT '[]',
      UNIQUE(user_id, week_key)
    );
  `);
}

// ── UTILS ─────────────────────────────────────
function ts() {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, '0');
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const hh  = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getWeekKey(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const dow = d.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysToMon);
  return mon.toISOString().slice(0, 10);
}

async function nextPlanId(userId) {
  let counter = await dbGet('SELECT * FROM counter WHERE user_id = ?', [userId]);
  if (!counter) {
    await dbRun('INSERT INTO counter (user_id, seq) VALUES (?, 0)', [userId]);
    counter = await dbGet('SELECT * FROM counter WHERE user_id = ?', [userId]);
  }
  const newSeq = counter.seq + 1;
  await dbRun('UPDATE counter SET seq = ? WHERE user_id = ?', [newSeq, userId]);
  return `PLAN-${userId}-${String(newSeq).padStart(3, '0')}`;
}

function parseJ(val, def) {
  try { return val ? JSON.parse(val) : def; } catch { return def; }
}

function rowToObj(row, jsonFields) {
  if (!row) return null;
  const obj = Object.assign({}, row);
  for (const f of jsonFields) {
    const isArr = ['dias','comentarios','checklist','vinculos'].includes(f);
    obj[f] = parseJ(obj[f], isArr ? [] : {});
  }
  if ('ativo'     in obj) obj.ativo     = obj.ativo     !== 0;
  if ('is_admin'  in obj) obj.is_admin  = obj.is_admin  !== 0;
  if ('concluido' in obj) obj.concluido = obj.concluido !== 0;
  if ('resolvido' in obj) obj.resolvido = obj.resolvido !== 0;
  return obj;
}

// ── AUTH MIDDLEWARE ───────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

async function loadUser(req, res, next) {
  if (req.session.userId) {
    req.currentUser = await dbGet('SELECT * FROM user WHERE id = ?', [req.session.userId]);
  }
  next();
}
app.use(loadUser);

function requireAdmin(req, res, next) {
  if (!req.currentUser || !req.currentUser.is_admin) return res.status(403).json({ error: 'Unauthorized' });
  next();
}

// ── SEMANA / REVISÃO HELPERS ─────────────────
async function getSemanaObj(userId, wk) {
  let s = await dbGet('SELECT * FROM semana WHERE user_id = ? AND week_key = ?', [userId, wk]);
  if (!s) {
    await dbRun("INSERT OR IGNORE INTO semana (user_id, week_key, items, rotina_done) VALUES (?, ?, '{}', '{}')", [userId, wk]);
    s = await dbGet('SELECT * FROM semana WHERE user_id = ? AND week_key = ?', [userId, wk]);
  }
  return s;
}

async function getRevisaoObj(userId, wk) {
  let r = await dbGet('SELECT * FROM revisao WHERE user_id = ? AND week_key = ?', [userId, wk]);
  if (!r) {
    await dbRun("INSERT OR IGNORE INTO revisao (user_id, week_key, dados, planos_action) VALUES (?, ?, '{}', '[]')", [userId, wk]);
    r = await dbGet('SELECT * FROM revisao WHERE user_id = ? AND week_key = ?', [userId, wk]);
  }
  return r;
}

function findItemInSemana(itemsDict, itemId) {
  for (const [ck, its] of Object.entries(itemsDict)) {
    if (ck.startsWith('_')) continue;
    const it = its.find(i => i.id === itemId);
    if (it) return { ck, it };
  }
  return { ck: null, it: null };
}

// ── SEED ──────────────────────────────────────
async function seedCategories(userId) {
  const exists = await dbGet('SELECT id FROM categoria WHERE user_id = ?', [userId]);
  if (exists) return;
  const cats = [
    { id: `c1_${userId}`, nome: 'Inglês',       cor: '#3498db', icone: '🗣️' },
    { id: `c2_${userId}`, nome: 'Profissional',  cor: '#c9a84c', icone: '🏗️' },
    { id: `c3_${userId}`, nome: 'Espiritual',    cor: '#9b59b6', icone: '🙏' },
    { id: `c4_${userId}`, nome: 'Saúde',         cor: '#2ecc71', icone: '💪' },
    { id: `c5_${userId}`, nome: 'Mental',        cor: '#e91e8c', icone: '🧠' },
    { id: `c6_${userId}`, nome: 'Futuro',        cor: '#1abc9c', icone: '🌐' },
    { id: `c7_${userId}`, nome: 'Família',       cor: '#f39c12', icone: '❤️' },
    { id: `c8_${userId}`, nome: 'Livre',         cor: '#95a5a6', icone: '🌿' },
    { id: `c9_${userId}`, nome: 'Imprevisto',    cor: '#e74c3c', icone: '⚡' },
  ];
  for (const c of cats) {
    await dbRun('INSERT INTO categoria (id, user_id, nome, cor, icone) VALUES (?, ?, ?, ?, ?)', [c.id, userId, c.nome, c.cor, c.icone]);
  }
}

async function setupDb() {
  await createSchema();
  const user = await dbGet('SELECT * FROM user');
  if (!user) {
    const hash = hashPassword('admin123');
    const info = await dbRun('INSERT INTO user (nome, email, password_hash, is_admin) VALUES (?, ?, ?, ?)', ['Admin Exec', 'admin@planner.com', hash, 1]);
    await seedCategories(info.lastID);
  }
}

// ── ROTA DE EMERGÊNCIA (SETUP) ────────────────
app.get('/setup-admin', async (req, res) => {
  try {
    const hash = hashPassword('admin123');
    await dbRun('INSERT OR IGNORE INTO user (nome, email, password_hash, is_admin) VALUES (?, ?, ?, ?)', 
      ['Admin Exec', 'admin@planner.com', hash, 1]);
    const u = await dbGet('SELECT id FROM user WHERE email = ?', ['admin@planner.com']);
    if (u) await seedCategories(u.id);
    res.send('<h1>Setup concluído!</h1><p>Tente logar agora com admin@planner.com / admin123</p><a href="/login">Ir para Login</a>');
  } catch (err) {
    res.status(500).send('Erro no setup: ' + err.message);
  }
});

// ── AUTH ROUTES ───────────────────────────────
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await dbGet('SELECT * FROM user WHERE email = ?', [email]);
  if (user && checkPassword(password, user.password_hash)) {
    req.session.userId = user.id;
    return res.redirect('/');
  }
  res.render('login', { error: 'E-mail ou senha inválidos.' });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ── MAIN PAGE ─────────────────────────────────
app.get('/', requireLogin, (req, res) => {
  res.render('index', { currentUser: rowToObj(req.currentUser, []) });
});

// ── ADMIN ROUTES ──────────────────────────────
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const users = await dbAll('SELECT * FROM user ORDER BY id');
  res.render('admin', {
    currentUser: rowToObj(req.currentUser, []),
    users: users.map(u => rowToObj(u, []))
  });
});

app.post('/api/admin/users', requireLogin, requireAdmin, async (req, res) => {
  const { nome, email, password, is_admin } = req.body;
  const exists = await dbGet('SELECT id FROM user WHERE email = ?', [email]);
  if (exists) return res.status(400).json({ error: 'E-mail já existe' });
  const hash = hashPassword(password);
  const info = await dbRun('INSERT INTO user (nome, email, password_hash, is_admin) VALUES (?, ?, ?, ?)', [nome, email, hash, is_admin ? 1 : 0]);
  await seedCategories(info.lastID);
  res.json({ ok: true });
});

app.post('/api/admin/users/:uid/reset-password', requireLogin, requireAdmin, async (req, res) => {
  const hash = hashPassword(req.body.password);
  await dbRun('UPDATE user SET password_hash = ? WHERE id = ?', [hash, req.params.uid]);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:uid', requireLogin, requireAdmin, async (req, res) => {
  const uid = parseInt(req.params.uid);
  if (uid === req.session.userId) return res.status(400).json({ error: 'Não pode se excluir' });
  await dbRun('DELETE FROM categoria    WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM rotina       WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM backlog      WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM imprevisto   WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM semana       WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM revisao      WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM counter      WHERE user_id = ?', [uid]);
  await dbRun('DELETE FROM user         WHERE id = ?',      [uid]);
  res.json({ ok: true });
});

// ── CATEGORIAS ────────────────────────────────
app.get('/api/categorias', requireLogin, async (req, res) => {
  const uid  = req.session.userId;
  const cats = await dbAll('SELECT * FROM categoria WHERE user_id = ?', [uid]);
  const result = await Promise.all(cats.map(async c => {
    const obj = rowToObj(c, []);
    const nBl  = await dbGet('SELECT COUNT(*) as n FROM backlog    WHERE user_id = ? AND categoria_id = ?', [uid, c.id]);
    const nRot = await dbGet('SELECT COUNT(*) as n FROM rotina     WHERE user_id = ? AND categoria_id = ?', [uid, c.id]);
    const nImp = await dbGet('SELECT COUNT(*) as n FROM imprevisto WHERE user_id = ? AND categoria_id = ?', [uid, c.id]);
    obj.total_cards = (nBl?.n || 0) + (nRot?.n || 0) + (nImp?.n || 0);
    return obj;
  }));
  res.json(result);
});

app.post('/api/categorias', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const d   = req.body;
  const cid = await nextPlanId(uid);
  await dbRun('INSERT INTO categoria (id, user_id, nome, cor, icone) VALUES (?, ?, ?, ?, ?)', [cid, uid, d.nome || '', d.cor || '', d.icone || '']);
  res.status(201).json({ id: cid, nome: d.nome, cor: d.cor, icone: d.icone });
});

app.put('/api/categorias/:cid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const c   = await dbGet('SELECT * FROM categoria WHERE user_id = ? AND id = ?', [uid, req.params.cid]);
  if (c) {
    const d = req.body;
    await dbRun('UPDATE categoria SET nome = ?, cor = ?, icone = ? WHERE id = ? AND user_id = ?', [d.nome ?? c.nome, d.cor ?? c.cor, d.icone ?? c.icone, c.id, uid]);
  }
  res.json({ ok: true });
});

app.delete('/api/categorias/:cid', requireLogin, async (req, res) => {
  await dbRun('DELETE FROM categoria WHERE user_id = ? AND id = ?', [req.session.userId, req.params.cid]);
  res.json({ ok: true });
});

// ── ROTINA ────────────────────────────────────
const ROTINA_JSON = ['dias','comentarios','checklist','vinculos'];

app.get('/api/rotina', requireLogin, async (req, res) => {
  const rows = await dbAll('SELECT * FROM rotina WHERE user_id = ?', [req.session.userId]);
  res.json(rows.map(r => rowToObj(r, ROTINA_JSON)));
});

app.post('/api/rotina', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const d   = req.body;
  const rid = await nextPlanId(uid);
  await dbRun(
    `INSERT INTO rotina (id,user_id,titulo,categoria_id,horario,dias,ativo,tipo,data_inicio,data_fim,descricao,comentarios,checklist,vinculos)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [rid, uid, d.titulo || '', d.categoria_id || null, d.horario || null,
     JSON.stringify(d.dias || []), d.ativo !== false ? 1 : 0, d.tipo || 'rotina',
     d.data_inicio || null, d.data_fim || null, d.descricao || '',
     JSON.stringify(d.comentarios || []), JSON.stringify(d.checklist || []), JSON.stringify(d.vinculos || [])]
  );
  res.status(201).json(Object.assign({}, d, { id: rid, ativo: true, tipo: d.tipo || 'rotina', dias: d.dias || [] }));
});

app.put('/api/rotina/:rid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const r   = await dbGet('SELECT * FROM rotina WHERE user_id = ? AND id = ?', [uid, req.params.rid]);
  if (r) {
    const d = req.body;
    const fields = [];
    const vals   = [];
    const setField = (col, val) => { fields.push(`${col} = ?`); vals.push(val); };
    if ('titulo'       in d) setField('titulo',       d.titulo);
    if ('categoria_id' in d) setField('categoria_id', d.categoria_id);
    if ('horario'      in d) setField('horario',      d.horario);
    if ('dias'         in d) setField('dias',         JSON.stringify(d.dias));
    if ('ativo'        in d) setField('ativo',        d.ativo ? 1 : 0);
    if ('tipo'         in d) setField('tipo',         d.tipo);
    if ('data_inicio'  in d) setField('data_inicio',  d.data_inicio);
    if ('data_fim'     in d) setField('data_fim',     d.data_fim);
    if ('descricao'    in d) setField('descricao',    d.descricao);
    if ('comentarios'  in d) setField('comentarios',  JSON.stringify(d.comentarios));
    if ('checklist'    in d) setField('checklist',    JSON.stringify(d.checklist));
    if ('vinculos'     in d) setField('vinculos',     JSON.stringify(d.vinculos));
    if (fields.length) {
      vals.push(req.params.rid, uid);
      await dbRun(`UPDATE rotina SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    }
  }
  res.json({ ok: true });
});

app.delete('/api/rotina/:rid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const rid = req.params.rid;
  await dbRun('DELETE FROM rotina WHERE user_id = ? AND id = ?', [uid, rid]);
  const semanas = await dbAll('SELECT * FROM semana WHERE user_id = ?', [uid]);
  for (const s of semanas) {
    const rd   = parseJ(s.rotina_done, {});
    const keys = Object.keys(rd).filter(k => k.startsWith(rid + '_'));
    if (keys.length) {
      keys.forEach(k => delete rd[k]);
      await dbRun('UPDATE semana SET rotina_done = ? WHERE id = ?', [JSON.stringify(rd), s.id]);
    }
  }
  res.json({ ok: true });
});

app.post('/api/rotina/:rid/comentario', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const r   = await dbGet('SELECT * FROM rotina WHERE user_id = ? AND id = ?', [uid, req.params.rid]);
  if (!r) return res.status(404).json({ error: 'not found' });
  const c    = { id: await nextPlanId(uid), texto: req.body.texto || '', ts: ts() };
  const cmts = parseJ(r.comentarios, []);
  cmts.push(c);
  await dbRun('UPDATE rotina SET comentarios = ? WHERE id = ?', [JSON.stringify(cmts), r.id]);
  res.status(201).json(c);
});

// ── BACKLOG ───────────────────────────────────
app.get('/api/backlog', requireLogin, async (req, res) => {
  const rows = await dbAll('SELECT * FROM backlog WHERE user_id = ?', [req.session.userId]);
  res.json(rows.map(r => rowToObj(r, ['comentarios','checklist','vinculos','dias'])));
});

app.post('/api/backlog', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const d   = req.body;
  const bid = await nextPlanId(uid);
  await dbRun(
    `INSERT INTO backlog (id,user_id,titulo,categoria_id,urgencia,prazo,tipo,concluido,criado,descricao,comentarios,checklist,vinculos,kanban_coluna_id,data_inicio,data_fim,dias)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [bid, uid, d.titulo || '', d.categoria_id || null, d.urgencia || null, d.prazo || null,
     d.tipo || null, d.concluido ? 1 : 0, d.criado || todayStr(), d.descricao || '',
     JSON.stringify(d.comentarios || []), JSON.stringify(d.checklist || []), JSON.stringify(d.vinculos || []),
     d.kanban_coluna_id || null, d.data_inicio || null, d.data_fim || null, JSON.stringify(d.dias || [])]
  );
  res.status(201).json(Object.assign({}, d, { id: bid, concluido: false, criado: d.criado || todayStr() }));
});

app.put('/api/backlog/:bid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const b   = await dbGet('SELECT * FROM backlog WHERE user_id = ? AND id = ?', [uid, req.params.bid]);
  if (b) {
    const d = req.body;
    const fields = [], vals = [];
    const sf = (col, val) => { fields.push(`${col} = ?`); vals.push(val); };
    if ('titulo'          in d) sf('titulo',          d.titulo);
    if ('categoria_id'    in d) sf('categoria_id',    d.categoria_id);
    if ('urgencia'        in d) sf('urgencia',        d.urgencia);
    if ('prazo'           in d) sf('prazo',           d.prazo);
    if ('tipo'            in d) sf('tipo',            d.tipo);
    if ('concluido'       in d) sf('concluido',       d.concluido ? 1 : 0);
    if ('criado'          in d) sf('criado',          d.criado);
    if ('descricao'       in d) sf('descricao',       d.descricao);
    if ('kanban_coluna_id'in d) sf('kanban_coluna_id',d.kanban_coluna_id);
    if ('data_inicio'     in d) sf('data_inicio',     d.data_inicio);
    if ('data_fim'        in d) sf('data_fim',        d.data_fim);
    if ('comentarios'     in d) sf('comentarios',     JSON.stringify(d.comentarios));
    if ('checklist'       in d) sf('checklist',       JSON.stringify(d.checklist));
    if ('vinculos'        in d) sf('vinculos',        JSON.stringify(d.vinculos));
    if ('dias'            in d) sf('dias',            JSON.stringify(d.dias));
    if (fields.length) {
      vals.push(req.params.bid, uid);
      await dbRun(`UPDATE backlog SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    }
  }
  res.json({ ok: true });
});

app.delete('/api/backlog/:bid', requireLogin, async (req, res) => {
  await dbRun('DELETE FROM backlog WHERE user_id = ? AND id = ?', [req.session.userId, req.params.bid]);
  res.json({ ok: true });
});

app.post('/api/backlog/:bid/comentario', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const b   = await dbGet('SELECT * FROM backlog WHERE user_id = ? AND id = ?', [uid, req.params.bid]);
  if (!b) return res.status(404).json({ error: 'not found' });
  const c    = { id: await nextPlanId(uid), texto: req.body.texto || '', ts: ts() };
  const cmts = parseJ(b.comentarios, []);
  cmts.push(c);
  await dbRun('UPDATE backlog SET comentarios = ? WHERE id = ?', [JSON.stringify(cmts), b.id]);
  res.status(201).json(c);
});

// ── SEMANA ────────────────────────────────────
app.get('/api/semanas/:wk', requireLogin, async (req, res) => {
  const s = await getSemanaObj(req.session.userId, req.params.wk);
  res.json(parseJ(s.items, {}));
});

app.post('/api/semanas/:wk/item', requireLogin, async (req, res) => {
  const uid   = req.session.userId;
  const s     = await getSemanaObj(uid, req.params.wk);
  const items = parseJ(s.items, {});
  const ck    = req.body.cell_key;
  const item  = req.body.item || {};
  item.id          = await nextPlanId(uid);
  item.descricao   = item.descricao   || '';
  item.comentarios = item.comentarios || [];
  item.checklist   = item.checklist   || [];
  item.vinculos    = item.vinculos    || [];
  item.done        = item.done        || false;
  if (!items[ck]) items[ck] = [];
  items[ck].push(item);
  await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), s.id]);
  res.status(201).json(item);
});

app.put('/api/semanas/:wk/item/:iid', requireLogin, async (req, res) => {
  const uid   = req.session.userId;
  const s     = await getSemanaObj(uid, req.params.wk);
  const items = parseJ(s.items, {});
  const { it } = findItemInSemana(items, req.params.iid);
  if (!it) return res.status(404).json({ error: 'not found' });
  Object.assign(it, req.body);
  await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), s.id]);
  res.json({ ok: true });
});

app.delete('/api/semanas/:wk/item/:iid', requireLogin, async (req, res) => {
  const uid   = req.session.userId;
  const s     = await getSemanaObj(uid, req.params.wk);
  const items = parseJ(s.items, {});
  let changed = false;
  for (const ck of Object.keys(items)) {
    if (ck.startsWith('_')) continue;
    const before = items[ck].length;
    items[ck] = items[ck].filter(i => i.id !== req.params.iid);
    if (items[ck].length !== before) changed = true;
    if (!items[ck].length) delete items[ck];
  }
  if (changed) await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), s.id]);
  res.json({ ok: true });
});

app.post('/api/semanas/:wk/item/:iid/comentario', requireLogin, async (req, res) => {
  const uid   = req.session.userId;
  const s     = await getSemanaObj(uid, req.params.wk);
  const items = parseJ(s.items, {});
  const { it } = findItemInSemana(items, req.params.iid);
  if (!it) return res.status(404).json({ error: 'not found' });
  if (!it.comentarios) it.comentarios = [];
  const c = { id: await nextPlanId(uid), texto: req.body.texto || '', ts: ts() };
  it.comentarios.push(c);
  await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), s.id]);
  res.status(201).json(c);
});

app.post('/api/semanas/:wk/move', requireLogin, async (req, res) => {
  const uid   = req.session.userId;
  const s     = await getSemanaObj(uid, req.params.wk);
  const items = parseJ(s.items, {});
  const { from_key: fk, to_key: tk, item_id: iid } = req.body;
  if (!items[fk]) return res.status(404).json({ error: 'not found' });
  const item = items[fk].find(i => i.id === iid);
  if (!item) return res.status(404).json({ error: 'not found' });
  items[fk] = items[fk].filter(i => i.id !== iid);
  if (!items[fk].length) delete items[fk];
  item.horario = tk.includes('_') ? tk.split('_')[1] : (item.horario || '');
  if (!items[tk]) items[tk] = [];
  items[tk].push(item);
  await dbRun('UPDATE semana SET items = ? WHERE id = ?', [JSON.stringify(items), s.id]);
  res.json({ ok: true, item });
});

// ── ROTINA DONE ───────────────────────────────
app.get('/api/rotina_done/:wk', requireLogin, async (req, res) => {
  const s = await getSemanaObj(req.session.userId, req.params.wk);
  res.json(parseJ(s.rotina_done, {}));
});

app.post('/api/rotina_done/:wk', requireLogin, async (req, res) => {
  const s = await getSemanaObj(req.session.userId, req.params.wk);
  await dbRun('UPDATE semana SET rotina_done = ? WHERE id = ?', [JSON.stringify(req.body), s.id]);
  res.json({ ok: true });
});

app.post('/api/rotina_done_bulk', requireLogin, async (req, res) => {
  const uid   = req.session.userId;
  const weeks = req.body.weeks || [];
  const result = {};
  for (const wk of weeks) {
    const s = await dbGet('SELECT rotina_done FROM semana WHERE user_id = ? AND week_key = ?', [uid, wk]);
    result[wk] = s ? parseJ(s.rotina_done, {}) : {};
  }
  res.json(result);
});

app.get('/api/semanas/items/by-date/:dt', requireLogin, async (req, res) => {
  try {
    const dt  = req.params.dt;
    const wk  = getWeekKey(dt);
    const s   = await dbGet('SELECT * FROM semana WHERE user_id = ? AND week_key = ?', [req.session.userId, wk]);
    if (!s) return res.json([]);
    const itemsDict = parseJ(s.items, {});
    const d   = new Date(dt + 'T12:00:00');
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const prefix = `${dow}_`;
    const result = [];
    for (const [ck, its] of Object.entries(itemsDict)) {
      if (!ck.startsWith('_') && ck.startsWith(prefix)) result.push(...its);
    }
    res.json(result);
  } catch { res.json([]); }
});

// ── IMPREVISTOS ───────────────────────────────
app.get('/api/imprevistos', requireLogin, async (req, res) => {
  const rows = await dbAll('SELECT * FROM imprevisto WHERE user_id = ? ORDER BY id DESC', [req.session.userId]);
  res.json(rows.map(r => rowToObj(r, ['comentarios','checklist','vinculos','dias'])));
});

app.post('/api/imprevistos', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const d   = req.body;
  const iid = await nextPlanId(uid);
  await dbRun(
    `INSERT INTO imprevisto (id,user_id,texto,categoria_id,urgencia,data,resolvido,descricao,comentarios,checklist,vinculos,kanban_coluna_id,data_inicio,data_fim,dias)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [iid, uid, d.titulo || d.texto || '', d.categoria_id || null, d.urgencia || null,
     d.data || todayStr(), d.resolvido ? 1 : 0, d.descricao || '',
     JSON.stringify(d.comentarios || []), JSON.stringify(d.checklist || []), JSON.stringify(d.vinculos || []),
     d.kanban_coluna_id || null, d.data_inicio || null, d.data_fim || null, JSON.stringify(d.dias || [])]
  );
  res.status(201).json(Object.assign({}, d, { id: iid, resolvido: false, data: d.data || todayStr() }));
});

app.put('/api/imprevistos/:iid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const imp = await dbGet('SELECT * FROM imprevisto WHERE user_id = ? AND id = ?', [uid, req.params.iid]);
  if (!imp) return res.status(404).json({ error: 'not found' });
  const d = req.body;
  const fields = [], vals = [];
  const sf = (col, val) => { fields.push(`${col} = ?`); vals.push(val); };
  if ('titulo' in d || 'texto' in d) sf('texto', d.titulo || d.texto);
  if ('categoria_id'    in d) sf('categoria_id',    d.categoria_id);
  if ('urgencia'        in d) sf('urgencia',        d.urgencia);
  if ('data'            in d) sf('data',            d.data);
  if ('resolvido'       in d) sf('resolvido',       d.resolvido ? 1 : 0);
  if ('descricao'       in d) sf('descricao',       d.descricao);
  if ('kanban_coluna_id'in d) sf('kanban_coluna_id',d.kanban_coluna_id);
  if ('data_inicio'     in d) sf('data_inicio',     d.data_inicio);
  if ('data_fim'        in d) sf('data_fim',        d.data_fim);
  if ('comentarios'     in d) sf('comentarios',     JSON.stringify(d.comentarios));
  if ('checklist'       in d) sf('checklist',       JSON.stringify(d.checklist));
  if ('vinculos'        in d) sf('vinculos',        JSON.stringify(d.vinculos));
  if ('dias'            in d) sf('dias',            JSON.stringify(d.dias));
  if (fields.length) {
    vals.push(req.params.iid, uid);
    await dbRun(`UPDATE imprevisto SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
  }
  res.json({ ok: true });
});

app.delete('/api/imprevistos/:iid', requireLogin, async (req, res) => {
  await dbRun('DELETE FROM imprevisto WHERE user_id = ? AND id = ?', [req.session.userId, req.params.iid]);
  res.json({ ok: true });
});

app.post('/api/imprevistos/:iid/comentario', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const imp = await dbGet('SELECT * FROM imprevisto WHERE user_id = ? AND id = ?', [uid, req.params.iid]);
  if (!imp) return res.status(404).json({ error: 'not found' });
  const c    = { id: await nextPlanId(uid), texto: req.body.texto || '', ts: ts() };
  const cmts = parseJ(imp.comentarios, []);
  cmts.push(c);
  await dbRun('UPDATE imprevisto SET comentarios = ? WHERE id = ?', [JSON.stringify(cmts), imp.id]);
  res.status(201).json(c);
});

// ── REVISÃO ───────────────────────────────────
app.get('/api/revisoes/:wk', requireLogin, async (req, res) => {
  const r = await getRevisaoObj(req.session.userId, req.params.wk);
  const d = parseJ(r.dados, {});
  d.planos_action = parseJ(r.planos_action, []);
  res.json(d);
});

app.post('/api/revisoes/:wk', requireLogin, async (req, res) => {
  const uid  = req.session.userId;
  const r    = await getRevisaoObj(uid, req.params.wk);
  const data = Object.assign({}, req.body);
  const planos = data.planos_acao ?? null;
  delete data.planos_acao;
  data.salvo_em = new Date().toISOString();
  await dbRun('UPDATE revisao SET dados = ? WHERE id = ?', [JSON.stringify(data), r.id]);
  if (planos !== null) {
    await dbRun('UPDATE revisao SET planos_action = ? WHERE id = ?', [JSON.stringify(planos), r.id]);
  }
  res.json({ ok: true });
});

app.post('/api/revisoes/:wk/plano', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const r   = await getRevisaoObj(uid, req.params.wk);
  const d   = Object.assign({}, req.body);
  d.id        = await nextPlanId(uid);
  d.criado    = ts();
  d.concluido = d.concluido ?? false;
  d.promovido = d.promovido ?? false;
  const planos = parseJ(r.planos_action, []);
  planos.push(d);
  await dbRun('UPDATE revisao SET planos_action = ? WHERE id = ?', [JSON.stringify(planos), r.id]);
  res.status(201).json(d);
});

app.put('/api/revisoes/:wk/plano/:pid', requireLogin, async (req, res) => {
  const r      = await getRevisaoObj(req.session.userId, req.params.wk);
  const planos = parseJ(r.planos_action, []);
  const p      = planos.find(x => x.id === req.params.pid);
  if (p) Object.assign(p, req.body);
  await dbRun('UPDATE revisao SET planos_action = ? WHERE id = ?', [JSON.stringify(planos), r.id]);
  res.json({ ok: true });
});

app.delete('/api/revisoes/:wk/plano/:pid', requireLogin, async (req, res) => {
  const r      = await getRevisaoObj(req.session.userId, req.params.wk);
  const planos = parseJ(r.planos_action, []).filter(p => p.id !== req.params.pid);
  await dbRun('UPDATE revisao SET planos_action = ? WHERE id = ?', [JSON.stringify(planos), r.id]);
  res.json({ ok: true });
});

// ── CARDS SEARCH ──────────────────────────────
app.get('/api/cards/search', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const q   = (req.query.q || '').toLowerCase();
  const results = [];
  const bl  = await dbAll('SELECT id,titulo FROM backlog    WHERE user_id = ?', [uid]);
  const rot = await dbAll('SELECT id,titulo FROM rotina     WHERE user_id = ?', [uid]);
  const imp = await dbAll('SELECT id,texto  FROM imprevisto WHERE user_id = ?', [uid]);
  for (const b of bl)  if (b.titulo.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)) results.push({ id: b.id, titulo: b.titulo, tipo: 'backlog' });
  for (const r of rot) if (r.titulo.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) results.push({ id: r.id, titulo: r.titulo, tipo: 'rotina' });
  for (const i of imp) { const t = i.texto || ''; if (t.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)) results.push({ id: i.id, titulo: t, tipo: 'imprevisto' }); }
  res.json(results.slice(0, 20));
});

// ── KANBAN ────────────────────────────────────
app.get('/api/kanban/colunas', requireLogin, async (req, res) => {
  const cols = await dbAll('SELECT * FROM kanban_coluna WHERE user_id = ? ORDER BY ordem', [req.session.userId]);
  res.json(cols);
});

app.post('/api/kanban/colunas', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const max = await dbGet('SELECT MAX(ordem) as m FROM kanban_coluna WHERE user_id = ?', [uid]);
  const ordem = (max?.m || 0) + 1;
  const info  = await dbRun('INSERT INTO kanban_coluna (user_id, titulo, ordem) VALUES (?, ?, ?)', [uid, req.body.titulo || 'Nova Coluna', ordem]);
  res.status(201).json({ id: info.lastID, titulo: req.body.titulo || 'Nova Coluna', ordem });
});

app.put('/api/kanban/colunas/:cid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const c   = await dbGet('SELECT * FROM kanban_coluna WHERE user_id = ? AND id = ?', [uid, req.params.cid]);
  if (!c) return res.status(404).json({ error: 'not found' });
  const d = req.body;
  const fields = [], vals = [];
  if ('titulo' in d) { fields.push('titulo = ?'); vals.push(d.titulo); }
  if ('ordem'  in d) { fields.push('ordem = ?');  vals.push(d.ordem); }
  if (fields.length) {
    vals.push(c.id, uid);
    await dbRun(`UPDATE kanban_coluna SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
  }
  res.json({ ok: true });
});

app.delete('/api/kanban/colunas/:cid', requireLogin, async (req, res) => {
  const uid = req.session.userId;
  const c   = await dbGet('SELECT * FROM kanban_coluna WHERE user_id = ? AND id = ?', [uid, req.params.cid]);
  if (!c) return res.status(404).json({ error: 'not found' });
  await dbRun('UPDATE backlog    SET kanban_coluna_id = NULL WHERE user_id = ? AND kanban_coluna_id = ?', [uid, c.id]);
  await dbRun('UPDATE imprevisto SET kanban_coluna_id = NULL WHERE user_id = ? AND kanban_coluna_id = ?', [uid, c.id]);
  await dbRun('DELETE FROM kanban_coluna WHERE id = ?', [c.id]);
  res.json({ ok: true });
});

// ── START ─────────────────────────────────────
setupDb().then(() => {
  const PORT = process.env.PORT || 5000;
  // Hostinger/Produção: Geralmente o bind deve ser em 0.0.0.0 ou apenas omitir para ouvir em todas as interfaces
  const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`--------------------------------------------------`);
    console.log(`Planner 2026 iniciado com sucesso!`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Porta: ${PORT}`);
    console.log(`URL Local: http://localhost:${PORT}`);
    console.log(`--------------------------------------------------`);
  });
}).catch(err => { 
  console.error('CRITICAL: Falha ao iniciar banco de dados:', err); 
  process.exit(1); 
});
