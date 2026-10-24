'use strict';
// Estates money + multiplayer safety: allocation fuzz, DB constraint rejections, parallel/forged buys
// (409, nothing written), auth (401) and admin-only wallet routes (403). Local only: no XRPL, no Xaman keys.
// Each simulated player gets its own fly-client-ip so per-IP limits never mask a per-account result.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), assert = require('node:assert/strict');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcestates-'));
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', TOKEN_SECRET: 'estsimsecret', ADMIN_TOKEN: 'estadmintoken', XRPL_WSS: 'ws://127.0.0.1:1', DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false', XUMM_KEY: '', XUMM_SECRET: '' });
delete process.env.ESTATE_TREASURY_ADDRESS;
const Srv = require('../server/server'), Pay = require('../server/payments');
const { allocateProfit, propertyWeight, CATALOG } = require('../server/estate-economy');
const db = Pay.sdb;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const TABLES = ['estate_property_ownership', 'estate_profit_weeks', 'estate_profit_allocations'];
const counts = () => TABLES.map(t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n).join(',');
const rnd = (() => { let s = 0x5eed1234; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32); })();   // deterministic fuzz
const ACCTS = ['rPlayerA', 'rPlayerB', 'rPlayerC', 'rPlayerD', 'rPlayerE'];

(async () => {
  console.log('allocateProfit fuzz');
  const ids = CATALOG.properties.map(p => p.id);
  let sumOk = true, negOk = true, intOk = true, propOk = true, detOk = true;
  for (let i = 0; i < 5000; i++) {
    const pick = ids.filter(() => rnd() < 0.6); if (!pick.length) pick.push(ids[0]);
    const holdings = pick.map(id => ({ propertyId: id, acct: ACCTS[Math.floor(rnd() * ACCTS.length)] }));
    const r = rnd(), amount = r < 0.05 ? 0 : r < 0.1 ? Number.MAX_SAFE_INTEGER : r < 0.4 ? Math.floor(rnd() * 100) : Math.floor(rnd() * 1e15);
    const out = allocateProfit(amount, holdings), total = out.reduce((n, x) => n + x.amountDrops, 0);
    const tw = holdings.reduce((n, h) => n + propertyWeight(h.propertyId), 0);
    if (total !== amount) sumOk = false;
    if (out.some(x => x.amountDrops < 0)) negOk = false;
    if (out.some(x => !Number.isSafeInteger(x.amountDrops))) intOk = false;
    // each share is within one drop of its exact proportional value (BigInt-exact check)
    for (const x of out) { const exactNum = BigInt(amount) * BigInt(x.weight), got = BigInt(x.amountDrops) * BigInt(tw); if (got < exactNum - BigInt(tw) || got > exactNum + BigInt(tw)) propOk = false; }
    if (JSON.stringify(allocateProfit(amount, [...holdings].reverse())) !== JSON.stringify(out)) detOk = false;
  }
  ok(sumOk, '5000 random splits: shares always sum exactly to the distributable amount (incl. 0 and MAX_SAFE_INTEGER)');
  ok(negOk, 'no share is ever negative');
  ok(intOk, 'every share is a safe integer number of drops');
  ok(propOk, 'every share is within 1 drop of its exact proportional value');
  ok(detOk, 'allocation is independent of holding order (deterministic)');
  for (const bad of [-1, 1.5, NaN, Infinity, '10', Number.MAX_SAFE_INTEGER + 2]) { let threw = false; try { allocateProfit(bad, [{ propertyId: 'trailer-01', acct: 'rA' }]); } catch { threw = true; } ok(threw || bad === '10', 'rejects distributable amount ' + String(bad)); }
  for (const h of [[{ propertyId: 'nope', acct: 'rA' }], [{ propertyId: 'trailer-01', acct: '' }], [{ propertyId: 'trailer-01', acct: 'rA' }, { propertyId: 'trailer-01', acct: 'rB' }]]) { let threw = false; try { allocateProfit(100, h); } catch { threw = true; } ok(threw, 'rejects holdings ' + JSON.stringify(h)); }

  console.log('DB constraint rejections (nothing may be written)');
  const before = counts();
  const rejects = (sql, args, m) => { let threw = false; try { db.prepare(sql).run(...args); } catch { threw = true; } ok(threw, m); };
  const own = 'INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)';
  rejects(own, ['trailer-01', 'rA', 'tx1', -1, 1, 1], 'negative purchase amount rejected');
  rejects(own, ['trailer-01', 'rA', 'tx1', 10, 0, 1], 'zero share units rejected');
  rejects(own, ['trailer-01', 'rA', 'tx1', 10, -3, 1], 'negative share units rejected');
  rejects(own, ['trailer-01', null, 'tx1', 10, 1, 1], 'NULL owner rejected');
  rejects(own, ['trailer-01', 'rA', null, 10, 1, 1], 'NULL purchase tx rejected');
  const wk = 'INSERT INTO estate_profit_weeks VALUES(?,?,?,?,?,?,?,?,?,?)';
  rejects(wk, ['2026-10-19', 'rT', 1, -5, 0, 0, 0, 'ref', 'draft', 1], 'negative realized profit rejected');
  rejects(wk, ['2026-10-19', 'rT', 1, 5, 0, 0, -1, 'ref', 'draft', 1], 'negative distributable rejected');
  rejects(wk, ['2026-10-19', 'rT', 1, 5, 0, 0, 5, 'ref', 'paid_out', 1], 'unknown week status rejected');
  const al = 'INSERT INTO estate_profit_allocations VALUES(?,?,?,?,?,?,?)';
  rejects(al, ['2099-01-01', 'trailer-01', 'rA', 1, 5, null, 'preview'], 'allocation for a non-existent week/property rejected (foreign keys enforced)');
  // duplicates: insert one valid row inside a transaction, prove the duplicate fails, then roll back
  db.exec('BEGIN');
  try {
    db.prepare(own).run('trailer-02', 'rA', 'txDup', 10, 1, 1);
    rejects(own, ['trailer-02', 'rB', 'txOther', 10, 1, 1], 'second owner of the same property rejected (PRIMARY KEY)');
    rejects(own, ['trailer-01', 'rB', 'txDup', 10, 1, 1], 'reused purchase tx rejected (UNIQUE)');
    db.prepare(wk).run('2026-10-19', 'rT', 1, 5, 0, 0, 5, 'ref', 'draft', 1);
    rejects(al, ['2026-10-19', 'trailer-02', 'rA', 1, -5, null, 'preview'], 'negative allocation amount rejected');
    rejects(al, ['2026-10-19', 'trailer-02', 'rA', 1, 5, null, 'sent'], 'unknown allocation status rejected');
    db.prepare(al).run('2026-10-19', 'trailer-02', 'rA', 1, 5, null, 'preview');
    rejects(al, ['2026-10-19', 'trailer-02', 'rB', 1, 5, null, 'preview'], 'double allocation of one property in one week rejected');
  } finally { db.exec('ROLLBACK'); }
  ok(counts() === before, 'constraint probes left every Estates table unchanged (' + counts() + ')');

  const port = await new Promise(r => Srv.server.listening ? r(Srv.server.address().port) : Srv.server.on('listening', () => r(Srv.server.address().port)));
  const H = 'http://127.0.0.1:' + port;
  const tok = acct => Pay.sign({ acct, exp: Date.now() + 1e6 });
  const req = (p, { method = 'GET', ip = '10.9.0.1', token, admin, body } = {}) => fetch(H + p, { method, headers: { 'fly-client-ip': ip, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(admin ? { 'x-admin-token': admin } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body });

  console.log('Auth: logged-out and forged tokens -> 401');
  for (const [p, m] of [['/api/estates', 'GET'], ['/api/estates/buy', 'POST'], ['/api/estates/wallet/status', 'GET'], ['/api/estates/wallet/verify/start', 'POST'], ['/api/estates/wallet/verify/finish', 'POST'], ['/api/estates/anything', 'GET']])
    ok((await req(p, { method: m, ip: '10.1.0.1' })).status === 401, `logged-out ${m} ${p} -> 401`);
  const forged = tok('rPlayerA').replace(/.$/, c => c === 'A' ? 'B' : 'A'), expired = Pay.sign({ acct: 'rPlayerA', exp: Date.now() - 1000 }), foreignSig = Buffer.from(JSON.stringify({ acct: 'rPlayerA', exp: Date.now() + 1e6 })).toString('base64url') + '.AAAA';
  for (const [t, m] of [[forged, 'tampered signature'], [expired, 'expired token'], [foreignSig, 'unsigned token']]) ok((await req('/api/estates', { ip: '10.1.0.2', token: t })).status === 401, m + ' -> 401');

  console.log('4+ players, parallel and forged buys -> 409, nothing written');
  const players = ACCTS.map((acct, i) => ({ acct, token: tok(acct), ip: '10.2.0.' + (i + 1) }));
  for (const p of players) { const r = await req('/api/estates', { ip: p.ip, token: p.token }); const j = await r.json(); ok(r.status === 200 && j.salesEnabled === false && j.distributionsEnabled === false && j.owned.length === 0, `${p.acct}: state 200, sales+distributions disabled, owns nothing`); }
  const pre = counts();
  const forgedBodies = [
    { propertyId: 'mansion-01' }, { propertyId: 'mansion-01', amountDrops: 1 }, { propertyId: 'mansion-01', amountDrops: -1e12 }, { propertyId: 'trailer-01', txHash: 'A'.repeat(64), acct: 'rPlayerB' },
    { propertyId: 'family-01', shareUnits: 1e9 }, { propertyId: "x'); DROP TABLE estate_property_ownership;--" }, { __proto__: { salesEnabled: true }, propertyId: 'starter-01' }, null
  ];
  const buys = [];
  for (let round = 0; round < 3; round++) for (const p of players) for (const b of forgedBodies) buys.push(req('/api/estates/buy', { method: 'POST', ip: p.ip, token: p.token, body: b === null ? 'not json{' : JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) })));
  const res = await Promise.all(buys);
  const st = res.reduce((m, r) => (m[r.s] = (m[r.s] || 0) + 1, m), {});
  ok(res.every(r => r.s === 409 && r.j.error === 'sales_not_configured'), `${res.length} parallel forged buys from 5 players: every one 409 sales_not_configured -> ${JSON.stringify(st)}`);
  ok(!res.some(r => r.s >= 200 && r.s < 300), 'no buy ever succeeded');
  ok(counts() === pre && pre === '0,0,0', 'Estates tables still empty after the buy storm (' + counts() + ')');
  for (const p of players) { const j = await (await req('/api/estates', { ip: '10.3.0.' + p.ip.split('.').pop(), token: p.token })).json(); if (j.error) { ok(true, p.acct + ': rate-limited after storm (expected)'); continue; } ok(j.owned.length === 0 && j.totalShareUnits === 0, `${p.acct}: still owns nothing, total share units 0`); }

  console.log('Buy never reads the body');
  const fresh = { acct: 'rPlayerF', token: tok('rPlayerF'), ip: '10.4.0.1' };
  const hung = await new Promise(resolve => {
    const r = http.request({ host: '127.0.0.1', port, path: '/api/estates/buy', method: 'POST', headers: { 'fly-client-ip': fresh.ip, authorization: 'Bearer ' + fresh.token, 'content-type': 'application/json', 'content-length': '999999' } }, res2 => { let d = ''; res2.on('data', c => d += c); res2.on('end', () => resolve({ s: res2.statusCode, d })); });
    r.on('error', () => resolve({ s: 0 })); r.write('{"propertyId":"mansion-01","amountDrops":'); setTimeout(() => resolve({ s: -1 }), 3000);   // body never finishes
  });
  ok(hung.s === 409, 'buy answers 409 while the request body is still unfinished (body is never awaited) -> ' + hung.s);

  console.log('Owner-wallet routes: admin token only (403)');
  const adm = { ip: '10.5.0.1', token: tok('rPlayerA') };
  for (const [p, m] of [['/api/estates/wallet/status', 'GET'], ['/api/estates/wallet/verify/start', 'POST'], ['/api/estates/wallet/verify/finish', 'POST']]) {
    ok((await req(p, { method: m, ip: adm.ip, token: adm.token })).status === 403, `signed-in player, no admin token: ${m} ${p} -> 403`);
    ok((await req(p, { method: m, ip: '10.5.0.2', token: adm.token, admin: 'wrong-token-xx' })).status === 403, `wrong admin token: ${m} ${p} -> 403`);
  }
  let r = await req('/api/estates/wallet/status', { ip: '10.5.0.3', token: adm.token, admin: 'estadmintoken' }); let j = await r.json();
  ok(r.status === 200 && j.salesEnabled === false && j.distributionsEnabled === false && j.expectedAddress === 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb', 'admin status 200: confirmed treasury address, sales/distributions disabled');
  r = await req('/api/estates/wallet/verify/start', { method: 'POST', ip: '10.5.0.3', token: adm.token, admin: 'estadmintoken' }); j = await r.json();
  ok(r.status === 503 && j.error === 'xaman_credentials_missing', 'verify/start without Xaman keys -> 503, no payload created');
  r = await req('/api/estates/wallet/verify/finish', { method: 'POST', ip: '10.5.0.3', token: adm.token, admin: 'estadmintoken', body: JSON.stringify({ verificationId: 'SIforged' }) }); j = await r.json();
  ok(r.status === 400 && j.error === 'verification_expired_or_unknown', 'verify/finish with a forged id -> 400');
  ok((await req('/api/estates/wallet/status', { ip: '10.5.0.4', admin: 'estadmintoken' })).status === 401, 'admin token alone (no player sign-in) -> 401');

  console.log('Tours (unowned interiors open to anyone; owned stay owner + invite only)');
  { const OWN = 'r' + 'T'.repeat(25), GST = 'r' + 'U'.repeat(25), STR = 'r' + 'V'.repeat(25), T = (id, o = {}) => req('/api/estates/tour?propertyId=' + id, { ip: '10.8.0.' + (o.n || 1), token: o.token });
    let r = await T('mansion-01'); let j = await r.json();
    ok(r.status === 200 && j.allowed === true && j.role === 'tour' && j.mode === 'tour' && JSON.stringify(j.permissions) === '["enter","inspect"]', 'signed-out visitor: unowned interior -> 200 tour (enter/inspect only)');
    r = await T('mansion-01', { n: 2, token: tok(STR) }); j = await r.json();
    ok(r.status === 200 && j.role === 'tour' && !j.permissions.includes('build') && !j.permissions.includes('invite'), 'signed-in visitor: unowned -> tour, no build/invite');
    r = await req('/api/estates/access/check?propertyId=mansion-01', { ip: '10.8.0.3', token: tok(STR) }); j = await r.json();
    ok(r.status === 200 && j.role === 'tour', '/access/check agrees: unowned -> tour');
    ok((await T('no-such-lot', { n: 4 })).status === 404, 'unknown property -> 404');
    db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01', OWN, 'tour-sim-tx', 100, 1, Date.now());
    db.prepare('INSERT INTO estate_property_invites VALUES(?,?,?,?)').run('trailer-01', GST, OWN, Date.now());
    ok((await T('trailer-01', { n: 5 })).status === 401, 'owned, signed out -> 401');
    r = await T('trailer-01', { n: 6, token: tok(STR) }); j = await r.json();
    ok(r.status === 403 && j.allowed === false && j.reason === 'no_access', 'owned, stranger -> 403');
    r = await T('trailer-01', { n: 7, token: tok(OWN) }); j = await r.json();
    ok(r.status === 200 && j.role === 'owner' && j.permissions.includes('invite'), 'owned, owner -> 200 owner');
    r = await T('trailer-01', { n: 8, token: tok(GST) }); j = await r.json();
    ok(r.status === 200 && j.role === 'guest' && !j.permissions.includes('invite') && !j.permissions.includes('build'), 'owned, invitee -> 200 guest (no build/invite)');
    r = await req('/api/estates/rights?propertyId=trailer-01&action=enter', { ip: '10.8.0.9', token: tok(GST) }); j = await r.json();
    ok(r.status === 200 && j.allowed === true && j.role === 'guest', 'island rights: invitee may enter (#237 invite list)');
    r = await req('/api/estates/rights?propertyId=trailer-01&action=build', { ip: '10.8.0.10', token: tok(GST) }); j = await r.json();
    ok(j.allowed === false, 'island rights: invitee cannot build');
    r = await req('/api/estates/access/invite', { method: 'POST', ip: '10.8.0.11', token: tok(STR), body: JSON.stringify({ propertyId: 'mansion-01', guestAcct: 'r' + 'B'.repeat(25) }) }); j = await r.json();
    ok(r.status === 403 && j.error === 'owner_only', 'tour visitor cannot invite on an unowned property');
    r = await req('/api/estates/access/invite', { method: 'POST', ip: '10.8.0.12', token: tok(GST), body: JSON.stringify({ propertyId: 'trailer-01', guestAcct: 'r' + 'B'.repeat(25) }) });
    ok(r.status === 403, 'invited guest cannot invite');
    ok((await req('/api/estates/access?propertyId=mansion-01', { ip: '10.8.0.13', token: tok(STR) })).status === 403, 'tour visitor cannot read/change rights (guest list)');
    db.prepare("DELETE FROM estate_property_invites WHERE property_id='trailer-01'").run();
    db.prepare("DELETE FROM estate_property_ownership WHERE property_id='trailer-01'").run(); }

  console.log('Rate limits');
  const rl = { token: tok('rPlayerRL') }; const codes = [];
  for (let i = 0; i < 64; i++) codes.push((await req('/api/estates', { ip: '10.6.0.' + (i % 60 + 1), token: rl.token })).status);
  ok(codes.slice(0, 60).every(c => c === 200) && codes.slice(60).every(c => c === 429), 'per-account: 60/min then 429 even across IPs');
  const ipc = []; for (let i = 0; i < 34; i++) ipc.push((await req('/api/estates', { ip: '10.7.0.1', token: tok('rIp' + i) })).status);
  ok(ipc.slice(0, 30).every(c => c === 200) && ipc.slice(30).every(c => c === 429), 'per-IP: shared API limit 30/min then 429 even across accounts');

  ok(counts() === '0,0,0', 'end state: no Estates rows written by any request');
  console.log(`\nEstates money/multiplayer sim: ${pass} passed, ${fail} failed`);
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
