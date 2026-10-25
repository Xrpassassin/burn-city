'use strict';

// Durable last-safe-position storage for authenticated Estates players.
// This is a return anchor only: it grants no property access and cannot mutate layouts.
const ACCOUNT_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const MAX_XZ = 240;
const MIN_Y = -2;
const MAX_Y = 20;

function validAnchor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { x, y, z, r } = value;
  if (![x, y, z, r].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  if (Math.abs(x) > MAX_XZ || Math.abs(z) > MAX_XZ || y < MIN_Y || y > MAX_Y || r < -Math.PI || r > Math.PI) return null;
  return Object.freeze({ x, y, z, r });
}

function createEstatesReturnAnchorStore({ db, now = Date.now } = {}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
    throw new TypeError('sqlite_database_required');
  }
  if (typeof now !== 'function') throw new TypeError('clock_must_be_function');
  db.exec(`
    CREATE TABLE IF NOT EXISTS estate_return_anchors (
      acct TEXT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      r REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const read = db.prepare('SELECT x, y, z, r, updated_at AS updatedAt FROM estate_return_anchors WHERE acct=?');
  const write = db.prepare(`INSERT INTO estate_return_anchors(acct,x,y,z,r,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(acct) DO UPDATE SET x=excluded.x,y=excluded.y,z=excluded.z,r=excluded.r,updated_at=excluded.updated_at`);

  function get(account) {
    if (typeof account !== 'string' || !ACCOUNT_RE.test(account)) return { ok: false, error: 'authenticated_account_required' };
    const row = read.get(account);
    return { ok: true, anchor: row ? { x: row.x, y: row.y, z: row.z, r: row.r, updatedAt: row.updatedAt } : null };
  }
  function save(account, value) {
    if (typeof account !== 'string' || !ACCOUNT_RE.test(account)) return { ok: false, error: 'authenticated_account_required' };
    const anchor = validAnchor(value);
    if (!anchor) return { ok: false, error: 'invalid_return_anchor' };
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) return { ok: false, error: 'invalid_clock' };
    write.run(account, anchor.x, anchor.y, anchor.z, anchor.r, timestamp);
    return { ok: true, anchor: { ...anchor, updatedAt: timestamp } };
  }
  return Object.freeze({ get, save });
}

module.exports = { ACCOUNT_RE, MAX_XZ, validAnchor, createEstatesReturnAnchorStore };
