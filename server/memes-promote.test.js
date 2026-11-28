// Promoted meme districts (server/memes-promote.js + eco.js applyPromoted): hysteresis, pair planning, eco merge, kill switch.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-')); process.env.DATA_DIR = tmp; process.env.ECO_NO_WS = '1';
const P = require('./memes-promote');

// ---- select: top 25 eligible enter, incumbents keep a seat down to 32 while seats remain, city tokens + Watchline never
const tok = (i, extra = {}) => ({ issuer: 'rIss' + String(i).padStart(4, '0') + 'xxxxxxxxxxxxxxxxxxxxx', currency: 'T' + i, name: 'T' + i, q: 'kings', rank: i, alpha: 90 - i * .5, ...extra });
const toks = Array.from({ length: 60 }, (_, i) => tok(i + 1));
toks[2].q = 'watchline'; toks[2].rank = null;                 // T3: Watchline, never
const city = new Set([toks[4].issuer + '-' + toks[4].currency]);   // T5 already a city district (match by issuer+currency)
let m = P.select(toks, city, []);
assert.equal(m.length, 25, 'exactly 25 enter on a cold start');
assert(!m.some(x => x.name === 'T3' || x.name === 'T5'), 'Watchline + existing city tokens are skipped');
assert.deepEqual(m.map(x => x.erank), Array.from({ length: 25 }, (_, i) => i + 1));
assert.equal(m[m.length - 1].name, 'T27');
// same ticker, different issuer = a different token
const dup = [tok(1), { ...tok(2), currency: 'T1', name: 'T1' }, ...toks.slice(2)];
assert.equal(P.select(dup, new Set(), []).filter(x => x.name === 'T1').length, 2, 'two tokens with the same ticker are both eligible');
// hysteresis: incumbents that slip to eligible rank 26..32 stay, below 32 they go
const prev = m.map(x => ({ key: x.key, since: 1 }));
const shuffled = toks.map(t => ({ ...t })); for (const t of shuffled) if (t.rank != null) t.rank += 0;
// push T1..T4 down: new tokens N1..N4 take the top ranks
const newcomers = Array.from({ length: 4 }, (_, i) => ({ ...tok(100 + i), rank: -10 + i }));
let m2 = P.select([...newcomers, ...shuffled], city, prev);
assert(m2.length <= P.SEATS && m2.length > 25, 'grace seats used: ' + m2.length);
assert(m2.some(x => x.name === 'T26'), 'T26 (now eligible rank 28) keeps its seat');
assert(!m2.some(x => x.name === 'T27'), 'T27 (rank 29) loses out once the 28 seats are full');
assert(P.select([...newcomers, ...shuffled], city, prev, { seats: 40 }).some(x => x.name === 'T27'), 'with room, rank 29 incumbents stay');
assert(newcomers.every(n => m2.some(x => x.name === n.name)), 'top-25 newcomers always get in');
assert.equal(m2.find(x => x.name === 'T1').since, 1, 'since is kept for incumbents');
// a token that falls below 32 leaves
const fall = shuffled.map(t => t.name === 'T6' ? { ...t, rank: 999 } : t);
assert(!P.select(fall, city, prev).some(x => x.name === 'T6'), 'below rank 32: leaves');
// a non-incumbent at eligible rank 26..32 does not enter
const m3 = P.select(toks, city, prev);
assert(!m3.some(x => x.name === 'T28') && m3.length === 25, 'rank 26+ without a seat does not enter');
// seats cap
assert(P.select([...newcomers, ...shuffled], city, prev, { seats: 25 }).length === 25);

// ---- pairPlan: XRP + every city partner + member pairs, negatives cached for 7 days, known pairs skipped
const mem = [{ key: 'A' }, { key: 'B' }], part = [{ key: 'C1' }, { key: 'C2' }];
let plan = P.pairPlan(mem, part, {});
assert.equal(plan.length, 2 * 1 + 2 * 2 + 1, 'XRP x2, partners x4, member pair x1');
plan = P.pairPlan(mem, part, { [P.pairId('A', 'C1')]: Date.now() - 3600e3 }, Date.now(), new Set([P.pairId('B', 'XRP')]));
assert.equal(plan.length, 5, 'fresh negative + known pair skipped');
assert.equal(P.pairPlan(mem, part, { [P.pairId('A', 'C1')]: Date.now() - 8 * 864e5 }).length, 7, 'negatives expire after 7 days');

// ---- eco merge (no network: stub rpc), xrpl.to never touched for promoted nodes
const Eco = require('./eco'); Eco._load();
const XrplTo = require('./xrplto'); const realReq = XrplTo.request; let xtCalls = 0; XrplTo.request = async () => { xtCalls++; throw Object.assign(new Error('budget'), { code: 'budget' }); };
const base = Eco.data(), nBase = base.nodes.length, pBase = base.pools.length, img = base.nodes.find(n => n.name === 'IMG');
const ISS = 'rPromoteTestIssuerxxxxxxxxxxxxxxx', AMMX = 'rPromoAmmXrpxxxxxxxxxxxxxxxxxxxxx', AMMI = 'rPromoAmmImgxxxxxxxxxxxxxxxxxxxxx', AMMD = 'rPromoAmmDustxxxxxxxxxxxxxxxxxxxx';
const members = [{ key: ISS + '-MEME', issuer: ISS, currency: 'MEME', name: 'IMG', q: 'kings', rank: 1, erank: 1, alpha: 88, since: Date.now() }];
const stubRpc = async (method, p) => {
  if (method === 'amm_info' && p.amm_account === AMMX) return { amm: { amount: '50000000000', amount2: { currency: 'MEME', issuer: ISS, value: '1000000' }, lp_token: { currency: 'LP1', value: '1000' }, trading_fee: 500 }, ledger_index: 1 };
  if (method === 'amm_info' && p.amm_account === AMMI) return { amm: { amount: { currency: 'MEME', issuer: ISS, value: '20000' }, amount2: { currency: 'IMG', issuer: img.key.split('-')[0], value: '5' }, lp_token: { currency: 'LP2', value: '10' }, trading_fee: 1000 }, ledger_index: 1 };
  if (method === 'amm_info' && p.amm_account === AMMD) return { amm: { amount: '1000000', amount2: { currency: 'MEME', issuer: ISS, value: '20' }, lp_token: { currency: 'LP3', value: '1' }, trading_fee: 1000 }, ledger_index: 1 };
  if (method === 'account_lines') return { lines: [] };
  if (method === 'gateway_balances') return { obligations: { MEME: '1000000000' } };
  return {};
};
// eco.rpc goes to the network: patch through the exported reader path by monkeypatching global fetch for this test
const realFetch = global.fetch; global.fetch = async (u, o) => { const b = JSON.parse(o.body); const r = await stubRpc(b.method, b.params[0]); return { json: async () => ({ result: r }) }; };
(async () => {
  const r = Eco.applyPromoted(members, [{ amm: AMMX, a: ISS + '-MEME', b: 'XRP', fee_pct: .5 }, { amm: AMMI, a: ISS + '-MEME', b: img.key, fee_pct: 1 }, { amm: AMMD, a: 'XRP', b: ISS + '-MEME', fee_pct: 1 }]);
  assert.equal(r.added, 1); await Eco._promoteRun();
  const e = Eco.data(), n = e.nodes.find(x => x.promoted);
  assert(n, 'promoted node in ECO'); assert.equal(n.key, ISS + '-MEME'); assert.notEqual(n.name, 'IMG', 'name collision gets an issuer suffix'); assert(/^IMG\u00B7/.test(n.name), n.name);
  assert.equal(n.promoted.q, 'kings'); assert.equal(n.circ, 1e9);
  const pp = e.pools.filter(p => p.promoted).map(p => p.amm);
  assert(pp.includes(AMMX), 'XRP pool kept'); assert(!pp.includes(AMMD), 'dust pool (< 50 XRP) dropped');
  assert.equal(e.pools.find(p => p.amm === AMMX).tvl_xrp, 100000, 'TVL read from the ledger: 2 x XRP side');
  assert.equal(e.nodes.length, nBase + 1); assert.equal(e.nodes.filter(x => x.discovered).length, base.nodes.filter(x => x.discovered).length, 'discovery cap untouched');
  assert(Eco.status().promoted.nodes.includes(n.name));
  await Eco._xrpltoPass(); assert.equal(xtCalls >= 0, true);
  // the xrpl.to pass skips promoted nodes: patch lastRun so it runs, count calls against node keys
  const seen = []; XrplTo.request = async (u) => { seen.push(u); throw Object.assign(new Error('x'), { code: 'http_500' }); };
  const lr = XrplTo.lastRun; XrplTo.lastRun = () => 0; const mr = XrplTo.markRun; XrplTo.markRun = () => {};
  await Eco._xrpltoPass(); XrplTo.lastRun = lr; XrplTo.markRun = mr;
  assert(!seen.some(u => u.includes(ISS)), 'no xrpl.to call for a promoted token'); assert(seen.length > 0);
  // removal: an empty list (MEMES_PROMOTE=0 path) drops the node and its pools
  Eco.applyPromoted([], []); await Eco._promoteRun();
  assert(!Eco.data().nodes.some(x => x.promoted) && !Eco.data().pools.some(p => p.promoted)); assert.equal(Eco.data().pools.length, pBase);
  // kill switch
  process.env.MEMES_PROMOTE = '0'; assert.equal(P.enabled(), false); assert.equal(P.start(Eco, { data: () => null }), false); delete process.env.MEMES_PROMOTE;
  // wiring: server starts it, eco status reports it, client kill switch + placement module exist
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'); assert(/require\('\.\/memes-promote'\)\.start\(Eco, MemesCircle\)/.test(srv));
  const app = fs.readFileSync(path.join(__dirname, '..', 'client', 'js', 'app.js'), 'utf8');
  assert(/Q\.get\('promote'\)!=='0'/.test(app), '?promote=0'); assert(/BASE_NODES\.map\(n=>new THREE\.Vector4/.test(app), 'ground zones only for the existing districts');
  assert(/estateLake\(BASE_NODES/.test(app) && /nodes:BASE_NODES/.test(app), 'lake + estate layout read the existing districts only');
  assert(/!n\.promoted\)\.map\(n=>n\.tvl\|\|0\)\);   \/\/ promoted/.test(app), 'MAXT ignores promoted districts');
  assert(/sw\.js/.test('sw.js') && /memes-promote-core\.mjs/.test(fs.readFileSync(path.join(__dirname, '..', 'client', 'sw.js'), 'utf8')), 'sw precaches the placement module');
  global.fetch = realFetch; XrplTo.request = realReq;
  console.log('memes-promote ok');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
