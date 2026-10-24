// Jetpacks: the city jetpack (infinite fuel, server/city.js JETSET + purchases here) and the Homefront
// jetpack (yard flight with fuel, an RPG `back` item), sold for real XRP.
//
// Payment flow (everything server-side; the client never supplies an amount, destination or tag):
//   POST /api/jetpack/invoice {kind}  → a fresh invoice: server price in drops, unique DestinationTag + memo,
//                                        and (when XAMAN keys are set) a Xaman payload for exactly that tx.
//   POST /api/jetpack/claim {invoice, txHash?} → the server reads the tx from the ledger and grants only if:
//        validated, Payment, tesSUCCESS, Destination = treasury, DestinationTag = invoice tag, invoice memo,
//        sender = the signed-in account, XRP only (string delivered_amount, no IOU), no tfPartialPayment,
//        delivered_amount in drops ≥ price, and the tx hash was never used before (persistent, SQLite).
//   The grant is one SQLite transaction (BEGIN IMMEDIATE), so concurrent/replayed claims grant once.
// Gate: JETPACK_PAYMENTS=1 turns purchases on. Off (default): invoice/claim return 409 payments_disabled.
// Exemptions (free) work regardless of the flag and are env/config (JETPACK_FREE_CITY, JETPACK_FREE_HOMEFRONT).
'use strict';
const crypto = require('crypto'), path = require('path'), C = require('./config');

const ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const DERRIK = 'rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA';            // Derrik (owner)
const TREASURY = 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';          // Derrik's treasury wallet (payments destination)
const GNASTY = 'rDtUEMFVDi3K7TUQAQLi6xxa1WCer84dcA';            // Gnasty
const BURN_DAD = 'rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST';          // BURN (Derrik's dad, personal wallet; exemption only, not a burn address)
// Defaults when the env lists are unset. BURN_DAD is ONLY an identity in the free-city list: it is never a
// burn address, treasury, payout or destination for any tokens or XRP. Nothing in this module sends anything.
const DEFAULT_FREE_CITY = [DERRIK, TREASURY, GNASTY, BURN_DAD];
const DEFAULT_FREE_HOMEFRONT = [DERRIK, TREASURY];                // Derrik only (his two wallets)
const KINDS = Object.freeze(['city', 'homefront']);
const INVOICE_TTL_MS = 24 * 3600e3, REUSE_MS = 9 * 60e3, MAX_OPEN_PER_HOUR = 6;

const addrList = (v, d) => (typeof v === 'string' && v.trim() ? v.split(',') : d).map(s => String(s).trim()).filter(s => ADDR.test(s));
const dropsOf = (v, d) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : d; };
function config(env = process.env) {
  const treasury = ADDR.test(env.JETPACK_TREASURY_ADDRESS || '') ? env.JETPACK_TREASURY_ADDRESS : TREASURY;
  return {
    enabled: env.JETPACK_PAYMENTS === '1',
    treasury,
    prices: { city: dropsOf(env.JETPACK_PRICE_CITY_DROPS, 5e6), homefront: dropsOf(env.JETPACK_PRICE_HOMEFRONT_DROPS, 30e6) },
    freeCity: new Set(addrList(env.JETPACK_FREE_CITY, DEFAULT_FREE_CITY)),
    freeHomefront: new Set(addrList(env.JETPACK_FREE_HOMEFRONT, DEFAULT_FREE_HOMEFRONT)),
    wss: env.JETPACK_XRPL_WSS || C.XRPL_WSS,
    network: env.JETPACK_XRPL_NETWORK || C.NETWORK
  };
}

let db = null;
function DB() {
  if (db) return db;
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(C.DATA_DIR, 'jetpack.db'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS jp_invoices(id TEXT PRIMARY KEY, acct TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('city','homefront')), drops INTEGER NOT NULL CHECK(drops > 0),
  tag INTEGER NOT NULL UNIQUE CHECK(tag BETWEEN 1 AND 4294967295), destination TEXT NOT NULL, uuid TEXT, xaman TEXT, created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid')), hash TEXT, paid INTEGER);
CREATE TABLE IF NOT EXISTS jp_used_tx(hash TEXT PRIMARY KEY, invoice TEXT NOT NULL, acct TEXT NOT NULL, drops INTEGER NOT NULL, t INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jp_grants(acct TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, hash TEXT, t INTEGER NOT NULL, PRIMARY KEY(acct, kind));`);
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

const isExempt = (acct, kind, cfg = config()) => !!acct && (kind === 'city' ? cfg.freeCity : cfg.freeHomefront).has(acct);
const granted = (acct, kind) => !!DB().prepare('SELECT 1 FROM jp_grants WHERE acct=? AND kind=?').get(acct, kind);
const owns = (acct, kind, cfg = config()) => isExempt(acct, kind, cfg) || granted(acct, kind);
// city.js hook: the city jetpack is on for JETSET (city.js) plus exemptions + paid grants here.
const ownsCity = acct => { try { return owns(acct, 'city'); } catch { return false; } };

// Keep the RPG sheet in step with ownership (idempotent; repairs a crash between the grant and the sheet write).
function syncRpgItem(acct, kind, store) {
  if (kind !== 'homefront') return;
  try {
    const Rpg = require('./homefront-rpg'), s = store || require('./homefront-store').shared;
    if (!Rpg.hasItem(s, acct, 'homefront_jetpack')) Rpg.grantItem(s, acct, 'homefront_jetpack', { note: 'jetpack' });
  } catch (e) { console.error('[jetpack] rpg sync failed', e?.message); }
}

function status(acct, cfg = config(), store) {
  const out = { payments: cfg.enabled, network: cfg.network, treasury: cfg.treasury, prices: {}, owned: {}, exempt: {} };
  for (const k of KINDS) {
    out.prices[k] = { drops: cfg.prices[k], xrp: cfg.prices[k] / 1e6 };
    out.exempt[k] = isExempt(acct, k, cfg); out.owned[k] = out.exempt[k] || granted(acct, k);
    if (out.owned[k]) syncRpgItem(acct, k, store);
  }
  return out;
}

function newTag() { for (let i = 0; i < 20; i++) { const t = crypto.randomInt(100000, 4294967295); if (!DB().prepare('SELECT 1 FROM jp_invoices WHERE tag=?').get(t)) return t; } throw new Error('tag_exhausted'); }
const publicInvoice = r => ({ id: r.id, kind: r.kind, drops: r.drops, xrp: r.drops / 1e6, destination: r.destination, destinationTag: r.tag, memo: r.id, memoType: 'burncity/jetpack', expiresAt: r.created + INVOICE_TTL_MS, status: r.status });

async function createInvoice(acct, kind, { now = Date.now(), cfg = config() } = {}) {
  if (!cfg.enabled) return { status: 409, body: { error: 'payments_disabled' } };
  if (!KINDS.includes(kind)) return { status: 400, body: { error: 'unknown_jetpack' } };
  if (owns(acct, kind, cfg)) return { status: 200, body: { owned: true, kind } };
  const d = DB();
  // Re-use a still-signable open invoice for the same account/kind (same price/destination), so a double tap makes one invoice.
  const open = d.prepare("SELECT * FROM jp_invoices WHERE acct=? AND kind=? AND status='open' AND created>? AND drops=? AND destination=? ORDER BY created DESC LIMIT 1").get(acct, kind, now - REUSE_MS, cfg.prices[kind], cfg.treasury);
  if (open) return { status: 200, body: { invoice: publicInvoice(open), xaman: open.xaman ? JSON.parse(open.xaman) : null, reused: true } };
  if (d.prepare('SELECT COUNT(*) n FROM jp_invoices WHERE acct=? AND created>?').get(acct, now - 3600e3).n >= MAX_OPEN_PER_HOUR) return { status: 429, body: { error: 'too_many_invoices' } };
  const id = 'JP' + crypto.randomBytes(12).toString('hex').toUpperCase(), tag = newTag(), drops = cfg.prices[kind];
  d.prepare('INSERT INTO jp_invoices(id,acct,kind,drops,tag,destination,created) VALUES(?,?,?,?,?,?,?)').run(id, acct, kind, drops, tag, cfg.treasury, now);
  let xaman = null;
  const x = sdk();
  if (x) {
    try {
      const txjson = { TransactionType: 'Payment', Account: acct, Destination: cfg.treasury, DestinationTag: tag, Amount: String(drops), Memos: [{ Memo: { MemoType: hex('burncity/jetpack'), MemoData: hex(id) } }] };
      const options = { submit: true, expire: 10, ...(cfg.network === 'testnet' ? { force_network: 'TESTNET' } : {}) };
      const p = await x.payload.create({ txjson, options, custom_meta: { identifier: id, instruction: `Burn City ${kind === 'city' ? 'city' : 'Homefront'} jetpack · ${drops / 1e6} XRP` } });
      xaman = { uuid: p.uuid, qr: p.refs?.qr_png || null, deeplink: p.next?.always || null };
      d.prepare('UPDATE jp_invoices SET uuid=?, xaman=? WHERE id=?').run(p.uuid, JSON.stringify(xaman), id);
    } catch (e) { console.error('[jetpack] xaman payload failed', e?.message); }
  }
  return { status: 200, body: { invoice: publicInvoice(d.prepare('SELECT * FROM jp_invoices WHERE id=?').get(id)), xaman } };
}

const fail = (reason, status = 402) => ({ ok: false, status, reason });
// Pure ledger check of one tx result against one invoice row. Exported for tests.
function checkTx(r, inv, hash) {
  if (!r || typeof r !== 'object') return fail('tx_not_found', 404);
  const tx = r.tx_json || r.tx || r, meta = r.meta || r.metaData;
  if (r.validated !== true) return fail('not_validated_yet', 202);
  const rh = String(r.hash || tx.hash || '').toUpperCase();
  if (rh !== hash) return fail('hash_mismatch');
  if (tx.TransactionType !== 'Payment') return fail('not_payment');
  if (!meta || typeof meta !== 'object' || meta.TransactionResult !== 'tesSUCCESS') return fail('tx_failed');
  if (tx.Destination !== inv.destination) return fail('wrong_destination');
  if (tx.DestinationTag !== inv.tag) return fail('wrong_destination_tag');
  if (!(Array.isArray(tx.Memos) && tx.Memos.some(m => unhex(m?.Memo?.MemoData) === inv.id))) return fail('memo_mismatch');
  if (tx.Account !== inv.acct) return fail('wrong_sender');
  if ((Number(tx.Flags) & 0x00020000) !== 0) return fail('partial_payment');               // tfPartialPayment
  const sent = tx.DeliverMax ?? tx.Amount, delivered = meta.delivered_amount ?? meta.DeliveredAmount;
  if (typeof sent !== 'string' || typeof delivered !== 'string' || !/^\d{1,20}$/.test(sent) || !/^\d{1,20}$/.test(delivered)) return fail('wrong_currency');   // XRP only, never an IOU
  if (BigInt(delivered) < BigInt(inv.drops)) return fail('underpaid');
  return { ok: true, drops: Number(BigInt(delivered)) };
}

async function claim(acct, invoiceId, txHash, { now = Date.now(), cfg = config(), store } = {}) {
  if (!cfg.enabled) return { status: 409, body: { error: 'payments_disabled' } };
  if (typeof invoiceId !== 'string' || !/^JP[0-9A-F]{24}$/.test(invoiceId)) return { status: 400, body: { error: 'unknown_invoice' } };
  const d = DB();
  let inv = d.prepare('SELECT * FROM jp_invoices WHERE id=?').get(invoiceId);
  if (!inv || inv.acct !== acct) return { status: 404, body: { error: 'unknown_invoice' } };
  if (inv.status === 'paid') { syncRpgItem(acct, inv.kind, store); return { status: 200, body: { granted: true, kind: inv.kind, already: true, hash: inv.hash } }; }
  if (now - inv.created > INVOICE_TTL_MS) return { status: 410, body: { error: 'invoice_expired' } };
  if (txHash != null && typeof txHash !== 'string') return { status: 400, body: { error: 'no_tx' } };
  if (!txHash && inv.uuid) { try { const p = await sdk()?.payload.get(inv.uuid); if (p?.meta?.signed) txHash = p.response?.txid || ''; } catch {} }
  if (!txHash) return { status: 202, body: { pending: true, reason: 'not_signed_yet' } };
  if (!/^[0-9A-F]{64}$/i.test(txHash)) return { status: 400, body: { error: 'no_tx' } };
  const hash = txHash.toUpperCase();
  const prior = d.prepare('SELECT invoice FROM jp_used_tx WHERE hash=?').get(hash);
  if (prior && prior.invoice !== inv.id) return { status: 409, body: { error: 'replay' } };
  let r;
  try { r = (await (await ledger(cfg)).request({ command: 'tx', transaction: hash })).result; }
  catch (e) { return { status: 404, body: { error: e?.data?.error === 'txnNotFound' || /not found/i.test(e?.message || '') ? 'tx_not_found' : 'ledger_unavailable' } }; }
  const chk = checkTx(r, inv, hash);
  if (!chk.ok) return { status: chk.status, body: chk.status === 202 ? { pending: true, reason: chk.reason } : { error: chk.reason } };
  // Atomic grant: one transaction; nothing awaits between the checks and the writes.
  let result;
  d.exec('BEGIN IMMEDIATE');
  try {
    inv = d.prepare('SELECT * FROM jp_invoices WHERE id=?').get(invoiceId);
    if (inv.status === 'paid') result = inv.hash === hash ? { status: 200, body: { granted: true, kind: inv.kind, already: true, hash } } : { status: 409, body: { error: 'invoice_already_paid' } };
    else if (d.prepare('INSERT OR IGNORE INTO jp_used_tx(hash,invoice,acct,drops,t) VALUES(?,?,?,?,?)').run(hash, inv.id, acct, chk.drops, now).changes !== 1) result = { status: 409, body: { error: 'replay' } };
    else {
      d.prepare('INSERT OR IGNORE INTO jp_grants(acct,kind,source,hash,t) VALUES(?,?,?,?,?)').run(acct, inv.kind, 'xrp', hash, now);
      d.prepare("UPDATE jp_invoices SET status='paid', hash=?, paid=? WHERE id=? AND status='open'").run(hash, now, inv.id);
      result = { status: 200, body: { granted: true, kind: inv.kind, hash } };
    }
    d.exec('COMMIT');
  } catch (e) { try { d.exec('ROLLBACK'); } catch {} throw e; }
  if (result.status === 200) { syncRpgItem(acct, inv.kind, store); if (!result.body.already) console.log('[jetpack] granted', inv.kind, acct, hash); }
  return result;
}

// HTTP routes (server.js): /api/jetpack, /api/jetpack/invoice, /api/jetpack/claim. Bearer auth first (401).
async function handle(req, res, url, { json, gate, ip, body, who, store }) {
  if (url.pathname !== '/api/jetpack' && !url.pathname.startsWith('/api/jetpack/')) return false;
  const u = who();
  if (!u) { json(res, 401, { error: 'sign_in_with_xaman' }); return true; }
  if (gate('jetpack:' + u.acct, 30, 60e3) || gate('jetpack-ip:' + ip, 60, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
  try {
    if (url.pathname === '/api/jetpack' && req.method === 'GET') { json(res, 200, status(u.acct, config(), store)); return true; }
    if (url.pathname === '/api/jetpack/invoice' && req.method === 'POST') {
      const cfg = config(); if (!cfg.enabled) { json(res, 409, { error: 'payments_disabled' }); return true; }
      const b = await body(); const kind = b && typeof b.kind === 'string' ? b.kind : '';       // only `kind` is read
      const r = await createInvoice(u.acct, kind, { cfg }); json(res, r.status, r.body); return true;
    }
    if (url.pathname === '/api/jetpack/claim' && req.method === 'POST') {
      const cfg = config(); if (!cfg.enabled) { json(res, 409, { error: 'payments_disabled' }); return true; }
      const b = await body();
      const r = await claim(u.acct, b?.invoice, b?.txHash ?? null, { cfg, store }); json(res, r.status, r.body); return true;
    }
    json(res, 404, { error: 'not_found' }); return true;
  } catch (e) { console.error('[jetpack]', e?.message); json(res, 500, { error: 'jetpack_error' }); return true; }
}

module.exports = { KINDS, config, status, owns, ownsCity, isExempt, createInvoice, claim, checkTx, handle, INVOICE_TTL_MS, _ledger: null, _sdk: null, _db: () => DB() };
