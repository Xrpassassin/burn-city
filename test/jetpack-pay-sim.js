'use strict';
// Jetpack real-XRP payments against a mocked ledger: flag gate, exemptions, server-only amounts, and every
// rejection (forged, partial, underpaid, wrong destination/tag/memo/sender, IOU, unvalidated, failed,
// replayed hash, concurrent claims) plus persistence of used hashes across a restart.
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-'));
process.env.DATA_DIR = DATA; process.env.DRY_RUN = 'true'; delete process.env.XAMAN_API_KEY; delete process.env.XUMM_API_KEY;
for (const k of Object.keys(process.env)) if (k.startsWith('JETPACK_')) delete process.env[k];
const fresh = () => { for (const k of Object.keys(require.cache)) if (/server[\\/](jetpack|config)\.js$/.test(k)) delete require.cache[k]; return require('../server/jetpack'); };
let J = fresh();
const TREASURY = 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb', DERRIK = 'rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA', DAD = 'rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST', GNASTY = 'rDtUEMFVDi3K7TUQAQLi6xxa1WCer84dcA';
const P1 = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY', P2 = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', P3 = 'rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh';
const files = new Map();
const store = { load: (n, f) => files.has(n) ? JSON.parse(JSON.stringify(files.get(n))) : f, save: (n, v) => files.set(n, JSON.parse(JSON.stringify(v))) };
const Rpg = require('../server/homefront-rpg');
const ledgerTx = new Map(); let ledgerDelay = 0, ledgerCalls = 0;
const mock = () => { J._ledger = async () => ({ request: async ({ transaction }) => { ledgerCalls++; if (ledgerDelay) await new Promise(r => setTimeout(r, ledgerDelay)); const r = ledgerTx.get(transaction); if (!r) { const e = new Error('Transaction not found.'); e.data = { error: 'txnNotFound' }; throw e; } return { result: JSON.parse(JSON.stringify(r)) }; } }); };
mock();
const hex = s => Buffer.from(s).toString('hex').toUpperCase();
let n = 0; const H = () => (n++).toString(16).toUpperCase().padStart(64, 'A');
// Build a ledger result paying `inv` (overrides tweak it).
function pay(inv, acct, o = {}) {
  const hash = o.hash || H();
  const tx = { TransactionType: 'Payment', Account: acct, Destination: inv.destination, DestinationTag: inv.destinationTag, DeliverMax: String(inv.drops), Flags: 0, Memos: [{ Memo: { MemoType: hex('burncity/jetpack'), MemoData: hex(inv.memo) } }], ...(o.tx || {}) };
  const r = { hash: o.reportedHash || hash, validated: o.validated ?? true, tx_json: tx, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: String(inv.drops), ...(o.meta || {}) } };
  ledgerTx.set(hash, r); return hash;
}
async function http(method, pathname, acct, payload = {}, ip = '10.0.0.1') {
  const out = {};
  const handled = await J.handle({ method }, out, new URL('http://x' + pathname), { json: (_r, status, data) => Object.assign(out, { status, data }), gate: () => false, ip, body: async () => payload, who: () => acct ? { acct } : null, store });
  assert.ok(handled); return out;
}
(async () => {
  // ---- flag off (default) ----
  assert.equal(J.config().enabled, false, 'JETPACK_PAYMENTS defaults off');
  assert.equal((await http('GET', '/api/jetpack', null)).status, 401, 'logged out → 401');
  assert.equal((await http('POST', '/api/jetpack/invoice', null, { kind: 'city' })).status, 401);
  assert.equal((await http('POST', '/api/jetpack/claim', null, {})).status, 401);
  let r = await http('POST', '/api/jetpack/invoice', P1, { kind: 'homefront' }); assert.equal(r.status, 409); assert.equal(r.data.error, 'payments_disabled');
  r = await http('POST', '/api/jetpack/claim', P1, { invoice: 'JP' + 'A'.repeat(24), txHash: H() }); assert.equal(r.status, 409);
  r = await http('GET', '/api/jetpack', P1); assert.equal(r.status, 200); assert.equal(r.data.payments, false); assert.equal(r.data.prices.homefront.drops, 30e6); assert.equal(r.data.prices.city.drops, 5e6); assert.equal(r.data.treasury, TREASURY);
  // ---- exemptions (work regardless of the flag) ----
  const st = a => J.status(a, J.config(), store).owned;
  assert.deepEqual(st(DERRIK), { city: true, homefront: true }, 'Derrik: both free');
  assert.deepEqual(st(TREASURY), { city: true, homefront: true }, "Derrik's treasury: both free");
  assert.deepEqual(st(DAD), { city: true, homefront: false }, 'BURN (Derrik\'s dad): free city jetpack only');
  assert.deepEqual(st(GNASTY), { city: true, homefront: false }, 'Gnasty: free city jetpack only');
  assert.deepEqual(st(P1), { city: false, homefront: false });
  assert.ok(Rpg.hasItem(store, DERRIK, 'homefront_jetpack'), 'exempt Homefront owner gets the RPG item');
  assert.equal(J.ownsCity(DAD), true); assert.equal(J.ownsCity(P1), false);
  // Exemption lists are env/config.
  process.env.JETPACK_FREE_CITY = P3; assert.equal(J.ownsCity(P3), true); assert.equal(J.ownsCity(DAD), false, 'env list replaces the default'); delete process.env.JETPACK_FREE_CITY;

  // ---- flag on ----
  process.env.JETPACK_PAYMENTS = '1';
  r = await http('POST', '/api/jetpack/invoice', DERRIK, { kind: 'homefront' }); assert.equal(r.status, 200); assert.equal(r.data.owned, true, 'exempt accounts get no invoice');
  r = await http('POST', '/api/jetpack/invoice', P1, { kind: 'warp' }); assert.equal(r.status, 400);
  // The client never supplies the amount, destination or tag.
  r = await http('POST', '/api/jetpack/invoice', P1, { kind: 'homefront', drops: 1, amount: '1', destination: P2, destinationTag: 7, price: 0 });
  assert.equal(r.status, 200); const inv = r.data.invoice;
  assert.equal(inv.drops, 30e6); assert.equal(inv.destination, TREASURY); assert.ok(inv.destinationTag >= 100000); assert.match(inv.memo, /^JP[0-9A-F]{24}$/);
  assert.equal((await http('POST', '/api/jetpack/invoice', P1, { kind: 'homefront' })).data.invoice.id, inv.id, 'double tap re-uses the open invoice');
  const invCity = (await http('POST', '/api/jetpack/invoice', P1, { kind: 'city' })).data.invoice;
  assert.equal(invCity.drops, 5e6); assert.notEqual(invCity.destinationTag, inv.destinationTag, 'unique tag per invoice');
  const claim = (acct, invoice, txHash) => http('POST', '/api/jetpack/claim', acct, { invoice, txHash });
  const expectErr = async (hash, err, invId = inv.id, acct = P1) => { const x = await claim(acct, invId, hash); assert.equal(x.data.error || x.data.reason, err, err + ' → ' + JSON.stringify(x)); assert.notEqual(x.data.granted, true); return x; };
  await expectErr(H(), 'tx_not_found');                                                                // forged: hash not on the ledger
  await expectErr(pay(inv, P1, { reportedHash: 'F'.repeat(64) }), 'hash_mismatch');                   // forged ledger answer for another hash
  await expectErr(pay(inv, P1, { tx: { Flags: 0x00020000 } }), 'partial_payment');
  await expectErr(pay(inv, P1, { meta: { delivered_amount: String(30e6 - 1) } }), 'underpaid');
  await expectErr(pay(inv, P1, { tx: { DeliverMax: String(29e6) }, meta: { delivered_amount: String(29e6) } }), 'underpaid');
  await expectErr(pay(inv, P1, { tx: { Destination: P2 } }), 'wrong_destination');
  await expectErr(pay(inv, P1, { tx: { Destination: DAD } }), 'wrong_destination');                  // never a destination
  await expectErr(pay(inv, P1, { tx: { DestinationTag: inv.destinationTag + 1 } }), 'wrong_destination_tag');
  await expectErr(pay(inv, P1, { tx: { Memos: [{ Memo: { MemoData: hex(invCity.memo) } }] } }), 'memo_mismatch');
  await expectErr(pay(inv, P1, { tx: { Memos: undefined } }), 'memo_mismatch');
  await expectErr(pay(inv, P2), 'wrong_sender');
  const iou = { currency: 'USD', issuer: P3, value: '1000000000' };
  await expectErr(pay(inv, P1, { tx: { DeliverMax: iou, Amount: iou }, meta: { delivered_amount: iou } }), 'wrong_currency');
  await expectErr(pay(inv, P1, { meta: { delivered_amount: iou } }), 'wrong_currency');
  await expectErr(pay(inv, P1, { meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' } }), 'tx_failed');
  await expectErr(pay(inv, P1, { tx: { TransactionType: 'EscrowCreate' } }), 'not_payment');
  r = await claim(P1, inv.id, pay(inv, P1, { validated: false })); assert.equal(r.status, 202); assert.equal(r.data.pending, true);
  assert.equal((await claim(P2, inv.id, pay(inv, P1))).status, 404, "another account can't claim your invoice");
  assert.equal((await claim(P1, 'JPnope', H())).status, 400);
  assert.equal((await claim(P1, inv.id, 'not-a-hash')).status, 400);
  assert.equal(st(P1).homefront, false, 'no rejection granted anything');
  // ---- concurrent claims on the good payment: exactly one grant ----
  const good = pay(inv, P1, { meta: { delivered_amount: String(30e6 + 5) } });   // overpay is fine
  ledgerDelay = 15;
  const runs = await Promise.all(Array.from({ length: 12 }, () => claim(P1, inv.id, good)));
  ledgerDelay = 0;
  assert.ok(runs.every(x => x.status === 200 && x.data.granted), 'every concurrent claim of the same paid invoice reports granted');
  assert.equal(runs.filter(x => !x.data.already).length, 1, 'exactly one claim did the grant');
  assert.equal(J._db().prepare("SELECT COUNT(*) n FROM jp_grants WHERE acct=? AND kind='homefront'").get(P1).n, 1);
  assert.equal(st(P1).homefront, true); assert.ok(Rpg.hasItem(store, P1, 'homefront_jetpack'), 'grant lands the RPG item');
  assert.equal((await http('POST', '/api/jetpack/invoice', P1, { kind: 'homefront' })).data.owned, true, 'owners get no new invoice');
  // ---- replay: the same hash on another invoice (same or another account) ----
  await expectErr(good, 'replay', invCity.id);
  const inv2 = (await http('POST', '/api/jetpack/invoice', P2, { kind: 'homefront' })).data.invoice;
  await expectErr(good, 'replay', inv2.id, P2);
  // Concurrent claims of ONE hash against two invoices: only one can win (forge both invoices to match the tx tag/memo is impossible; use two tx results instead).
  const a = (await http('POST', '/api/jetpack/invoice', P3, { kind: 'city' })).data.invoice;
  const shared = pay(a, P3);
  ledgerDelay = 10;
  const both = await Promise.all([claim(P3, a.id, shared), claim(P3, a.id, shared), claim(P2, inv2.id, shared)]);
  ledgerDelay = 0;
  assert.equal(both.filter(x => x.data.granted && !x.data.already).length, 1);
  assert.notEqual(both[2].data.granted, true, "the other invoice can't reuse the hash");
  assert.equal(J.ownsCity(P3), true);
  // ---- persistence: a restart keeps used hashes + grants ----
  const before = ledgerCalls;
  J = fresh(); mock();
  assert.equal(st(P1).homefront, true, 'grant survives restart');
  await expectErr(good, 'replay', inv2.id, P2);
  assert.equal(ledgerCalls, before, 'a known replay is rejected before any ledger call');
  // Prices / treasury come from config only.
  process.env.JETPACK_PRICE_CITY_DROPS = '7000000';
  const inv7 = (await http('POST', '/api/jetpack/invoice', P2, { kind: 'city', drops: 1 })).data.invoice; assert.equal(inv7.drops, 7e6);
  delete process.env.JETPACK_PRICE_CITY_DROPS;
  // Flag back off: purchases 409 again, ownership stays.
  delete process.env.JETPACK_PAYMENTS;
  assert.equal((await claim(P2, inv2.id, good)).status, 409);
  assert.equal(st(P1).homefront, true);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log('Jetpack payment sim passed (flag gate, exemptions, server-only amounts, forged/partial/underpaid/wrong-destination/tag/memo/sender/IOU/unvalidated/failed rejected, replay + concurrent claims grant once, persistence).');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
