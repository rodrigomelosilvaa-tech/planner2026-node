const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

function checkPassword(password, hash) {
  if (hash.startsWith('scrypt:')) {
    const parts = hash.split('$');
    if (parts.length !== 3) return false;
    const [method, salt, expected] = parts;
    const [, N, r, p] = method.split(':').map(Number);
    const dklen = expected.length / 2;
    const maxmem = 128 * N * r * 2;
    const derived = crypto.scryptSync(password, salt, dklen, { N, r, p, maxmem });
    return derived.toString('hex') === expected;
  }
  return bcrypt.compareSync(password, hash);
}

const db = new sqlite3.Database('app.db');
db.get('SELECT password_hash FROM user WHERE email = ?', ['admin@planner.com'], (err, row) => {
  if (row) {
    const ok = checkPassword('admin123', row.password_hash);
    console.log('Login admin@planner.com / admin123:', ok ? 'SUCESSO ✅' : 'FALHA ❌');
  } else {
    console.log('Usuário não encontrado no banco local.');
  }
  db.close();
});
