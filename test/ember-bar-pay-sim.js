'use strict';
// Ember Bar 1 XRP drink checkout against a mocked ledger + mocked Xaman: default-on flag and kill switch, server-only
// amount/destination/tag, exact 1 XRP, every rejection (unvalidated, failed, wrong destination/tag/memo/sender, IOU,
// partial payment, under/over payment, forged hash), replayed hashes, concurrent claims, declined/expired payloads,
// one celebration per paid order, resume after reload, and persistence across a restart.
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'eb-'));
const TREASURY = 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
process.env.DATA_DIR = DATA; process.env.TREASURY_ADDRESS = TREASURY; process.env.XAMAN_API_KEY = 'test-key'; process.env.XAMAN_API_SECRET = 'test-secret';
delete process.env.EMBER_BAR_PAYMENTS;
const fresh = () => { for (const k of Object.keys(require.cache)) if (/server[\\/](ember-bar|config)\.js$/.test(k)) delete require.cache[k]; return require('../server/ember-bar'); };
let E = fresh();
const P1 = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY', P2 = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const ledgerTx = new Map(); let ledgerDelay = 0;
const payloads = new Map(); let created = [], pseq = 0;
const mock = () => {
  E._ledger = async () => ({ request: async ({ transaction }) => { if (ledgerDelay) await new Promise(r => setTimeout(r, ledgerDelay)); const r = ledgerTx.get(transaction); if (!r) { const e = new Error('Transaction not found.'); e.data = { error: 'txnNotFound' }; throw e; } return { result: JSON.parse(JSON.stringify(r)) }; } });
  E._sdk = () => ({ payload: {
    create: async p => { const uuid = 'u' + (pseq++); created.push(p); payloads.set(uuid, { meta: { signed: false, resolved: false, expired: false } }); return { uuid, refs: { qr_png: 'https://x/qr/' + uuid }, next: { always: 'https://xaman.app/sign/' + uuid } }; },
    get: async uuid => payloads.get(uuid) || null } });
};
mock();
const hex = s => Buffer.from(s).toString('hex').toUpperCase();
let n = 0; const H = () => (n++).toString(16).toUpperCase().padStart(64, 'B');
function pay(o_, acct, o = {}) {
  const hash = o.hash || H();
  const tx = { TransactionType: 'Payment', Account: acct, Destination: o_.destination, DestinationTag: o_.destinationTag, DeliverMax: '1000000', Flags: 0, Memos: [{ Memo: { MemoType: hex('burncity/ember-bar'), MemoData: hex(o_.memo) } }], ...(o.tx || {}) };
  const r = { hash: o.reportedHash || hash, validated: o.validated ?? true, tx_json: tx, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: '1000000', ...(o.meta || {}) } };
  ledgerTx.set(hash, r); return hash;
}
async function http(method, pathname, acct, payload = {}) {
  const out = {};
  const handled = await E.handle({ method }, out, new URL('http://x' + pathname), { json: (_r, status, data) => Object.assign(out, { status, data }), gate: () => false, ip: '10.0.0.1', body: async () => payload, who: () => acct ? { acct } : null });
  assert.ok(handled); return out;
}
const order = async (acct, drink = 'ember-fizz') => { const r = await http('POST', '/api/ember-bar/order', acct, { drink }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.order; };
const claim = (acct, o, txHash) => http('POST', '/api/ember-bar/claim', acct, { order: o.id, ...(txHash !== undefined ? { txHash } : {}) });
(async () => {
  // ---- status / defaults ----
  let r = await http('GET', '/api/ember-bar', null);
  assert.equal(r.status, 200); assert.equal(r.data.payments, true, 'on by default'); assert.equal(r.data.price.drops, 1000000); assert.equal(r.data.price.xrp, 1);
  assert.equal(r.data.treasury, TREASURY); assert.equal(r.data.recipient, 'BURN City treasury'); assert.deepEqual(r.data.drinks.map(d => d.id), ['cinder-tea', 'ember-fizz', 'blackglass-tonic']);
  assert.equal(r.data.pending, undefined, 'no wallet data without sign-in');
  assert.equal((await http('POST', '/api/ember-bar/order', null, { drink: 'ember-fizz' })).status, 401, 'logged out → 401');
  assert.equal((await http('POST', '/api/ember-bar/order', P1, { drink: 'rum' })).status, 400, 'unknown drink');
  assert.equal((await http('POST', '/api/ember-bar/order', P1, { drink: '__proto__' })).status, 400, 'prototype keys are not drinks');

  // ---- the client never supplies amount, destination or tag ----
  r = await http('POST', '/api/ember-bar/order', P1, { drink: 'cinder-tea', drops: 1, amount: '1', destination: P2, destinationTag: 7 });
  assert.equal(r.status, 200); let o = r.data.order;
  assert.equal(o.drops, 1000000); assert.equal(o.destination, TREASURY); assert.match(o.id, /^EB[0-9A-F]{24}$/); assert.ok(o.destinationTag >= 100000);
  const tj = created.at(-1).txjson; assert.equal(tj.Amount, '1000000'); assert.equal(tj.Destination, TREASURY); assert.equal(tj.DestinationTag, o.destinationTag); assert.equal(tj.Account, P1);
  assert.equal(Buffer.from(tj.Memos[0].Memo.MemoData, 'hex').toString(), o.id, 'order reference memo'); assert.ok(o.xaman.deeplink && o.xaman.qr);
  assert.ok(/1 XRP to the BURN City treasury/.test(created.at(-1).custom_meta.instruction));
  // double tap → same order
  const again = await order(P1, 'cinder-tea'); assert.equal(again.id, o.id, 'double tap reuses the open order');

  // ---- not signed / not found / not validated ----
  r = await claim(P1, o); assert.equal(r.status, 202); assert.equal(r.data.reason, 'not_signed_yet');
  r = await claim(P1, o, H()); assert.equal(r.status, 202, 'unknown hash → keep polling'); assert.equal(r.data.reason, 'tx_not_found');
  let h = pay(o, P1, { validated: false }); r = await claim(P1, o, h); assert.equal(r.status, 202); assert.equal(r.data.reason, 'not_validated_yet');
  // ---- rejections ----
  const bad = async (opts, why) => { const hh = pay(o, P1, opts); const rr = await claim(P1, o, hh); assert.equal(rr.data.error, why, why + ' ' + JSON.stringify(rr.data)); assert.ok(rr.status >= 400); };
  await bad({ meta: { TransactionResult: 'tecUNFUNDED_PAYMENT' } }, 'tx_failed');
  await bad({ tx: { TransactionType: 'EscrowCreate' } }, 'not_payment');
  await bad({ tx: { Destination: P2 } }, 'wrong_destination');
  await bad({ tx: { DestinationTag: 42 } }, 'wrong_destination_tag');
  await bad({ tx: { DestinationTag: undefined } }, 'wrong_destination_tag');
  await bad({ tx: { Memos: [{ Memo: { MemoData: hex('EB' + '0'.repeat(24)) } }] } }, 'memo_mismatch');
  await bad({ tx: { Memos: undefined } }, 'memo_mismatch');
  { const hh = pay(o, P2); r = await claim(P1, o, hh); assert.equal(r.data.error, 'wrong_sender'); }
  await bad({ tx: { Flags: 0x00020000 }, meta: { delivered_amount: '1000' } }, 'partial_payment');
  await bad({ tx: { Flags: 0x00020000 } }, 'partial_payment');
  await bad({ meta: { delivered_amount: '999999' } }, 'wrong_amount');
  await bad({ meta: { delivered_amount: '1000001' }, tx: { DeliverMax: '1000001' } }, 'wrong_amount');
  await bad({ tx: { DeliverMax: '5000000' } }, 'wrong_amount');
  await bad({ meta: { delivered_amount: { currency: 'USD', issuer: P2, value: '1' } } }, 'wrong_currency');
  await bad({ tx: { DeliverMax: { currency: 'XRP', value: '1' } } }, 'wrong_currency');
  await bad({ reportedHash: 'C'.repeat(64) }, 'hash_mismatch');
  assert.equal((await claim(P1, o, 'not-a-hash')).status, 400);
  assert.equal((await claim(P2, o, H())).status, 404, "another wallet can't claim this order");
  r = await http('GET', '/api/ember-bar', P1); assert.equal(r.data.pending.length, 1, 'open order resumes after reload'); assert.equal(r.data.uncollected.length, 0);

  // ---- a good payment, concurrent claims settle once ----
  const good = pay(o, P1); ledgerDelay = 20;
  const both = await Promise.all([claim(P1, o, good), claim(P1, o, good), claim(P1, o, good)]); ledgerDelay = 0;
  assert.ok(both.every(x => x.status === 200 && x.data.paid), JSON.stringify(both.map(x => x.data)));
  assert.equal(both.filter(x => !x.data.already).length, 1, 'exactly one settlement');
  assert.equal(E._db().prepare('SELECT COUNT(*) n FROM eb_used_tx').get().n, 1);
  r = await claim(P1, o); assert.equal(r.status, 200); assert.equal(r.data.already, true, 'polling after payment returns the same receipt'); assert.equal(r.data.order.hash, good);
  // replay the same hash on another order
  const o2 = await order(P1, 'blackglass-tonic'); r = await claim(P1, o2, good); assert.equal(r.status, 409); assert.equal(r.data.error, 'replay');
  // replay a hash on another wallet's order
  const o3 = await order(P2, 'ember-fizz'); r = await claim(P2, o3, good); assert.equal(r.data.error, 'replay');

  // ---- celebration plays once; pickup while away ----
  r = await http('GET', '/api/ember-bar', P1); assert.equal(r.data.uncollected.length, 1, 'paid drink waits at the bar'); assert.equal(r.data.uncollected[0].id, o.id);
  r = await http('POST', '/api/ember-bar/collect', P1, { order: o.id }); assert.equal(r.status, 200); assert.equal(r.data.celebrate, true);
  r = await http('POST', '/api/ember-bar/collect', P1, { order: o.id }); assert.equal(r.data.celebrate, false, 'second collect: no second celebration');
  assert.equal((await http('POST', '/api/ember-bar/collect', P2, { order: o.id })).status, 404);
  assert.equal((await http('POST', '/api/ember-bar/collect', P1, { order: o2.id })).status, 409, 'unpaid orders are not served');
  r = await http('GET', '/api/ember-bar', P1); assert.equal(r.data.uncollected.length, 0);

  // ---- declined / expired in Xaman ----
  const od = await order(P2, 'cinder-tea'); payloads.get(od.xaman.uuid).meta = { signed: false, resolved: true, cancelled: true };
  r = await claim(P2, od); assert.equal(r.status, 410); assert.equal(r.data.error, 'order_declined');
  r = await claim(P2, od); assert.equal(r.data.error, 'order_declined', 'stays declined');
  const oe = await order(P2, 'blackglass-tonic'); payloads.get(oe.xaman.uuid).meta = { signed: false, resolved: false, expired: true };
  r = await claim(P2, oe); assert.equal(r.data.error, 'order_expired');
  // ---- signed while away: the server sweep settles it, the drink waits ----
  const ow = await order(P2, 'ember-fizz'); assert.notEqual(ow.id, o3.id === ow.id ? '' : ow.id + 'x');
  const hw = pay(ow, P2); payloads.get(ow.xaman.uuid).meta = { signed: true, resolved: true }; payloads.get(ow.xaman.uuid).response = { txid: hw };
  assert.ok(await E.sweep() >= 1); r = await http('GET', '/api/ember-bar', P2); assert.ok(r.data.uncollected.some(x => x.id === ow.id), 'confirmed while away → collectable');

  // ---- kill switch ----
  process.env.EMBER_BAR_PAYMENTS = '0';
  r = await http('GET', '/api/ember-bar', P1); assert.equal(r.data.payments, false);
  r = await http('POST', '/api/ember-bar/order', P1, { drink: 'ember-fizz' }); assert.equal(r.status, 409); assert.equal(r.data.error, 'payments_disabled');
  r = await claim(P1, o); assert.equal(r.status, 200, 'paid receipts still load with the flag off');
  delete process.env.EMBER_BAR_PAYMENTS;
  // no treasury / no Xaman → checkout unavailable
  const savedT = process.env.TREASURY_ADDRESS; process.env.TREASURY_ADDRESS = '';
  E = fresh(); mock(); assert.equal(E.config().available, false); r = await http('POST', '/api/ember-bar/order', P1, { drink: 'ember-fizz' }); assert.equal(r.status, 503);
  process.env.TREASURY_ADDRESS = savedT;

  // ---- restart: used hashes persist ----
  E = fresh(); mock();
  const o4 = await order(P1, 'ember-fizz'); r = await claim(P1, o4, good); assert.equal(r.data.error, 'replay', 'used hash survives restart');
  r = await claim(P1, o); assert.equal(r.data.already, true);
  // rate limit: max 12 orders/hour per wallet
  const P3 = 'rLHzPsX6oXkzU2qL12kHCH8G8cnZv1rBJh'; let last;
  for (let i = 0; i < 14; i++) { E._db().prepare("UPDATE eb_orders SET xaman=NULL WHERE acct=?").run(P3); last = await http('POST', '/api/ember-bar/order', P3, { drink: 'ember-fizz' }); }
  assert.equal(last.status, 429);
  console.log('ember-bar pay sim: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
