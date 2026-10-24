// Fishing fleet over the real HTTP + city WS routes: auth, concurrent buys (no double-spend), forged amounts ignored,
// per-account boat isolation, and the boat class other players see. Local only, no real keys.
const fs = require('fs'), path = require('path'), os = require('os'), xrpl = require('xrpl');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcfleet-'));
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', TOKEN_SECRET: 'fleetsecret', XRPL_WSS: 'ws://127.0.0.1:1', TREASURY_ADDRESS: xrpl.Wallet.generate().classicAddress, DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false' });
// An old (pre-fleet) save: fish_prof without xp/boats/selectedBoat columns, plus a corrupted row.
const LEGACY = xrpl.Wallet.generate().classicAddress, BROKEN = xrpl.Wallet.generate().classicAddress;
{ const { DatabaseSync } = require('node:sqlite'), old = new DatabaseSync(path.join(DIR, 'shop.db'));
  old.exec('CREATE TABLE fish_prof(acct TEXT PRIMARY KEY, coins INTEGER, rod TEXT, rods TEXT, bait TEXT, log TEXT, creel TEXT, n INTEGER); CREATE TABLE fish_catch(acct TEXT, t INTEGER, kg REAL, sp TEXT);');
  old.prepare('INSERT INTO fish_prof VALUES(?,?,?,?,?,?,?,?)').run(LEGACY, 321, 'carbon', '["basic","carbon"]', '{"worm":-1,"glow":4}', '{"perch":{"n":2,"best":0.9}}', '[]', 2);
  old.prepare('INSERT INTO fish_catch VALUES(?,?,?,?)').run(LEGACY, Date.now() - 864e5, 0.9, 'perch'); old.prepare('INSERT INTO fish_catch VALUES(?,?,?,?)').run(LEGACY, Date.now() - 864e5, 2.5, 'koi');
  old.prepare('INSERT INTO fish_prof VALUES(?,?,?,?,?,?,?,?)').run(BROKEN, 5, 'basic', '["basic"]', '{"worm":-1}', '{}', '[]', 0); old.close(); }
const Srv = require('../server/server'), Pay = require('../server/payments'), Fish = require('../server/fish'), WS = require('ws');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, every = 20) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v || Date.now() >= end) return v || undefined; await wait(every); } };
(async () => {
  const port = await new Promise(r => Srv.server.listening ? r(Srv.server.address().port) : Srv.server.on('listening', () => r(Srv.server.address().port)));
  const H = 'http://127.0.0.1:' + port;
  const [A, B, C, D] = [0, 1, 2, 3].map(() => xrpl.Wallet.generate().classicAddress);
  const tok = a => Pay.sign({ acct: a, exp: Date.now() + 3600e3 });
  const call = (a, op, body) => fetch(H + '/api/fish/' + op, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'fly-client-ip': '10.0.0.' + (1 + [A, B, C, D].indexOf(a)) + '.' + (call.n = (call.n || 0) + 1) % 8, ...(a ? { authorization: 'Bearer ' + tok(a) } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, data: await r.json() }));

  console.log('Old saves');
  { const L = Fish.get(LEGACY); ok(L.coins === 321 && L.rod === 'carbon' && L.boats.join() === 'skiff' && L.selectedBoat === 'skiff', 'pre-fleet save loads: coins/rod kept, starter skiff granted');
    ok(L.xp === Fish.xpForCatch({ r: 0, kg: 0.9 }) + Fish.xpForCatch({ r: 2, kg: 2.5 }), 'pre-fleet XP backfilled from server catch rows (' + L.xp + ')');
    Pay.sdb.prepare("UPDATE fish_prof SET boats='not json', selectedBoat='abyss' WHERE acct=?").run(BROKEN); const Bk = Fish.get(BROKEN);
    ok(Bk.boats.join() === 'skiff' && Bk.selectedBoat === 'skiff', 'corrupted boats JSON / unowned selection normalize to the skiff');
    Pay.sdb.prepare(`UPDATE fish_prof SET boats='["skiff","__proto__","abyss"]', selectedBoat='__proto__' WHERE acct=?`).run(BROKEN); const Bp = Fish.get(BROKEN);
    ok(Bp.boats.join() === 'skiff,abyss' && Bp.selectedBoat === 'skiff', 'unknown boat ids dropped on load'); }
  console.log('Auth');
  for (const [op, b] of [['state'], ['buy', { kind: 'boat', id: 'bass' }], ['boat-select', { id: 'bass' }], ['cast', { near: 1, x: 0, z: 0 }]]) ok((await call(null, op, b)).status === 401, 'logged out ' + op + ' -> 401');
  ok((await call(A, 'state')).data.selectedBoat === 'skiff' && (await call(A, 'state')).data.boats.join() === 'skiff', 'new account starts with only the starter skiff');

  console.log('Concurrent purchases');
  for (const a of [A, B, C, D]) Fish.importGuest(a, { coins: 2000 });
  let rs = await Promise.all(Array.from({ length: 10 }, () => call(A, 'buy', { kind: 'boat', id: 'bass', qty: 50, price: 0, cost: 1, coins: 999999 })));
  let st = Fish.get(A);
  ok(st.coins === 800, '10 parallel Bass Runner buys (forged qty/price/coins) charge exactly once: 2000 -> ' + st.coins);
  ok(st.boats.filter(b => b === 'bass').length === 1 && st.selectedBoat === 'bass', 'boat owned once and selected');
  ok(rs.every(r => r.status === 200 && r.data.profile && r.data.profile.coins === 800), 'repeat buys of an owned boat only re-select it');
  rs = await Promise.all(Array.from({ length: 8 }, () => call(A, 'buy', { kind: 'bait', id: 'shrimp', qty: 50 })));
  st = Fish.get(A);
  ok(rs.filter(r => r.data.profile).length === 3 && st.coins === 50 && st.bait.shrimp === 150, '8 parallel 250-coin bait buys with 800 coins: exactly 3 succeed, coins ' + st.coins + ', shrimp ' + st.bait.shrimp);
  ok(rs.filter(r => r.data.error === 'not_enough_coins').length === 5, 'the other 5 are refused');
  ok((await call(A, 'buy', { kind: 'boat', id: 'abyss' })).data.error === 'not_enough_coins' && Fish.get(A).coins === 50, 'unaffordable boat refused, coins untouched');
  for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '']) {
    const r1 = await call(B, 'buy', { kind: 'boat', id: bad }), r2 = await call(B, 'boat-select', { id: bad }), r3 = await call(B, 'buy', { kind: bad, id: bad });
    ok(r1.data.error === "unknown" && r2.data.error === "boat_not_owned" && r3.data.error === "unknown", JSON.stringify([r1.data.error, r2.data.error, r3.data.error, r3.status]) + " " + 'prototype/empty key ' + JSON.stringify(bad) + ' rejected');
  }
  ok(Fish.get(B).coins === 2000 && Fish.get(B).boats.join() === 'skiff', 'rejected keys changed nothing');

  console.log('Isolation');
  ok((await call(B, 'boat-select', { id: 'bass' })).data.error === 'boat_not_owned', "B cannot select A's boat");
  ok((await call(C, 'buy', { kind: 'boat', id: 'bass' })).data.profile.boats.includes('bass') && Fish.get(D).boats.join() === 'skiff' && Fish.get(B).boats.join() === 'skiff', "C's purchase does not leak to B or D");
  ok((await call(C, 'boat-select', { id: 'skiff' })).data.profile.selectedBoat === 'skiff' && Fish.get(A).selectedBoat === 'bass', 'selection is per account');

  console.log('4-client city presence (boat class others see)');
  const conns = [A, B, C, D].map(a => { const w = new WS('ws://127.0.0.1:' + port + '/?mode=city&token=' + encodeURIComponent(tok(a))); w.msgs = []; w.on('message', d => { try { w.msgs.push(JSON.parse(d)); } catch (e) { } }); return w; });
  await until(() => conns.every(w => w.msgs.some(m => m.t === 'w')));
  const ids = conns.map(w => w.msgs.find(m => m.t === 'w').id);
  const sendP = (w, bt) => w.send(JSON.stringify({ t: 'p', x: 1, y: 0, z: 2, r: 0, b: 1, bt, md: 'b' }));
  sendP(conns[0], 'bass'); sendP(conns[1], 'abyss'); sendP(conns[2], 'offshore'); sendP(conns[3], '__proto__');
  const snap = await until(() => { const s = [...conns[3].msgs].reverse().find(m => m.t === 's' && m.p.length === 4); return s; });
  const bt = id => snap && (snap.p.find(p => p[0] === id) || [])[13];
  ok(snap && bt(ids[0]) === 'bass', 'A (owns bass) shows Bass Runner to others');
  ok(bt(ids[1]) === 'skiff', 'B claims Abyssal Hunter without owning it -> shown as skiff');
  ok(bt(ids[2]) === 'skiff', 'C claims Offshore Cruiser without owning it -> shown as skiff');
  ok(bt(ids[3]) === 'skiff', 'prototype key boat id -> skiff');
  conns.forEach(w => w.close());
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
