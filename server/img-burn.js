// Jetpack IMG buy-and-burn: JETPACK_IMG_BURN_BPS (default 322 = 3.22%) of every verified jetpack sale is owed to a
// batched buy-and-burn of IMG. The treasury buys IMG through the IMG/XRP AMM and delivers it to the IMG issuer in ONE
// cross-currency Payment (tokens delivered to their issuer are destroyed) — the same tx shape as the BURN job
// (server/burn.js quoteToken/burnTx, reused). The other 96.78% simply stays in the treasury (no deposit here).
//
// Ledger (SQLite, the jetpack DB): jp_img_sales = one row per verified sale (copied idempotently from jp_used_tx,
// keyed by tx hash), jp_img_batches = every batch with status building → submitted → done | failed | held.
// Owed (BigInt drops) = floor(Σ sale drops × bps / 10000) − Σ batch drops not failed. Cumulative floor, so rounding
// never loses more than 1 drop in total and a sale can never be counted twice.
// A batch is `done` only after its tx is validated tesSUCCESS on the ledger with IMG delivered to the IMG issuer.
// The signed blob + hash are stored BEFORE submit, so a restart resolves the same tx (never re-signs a new one
// while one is in flight). Gate: JETPACK_TREASURY_AUTO=1 (off: nothing is sent; sales still accrue as owed).
'use strict';
const C = require('./config'), Burn = require('./burn'), Guard = require('./guard'), Jet = require('./jetpack');

const ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const BURN_DAD = 'rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST';   // Derrik's dad's personal wallet: exemption only, NEVER a destination
const int = (v, d) => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : d; };

function config(env = process.env) {
  const jp = Jet.config(env);
  const slip = Number(env.JETPACK_IMG_MAX_SLIPPAGE);
  return {
    enabled: env.JETPACK_TREASURY_AUTO === '1',
    bps: BigInt(Math.min(int(env.JETPACK_IMG_BURN_BPS, 322), 10000)),
    minDrops: BigInt(Math.max(1, int(env.JETPACK_IMG_BURN_MIN_DROPS, 1e6))),        // batch once ≥ 1 XRP is owed
    maxDrops: BigInt(Math.max(1, int(env.JETPACK_IMG_BURN_MAX_DROPS, 50e6))),       // cap per batch
    floorDrops: BigInt(int(env.JETPACK_IMG_RESERVE_FLOOR_DROPS, 10e6)),             // kept on top of account reserve + guard margin
    slippage: slip > 0 && slip < 0.5 ? slip : C.MAX_SLIPPAGE,
    intervalMs: Math.max(60e3, int(env.JETPACK_IMG_BURN_INTERVAL_MS, 3600e3)),
    token: { currency: Burn.curHex(env.JETPACK_IMG_CURRENCY || C.IMG_CURRENCY), issuer: env.JETPACK_IMG_ISSUER || C.IMG_ISSUER },
    treasury: jp.treasury, wss: jp.wss, network: jp.network,
    forbidden: new Set([BURN_DAD, jp.treasury, ...String(env.JETPACK_FORBIDDEN_DESTINATIONS || '').split(',').map(s => s.trim()).filter(Boolean)]),
  };
}

let ready = false;
function DB() {
  const d = Jet._db();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS jp_img_sales(hash TEXT PRIMARY KEY, drops INTEGER NOT NULL CHECK(drops > 0), t INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jp_img_batches(id INTEGER PRIMARY KEY AUTOINCREMENT, drops INTEGER NOT NULL CHECK(drops > 0),
  status TEXT NOT NULL CHECK(status IN ('building','submitted','done','failed','held')), hash TEXT UNIQUE, blob TEXT, last_ledger INTEGER,
  expected TEXT, delivered TEXT, result TEXT, note TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);`);
    ready = true;
  }
  return d;
}
const big = (d, sql, ...a) => { const s = d.prepare(sql); s.setReadBigInts(true); return s.get(...a); };
// Copy every verified jetpack sale (jp_used_tx is written only inside a successful claim) — idempotent per tx hash.
const sync = () => DB().prepare('INSERT OR IGNORE INTO jp_img_sales(hash,drops,t) SELECT hash,drops,t FROM jp_used_tx').run().changes;
function ledgerState(cfg = config()) {
  const d = DB();
  const sales = big(d, 'SELECT COALESCE(SUM(drops),0) s, COUNT(*) n FROM jp_img_sales');
  const committed = big(d, "SELECT COALESCE(SUM(drops),0) s FROM jp_img_batches WHERE status IN ('building','submitted','done','held')").s;
  const burned = big(d, "SELECT COALESCE(SUM(drops),0) s FROM jp_img_batches WHERE status='done'").s;
  const total = sales.s * cfg.bps / 10000n;
  return { salesDrops: sales.s, sales: Number(sales.n), totalOwed: total, committed, burned, owed: total - committed };
}

// Pure check of a looked-up tx against its batch. Exported for tests.
function verify(r, b, cfg) {
  if (!r || r.validated !== true) return { state: 'pending' };
  const tx = r.tx_json || r.tx || r, meta = r.meta || r.metaData || {};
  if (String(r.hash || tx.hash || '').toUpperCase() !== b.hash) return { state: 'pending' };
  if (meta.TransactionResult !== 'tesSUCCESS') return { state: 'failed', result: meta.TransactionResult || 'unknown' };
  const del = meta.delivered_amount ?? meta.DeliveredAmount;
  const ok = tx.TransactionType === 'Payment' && tx.Account === cfg.treasury && tx.Destination === cfg.token.issuer &&
    del && typeof del === 'object' && del.currency === cfg.token.currency && del.issuer === cfg.token.issuer && +del.value > 0;
  // tesSUCCESS but not the expected IMG delivery: XRP was spent, so never release it as owed again — hold for review.
  return ok ? { state: 'done', result: 'tesSUCCESS', delivered: JSON.stringify(del) } : { state: 'held', result: 'tesSUCCESS', note: 'unexpected_delivery' };
}

async function client(cfg) {
  if (module.exports._client) return module.exports._client(cfg);
  const xrpl = require('xrpl'); const c = new xrpl.Client(cfg.wss); await c.connect(); return c;
}
const wallet = () => { if (module.exports._wallet) return module.exports._wallet(); return C.TREASURY_SEED ? require('xrpl').Wallet.fromSeed(C.TREASURY_SEED) : null; };
const set = (id, f) => { const k = Object.keys(f); DB().prepare(`UPDATE jp_img_batches SET ${k.map(x => x + '=?').join(',')}, updated=? WHERE id=?`).run(...k.map(x => f[x]), Date.now(), id); };

// Resolve in-flight batches: done/failed/held from the validated ledger; resubmit the same blob while it can still land.
async function resolve(c, cfg) {
  const d = DB();
  for (const b of d.prepare("SELECT * FROM jp_img_batches WHERE status='building'").all()) set(b.id, { status: 'failed', note: 'never_submitted' });  // crash before sign+store: nothing was sent
  let open = 0;
  for (const b of d.prepare("SELECT * FROM jp_img_batches WHERE status='submitted' ORDER BY id").all()) {
    let r = null; try { r = (await c.request({ command: 'tx', transaction: b.hash })).result; } catch {}
    const v = verify(r, b, cfg);
    if (v.state !== 'pending') {
      set(b.id, { status: v.state, result: v.result || null, delivered: v.delivered || null, note: v.note || null });
      Guard.log('img_burn', { batch: b.id, hash: b.hash, result: v.result, status: v.state, drops: b.drops }); continue;
    }
    let cur = 0; try { cur = +(await c.request({ command: 'ledger', ledger_index: 'validated' })).result.ledger_index; } catch {}
    if (cur && b.last_ledger && cur > b.last_ledger && !(r && r.validated)) { set(b.id, { status: 'failed', note: 'expired' }); continue; }   // can never be included now
    try { await c.request({ command: 'submit', tx_blob: b.blob }); } catch {}   // same signed tx, same hash: harmless if already queued
    open++;
  }
  return open;
}

async function run({ cfg = config(), now = Date.now() } = {}) {
  if (!cfg.enabled) return { skipped: 'disabled' };
  sync();
  const tok = cfg.token;
  if (!ADDR.test(tok.issuer) || cfg.forbidden.has(tok.issuer)) return { blocked: 'forbidden_destination' };
  const w = wallet();
  if (!w) return { blocked: 'no_signing_key' };
  if (w.classicAddress !== cfg.treasury) return { blocked: 'seed_not_treasury' };
  const c = await client(cfg);
  try {
    if (await resolve(c, cfg)) return { pending: 'batch_in_flight', ...pub(ledgerState(cfg)) };
    const st = ledgerState(cfg);
    if (st.owed < cfg.minDrops) return { skipped: 'below_threshold', ...pub(st) };
    if (Guard.paused()) return { blocked: 'payouts_paused', ...pub(st) };
    const drops = st.owed < cfg.maxDrops ? st.owed : cfg.maxDrops;
    const q = await Burn.quoteToken(c, Number(drops), tok);
    const a2 = q.pool.asset2 || {};
    if (a2.currency !== tok.currency || a2.issuer !== tok.issuer) return { blocked: 'wrong_pool_asset' };
    if (!(q.out > 0) || !Number.isFinite(q.out)) return { blocked: 'bad_quote' };
    const bad = await Guard.check(c, w.classicAddress, Number(drops + cfg.floorDrops + 1000n));    // reserve + owner reserve + margin + floor + fee
    if (bad) return { blocked: bad, ...pub(st) };
    const tx = await Burn.burnTx(c, w.classicAddress, tok, drops.toString(), q.out, 'burncity/imgburn', `jetpack IMG burn ${drops} drops`, cfg.slippage);
    if (tx.Destination !== tok.issuer || cfg.forbidden.has(tx.Destination) || tx.SendMax !== drops.toString() || tx.Account !== cfg.treasury ||
        tx.Amount.currency !== tok.currency || tx.Amount.issuer !== tok.issuer || tx.DeliverMin.issuer !== tok.issuer) return { blocked: 'tx_sanity' };
    if (C.DRY_RUN) return { dryRun: true, wouldSubmit: tx, expected: q.out, ...pub(st) };
    const id = Number(DB().prepare("INSERT INTO jp_img_batches(drops,status,expected,created,updated) VALUES(?,?,?,?,?)").run(drops, 'building', String(q.out), now, now).lastInsertRowid);
    const signed = w.sign(tx);
    set(id, { status: 'submitted', hash: signed.hash.toUpperCase(), blob: signed.tx_blob, last_ledger: tx.LastLedgerSequence || null });   // stored before submit
    Guard.log('img_burn_submit', { batch: id, hash: signed.hash, drops: drops.toString(), expectedImg: q.out, deliverMin: tx.DeliverMin.value });
    try { await c.submitAndWait(signed.tx_blob); } catch (e) { console.error('[img-burn] submit', e?.message); }
    await resolve(c, cfg);
    const b = DB().prepare('SELECT id,status,hash,result,delivered FROM jp_img_batches WHERE id=?').get(id);
    return { batch: b, ...pub(ledgerState(cfg)) };
  } finally { try { await c.disconnect(); } catch {} }
}
const pub = st => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]));
function publicLog(cfg = config()) {
  sync();
  const batches = DB().prepare('SELECT id,drops,status,hash,result,delivered,expected,created,updated,note FROM jp_img_batches ORDER BY id DESC LIMIT 50').all();
  return { enabled: cfg.enabled, dryRun: C.DRY_RUN, bps: Number(cfg.bps), token: cfg.token, ...pub(ledgerState(cfg)), batches };
}
let timer = null;
function start(cfg = config()) {
  if (!cfg.enabled || timer) return false;
  const tick = () => run().then(r => { if (!r.skipped) console.log('[img-burn]', JSON.stringify(r)); }, e => console.error('[img-burn]', e?.message));
  setTimeout(tick, 90e3).unref?.(); timer = setInterval(tick, cfg.intervalMs); timer.unref?.(); return true;
}
module.exports = { config, run, sync, ledgerState, verify, publicLog, start, BURN_DAD, _client: null, _wallet: null };
