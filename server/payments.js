// XAMAN sign-in (identity = XRPL account) + cosmetic purchases verified on the ledger.
// Playing is free; nothing here gates gameplay. Sales never fund prizes.
const crypto = require('crypto'), xrpl = require('xrpl'), C = require('./config'), S = require('./store'), { items } = require('./shop');

// Ownership lives in SQLite on the /data volume (DATA_DIR/shop.db), keyed by the XRPL account that SIGNED the payment.
const { DatabaseSync } = require('node:sqlite'), sdb = new DatabaseSync(require('path').join(C.DATA_DIR, 'shop.db'));
sdb.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS owned(acct TEXT, item TEXT, hash TEXT, t INTEGER, PRIMARY KEY(acct, item));
CREATE TABLE IF NOT EXISTS used_tx(hash TEXT PRIMARY KEY, sid TEXT, t INTEGER);
CREATE TABLE IF NOT EXISTS buy_sessions(sid TEXT PRIMARY KEY, acct TEXT, item TEXT, uuid TEXT, created INTEGER, done INTEGER DEFAULT 0);`);
{ const o = S.load('owners.json', {}), st = sdb.prepare('INSERT OR IGNORE INTO owned VALUES(?,?,?,?)'); for (const [a, l] of Object.entries(o)) for (const i of l) st.run(a, i, 'migrated', Date.now());   // one-time import of the old JSON
  const ut = sdb.prepare('INSERT OR IGNORE INTO used_tx VALUES(?,?,?)'); for (const h of S.load('used_tx.json', [])) ut.run(h, 'migrated', Date.now()); }
const sessions = new Map();                       // sid -> {created, kind, item, account}; buy sessions are mirrored in SQLite
for (const r of sdb.prepare('SELECT * FROM buy_sessions WHERE done=0 AND created>?').all(Date.now() - 86400e3)) sessions.set(r.sid, { created: r.created, kind: 'buy', item: r.item, account: r.acct, uuid: r.uuid || undefined });
const used = { has: h => !!sdb.prepare('SELECT 1 FROM used_tx WHERE hash=?').get(h) };
const usedSids = { has: sid => !!sdb.prepare('SELECT 1 FROM buy_sessions WHERE sid=? AND done=1').get(sid) };
let client;
async function ledger() { if (module.exports._ledger) return module.exports._ledger(); if (client && client.isConnected()) return client; client = new xrpl.Client(C.XRPL_WSS); await client.connect(); return client; }
const hex = s => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const sdk = () => module.exports._sdk ? module.exports._sdk() : sdk0(); const sdk0 = () => { const { XummSdk } = require('xumm-sdk'); return new XummSdk(C.XUMM_KEY, C.XUMM_SECRET); };
function gc() { for (const [k, v] of sessions) if (Date.now() - v.created > (v.kind === 'buy' && v.uuid ? 86400e3 : C.SESSION_TTL_MS) && !v.done) sessions.delete(k); }

// ---- identity ----
async function startSignIn() {
  gc(); const sid = 'SI' + crypto.randomBytes(12).toString('hex'); sessions.set(sid, { created: Date.now(), kind: 'signin' });
  if (!C.XUMM_KEY) return { sid, xaman: null };
  const p = await sdk().payload.create({ txjson: { TransactionType: 'SignIn' }, custom_meta: { identifier: sid, instruction: 'Sign in to Burn City Arena' } });
  sessions.get(sid).uuid = p.uuid; return { sid, xaman: { uuid: p.uuid, qr: p.refs.qr_png, deeplink: p.next.always } };
}
async function finishSignIn(sid) {
  const s = sessions.get(sid); if (!s || s.kind !== 'signin' || !s.uuid) return { ok: false, reason: 'unknown_session' };
  const p = await sdk().payload.get(s.uuid);
  if (!p?.meta?.signed || !p.response?.account) return { ok: false, reason: 'not_signed' };
  sessions.delete(sid); try { require('./estate-access').markRegistered(p.response.account); } catch (e) { console.error('wallet registry', e.message); return { ok: false, reason: 'registration_unavailable' }; } return { ok: true, account: p.response.account, token: sign({ acct: p.response.account, exp: Date.now() + C.LOGIN_TTL_MS }) };
}
// ---- purchases ----
function newPurchase(account, itemId) {
  gc(); const it = items[itemId]; if (!it) return null;
  const sid = 'BC' + crypto.randomBytes(12).toString('hex');
  sessions.set(sid, { created: Date.now(), kind: 'buy', item: itemId, account }); sdb.prepare('INSERT INTO buy_sessions(sid,acct,item,created) VALUES(?,?,?,?)').run(sid, account, itemId, Date.now()); return sid;
}
function txJsonFor(sid) {
  const s = sessions.get(sid);
  return { TransactionType: 'Payment', Destination: C.TREASURY, Amount: String(items[s.item].drops),
    Memos: [{ Memo: { MemoType: hex('burncity/shop'), MemoData: hex(sid) } }] };
}
async function createXamanPayload(sid) {
  if (!C.XUMM_KEY) return null; const s = sessions.get(sid);
  const p = await sdk().payload.create({ txjson: { ...txJsonFor(sid), Account: s.account }, options: { submit: true, expire: 10 },
    custom_meta: { identifier: sid, instruction: `Burn City cosmetic: ${items[s.item].name}. Cosmetic only. 32.2% is burned as BURN.` } });
  s.uuid = p.uuid; sdb.prepare('UPDATE buy_sessions SET uuid=? WHERE sid=?').run(p.uuid, sid); return { uuid: p.uuid, qr: p.refs.qr_png, deeplink: p.next.always };
}
async function hashFromPayload(sid) {
  const s = sessions.get(sid); if (!s?.uuid || !C.XUMM_KEY) return null;
  const p = await sdk().payload.get(s.uuid); return p?.meta?.signed ? p.response.txid : null;
}
// Core check: pure ledger truth.
async function verify(sid, txHash) {
  const s = sessions.get(sid);
  if (!s || s.kind !== 'buy') return { ok: false, reason: 'unknown_or_expired_session' };
  if (s.done) return { ok: true, item: s.item };
  if (usedSids.has(sid)) return { ok: false, reason: 'session_used' };
  if (!txHash) txHash = await hashFromPayload(sid);
  if (!/^[0-9A-F]{64}$/i.test(txHash || '')) return { ok: false, reason: 'no_tx' };
  txHash = txHash.toUpperCase();
  if (used.has(txHash)) return { ok: false, reason: 'replay' };
  let r; try { r = (await (await ledger()).request({ command: 'tx', transaction: txHash })).result; } catch { return { ok: false, reason: 'tx_not_found' }; }
  const tx = r.tx_json || r, meta = r.meta;
  if (!r.validated) return { ok: false, reason: 'not_validated_yet' };
  if (tx.TransactionType !== 'Payment') return { ok: false, reason: 'not_payment' };
  if (meta.TransactionResult !== 'tesSUCCESS') return { ok: false, reason: 'tx_failed' };
  if (tx.Destination !== C.TREASURY) return { ok: false, reason: 'wrong_destination' };
  if (tx.Account !== s.account) return { ok: false, reason: 'wrong_sender' };     // item goes to the signed-in account that paid
  const d = meta.delivered_amount;                 // delivered_amount defeats partial-payment tricks
  if (typeof d !== 'string' || +d < items[s.item].drops) return { ok: false, reason: 'wrong_amount' };
  if (!(tx.Memos || []).some(m => Buffer.from(m.Memo.MemoData || '', 'hex').toString() === sid)) return { ok: false, reason: 'memo_mismatch' };
  if (s.done) return { ok: true, item: s.item };
  if (sdb.prepare('INSERT OR IGNORE INTO used_tx VALUES(?,?,?)').run(txHash, sid, Date.now()).changes !== 1) return sdb.prepare('SELECT sid FROM used_tx WHERE hash=?').get(txHash)?.sid === sid ? { ok: true, item: s.item } : { ok: false, reason: 'replay' };   // atomic: a hash is used once, ever
  const burnDrops = Math.floor(+d * C.BURN_SHARE);
  S.append('sales.jsonl', { t: Date.now(), sid, txHash, account: tx.Account, item: s.item, drops: +d, burnDrops });
  const owed = S.load('burn_owed.json', { drops: 0 }); owed.drops += burnDrops; S.save('burn_owed.json', owed);
  sdb.prepare('INSERT OR IGNORE INTO owned VALUES(?,?,?,?)').run(tx.Account, s.item, txHash, Date.now());
  sdb.prepare('UPDATE buy_sessions SET done=1 WHERE sid=?').run(sid);
  s.done = true; return { ok: true, item: s.item, hash: txHash };
}
const owned = acct => sdb.prepare('SELECT item FROM owned WHERE acct=? ORDER BY t').all(acct).map(r => r.item);
// page closed / restart mid-purchase: finish verifying signed XAMAN payloads server-side (idempotent)
async function sweepBuys() { for (const [sid, s] of sessions) if (s.kind === 'buy' && s.uuid && !s.done) { try { await verify(sid); } catch {} } }
function sign(o) { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', C.TOKEN_SECRET).update(b).digest('base64url'); }
function checkToken(t) {
  if (!t || typeof t !== 'string') return null; const [b, m] = t.split('.');
  const mm = crypto.createHmac('sha256', C.TOKEN_SECRET).update(b || '').digest('base64url');
  if (!m || m.length !== mm.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(mm))) return null;
  try { const o = JSON.parse(Buffer.from(b, 'base64url')); return o.exp > Date.now() ? o : null; } catch { return null; }
}
module.exports = { sdk, sweepBuys, sessions, sdb, startSignIn, finishSignIn, newPurchase, txJsonFor, createXamanPayload, verify, owned, checkToken, sign, ledger };
