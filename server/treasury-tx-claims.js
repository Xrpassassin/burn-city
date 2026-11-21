// One shared "this payment already settled something" table for every product that verifies a player's XRP
// payment to the treasury (shop cosmetics, ranked buy-ins, Ember Bar drinks, jetpacks). Each product still keeps
// its own used-tx table; this one sits across them so ONE ledger tx can never settle TWO products, even if a
// hand-built payment carries several memos or both products accept the same destination tag.
// DATA_DIR/tx-claims.db · see HANDOFF.md "Security hardening".
const path = require('path'), C = require('./config');
let db = null;
function DB() {
  if (db) return db;
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(C.DATA_DIR, 'tx-claims.db'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS tx_claims(hash TEXT PRIMARY KEY, product TEXT NOT NULL, ref TEXT NOT NULL, t INTEGER NOT NULL);`);
  return db;
}
const HASH = /^[0-9A-F]{64}$/;
// Claim `hash` for (product, ref). Synchronous, so no other request can interleave between check and insert.
// Returns { ok: true } for a new claim or a repeat of the same (product, ref); { ok: false, product, ref } when
// another product/order already settled with this tx.
function claim(hash, product, ref) {
  hash = String(hash || '').toUpperCase(); product = String(product || ''); ref = String(ref || '');
  if (!HASH.test(hash) || !product || !ref) return { ok: false, reason: 'bad_claim' };
  const d = DB();
  if (d.prepare('INSERT OR IGNORE INTO tx_claims(hash,product,ref,t) VALUES(?,?,?,?)').run(hash, product, ref, Date.now()).changes === 1) return { ok: true };
  const row = d.prepare('SELECT product, ref FROM tx_claims WHERE hash=?').get(hash);
  return row && row.product === product && row.ref === ref ? { ok: true, again: true } : { ok: false, reason: 'tx_already_used', product: row?.product, ref: row?.ref };
}
const owner = hash => { const r = DB().prepare('SELECT product, ref FROM tx_claims WHERE hash=?').get(String(hash || '').toUpperCase()); return r ? { product: r.product, ref: r.ref } : null; };
// Exactly one memo whose data is the expected id and whose MemoType is the expected type (hex-compare, case-insensitive).
// typeOptional: a memo with no MemoType at all is accepted (products whose order screens show only the memo text and
// rely on their own unique destination tag); a memo with a DIFFERENT type, or any second memo, never is.
const hex = s => Buffer.from(String(s), 'utf8').toString('hex').toUpperCase();
function exactlyOneMemo(tx, type, data, { typeOptional = false } = {}) {
  const m = Array.isArray(tx?.Memos) && tx.Memos.length === 1 ? tx.Memos[0]?.Memo : null;
  if (!m || typeof m.MemoData !== 'string' || m.MemoData.toUpperCase() !== hex(data)) return false;
  if (m.MemoType == null || m.MemoType === '') return typeOptional;
  return typeof m.MemoType === 'string' && m.MemoType.toUpperCase() === hex(type);
}
module.exports = { claim, owner, exactlyOneMemo, _db: DB };
