// Promoted meme districts: the top Circle of XRPL Memes tokens (GET /api/memes-circle, Alpha order, Watchline excluded) that are
// NOT already city token districts become FULL city districts in window.ECO (their own tower, district, AMM rails, swirls,
// LP-lock halos, black-hole singularity, swap ships, tower cards). This is a first-class eco source, separate from eco.js's
// generic pool discovery (whose 12-district cap and thresholds are unchanged).
//   membership  rebuilt at most once a day from the memes snapshot (no extra xrpl.to calls: the snapshot is already built from
//               the daily xrpl.to read + hourly XRPLMeta). Hysteresis: a token ENTERS at rank <= ENTER (25) among the eligible
//               tokens and LEAVES only when it falls below LEAVE (32) - incumbents between 26 and 32 keep their seat while there
//               is room (SEATS, default 28). Tokens already in ECO (matched by issuer+currency, never by ticker) are skipped.
//   pools       found on our own XRPL connection (eco.rpc): amm_info for the token/XRP pair + every pair against an existing
//               city token and the other promoted tokens. "No pool" answers are cached 7 days; found pools are then read by
//               eco.js like every other city pool (subscription, hourly sweep).
//   persisted   <data>/memes-promoted.json, merged by eco.js at boot so districts are right on the first page load.
// Kill switch: MEMES_PROMOTE=0 (env / Fly secret) -> nothing is promoted and eco drops any promoted nodes; client ?promote=0.
'use strict';
const fs = require('fs'), path = require('path');

const ENTER = 25, LEAVE = 32, SEATS = +process.env.MEMES_PROMOTE_SEATS || 28;
const REBUILD_EVERY = 24 * 3600e3, CHECK_EVERY = 60 * 60e3, NEG_TTL = 7 * 24 * 3600e3, MIN_POOL_TVL = 50;
const enabled = () => String(process.env.MEMES_PROMOTE ?? '1') !== '0' && String(process.env.MEMES_CIRCLE ?? '1') !== '0';
const dataDir = () => process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
const FILE = () => path.join(dataDir(), 'memes-promoted.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const keyOf = t => t && t.issuer && t.currency ? t.issuer + '-' + t.currency : null;

// ---- pure: who is promoted (hysteresis) ----
// tokens: /api/memes-circle tokens (Alpha order); cityKeys: Set of issuer-currency keys already in ECO (NOT counting promoted
// ones); prev: previous members [{key, since}]. Returns members in rank order: [{key, issuer, currency, name, q, rank, erank,
// alpha, since}], erank = rank among the eligible (non-city, non-Watchline) tokens.
function select(tokens, cityKeys, prev = [], { enter = ENTER, leave = LEAVE, seats = SEATS, now = Date.now() } = {}) {
  const prevBy = new Map((prev || []).map(m => [m.key, m]));
  const elig = (Array.isArray(tokens) ? tokens : []).filter(t => t && t.q !== 'watchline' && t.rank != null && keyOf(t) && !cityKeys.has(keyOf(t)))
    .sort((a, b) => a.rank - b.rank);
  const seen = new Set(), list = [];
  for (const t of elig) { const k = keyOf(t); if (seen.has(k)) continue; seen.add(k); list.push(t); }
  const out = [];
  list.forEach((t, i) => { const erank = i + 1, k = keyOf(t), was = prevBy.get(k);
    if (erank <= enter || (was && erank <= leave)) out.push({ key: k, issuer: t.issuer, currency: t.currency, name: t.name, label: t.label, q: t.q, rank: t.rank, erank, alpha: t.alpha, amm: t.amm || null, since: was ? was.since : now }); });
  // top `enter` always hold a seat; incumbents between enter+1 and leave keep theirs while seats remain (best rank first)
  const core = out.filter(m => m.erank <= enter), grace = out.filter(m => m.erank > enter).slice(0, Math.max(0, seats - core.length));
  return [...core, ...grace].sort((a, b) => a.erank - b.erank);
}

// ---- pure: which pairs to ask the ledger about ----
// members: [{key}], partners: city tokens [{key}] (XRP excluded), neg: { 'A|B': ts } cached "no pool" answers.
const pairId = (a, b) => [a, b].sort().join('|');
function pairPlan(members, partners, neg = {}, now = Date.now(), known = new Set()) {
  const out = [], seen = new Set();
  const add = (a, b) => { const id = pairId(a, b); if (seen.has(id) || known.has(id)) return; seen.add(id); if (neg[id] && now - neg[id] < NEG_TTL) return; out.push([a, b]); };
  for (const m of members) { add(m.key, 'XRP'); for (const p of partners) if (p.key !== m.key) add(m.key, p.key); }
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) add(members[i].key, members[j].key);
  return out;
}
const asset = k => k === 'XRP' ? { currency: 'XRP' } : { currency: k.slice(k.indexOf('-') + 1), issuer: k.slice(0, k.indexOf('-')) };

let state = null, timer = null, running = false, rpcImpl = null, rpcGap = 110, ecoRef = null, memesRef = null;
const status = { enabled: true, ts: null, members: 0, pools: 0, calls: 0, callsLast: 0, err: null, lastTry: null };

function load() { try { const s = JSON.parse(fs.readFileSync(FILE(), 'utf8')); if (s && Array.isArray(s.members)) return s; } catch {} return null; }
function save() { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(state)); } catch (e) { console.error('[memes-promote] save', e.message); } }
function current() { if (!state) state = load(); return state; }

// one ledger pass: find the AMM pools for the members (cached negatives skipped). Returns [{amm, a, b}] with keys.
async function findPools(members, partners, prevPools, neg) {
  const mk = new Set(members.map(m => m.key)), pk = new Set(partners.map(c => c.key)), valid = k => k === 'XRP' || mk.has(k) || pk.has(k);
  const keep = (prevPools || []).filter(p => (mk.has(p.a) || mk.has(p.b)) && valid(p.a) && valid(p.b));
  const known = new Set(keep.map(p => pairId(p.a, p.b)));
  const plan = pairPlan(members, partners, neg, Date.now(), known), found = [...keep]; let calls = 0;
  for (const [a, b] of plan) {
    let r = null; calls++;
    try { r = await rpcImpl('amm_info', { asset: asset(a), asset2: asset(b), ledger_index: 'validated' }); } catch { r = null; }
    if (r && r.amm && r.amm.account) found.push({ amm: r.amm.account, a, b, fee_pct: (r.amm.trading_fee || 0) / 1000 });
    else if (r) neg[pairId(a, b)] = Date.now();   // actNotFound / no AMM for this pair (a thrown error is retried next time)
    if (rpcGap) await sleep(rpcGap);
  }
  return { pools: found, calls };
}

async function rebuild(force = false) {
  if (!enabled() || running || !rpcImpl || !ecoRef) return false;
  const md = memesRef && memesRef(); if (!md || !Array.isArray(md.tokens) || md.tokens.length < 20) { status.err = 'waiting for /api/memes-circle'; return false; }
  const s = current();
  if (!force && s && s.ts && Date.now() - s.ts < REBUILD_EVERY && s.src_ts) return false;
  running = true; status.lastTry = new Date().toISOString();
  try {
    const eco = ecoRef.data(); if (!eco) throw new Error('eco not ready');
    const cityNodes = eco.nodes.filter(n => !n.promoted && n.key && n.key.includes('-'));
    const cityKeys = new Set(cityNodes.map(n => n.key));
    const members = select(md.tokens, cityKeys, s ? s.members : []);
    const neg = { ...((s && s.neg) || {}) }; for (const [k, t] of Object.entries(neg)) if (Date.now() - t > NEG_TTL) delete neg[k];
    const { pools, calls } = await findPools(members, cityNodes, s ? s.pools : [], neg);
    const live = pools.filter(p => members.some(m => m.key === p.a || m.key === p.b)).map(p => ({ amm: p.amm, a: p.a, b: p.b, fee_pct: p.fee_pct }));
    state = { v: 1, ts: Date.now(), src_ts: md.ts || null, members, pools: live, neg, calls };
    save(); status.calls += calls; status.callsLast = calls; status.err = null;
    apply();
    return true;
  } catch (e) { status.err = e.message; console.error('[memes-promote]', e.message); return false; }
  finally { running = false; }
}

// hand the current list to eco.js (it builds nodes + pools, prices, reads, subscribes); MEMES_PROMOTE=0 hands an empty list
function apply() { if (!ecoRef || !ecoRef.applyPromoted) return; const s = enabled() ? current() : null;
  const r = ecoRef.applyPromoted(s ? s.members : [], s ? s.pools : []); if (r) Object.assign(status, { members: r.members, pools: r.pools }); status.ts = s && s.ts ? new Date(s.ts).toISOString() : null; }

function start(eco, memes) {
  ecoRef = eco; memesRef = () => memes.data(); if (!rpcImpl) rpcImpl = (m, p) => eco.rpc(m, p);
  status.enabled = enabled();
  if (!enabled()) { apply(); return false; }
  if (timer) return true;
  if (current()) apply();   // persisted list: eco already merged the saved snapshot at boot; this reconciles + reads anything missing
  const tick = async () => { try { await rebuild(false); } catch {} timer = setTimeout(tick, CHECK_EVERY); timer.unref?.(); };
  timer = setTimeout(tick, +process.env.MEMES_PROMOTE_DELAY_MS || 4 * 60e3); timer.unref?.();   // after eco's first reads + the memes snapshot
  return true;
}

// eco.js reports pools it dropped as too thin (< MIN_POOL_TVL real liquidity): forget them for NEG_TTL like a "no pool" answer
function markThin(amms) { const s = current(); if (!s || !amms.length) return; const t = new Set(amms); let n = 0; s.neg = s.neg || {};
  s.pools = s.pools.filter(p => { if (!t.has(p.amm)) return true; s.neg[pairId(p.a, p.b)] = Date.now(); n++; return false; }); if (n) save(); }
module.exports = { start, markThin, rebuild, select, pairPlan, pairId, current, apply, enabled, status: () => ({ ...status, enabled: enabled() }), FILE, ENTER, LEAVE, SEATS, MIN_POOL_TVL,
  _setRpc: (f, gap = 0) => { rpcImpl = f; rpcGap = gap; }, _setState: s => { state = s; }, _bind: (eco, memes) => { ecoRef = eco; memesRef = memes; }, _reset: () => { state = null; if (timer) clearTimeout(timer); timer = null; running = false; } };
