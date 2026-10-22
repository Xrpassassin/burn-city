// Blacktide trade + persistence rules: server-authoritative gold doubloons, prices, cargo capacity, hold upgrade, auth, rate limits, /data save.
const fs = require('fs'), path = require('path'), os = require('os');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcbt-'));
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', TOKEN_SECRET: 'simsecret', XRPL_WSS: 'ws://127.0.0.1:1', DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false' });
const BT = require('../server/blacktide'), Pay = require('../server/payments'), Srv = require('../server/server');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
(async () => {
  console.log('World data');
  const W = BT.world();
  ok(W.regions.length >= 2 && W.regions.every(r => typeof r.id === 'string' && Number.isInteger(r.levelMin) && typeof r.pvp === 'boolean'), 'regions carry id, levelMin, pvp');
  ok(W.regions.filter(r => r.live).every(r => r.pvp === false && r.protected) && W.regions[0].levelMin === 1, 'only protected non-PvP starter waters are live');
  ok(W.regions.filter(r => r.pvp).every(r => !r.live), 'PvP regions are data only (not live)');
  ok(W.goods.length >= 3 && W.goods.length <= 5 && W.ports.length >= 2, '3-5 goods, 2+ ports');
  ok(/not BURN/.test(W.currency.note), 'doubloons declared separate from BURN/XRPL/city money');
  const t = Date.UTC(2026, 9, 22, 12);
  for (const p of W.ports) for (const g of W.goods) { const pr = BT.price(p.id, g.id, t); if (!(pr.sell < pr.buy && pr.buy >= 1)) ok(false, 'spread ' + p.id + ' ' + g.id); }
  ok(true, 'every port/good: sell < buy (no same-port loop)');
  ok(BT.price('cinder-cove', 'rum', t).buy === BT.price('cinder-cove', 'rum', t + 60e3).buy, 'prices stable inside a tide');
  ok(BT.price('nowhere', 'rum', t) === null && BT.price('saltmere', 'gold', t) === null, 'unknown port/good has no price');

  console.log('Rules');
  const A = 'rTESTacctAAAAAAAAAAAAAAAAAAAAAAAA';
  let p = BT.view(BT.player(A)); ok(p.gold === BT.START.gold && p.cap === BT.START.cap && p.used === 0 && p.level === 1, 'new captain: starting gold + empty hold');
  const rum = BT.price('cinder-cove', 'rum', t).buy;
  let r = BT.buy(A, 'cinder-cove', 'rum', 3, t); ok(r.ok && r.gold === BT.START.gold - 3 * rum && r.hold.rum === 3, 'buy deducts server price x qty');
  ok(BT.buy(A, 'cinder-cove', 'rum', 0, t).error === 'bad_qty' && BT.buy(A, 'cinder-cove', 'rum', 1.5, t).error === 'bad_qty' && BT.buy(A, 'cinder-cove', 'rum', -2, t).error === 'bad_qty', 'qty must be a positive integer');
  ok(BT.buy(A, 'cinder-cove', 'rum', NaN, t).error === 'bad_qty', 'NaN qty rejected');
  ok(BT.buy(A, 'atlantis', 'rum', 1, t).error === 'bad_port' && BT.buy(A, 'saltmere', 'doubloons', 1, t).error === 'bad_good', 'unknown port/good rejected');
  ok(BT.buy(A, 'cinder-cove', 'timber', BT.START.cap - 3 + 1, t).error === 'hold_full', 'cannot exceed hold capacity');
  const g0 = BT.view(BT.player(A)).gold; r = BT.buy(A, 'saltmere', 'silk', 999, t); ok(r.error === 'hold_full' || r.error === 'not_enough_gold', 'cannot overspend'); ok(BT.view(BT.player(A)).gold === g0, 'failed buy changes nothing');
  r = BT.buy(A, 'cinder-cove', 'silk', 5, t); ok(r.error === 'not_enough_gold' && r.gold === g0, 'not enough gold rejected');
  ok(BT.sell(A, 'saltmere', 'rum', 4, t).error === 'not_enough_cargo', 'cannot sell cargo you lack');
  const rumSell = BT.price('saltmere', 'rum', t).sell; r = BT.sell(A, 'saltmere', 'rum', 3, t);
  ok(r.ok && r.gold === g0 + 3 * rumSell && !r.hold.rum && r.xp === 3, 'sell pays server price, empties slot, +xp');
  ok(BT.upgrade(A, 'speed').error === 'bad_upgrade', 'unknown upgrade rejected');
  ok(BT.upgrade(A, 'hold').error === 'not_enough_gold', 'hold upgrade needs gold');
  BT.player(A).gold = 5000; r = BT.upgrade(A, 'hold'); ok(r.ok && r.cap === BT.START.cap + BT.HOLD_UP.add && r.gold === 5000 - BT.HOLD_UP.cost[0], 'hold upgrade: +cap, costs gold');
  BT.upgrade(A, 'hold'); BT.upgrade(A, 'hold'); ok(BT.upgrade(A, 'hold').error === 'maxed', 'hold upgrade caps at max tier');

  console.log('Persistence');
  const saved = JSON.parse(fs.readFileSync(path.join(DIR, 'blacktide.json'), 'utf8'));
  ok(saved.players[A] && saved.players[A].cap === BT.START.cap + 3 * BT.HOLD_UP.add, 'saved to DATA_DIR/blacktide.json');
  const before = JSON.stringify(BT.view(BT.player(A))); BT._reset(); ok(JSON.stringify(BT.view(BT.player(A))) === before, 'reload from disk restores the captain');

  console.log('HTTP');
  const port = await new Promise(r => Srv.server.listening ? r(Srv.server.address().port) : Srv.server.on('listening', () => r(Srv.server.address().port)));
  const H = 'http://127.0.0.1:' + port, B = 'rTESTacctBBBBBBBBBBBBBBBBBBBBBBBB', tok = Pay.sign({ acct: B, exp: Date.now() + 1e6 });
  const call = (op, b, tk = tok, h = {}) => fetch(H + '/api/bt/' + op, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tk, ...h }, body: b ? JSON.stringify(b) : undefined });
  let res = await fetch(H + '/api/bt/world'), d = await res.json(); ok(res.status === 200 && d.ports.length && d.prices['saltmere'].rum.buy > 0, 'GET /world public with prices');
  res = await call('state', null, ''); ok(res.status === 401, 'state without token -> 401');
  res = await call('buy', { port: 'saltmere', good: 'sugar', qty: 1 }, Pay.sign({ acct: B, exp: Date.now() - 1 })); ok(res.status === 401, 'expired token -> 401');
  res = await call('buy', { port: 'saltmere', good: 'sugar', qty: 1 }, tok.slice(0, -2) + 'xx'); ok(res.status === 401, 'forged token -> 401');
  res = await call('state'); d = await res.json(); ok(res.status === 200 && d.gold === BT.START.gold && d.prices.saltmere, 'GET /state with token');
  const sug = d.prices.saltmere.sugar.buy;
  res = await call('buy', { port: 'saltmere', good: 'sugar', qty: 2, price: 0, gold: 99999, cap: 999 }); d = await res.json();
  ok(res.status === 200 && d.gold === BT.START.gold - 2 * sug && d.cap === BT.START.cap, 'client price/gold/cap fields ignored');
  res = await call('sell', { port: 'saltmere', good: 'sugar', qty: '2' }); d = await res.json(); ok(res.status === 400 && d.error === 'bad_qty', 'string qty rejected');
  res = await call('sell', { port: 'cinder-cove', good: 'sugar', qty: 2 }); d = await res.json(); ok(res.status === 200 && d.ok && d.used === 0, 'POST /sell');
  res = await call('upgrade', { kind: 'hold' }); ok(res.status === 400, 'upgrade without gold -> 400');
  res = await call('buy', null); ok(res.status === 404, 'GET on a POST op -> 404');
  let codes = []; for (let i = 0; i < 62; i++) codes.push((await call('state')).status);
  ok(codes.includes(429), 'per-captain rate limit (60/min) -> 429');
  console.log(`\nblacktide: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
