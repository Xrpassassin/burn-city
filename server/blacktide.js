// Blacktide (pirate region prototype, /blacktide/): server-authoritative trade + progression.
// Currency = gold doubloons, a Blacktide-only game currency. It is NOT BURN, XRP, any XRPL token or city money,
// and it can't be bought, sold or withdrawn. The client is never trusted for gold, prices, cargo or capacity.
// Identity = the existing XAMAN-signed bearer token (payments.js checkToken). Save file: <DATA_DIR>/blacktide.json.
const S = require('./store');
const FILE = 'blacktide.json';

// Regions: data model only. Only the protected starter waters are playable; PvP regions are designed (docs) but NOT live.
const REGIONS = [
  { id: 'ashen-shallows', name: 'Ashen Shallows', levelMin: 1, pvp: false, protected: true, live: true },
  { id: 'blackreach', name: 'Blackreach Straits', levelMin: 8, pvp: true, protected: false, live: false },
  { id: 'cinder-maw', name: 'The Cinder Maw', levelMin: 20, pvp: true, protected: false, live: false }
];
// Ports sit on the prototype's islands (client/blacktide/blacktide.js makeIsland positions).
const PORTS = [
  { id: 'cinder-cove', name: 'Cinder Cove', region: 'ashen-shallows', x: -56, z: -84, r: 30 },
  { id: 'saltmere', name: 'Saltmere', region: 'ashen-shallows', x: 120, z: 40, r: 26 },
  { id: 'gallows-reach', name: "Gallows Reach", region: 'ashen-shallows', x: -135, z: 115, r: 32 }
];
const GOODS = [
  { id: 'rum', name: 'Rum', base: 12 },
  { id: 'sugar', name: 'Sugar', base: 8 },
  { id: 'spice', name: 'Spice', base: 30 },
  { id: 'timber', name: 'Timber', base: 6 },
  { id: 'silk', name: 'Silk', base: 45 }
];
// Per-port multipliers: each port is cheap in something, dear in something else.
const MUL = {
  'cinder-cove': { rum: 0.7, sugar: 1.2, spice: 1.35, timber: 1.0, silk: 1.25 },
  'saltmere': { rum: 1.35, sugar: 0.7, spice: 1.0, timber: 1.3, silk: 0.75 },
  'gallows-reach': { rum: 1.15, sugar: 1.3, spice: 0.7, timber: 0.7, silk: 1.3 }
};
const SELL_SPREAD = 0.85;              // sell = 85% of the port's buy price: no same-port buy/sell loop makes gold
const START = { gold: 200, cap: 20 };
const HOLD_UP = { add: 10, max: 3, cost: [300, 700, 1500] };   // hold upgrade tiers, gold
const MAX_GOLD = 1e9;

let db = null;
const load = () => db || (db = (o => (o && o.players ? o : { v: 1, players: {} }))(S.load(FILE, null)));
const persist = () => S.save(FILE, db);
const goodsById = Object.fromEntries(GOODS.map(g => [g.id, g])), portsById = Object.fromEntries(PORTS.map(p => [p.id, p]));

// Prices drift a little with the tide: a deterministic +-10% wave per port/good per 6-hour tide, the same for everyone.
function tideFactor(port, good, t = Date.now()) {
  const tide = Math.floor(t / 216e5); let h = 2166136261;
  for (const c of port + '|' + good + '|' + tide) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return 0.9 + ((h >>> 0) % 2001) / 10000;     // 0.90 .. 1.10
}
function price(port, good, t) {
  const g = goodsById[good], m = MUL[port] && MUL[port][good]; if (!g || !m) return null;
  const buy = Math.max(1, Math.round(g.base * m * tideFactor(port, good, t)));
  return { buy, sell: Math.max(1, Math.floor(buy * SELL_SPREAD)) };
}
const prices = (port, t) => Object.fromEntries(GOODS.map(g => [g.id, price(port, g.id, t)]));

const level = xp => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 25));
function player(acct) {
  const d = load(); let p = d.players[acct];
  if (!p) p = d.players[acct] = { gold: START.gold, cap: START.cap, hold: {}, xp: 0, region: 'ashen-shallows', up: { hold: 0 }, trades: 0, created: Date.now() };
  return p;
}
const used = p => Object.values(p.hold).reduce((a, n) => a + n, 0);
const view = p => ({ gold: p.gold, cap: p.cap, used: used(p), hold: { ...p.hold }, xp: p.xp, level: level(p.xp), region: p.region, up: { ...p.up },
  nextHold: p.up.hold < HOLD_UP.max ? { add: HOLD_UP.add, cost: HOLD_UP.cost[p.up.hold] } : null });
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function buy(acct, port, good, qty, t) {
  if (!portsById[port]) return { error: 'bad_port' }; if (!goodsById[good]) return { error: 'bad_good' };
  if (!int(qty, 1, 1000)) return { error: 'bad_qty' };
  const p = player(acct), pr = price(port, good, t), cost = pr.buy * qty;
  if (used(p) + qty > p.cap) return { error: 'hold_full', ...view(p) };
  if (cost > p.gold) return { error: 'not_enough_gold', ...view(p) };
  p.gold -= cost; p.hold[good] = (p.hold[good] || 0) + qty; p.trades++; persist();
  return { ok: true, cost, ...view(p) };
}
function sell(acct, port, good, qty, t) {
  if (!portsById[port]) return { error: 'bad_port' }; if (!goodsById[good]) return { error: 'bad_good' };
  if (!int(qty, 1, 1000)) return { error: 'bad_qty' };
  const p = player(acct); if ((p.hold[good] || 0) < qty) return { error: 'not_enough_cargo', ...view(p) };
  const pr = price(port, good, t), got = pr.sell * qty;
  p.hold[good] -= qty; if (!p.hold[good]) delete p.hold[good];
  p.gold = Math.min(MAX_GOLD, p.gold + got); p.xp += qty; p.trades++; persist();
  return { ok: true, got, ...view(p) };
}
function upgrade(acct, kind) {
  if (kind !== 'hold') return { error: 'bad_upgrade' };
  const p = player(acct); if (p.up.hold >= HOLD_UP.max) return { error: 'maxed', ...view(p) };
  const cost = HOLD_UP.cost[p.up.hold]; if (p.gold < cost) return { error: 'not_enough_gold', ...view(p) };
  p.gold -= cost; p.up.hold++; p.cap += HOLD_UP.add; persist();
  return { ok: true, cost, ...view(p) };
}
const world = () => ({ prices: Object.fromEntries(PORTS.map(x => [x.id, prices(x.id)])), currency: { id: 'doubloon', name: 'gold doubloons', note: 'Blacktide-only game currency; not BURN, XRP, any token or city money' },
  regions: REGIONS, ports: PORTS, goods: GOODS, sellSpread: SELL_SPREAD, holdUpgrade: HOLD_UP });

// HTTP: GET /api/bt/world (public) · GET /api/bt/state · POST /api/bt/buy|sell {port,good,qty} · POST /api/bt/upgrade {kind:'hold'}
async function handle(req, res, url, { json, gate, ip, body, who }) {
  const op = url.pathname.slice(8);
  if (op === 'world' && req.method === 'GET') { if (gate('btw:' + ip, 30, 60e3)) return json(res, 429, { error: 'slow_down' }), true; return json(res, 200, world()), true; }
  const u = who(); if (!u || !u.acct) return json(res, 401, { error: 'sign_in_with_xaman' }), true;
  if (gate('bt:' + u.acct, 60, 60e3) || gate('btip:' + ip, 120, 60e3)) return json(res, 429, { error: 'slow_down' }), true;
  if (op === 'state' && req.method === 'GET') { const p = player(u.acct); return json(res, 200, { ...view(p), prices: Object.fromEntries(PORTS.map(x => [x.id, prices(x.id)])) }), true; }
  if (req.method !== 'POST') return json(res, 404, { error: 'not_found' }), true;
  const b = await body(), port = String(b.port || ''), good = String(b.good || ''), qty = typeof b.qty === 'number' ? b.qty : NaN;
  let r;
  if (op === 'buy') r = buy(u.acct, port, good, qty);
  else if (op === 'sell') r = sell(u.acct, port, good, qty);
  else if (op === 'upgrade') r = upgrade(u.acct, String(b.kind || ''));
  else return json(res, 404, { error: 'not_found' }), true;
  if (r.ok && portsById[port]) r.prices = prices(port);
  return json(res, r.error ? 400 : 200, r), true;
}
const _reset = () => { db = null; };   // tests: re-read the save file
module.exports = { handle, world, price, prices, buy, sell, upgrade, player, view, level, REGIONS, PORTS, GOODS, SELL_SPREAD, HOLD_UP, START, _reset };
