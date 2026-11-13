// The Ember Bar (BURN Tower mezzanine): a 1 XRP cosmetic drink purchase paid to the BURN City treasury via Xaman.
// The drink is a cosmetic scene moment (the bartender hops twice and serves the cup). It grants no gameplay item.
//
// Payment flow (server-owned; the client only names the drink and, at most, passes back the tx hash Xaman returned):
//   GET  /api/ember-bar                  → payment availability, price, treasury, network, drinks; with a sign-in token also the
//                                           wallet's open orders and paid-but-not-yet-collected orders (resume after reload).
//   POST /api/ember-bar/order {drink}    → an order bound to the signed-in wallet: exactly 1 XRP (1000000 drops), unique
//                                           DestinationTag + order-reference memo, and a Xaman payload for exactly that tx.
//   POST /api/ember-bar/claim {order, txHash?} → reads the tx from the ledger; settles only when the tx is validated, a Payment,
//                                           tesSUCCESS, Destination = treasury, DestinationTag = order tag, memo = order id,
//                                           sender = signed-in wallet, native XRP, no tfPartialPayment, and
//                                           meta.delivered_amount is exactly 1000000 drops. The tx hash is unique forever (SQLite).
//   POST /api/ember-bar/collect {order}  → the client reports the drink was served. Returns celebrate:true exactly once per paid
//                                           order, so polling, refreshes and double taps never replay the hops or charge again.
// Gate: on by default (owner-approved); EMBER_BAR_PAYMENTS=0 turns paid checkout off (order/claim return 409). Collecting an
// already-paid drink keeps working with the flag off. Nothing in this module sends XRP or reads a wallet seed.
'use strict';
const crypto = require('crypto'), path = require('path'), C = require('./config');

const ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const PRICE_DROPS = 1000000;                         // fixed: 1 XRP. Not configurable from the client or env.
const DRINKS = Object.freeze({
  'cinder-tea': { name: 'Cinder Tea', note: 'Smoked black tea, clove, and a slow amber glow.', color: 0xc9762a },
  'ember-fizz': { name: 'Ember Fizz', note: 'A bright citrus sparkle with a warm red finish.', color: 0xff5a2a },
  'blackglass-tonic': { name: 'Blackglass Tonic', note: 'Dark berry, cool mint, and a shimmer like volcanic glass.', color: 0x2a1a3a }
});
const ORDER_TTL_MS = 24 * 3600e3, XAMAN_EXPIRE_MIN = 10, REUSE_MS = 9 * 60e3, MAX_ORDERS_PER_HOUR = 12;

function config(env = process.env) {
  const treasury = ADDR.test(C.TREASURY || '') ? C.TREASURY : '';
  const enabled = env.EMBER_BAR_PAYMENTS !== '0';
  const xaman = !!C.XUMM_KEY || !!module.exports._sdk;
  return { enabled, treasury, xaman, available: enabled && !!treasury && xaman, wss: env.EMBER_BAR_XRPL_WSS || C.XRPL_WSS, network: env.EMBER_BAR_XRPL_NETWORK || C.NETWORK };
}

let db = null;
function DB() {
  if (db) return db;
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(C.DATA_DIR, 'ember-bar.db'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS eb_orders(id TEXT PRIMARY KEY, acct TEXT NOT NULL, drink TEXT NOT NULL, drops INTEGER NOT NULL CHECK(drops = 1000000),
  tag INTEGER NOT NULL UNIQUE CHECK(tag BETWEEN 1 AND 4294967295), destination TEXT NOT NULL, network TEXT NOT NULL, uuid TEXT, xaman TEXT,
  created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','declined','expired')), hash TEXT UNIQUE, paid INTEGER, collected INTEGER);
CREATE TABLE IF NOT EXISTS eb_used_tx(hash TEXT PRIMARY KEY, ord TEXT NOT NULL UNIQUE, acct TEXT NOT NULL, drops INTEGER NOT NULL, t INTEGER NOT NULL);`);
  return db;
}
const hex = s => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const unhex = s => { try { return Buffer.from(String(s || ''), 'hex').toString('utf8'); } catch { return ''; } };

let client = null;
async function ledger(cfg) {
  if (module.exports._ledger) return module.exports._ledger(cfg);
  const xrpl = require('xrpl');
  if (client && client.isConnected() && client.url === cfg.wss) return client;
  try { if (client) await client.disconnect(); } catch {}
  client = new xrpl.Client(cfg.wss); await client.connect(); return client;
}
function sdk() {
  if (module.exports._sdk) return module.exports._sdk();
  if (!C.XUMM_KEY) return null;
  const { XummSdk } = require('xumm-sdk'); return new XummSdk(C.XUMM_KEY, C.XUMM_SECRET);
}

function newTag() { for (let i = 0; i < 20; i++) { const t = crypto.randomInt(100000, 4294967295); if (!DB().prepare('SELECT 1 FROM eb_orders WHERE tag=?').get(t)) return t; } throw new Error('tag_exhausted'); }
const publicOrder = r => ({ id: r.id, drink: r.drink, drinkName: DRINKS[r.drink]?.name || r.drink, drops: r.drops, xrp: r.drops / 1e6, destination: r.destination, destinationTag: r.tag,
  memo: r.id, memoType: 'burncity/ember-bar', network: r.network, created: r.created, expiresAt: r.created + ORDER_TTL_MS, status: r.status, hash: r.hash || null, paid: r.paid || null, collected: !!r.collected,
  xaman: r.xaman && r.status === 'open' ? JSON.parse(r.xaman) : null });

function status(acct, { cfg = config(), now = Date.now() } = {}) {
  const out = { payments: cfg.available, enabled: cfg.enabled, network: cfg.network, treasury: cfg.treasury || null, recipient: 'BURN City treasury', price: { drops: PRICE_DROPS, xrp: PRICE_DROPS / 1e6 },
    drinks: Object.entries(DRINKS).map(([id, d]) => ({ id, name: d.name, note: d.note })) };
  if (acct) {
    const d = DB();
    out.pending = d.prepare("SELECT * FROM eb_orders WHERE acct=? AND status='open' AND created>? ORDER BY created DESC LIMIT 3").all(acct, now - ORDER_TTL_MS).map(publicOrder);
    out.uncollected = d.prepare("SELECT * FROM eb_orders WHERE acct=? AND status='paid' AND collected IS NULL ORDER BY paid").all(acct).map(publicOrder);
  }
  return out;
}

async function createOrder(acct, drink, { now = Date.now(), cfg = config() } = {}) {
  if (!cfg.enabled) return { status: 409, body: { error: 'payments_disabled' } };
  if (!cfg.available) return { status: 503, body: { error: 'payments_unavailable' } };
  if (!Object.hasOwn(DRINKS, drink)) return { status: 400, body: { error: 'unknown_drink' } };
  const d = DB();
  const open = d.prepare("SELECT * FROM eb_orders WHERE acct=? AND drink=? AND status='open' AND created>? AND destination=? AND network=? AND xaman IS NOT NULL ORDER BY created DESC LIMIT 1").get(acct, drink, now - REUSE_MS, cfg.treasury, cfg.network);
  if (open) return { status: 200, body: { order: publicOrder(open), reused: true } };   // a double tap makes one order
  if (d.prepare('SELECT COUNT(*) n FROM eb_orders WHERE acct=? AND created>?').get(acct, now - 3600e3).n >= MAX_ORDERS_PER_HOUR) return { status: 429, body: { error: 'too_many_orders' } };
  const x = sdk(); if (!x) return { status: 503, body: { error: 'payments_unavailable' } };
  const id = 'EB' + crypto.randomBytes(12).toString('hex').toUpperCase(), tag = newTag();
  const txjson = { TransactionType: 'Payment', Account: acct, Destination: cfg.treasury, DestinationTag: tag, Amount: String(PRICE_DROPS), Memos: [{ Memo: { MemoType: hex('burncity/ember-bar'), MemoData: hex(id) } }] };
  const options = { submit: true, expire: XAMAN_EXPIRE_MIN, ...(cfg.network === 'testnet' ? { force_network: 'TESTNET' } : {}) };
  let p;
  try { p = await x.payload.create({ txjson, options, custom_meta: { identifier: id, instruction: `Ember Bar · ${DRINKS[drink].name} · 1 XRP to the BURN City treasury. Cosmetic purchase; the network fee is shown separately.` } }); }
  catch (e) { console.error('[ember-bar] xaman payload failed', e?.message); return { status: 502, body: { error: 'xaman_unavailable' } }; }
  const xaman = { uuid: p.uuid, qr: p.refs?.qr_png || null, deeplink: p.next?.always || null };
  d.prepare('INSERT INTO eb_orders(id,acct,drink,drops,tag,destination,network,uuid,xaman,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, acct, drink, PRICE_DROPS, tag, cfg.treasury, cfg.network, p.uuid, JSON.stringify(xaman), now);
  return { status: 200, body: { order: publicOrder(d.prepare('SELECT * FROM eb_orders WHERE id=?').get(id)) } };
}

const fail = (reason, status = 402) => ({ ok: false, status, reason });
// Pure ledger check of one tx result against one order row. Exported for tests.
function checkTx(r, ord, hash) {
  if (!r || typeof r !== 'object') return fail('tx_not_found', 404);
  const tx = r.tx_json || r.tx || r, meta = r.meta || r.metaData;
  if (r.validated !== true) return fail('not_validated_yet', 202);
  const rh = String(r.hash || tx.hash || '').toUpperCase();
  if (rh !== hash) return fail('hash_mismatch');
  if (tx.TransactionType !== 'Payment') return fail('not_payment');
  if (!meta || typeof meta !== 'object' || meta.TransactionResult !== 'tesSUCCESS') return fail('tx_failed');
  if (tx.Destination !== ord.destination) return fail('wrong_destination');
  if (tx.DestinationTag !== ord.tag) return fail('wrong_destination_tag');
  if (!(Array.isArray(tx.Memos) && tx.Memos.some(m => unhex(m?.Memo?.MemoData) === ord.id))) return fail('memo_mismatch');
  if (tx.Account !== ord.acct) return fail('wrong_sender');
  if ((Number(tx.Flags) & 0x00020000) !== 0) return fail('partial_payment');                 // tfPartialPayment
  const sent = tx.DeliverMax ?? tx.Amount, delivered = meta.delivered_amount ?? meta.DeliveredAmount;
  if (typeof sent !== 'string' || typeof delivered !== 'string' || !/^\d{1,20}$/.test(sent) || !/^\d{1,20}$/.test(delivered)) return fail('wrong_currency');   // native XRP only
  if (BigInt(delivered) !== BigInt(ord.drops) || BigInt(sent) !== BigInt(ord.drops)) return fail('wrong_amount');   // exactly 1 XRP
  return { ok: true, drops: Number(BigInt(delivered)) };
}

async function claim(acct, orderId, txHash, { now = Date.now(), cfg = config() } = {}) {
  if (typeof orderId !== 'string' || !/^EB[0-9A-F]{24}$/.test(orderId)) return { status: 400, body: { error: 'unknown_order' } };
  const d = DB();
  let ord = d.prepare('SELECT * FROM eb_orders WHERE id=?').get(orderId);
  if (!ord || ord.acct !== acct) return { status: 404, body: { error: 'unknown_order' } };
  if (ord.status === 'paid') return { status: 200, body: { paid: true, already: true, order: publicOrder(ord) } };   // retries return the same receipt
  if (!cfg.enabled) return { status: 409, body: { error: 'payments_disabled' } };
  if (ord.status !== 'open') return { status: 410, body: { error: 'order_' + ord.status, order: publicOrder(ord) } };
  if (now - ord.created > ORDER_TTL_MS) { d.prepare("UPDATE eb_orders SET status='expired' WHERE id=? AND status='open'").run(ord.id); return { status: 410, body: { error: 'order_expired' } }; }
  if (txHash != null && typeof txHash !== 'string') return { status: 400, body: { error: 'no_tx' } };
  if (!txHash && ord.uuid) {
    let p = null; try { p = await sdk()?.payload.get(ord.uuid); } catch {}
    if (p?.meta?.signed) txHash = p.response?.txid || '';
    else if (p?.meta && (p.meta.cancelled || (p.meta.resolved && p.meta.signed === false))) { d.prepare("UPDATE eb_orders SET status='declined' WHERE id=? AND status='open'").run(ord.id); return { status: 410, body: { error: 'order_declined' } }; }
    else if (p?.meta?.expired) { d.prepare("UPDATE eb_orders SET status='expired' WHERE id=? AND status='open'").run(ord.id); return { status: 410, body: { error: 'order_expired' } }; }
  }
  if (!txHash) return { status: 202, body: { pending: true, reason: 'not_signed_yet' } };
  if (!/^[0-9A-F]{64}$/i.test(txHash)) return { status: 400, body: { error: 'no_tx' } };
  const hash = txHash.toUpperCase();
  const prior = d.prepare('SELECT ord FROM eb_used_tx WHERE hash=?').get(hash);
  if (prior && prior.ord !== ord.id) return { status: 409, body: { error: 'replay' } };
  let r;
  try { r = (await (await ledger(cfg)).request({ command: 'tx', transaction: hash })).result; }
  catch (e) { const nf = e?.data?.error === 'txnNotFound' || /not found/i.test(e?.message || ''); return { status: nf ? 202 : 503, body: nf ? { pending: true, reason: 'tx_not_found' } : { error: 'ledger_unavailable' } }; }
  const chk = checkTx(r, ord, hash);
  if (!chk.ok) return { status: chk.status, body: chk.status === 202 ? { pending: true, reason: chk.reason } : { error: chk.reason } };
  // Atomic settlement: nothing awaits between the re-read and the writes.
  let result;
  d.exec('BEGIN IMMEDIATE');
  try {
    ord = d.prepare('SELECT * FROM eb_orders WHERE id=?').get(orderId);
    if (ord.status === 'paid') result = ord.hash === hash ? { status: 200, body: { paid: true, already: true } } : { status: 409, body: { error: 'order_already_paid' } };
    else if (d.prepare('INSERT OR IGNORE INTO eb_used_tx(hash,ord,acct,drops,t) VALUES(?,?,?,?,?)').run(hash, ord.id, acct, chk.drops, now).changes !== 1) result = { status: 409, body: { error: 'replay' } };
    else { d.prepare("UPDATE eb_orders SET status='paid', hash=?, paid=? WHERE id=? AND status IN ('open','expired','declined')").run(hash, now, ord.id); result = { status: 200, body: { paid: true } }; }
    d.exec('COMMIT');
  } catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }
  if (result.status === 200) { result.body.order = publicOrder(d.prepare('SELECT * FROM eb_orders WHERE id=?').get(orderId)); if (!result.body.already) console.log('[ember-bar] paid', ord.drink, acct, hash); }
  return result;
}

// The client served the drink. celebrate:true only the first time, so the two hops play once per paid order.
function collect(acct, orderId, { now = Date.now() } = {}) {
  if (typeof orderId !== 'string' || !/^EB[0-9A-F]{24}$/.test(orderId)) return { status: 400, body: { error: 'unknown_order' } };
  const d = DB(), ord = d.prepare('SELECT * FROM eb_orders WHERE id=?').get(orderId);
  if (!ord || ord.acct !== acct) return { status: 404, body: { error: 'unknown_order' } };
  if (ord.status !== 'paid') return { status: 409, body: { error: 'not_paid' } };
  const first = d.prepare('UPDATE eb_orders SET collected=? WHERE id=? AND collected IS NULL').run(now, orderId).changes === 1;
  return { status: 200, body: { celebrate: first, order: publicOrder(d.prepare('SELECT * FROM eb_orders WHERE id=?').get(orderId)) } };
}

async function handle(req, res, url, { json, gate, ip, body, who }) {
  if (url.pathname !== '/api/ember-bar' && !url.pathname.startsWith('/api/ember-bar/')) return false;
  const u = who();
  if (url.pathname === '/api/ember-bar' && req.method === 'GET') {
    if (gate('ember-ip:' + ip, 60, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
    try { json(res, 200, status(u?.acct || null)); } catch (e) { console.error('[ember-bar]', e?.message); json(res, 500, { error: 'ember_bar_error' }); }
    return true;
  }
  if (!u) { json(res, 401, { error: 'sign_in_with_xaman' }); return true; }
  if (gate('ember:' + u.acct, 40, 60e3) || gate('ember-ip:' + ip, 80, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
  try {
    if (req.method !== 'POST') { json(res, 404, { error: 'not_found' }); return true; }
    const b = await body();
    let r;
    if (url.pathname === '/api/ember-bar/order') r = await createOrder(u.acct, typeof b?.drink === 'string' ? b.drink : '');   // only `drink` is read
    else if (url.pathname === '/api/ember-bar/claim') r = await claim(u.acct, b?.order, b?.txHash ?? null);
    else if (url.pathname === '/api/ember-bar/collect') r = collect(u.acct, b?.order);
    else r = { status: 404, body: { error: 'not_found' } };
    json(res, r.status, r.body); return true;
  } catch (e) { console.error('[ember-bar]', e?.message); json(res, 500, { error: 'ember_bar_error' }); return true; }
}

// Restart / page closed mid-checkout: settle signed Xaman payloads server-side so the drink waits at the bar (idempotent).
async function sweep({ now = Date.now() } = {}) {
  const cfg = config(); if (!cfg.enabled) return 0; let n = 0;
  for (const o of DB().prepare("SELECT id, acct FROM eb_orders WHERE status='open' AND uuid IS NOT NULL AND created>?").all(now - ORDER_TTL_MS)) {
    try { const r = await claim(o.acct, o.id, null, { now, cfg }); if (r.body?.paid) n++; } catch {}
  }
  return n;
}

module.exports = { DRINKS, PRICE_DROPS, ORDER_TTL_MS, config, status, createOrder, claim, collect, checkTx, handle, sweep, _ledger: null, _sdk: null, _db: () => DB() };
