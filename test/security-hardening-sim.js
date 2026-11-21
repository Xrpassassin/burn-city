'use strict';
// Security hardening (sw bc-v184-sec): server-side checks against mocked ledgers. No network, no real server.
//  1. one XRP payment can never settle two products (shop / ranked / Ember Bar / jetpack share tx-claims.db)
//  2. shop payments need exactly one burncity/shop memo for the session and no destination tag
//  3. XRPL token names are restricted to [A-Za-z0-9 ._·$-] (else the hex code)
//  4. static responses carry security headers; the static path check uses base + path.sep
//  5. /admin/social/* goes through adminOk (constant-time compare + lockout)
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), { PassThrough } = require('stream');
const xrpl = require('xrpl');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bcsec-'));
const W = xrpl.Wallet.generate();
Object.assign(process.env, { DATA_DIR: DATA, DRY_RUN: 'true', TREASURY_ADDRESS: W.classicAddress, XAMAN_API_KEY: 'sim', RANKED_LIVE: 'true',
  JETPACK_PAYMENTS: '1', XRPL_WSS: 'ws://127.0.0.1:1', TOKEN_SECRET: 'sec-test', ADMIN_TOKEN: 'admin-test-token-0123456789' });
for (const k of Object.keys(process.env)) if (k.startsWith('JETPACK_') && k !== 'JETPACK_PAYMENTS') delete process.env[k];
const C = require('../server/config'), Pay = require('../server/payments'), R = require('../server/ranked');
const Ember = require('../server/ember-bar'), Jet = require('../server/jetpack'), Claims = require('../server/treasury-tx-claims');
const hex = s => Buffer.from(s).toString('hex').toUpperCase();
const acct = () => xrpl.Wallet.generate().classicAddress;
let hn = 0; const H = () => (++hn).toString(16).toUpperCase().padStart(64, 'C');
const result = (tx, drops) => ({ validated: true, tx_json: { TransactionType: 'Payment', Destination: C.TREASURY, Flags: 0, Amount: String(drops), ...tx }, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: String(drops) } });
const fakeSdk = () => ({ payload: { create: async () => ({ uuid: '00000000-0000-0000-0000-000000000000', refs: { qr_png: 'https://xumm.app/sign/x_q.png' }, next: { always: 'https://xumm.app/sign/x' } }), get: async () => ({ meta: {} }) } });
Ember._sdk = fakeSdk; Jet._sdk = fakeSdk;

(async () => {
  // ---- shared helpers ----
  assert.equal(Claims.claim('ab'.repeat(32), 'shop', 'S1').ok, true);
  assert.equal(Claims.claim('AB'.repeat(32), 'shop', 'S1').ok, true, 'same product+ref is idempotent (case-insensitive hash)');
  assert.deepEqual(Claims.claim('AB'.repeat(32), 'ember-bar', 'E1'), { ok: false, reason: 'tx_already_used', product: 'shop', ref: 'S1' });
  assert.equal(Claims.claim('AB'.repeat(32), 'shop', 'S2').ok, false, 'another shop session cannot reuse it');
  assert.equal(Claims.claim('nothex', 'shop', 'S').ok, false);
  const memo = (t, d) => ({ Memos: [{ Memo: { MemoType: hex(t), MemoData: hex(d) } }] });
  assert.equal(Claims.exactlyOneMemo(memo('burncity/shop', 'BC1'), 'burncity/shop', 'BC1'), true);
  assert.equal(Claims.exactlyOneMemo({ Memos: [...memo('burncity/shop', 'BC1').Memos, ...memo('burncity/ember-bar', 'EB1').Memos] }, 'burncity/shop', 'BC1'), false, 'two memos');
  assert.equal(Claims.exactlyOneMemo(memo('burncity/ranked', 'BC1'), 'burncity/shop', 'BC1'), false, 'wrong type');
  assert.equal(Claims.exactlyOneMemo({ Memos: [{ Memo: { MemoData: hex('BC1') } }] }, 'burncity/shop', 'BC1'), false, 'shop requires the type');
  assert.equal(Claims.exactlyOneMemo({ Memos: [{ Memo: { MemoData: hex('BC1') } }] }, 'burncity/shop', 'BC1', { typeOptional: true }), true);
  assert.equal(Claims.exactlyOneMemo({}, 'burncity/shop', 'BC1', { typeOptional: true }), false);

  // ---- the audit PoC: one hand-built payment for an Ember Bar order AND a shop purchase ----
  { const A = acct(), ord = (await Ember.createOrder(A, 'ember-fizz')).body.order, sid = Pay.newPurchase(A, 'skin_ember'), h = H();
    const r = result({ Account: A, DestinationTag: ord.destinationTag, Memos: [{ Memo: { MemoData: hex(ord.id) } }, { Memo: { MemoData: hex(sid) } }] }, 1e6); r.hash = h;
    const fake = { request: async () => ({ result: r }) }; Ember._ledger = async () => fake; Pay._ledger = async () => fake;
    const e = await Ember.claim(A, ord.id, h), s = await Pay.verify(sid, h);
    assert.notEqual(e.body.paid, true, 'two-memo payment no longer settles the Ember order'); assert.equal(e.body.error, 'memo_mismatch');
    assert.equal(s.ok, false, 'two-memo tagged payment no longer settles the shop'); assert.deepEqual(Pay.owned(A), []); }

  // ---- shop: no tag, exactly one memo, then success ----
  { const A = acct(), sid = Pay.newPurchase(A, 'skin_ember');
    const try_ = async tx => { const h = H(), r = result({ Account: A, ...tx }, 1e6); Pay._ledger = async () => ({ request: async () => ({ result: r }) }); return [h, await Pay.verify(sid, h)]; };
    assert.equal((await try_({ DestinationTag: 7, ...memo('burncity/shop', sid) }))[1].reason, 'wrong_destination_tag');
    assert.equal((await try_({ Memos: [{ Memo: { MemoData: hex(sid) } }] }))[1].reason, 'memo_mismatch');
    assert.equal((await try_({ Memos: [...memo('burncity/shop', sid).Memos, ...memo('burncity/shop', sid).Memos] }))[1].reason, 'memo_mismatch');
    const [h, ok] = await try_(memo('burncity/shop', sid)); assert.equal(ok.ok, true, 'a correct shop payment still works'); assert.deepEqual(Pay.owned(A), ['skin_ember']);
    assert.deepEqual(Claims.owner(h), { product: 'shop', ref: sid }); }

  // ---- cross-product replay through the shared table, even if every per-product check passes ----
  // The mocked ledger answers each product with a tx that satisfies THAT product (as if its checks were fooled);
  // the shared claim must still let only the first product settle.
  { const A = acct(), h = H();
    const sid = Pay.newPurchase(A, 'skin_ember');
    Pay._ledger = async () => ({ request: async () => ({ result: result({ Account: A, ...memo('burncity/shop', sid) }, 1e6) }) });
    assert.equal((await Pay.verify(sid, h)).ok, true, 'shop settles first');
    // ranked
    const e = R.enter(A, { create: true, buyinXrp: R.R.MINB / 1e6 }); assert.ok(e.sid, 'ranked entry ' + JSON.stringify(e));
    const rk = result({ Account: A, DestinationTag: e.tag, ...memo('burncity/ranked', e.sid) }, R.R.MINB);
    R.sessions.get(e.sid).hash = h;   // as /api/ranked/verify does with a client-supplied hash
    const v = await R.verify(e.sid, async () => ({ request: async () => ({ result: rk }) }), null, A);
    assert.equal(v.ok, false); assert.equal(v.reason, 'replay', 'ranked refuses a tx the shop already used');
    // ember
    const ord = (await Ember.createOrder(A, 'ember-fizz')).body.order;
    const eb = result({ Account: A, DestinationTag: ord.destinationTag, ...memo('burncity/ember-bar', ord.id) }, 1e6); eb.hash = h;
    Ember._ledger = async () => ({ request: async () => ({ result: eb }) });
    const ec = await Ember.claim(A, ord.id, h); assert.equal(ec.status, 409); assert.equal(ec.body.error, 'replay', 'ember refuses it');
    // jetpack
    const inv = (await Jet.createInvoice(A, 'city')).body.invoice; assert.ok(inv && inv.id, 'jetpack invoice');
    const jp = result({ Account: A, Destination: inv.destination, DestinationTag: inv.destinationTag, ...memo('burncity/jetpack', inv.id) }, inv.drops); jp.hash = h;
    Jet._ledger = async () => ({ request: async () => ({ result: jp }) });
    const jc = await Jet.claim(A, inv.id, h); assert.equal(jc.status, 409); assert.equal(jc.body.error, 'replay', 'jetpack refuses it');
    assert.deepEqual(Claims.owner(h), { product: 'shop', ref: sid });
    // and a fresh tx for the jetpack still works
    const h2 = H(), jp2 = { ...jp, hash: h2 }; Jet._ledger = async () => ({ request: async () => ({ result: jp2 }) });
    assert.equal((await Jet.claim(A, inv.id, h2)).status, 200, 'a separate payment for the jetpack is granted'); }

  // ---- XRPL token names ----
  const Eco = require('../server/eco');
  assert.equal(Eco._curName('3C7374796C65206F6E6C6F61643D5F5F583D313E'), '3C7374796C65206F6E6C6F61643D5F5F583D313E', 'markup name -> hex code');
  assert.equal(Eco._curName(hex('SOLO').padEnd(40, '0')), 'SOLO');
  assert.equal(Eco._curName('USD'), 'USD'); assert.equal(Eco._curName('<a>'), hex('<a>'));
  assert.equal(Eco._curName(hex('$BTCK').padEnd(40, '0')), '$BTCK');
  assert.equal(Eco._safeNodeName('<img src=x>', 'rX-' + hex('<img src=x>').padEnd(40, '0')), hex('<img src=x>').padEnd(40, '0'));
  assert.equal(Eco._safeNodeName('FOO·Abc1', 'rX-FOO'), 'FOO·Abc1');

  // ---- static security headers + containment (the real serveStatic, run in a sandbox) ----
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  const a = src.indexOf('const STATIC_SEC'), b = src.indexOf('const server = http.createServer', a); assert.ok(a > 0 && b > a, 'serveStatic source found');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bcstatic-'));
  fs.mkdirSync(path.join(root, 'server')); fs.mkdirSync(path.join(root, 'client', 'arena'), { recursive: true }); fs.mkdirSync(path.join(root, 'clientX'));
  fs.writeFileSync(path.join(root, 'client', 'index.html'), '<!doctype html>'); fs.writeFileSync(path.join(root, 'client', 'arena', 'index.html'), 'x');
  fs.writeFileSync(path.join(root, 'clientX', 'secret.txt'), 'secret');
  const serveStatic = vm.runInNewContext(src.slice(a, b) + '\nserveStatic;', { path, fs, URL, decodeURIComponent, __dirname: path.join(root, 'server'), Eco: { serve: () => false } });
  const get = (p, method = 'GET') => { const res = new PassThrough(); res.writeHead = (code, h) => { res.code = code; res.h = h; }; const handled = serveStatic({ method, headers: {} }, res, new URL('http://x' + p)); return { handled, code: res.code, h: res.h || {} }; };
  for (const p of ['/', '/index.html', '/arena', '/arena/']) {
    const r = get(p); assert.equal(r.handled, true, p);
    assert.equal(r.h['x-content-type-options'], 'nosniff', p); assert.equal(r.h['x-frame-options'], 'DENY', p);
    assert.match(r.h['content-security-policy'], /frame-ancestors 'none'/, p); assert.match(r.h['strict-transport-security'], /max-age=\d+/, p);
    assert.equal(r.h['referrer-policy'], 'strict-origin-when-cross-origin', p); }
  assert.equal(get('/..%2fclientX/secret.txt').handled, false, 'sibling directory clientX is not served');
  assert.equal(get('/../clientX/secret.txt').handled, false);
  assert.equal(get('/api/x').handled, false);

  // ---- /admin/social uses adminOk ----
  const Social = require('../server/social');
  let calls = 0, allow = false; const out = {};
  const call = async token => { const req = { method: 'GET', headers: { 'x-admin-token': token }, socket: { remoteAddress: '10.9.9.9' } };
    await Social.handle(req, {}, new URL('http://x/admin/social/reports'), { json: (_r, s, d) => Object.assign(out, { s, d }), body: async () => ({}), who: () => null, adminOk: () => (calls++, allow) }); return out.s; };
  assert.equal(await call(process.env.ADMIN_TOKEN), 403, 'right token but adminOk says locked out -> 403'); assert.equal(calls, 1);
  allow = true; assert.equal(await call('anything'), 200, 'adminOk decides'); assert.equal(calls, 2);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8'), /Social\.handle\([^)]*adminOk \}\)/, 'server passes adminOk to social');

  console.log('security-hardening (server): ok');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
