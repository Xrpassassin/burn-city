// Mocked tests for server/img-burn.js (jetpack 3.22% IMG buy-and-burn). No network.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'imgburn-'));
const xrpl = require('xrpl');
const W = xrpl.Wallet.generate(), BUYER = xrpl.Wallet.generate().classicAddress;
const IMG_ISSUER = 'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd', DAD = 'rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST';
Object.assign(process.env, { DATA_DIR: DATA, DRY_RUN: 'false', JETPACK_PAYMENTS: '1', JETPACK_TREASURY_ADDRESS: W.classicAddress, JETPACK_TREASURY_AUTO: '1', RESERVE_MARGIN_DROPS: '500000' });
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };

// ---- mock XRPL ----
const L = { seq: 6, ledger: 1000, txs: {}, balance: 200e6, owner: 2, pool: { currency: 'IMG', issuer: IMG_ISSUER }, onSubmit: 'success', submitThrows: false, submitted: [] };
function hashOf(blob) { return xrpl.hashes.hashSignedTx(blob).toUpperCase(); }
function land(blob) {
  const tx = xrpl.decode(blob), h = hashOf(blob);
  if (L.txs[h]) return;
  const out = L.onSubmit;
  const res = out === 'success' ? 'tesSUCCESS' : out === 'slip' ? 'tecPATH_PARTIAL' : 'tesSUCCESS';
  const del = out === 'success' ? { currency: tx.DeliverMin.currency, issuer: tx.DeliverMin.issuer, value: String(+tx.DeliverMin.value * 1.01) }
    : out === 'wrongiss' ? { currency: 'IMG', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', value: '5' } : undefined;
  L.txs[h] = { hash: h, validated: true, tx_json: tx, meta: { TransactionResult: res, ...(del ? { delivered_amount: del } : {}) } };
  if (res === 'tesSUCCESS') L.balance -= +tx.SendMax + 12;
}
const mock = () => ({
  async request(q) {
    if (q.command === 'amm_info') return { result: { amm: { account: 'rAMM', amount: '454002255', amount2: { ...L.pool, value: '322966.9228695012' }, trading_fee: 1000 } } };
    if (q.command === 'account_info') return { result: { account_data: { Balance: String(L.balance), OwnerCount: L.owner } } };
    if (q.command === 'server_state') return { result: { state: { validated_ledger: { reserve_base: 1000000, reserve_inc: 200000 } } } };
    if (q.command === 'ledger') return { result: { ledger_index: L.ledger } };
    if (q.command === 'tx') { const t = L.txs[q.transaction]; if (!t) { const e = new Error('txnNotFound'); e.data = { error: 'txnNotFound' }; throw e; } return { result: t }; }
    if (q.command === 'submit') { L.submitted.push(q.tx_blob); if (!L.submitThrows) land(q.tx_blob); return { result: { engine_result: 'tesSUCCESS' } }; }
    throw new Error('unexpected ' + q.command);
  },
  async autofill(tx) { return { ...tx, Sequence: ++L.seq, Fee: '12', LastLedgerSequence: L.ledger + 20 }; },
  async submitAndWait(blob) { L.submitted.push(blob); if (L.submitThrows) throw new Error('socket closed'); land(blob); return { result: L.txs[hashOf(blob)] }; },
  async disconnect() {},
});
function fresh() {   // "restart": drop module caches (in-memory state), keep DATA_DIR
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}server${path.sep}`)) delete require.cache[k];
  const Jet = require('../server/jetpack'), IB = require('../server/img-burn');
  IB._client = async () => mock(); IB._wallet = () => W; return { Jet, IB };
}
const BURN_OWED = path.join(DATA, 'burn_owed.json');
fs.writeFileSync(BURN_OWED, JSON.stringify({ drops: 777 }));

// verified sales through the real claim path (mocked ledger)
async function sale(Jet, kind, deliver) {
  const cfg = Jet.config();
  const inv = (await Jet.createInvoice(BUYER, kind, { cfg })).body.invoice;
  const hash = require('crypto').randomBytes(32).toString('hex').toUpperCase();
  Jet._ledger = async () => ({ request: async () => ({ result: { hash, validated: true, tx_json: { TransactionType: 'Payment', Account: BUYER, Destination: inv.destination, DestinationTag: inv.destinationTag, Amount: String(deliver), Flags: 0, Memos: [{ Memo: { MemoData: Buffer.from(inv.id).toString('hex') } }] }, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: String(deliver) } } }) });
  return (await Jet.claim(BUYER, inv.id, hash, { cfg })).body;
}

(async () => {
  let { Jet, IB } = fresh();
  // flag off → nothing
  ok((await IB.run({ cfg: IB.config({ ...process.env, JETPACK_TREASURY_AUTO: '' }) })).skipped === 'disabled', 'flag off skips');
  // underpay: claim rejected → never owed
  const under = await sale(Jet, 'city', 4999999);
  ok(under.error === 'underpaid', 'underpaid claim rejected'); IB.sync();
  ok(IB.ledgerState().owed === 0n, 'underpaid sale accrues nothing');
  // one 5 XRP city sale: 3.22% = 161000 drops (BigInt, exact) → below 1 XRP threshold
  ok((await sale(Jet, 'city', 5000000)).granted, 'city sale granted');
  let r = await IB.run(); ok(r.skipped === 'below_threshold' && r.owed === '161000', 'owed 161000, below threshold: ' + JSON.stringify(r));
  // idempotent accrual: syncing again never double counts
  IB.sync(); IB.sync(); ok(IB.ledgerState().owed === 161000n && IB.ledgerState().sales === 1, 'sync idempotent');
  // rounding: 30 000 007 drops (overpay) → floor((5e6+30000007)*322/1e4) = 1127000 (cumulative floor)
  ok((await sale(Jet, 'homefront', 30000007)).granted, 'homefront sale granted');
  IB.sync(); ok(IB.ledgerState().owed === (35000007n * 322n) / 10000n && IB.ledgerState().owed === 1127000n, 'cumulative BigInt floor');

  // reserve floor: balance too low → blocked, no batch
  L.balance = 1e6 + 2 * 200000 + 500000 + 10e6 + 1127000 - 1; // 1 drop short of reserve+owner+margin+floor+batch+fee cushion
  r = await IB.run(); ok(/would_break_reserve/.test(r.blocked || ''), 'reserve floor blocks: ' + JSON.stringify(r));
  ok(Jet._db().prepare('SELECT COUNT(*) n FROM jp_img_batches').get().n === 0, 'no batch row on reserve block');
  L.balance = 200e6;

  // forbidden destinations / bad issuer
  for (const iss of [DAD, W.classicAddress]) { r = await IB.run({ cfg: IB.config({ ...process.env, JETPACK_IMG_ISSUER: iss }) }); ok(r.blocked === 'forbidden_destination', 'forbidden ' + iss); }
  r = await IB.run({ cfg: IB.config({ ...process.env, JETPACK_FORBIDDEN_DESTINATIONS: IMG_ISSUER }) }); ok(r.blocked === 'forbidden_destination', 'env forbidden list');
  // wrong-currency issuer in the AMM → blocked
  L.pool = { currency: 'IMG', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq' }; r = await IB.run(); ok(r.blocked === 'wrong_pool_asset', 'wrong pool issuer blocked');
  L.pool = { currency: 'USD', issuer: IMG_ISSUER }; r = await IB.run(); ok(r.blocked === 'wrong_pool_asset', 'wrong pool currency blocked');
  L.pool = { currency: 'IMG', issuer: IMG_ISSUER };

  // slippage: ledger returns tecPATH_PARTIAL (DeliverMin not met) → failed, owed released; DeliverMin = quote × (1 − 3%)
  L.onSubmit = 'slip'; r = await IB.run();
  ok(r.batch.status === 'failed' && r.batch.result === 'tecPATH_PARTIAL' && r.owed === '1127000', 'slippage → failed + released: ' + JSON.stringify(r));
  const t0 = xrpl.decode(L.submitted.at(-1)), q = await require('../server/burn').quoteToken(mock(), 1127000, { currency: 'IMG', issuer: IMG_ISSUER });
  ok(t0.Destination === IMG_ISSUER && t0.SendMax === '1127000' && Math.abs(+t0.DeliverMin.value - q.out * 0.97) < 1e-6 && t0.DeliverMin.issuer === IMG_ISSUER && t0.Flags & 0x00020000, 'tx shape: issuer dest, exact SendMax, DeliverMin slippage');
  ok(t0.Destination !== DAD, 'never the dad wallet');

  // wrong currency delivered with tesSUCCESS → held (not done, not re-owed)
  L.onSubmit = 'wrongiss'; r = await IB.run(); ok(r.batch.status === 'held' && r.owed === '0', 'unexpected delivery held, not released');
  Jet._db().prepare("UPDATE jp_img_batches SET status='failed' WHERE status='held'").run();   // (manual review would do this)

  // restart mid-batch: submit dies after the blob is stored → stays submitted; restart resolves the SAME tx, no second batch
  L.onSubmit = 'success'; L.submitThrows = true; r = await IB.run();
  ok(r.pending === 'batch_in_flight' || (r.batch && r.batch.status === 'submitted'), 'in flight after crash: ' + JSON.stringify(r));
  const inflight = Jet._db().prepare("SELECT * FROM jp_img_batches WHERE status='submitted'").all(); ok(inflight.length === 1, 'one submitted batch');
  ok(IB.ledgerState().owed === 0n, 'in-flight batch commits owed (no double spend)');
  ({ Jet, IB } = fresh()); L.submitThrows = false;
  r = await IB.run(); ok(r.pending === 'batch_in_flight' || r.skipped === 'below_threshold', 'restart resubmits same blob: ' + JSON.stringify(r));
  r = await IB.run();
  const b = Jet._db().prepare('SELECT * FROM jp_img_batches WHERE id=?').get(inflight[0].id);
  ok(b.status === 'done' && b.hash === inflight[0].hash && JSON.parse(b.delivered).issuer === IMG_ISSUER, 'same hash done after restart');
  ok(Jet._db().prepare("SELECT COUNT(*) n FROM jp_img_batches WHERE status IN ('submitted','building','done')").get().n === 1, 'exactly one live batch');
  ok(IB.ledgerState().burned === 1127000n && IB.ledgerState().owed === 0n, 'burned == owed total');
  // crash before signing ("building") → failed, nothing sent, re-batched later
  Jet._db().prepare("INSERT INTO jp_used_tx(hash,invoice,acct,drops,t) VALUES(?,?,?,?,?)").run('D'.repeat(64), 'JPD', BUYER, 31000000, 1);   // a later verified sale
  IB.sync(); const owed3 = IB.ledgerState().owed;
  Jet._db().prepare("INSERT INTO jp_img_batches(drops,status,created,updated) VALUES(?,?,?,?)").run(owed3 > 0n ? owed3 : 1n, 'building', 1, 1);
  ({ Jet, IB } = fresh()); r = await IB.run();
  ok(Jet._db().prepare("SELECT COUNT(*) n FROM jp_img_batches WHERE status='building'").get().n === 0, 'building → failed on restart');
  // expiry: tx never lands and the ledger passes LastLedgerSequence → failed, released
  L.submitThrows = true; Jet._db().prepare("INSERT INTO jp_used_tx(hash,invoice,acct,drops,t) VALUES(?,?,?,?,?)").run('E'.repeat(64), 'JPX', BUYER, 40000000, 1);
  r = await IB.run(); L.ledger += 100; ({ Jet, IB } = fresh()); r = await IB.run();
  ok(Jet._db().prepare("SELECT COUNT(*) n FROM jp_img_batches WHERE note='expired'").get().n === 1, 'expired → failed');
  L.submitThrows = false; L.ledger += 1; r = await IB.run(); r = await IB.run();
  ok(IB.ledgerState().owed === 0n && IB.ledgerState().burned === IB.ledgerState().totalOwed, 'all owed burned exactly once: ' + JSON.stringify(IB.publicLog()).slice(0, 300));
  // pure verify(): wrong hash / unvalidated → pending
  ok(IB.verify({ validated: false }, { hash: 'A' }, IB.config()).state === 'pending', 'unvalidated pending');
  // existing BURN (shop/ranked) ledger untouched
  ok(JSON.parse(fs.readFileSync(BURN_OWED)).drops === 777, 'burn_owed.json untouched');
  console.log(`img-burn-sim: ${pass} checks passed`); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
