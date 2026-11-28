// Live city data (window.ECO). Every AMM pool in the city is subscribed on the XRP Ledger: any validated transaction that
// touches a pool re-reads its reserves within ~2 s, re-prices every token and republishes. Market stats (24h change,
// volume, holders, market cap) from XRPLMeta every 15 min; 1h change + 24h unique traders from xrpl.to every 6 h through the
// shared xrpl.to budget (server/xrplto.js). Outstanding supply + LP-lock sweep + new-pool discovery hourly.
// Read-only public requests. Base structure (burn history, scars, holder bands) comes from client/data.js.
// GET /data.js = full ECO for page load · GET /api/eco/live = compact live values for in-page polling · GET /api/eco = status.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), xrpl = require('xrpl');
const XrplTo = require('./xrplto');   // shared xrpl.to queue + daily budget (eco has top priority); X-Api-Key when XRPLTO_API_KEY is set
const XM = require('./xrplmeta');      // keyless XRPLMeta token metrics
const Promote = require('./memes-promote');   // promoted meme districts (first-class source, own file on /data; MEMES_PROMOTE=0 kill switch)
const FILE = path.join(__dirname, '..', 'client', 'data.js');
const RPC = ['https://xrplcluster.com/', 'https://s2.ripple.com:51234/', 'https://s1.ripple.com:51234/'];
const WSS = ['wss://xrplcluster.com', 'wss://s2.ripple.com', 'wss://s1.ripple.com'];
const G = require('../client/js/goldlock.js');   // shared strict gold / black-hole rule (also used by the client + lock audit)
const MARKET_EVERY = 15 * 60e3, XRPLTO_EVERY = 6 * 3600e3, SWEEP_EVERY = 60 * 60e3, DISCOVER_MIN_TVL = 50, DISCOVER_NEW_TOKEN_TVL = 2500, DISCOVER_MAX_NEW = 12;
let eco = null, out = null, live = null, ver = 0, ws = null, wsi = 0, lastLedger = null;
const status = { ok: false, ts: null, pools: 0, tokens: 0, stream: 'off', ledger: null, poolUpdates: 0, lastPoolUpdate: null, market: null, sweep: null, discovered: [], err: null };
const res = {}, bhCache = new Map(), notAmm = new Set(), pending = new Set(); let flushT = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const side = x => typeof x === 'string' ? { cur: 'XRP', v: +x / 1e6 } : { cur: x.currency, iss: x.issuer, v: +x.value };
// Token names reach players' browsers, and anyone can issue a currency whose code decodes to markup: keep only
// [A-Za-z0-9 ._·$-] names; anything else is shown as its hex code (security hardening, HANDOFF "Security hardening").
const SAFE_NAME = /^[A-Za-z0-9 ._\u00B7$-]{1,48}$/;
const curHex = c => /^[0-9A-F]{40}$/i.test(c) ? c.toUpperCase() : Buffer.from(c, 'latin1').toString('hex').toUpperCase();
const curName = c => { c = String(c || ''); const n = c.length === 40 ? Buffer.from(c, 'hex').toString('latin1').replace(/\0/g, '').trim() || c : c;
  return SAFE_NAME.test(n) ? n : curHex(c); };
const safeNodeName = (name, key) => typeof name === 'string' && SAFE_NAME.test(name) ? name
  : curName(String(key || '').slice(String(key || '').indexOf('-') + 1));

const DISC_FILE = fs.existsSync('/data') ? '/data/eco-discovered.json' : path.join(__dirname, 'eco-discovered.json');
// discovered pools/tokens survive restarts, so towers are right from the first page load instead of after the hourly sweep
function loadBase() { const s = fs.readFileSync(FILE, 'utf8'); const e = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  try { const d = JSON.parse(fs.readFileSync(DISC_FILE, 'utf8')); const keys = new Set(e.nodes.map(n => n.key)), names = new Set(e.nodes.map(n => n.name)), amms = new Set(e.pools.map(p => p.amm));
    const renamed = {};   // discovered names saved before the safe-name rule: re-derive them from the currency code
    for (const n of d.nodes || []) { const nm = safeNodeName(n.name, n.key); if (nm !== n.name) { renamed[n.name] = nm; n.name = nm; }
      if (!keys.has(n.key) && !names.has(n.name)) { e.nodes.push(n); keys.add(n.key); names.add(n.name); } }
    for (const p of d.pools || []) { if (Object.hasOwn(renamed, p.a)) p.a = renamed[p.a]; if (Object.hasOwn(renamed, p.b)) p.b = renamed[p.b];
      if (!amms.has(p.amm) && names.has(p.a) && names.has(p.b)) { e.pools.push(p); amms.add(p.amm); } }
  } catch {}
  try { mergePromotedSnap(e); } catch {}
  return e; }
// promoted meme districts: last values (tvl, prices, LP) persisted beside the membership file, so towers are right at boot
const PROMO_SNAP = () => Promote.FILE().replace(/\.json$/, '-eco.json');
function mergePromotedSnap(e) {
  if (!Promote.enabled()) return; const st = Promote.current(); if (!st || !st.members.length) return;
  const want = new Set(st.members.map(m => m.key)); let snap = null; try { snap = JSON.parse(fs.readFileSync(PROMO_SNAP(), 'utf8')); } catch { return; }
  const keys = new Set(e.nodes.map(n => n.key)), names = new Set(e.nodes.map(n => n.name)), amms = new Set(e.pools.map(p => p.amm));
  for (const n of snap.nodes || []) { if (!want.has(n.key) || keys.has(n.key)) continue; const nm = safeNodeName(n.name, n.key); if (names.has(nm)) continue; n.name = nm; e.nodes.push(n); keys.add(n.key); names.add(nm); }
  for (const p of snap.pools || []) if (!amms.has(p.amm) && names.has(p.a) && names.has(p.b)) { e.pools.push(p); amms.add(p.amm); }
}
function saveDiscovered() { try { fs.writeFileSync(DISC_FILE, JSON.stringify({ ts: new Date().toISOString(), nodes: eco.nodes.filter(n => n.discovered), pools: eco.pools.filter(p => p.discovered) })); } catch (e) { console.error('save discovered', e.message); }
  if (Promote.enabled() && eco.nodes.some(n => n.promoted)) try { fs.mkdirSync(path.dirname(PROMO_SNAP()), { recursive: true }); fs.writeFileSync(PROMO_SNAP(), JSON.stringify({ ts: new Date().toISOString(), nodes: eco.nodes.filter(n => n.promoted), pools: eco.pools.filter(p => p.promoted) })); } catch (e) { console.error('save promoted', e.message); } }
async function rpc(method, p) {
  if (ws && ws.isConnected()) { try { const r = (await ws.request({ command: method, ...p })).result; return r; } catch (e) { if (e.data && e.data.error === 'actNotFound') return { error: 'actNotFound' }; } }
  let err;
  for (const u of RPC) {
    try { const r = (await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params: [p] }), signal: AbortSignal.timeout(20e3) })).json()).result || {};
      if (r.status === 'error') { err = r.error; if (r.error === 'actNotFound') return r; continue; } return r; } catch (e) { err = e.message; }
  }
  throw new Error(String(err));
}
async function xrplto(key) { const r = await XrplTo.request('https://api.xrpl.to/v1/token/' + key, { prio: 'eco', headers: { 'user-agent': 'burn-city/1' }, timeout: 15e3 }); if (!r.ok) return null; const j = await r.json(); return j.token || j; }
async function isBlackhole(acct) {
  const c = bhCache.get(acct); if (c && Date.now() - c.t < 6 * 3600e3) return c.bh; let bh = false;
  // black hole = master key disabled AND (no RegularKey or RegularKey is a known black-hole address) AND no SignerList (client/js/goldlock.js)
  try { const r = await rpc('account_info', { account: acct, ledger_index: 'validated', signer_lists: true }); bh = G.isBlackholedInfo(r); } catch { return c ? c.bh : false; }
  bhCache.set(acct, { bh, t: Date.now() }); return bh;
}
const idx = () => { const byKey = {}, byName = {}; for (const n of eco.nodes) { byName[n.name] = n; if (n.key && n.key.includes('-')) byKey[n.key] = n; } return { byKey, byName }; };

// ---- per-pool ledger reads ----
async function readPool(p, withLines) {
  const r = await rpc('amm_info', { amm_account: p.amm, ledger_index: 'validated' });
  if (r.error === 'actNotFound' || !r.amm) { delete res[p.amm]; p.tvl_xrp = 0; p.gone = true; return; }
  if (!eco.pools.includes(p)) { delete res[p.amm]; return; }   // dropped while the read was in flight (promoted thin pool, removed district)
  const a = r.amm; res[p.amm] = { A: side(a.amount), B: side(a.amount2), lp: a.lp_token }; p.fee_pct = (a.trading_fee || 0) / 1000; delete p.gone;
  if (r.ledger_index) lastLedger = r.ledger_index;
  if (withLines) await readLP(p);
}
async function readLP(p) {
  const r = res[p.amm]; if (!r) return; const tot = +r.lp.value; if (!(tot > 0)) return; const lines = []; let marker;
  do { const al = await rpc('account_lines', { account: p.amm, ledger_index: 'validated', limit: 400, ...(marker ? { marker } : {}) });
    for (const l of al.lines || []) if (l.currency === r.lp.currency && Math.abs(+l.balance) > 0) lines.push({ acct: l.account, v: Math.abs(+l.balance) });
    marker = al.marker; } while (marker && lines.length < 4000);
  lines.sort((x, y) => y.v - x.v); let locked = 0; const oldTag = Object.fromEntries((p.top_lp || []).map(t => [t.acct, t.tag]));
  for (const l of lines) if (l.v / tot >= 0.001 && await isBlackhole(l.acct)) { l.bh = true; locked += l.v; }
  // floor (never round up): 94.96% must not display/count as 95.0% and pass the strict gold rule
  p.locked_pct = Math.floor(10 * G.lockedPct(lines, tot) + 1e-9) / 10; p.lp_holders = lines.length;
  p.top_lp = lines.slice(0, 4).map(l => ({ acct: l.acct, pct: +(100 * l.v / tot).toFixed(2), tag: l.bh ? 'BH' : (oldTag[l.acct] ?? '') }));
}

// ---- pure recompute: prices from AMM reserves, TVL, market caps ----
function recompute() {
  const { byKey } = idx(); const nameOf = s => s.cur === 'XRP' ? 'XRP' : (byKey[s.iss + '-' + s.cur] || {}).name;
  const price = { XRP: { v: 1, src: 'xrp', d: 1e18 } };
  for (let hop = 0; hop < 3; hop++) { const cand = {};
    for (const { A, B } of Object.values(res)) { const a = nameOf(A), b = nameOf(B);
      for (const [x, sx, y, sy] of [[a, A, b, B], [b, B, a, A]]) {
        if (!x || price[x] || !price[y] || sx.v <= 0) continue; const depth = sy.v * price[y].v;
        if (!cand[x] || depth > cand[x].d) cand[x] = { v: depth / sx.v, src: y === 'XRP' ? 'amm-xrp' : 'amm-via-' + y, d: depth }; } }
    Object.assign(price, cand); }
  const val = s => { if (s.cur === 'XRP') return s.v; const n = byKey[s.iss + '-' + s.cur]; const pr = n && (price[n.name] ? price[n.name].v : n.price_xrp); return pr ? s.v * pr : 0; };
  const priced = s => s.cur === 'XRP' || val(s) > 0 || !(s.v > 0);
  for (const p of eco.pools) { const r = res[p.amm]; if (!r) { p.gold = G.isGold(p); continue; }
    const xrpPair = r.A.cur === 'XRP' || r.B.cur === 'XRP';
    p.tvl_xrp = +(r.A.cur === 'XRP' ? 2 * r.A.v : r.B.cur === 'XRP' ? 2 * r.B.v : val(r.A) + val(r.B)).toFixed(2);
    p.tvl_priced = xrpPair || (priced(r.A) && priced(r.B));   // non-XRP pair: both sides need an XRP price, else never gold
    p.gold = G.isGold(p); }
  for (const n of eco.nodes) {
    const ps = eco.pools.filter(p => p.a === n.name || p.b === n.name);
    n.tvl = +ps.reduce((s, p) => s + (p.tvl_xrp || 0), 0).toFixed(2); n.pools = ps.filter(p => !p.gone).length;
    if (!byKey[n.key]) continue; const pr = price[n.name];
    if (pr) { n.price_amm = pr.v; n.price_src = pr.src; n.price_depth = +pr.d.toFixed(2); n.price_thin = pr.d < 1000; n.mcap_amm = n.circ != null && pr.d >= 100 ? n.circ * pr.v : null; }
    else n.mcap_amm = null;
    // headline market cap (drives tower height): AMM price when >=1,000 XRP of liquidity backs it; otherwise xrpl.to's market cap;
    // otherwise the thin AMM price (flagged). Stops a token with a few hundred XRP of liquidity from towering over real ones.
    if (n.mcap_amm != null && n.price_depth >= 1000) { n.mcap = n.mcap_amm; n.mcap_src = 'amm'; }
    else if (n.mcap_xrp > 0) { n.mcap = n.mcap_xrp; n.mcap_src = 'market'; }
    else if (n.mcap_amm != null) { n.mcap = n.mcap_amm; n.mcap_src = 'amm-thin'; }
    else { n.mcap = null; n.mcap_src = null; }
    if (n.burn_complete && n.circ != null) n.burned_pct = +(100 * n.burn_vol / (n.burn_vol + n.circ)).toFixed(3);
  }
}
const NODE_LIVE = ['tvl', 'pools', 'price_xrp', 'price_amm', 'price_src', 'price_depth', 'price_thin', 'mcap_amm', 'mcap_xrp', 'mcap', 'mcap_src', 'circ', 'pro24h', 'pro1h', 'pro7d', 'vol24h', 'holders', 'active', 'active_src', 'burned_pct'];
const POOL_LIVE = ['tvl_xrp', 'tvl_priced', 'gold', 'fee_pct', 'locked_pct', 'lp_holders', 'top_lp', 'gone'];
function publish() {
  eco.ts = new Date().toISOString().slice(0, 19) + 'Z'; eco.enriched_ts = eco.ts; eco.live = true; eco.ledger = lastLedger; ver++;
  const body = 'window.ECO=' + JSON.stringify(eco) + ';\n';
  out = { body, etag: '"e' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"' };
  const L = { v: ver, ts: eco.ts, ledger: lastLedger, nodes: {}, pools: {} };
  for (const n of eco.nodes) { const o = {}; for (const k of NODE_LIVE) if (n[k] !== undefined) o[k] = n[k]; L.nodes[n.name] = o; }
  for (const p of eco.pools) if (p.amm) { const o = {}; for (const k of POOL_LIVE) if (p[k] !== undefined) o[k] = p[k]; L.pools[p.amm] = o; }
  L.recent = recent.slice(-120); live = { body: JSON.stringify(L), etag: '"l' + ver + '"' };
  Object.assign(status, { ok: true, ts: eco.ts, ledger: lastLedger, pools: Object.keys(res).length, tokens: Object.keys(idx().byKey).length });
}

// ---- real-time: subscribe to every pool account, re-read pools touched by each validated tx ----
function queue(amm) { pending.add(amm); if (!flushT) flushT = setTimeout(flush, 1500); }
async function flush() {
  flushT = null; const list = [...pending]; pending.clear();
  for (const amm of list) { const p = eco.pools.find(x => x.amm === amm); if (!p) continue;
    try { await readPool(p, !p.promoted); status.poolUpdates++; } catch (e) { status.err = 'pool ' + e.message; } }
  status.lastPoolUpdate = new Date().toISOString(); recompute(); publish();
}

// recent swaps through city pools (same parsing as client live.js), so a fresh page load can show the last few minutes of traffic
const recent = [];
const recentSeen = new Set();
function trades(t, when) {
  const tx = t.tx_json || t.transaction || {}, meta = t.meta || {}; if (meta.TransactionResult !== 'tesSUCCESS' || (tx.TransactionType !== 'Payment' && tx.TransactionType !== 'OfferCreate')) return;
  const byAmm = {}; for (const p of eco.pools) if (p.amm) byAmm[p.amm] = p; const { byKey } = idx(); const touched = new Map();
  const tokOf = (p, iss, cur) => { const n = byKey[iss + '-' + cur]; return n && (n.name === p.a || n.name === p.b) ? n : null; };
  for (const w of meta.AffectedNodes || []) { const n = w.ModifiedNode || w.CreatedNode || w.DeletedNode; if (!n) continue; const f = n.FinalFields || n.NewFields || {}, pf = n.PreviousFields || {};
    if (n.LedgerEntryType === 'AccountRoot' && byAmm[f.Account] && pf.Balance != null) { const p = byAmm[f.Account], o = touched.get(p) || {}; o.XRP = (f.Balance - pf.Balance) / 1e6; touched.set(p, o); }
    if (n.LedgerEntryType === 'RippleState' && pf.Balance && f.Balance) { const hi = f.HighLimit && f.HighLimit.issuer, lo = f.LowLimit && f.LowLimit.issuer, amm = byAmm[hi] ? hi : byAmm[lo] ? lo : null; if (!amm) continue;
      const p = byAmm[amm], other = amm === lo ? hi : lo, tk = tokOf(p, other, f.Balance.currency); if (!tk) continue; const o = touched.get(p) || {}; o[tk.name] = (amm === lo ? 1 : -1) * (+f.Balance.value - (+pf.Balance.value)); touched.set(p, o); } }
  const arb = tx.TransactionType === 'Payment' && tx.Account === tx.Destination, hops = touched.size, hash = t.hash || tx.hash;
  for (const [p, d] of touched) { const ks = Object.keys(d).filter(k => d[k]), from = ks.find(k => d[k] > 0) || null, to = ks.find(k => d[k] < 0) || null;
    let xrp = d.XRP ? Math.abs(d.XRP) : 0; if (!xrp) for (const k of ks) { const n = eco.nodes.find(x => x.name === k); const pr = n && (n.price_amm || n.price_xrp); if (pr) xrp = Math.max(xrp, Math.abs(d[k]) * pr); }
    const key = hash + ':' + p.amm; if (xrp > 0 && !recentSeen.has(key)) { recentSeen.add(key); recent.push({ hash, amm: p.amm, acct: tx.Account, xrp: +xrp.toFixed(4), from, to, arb, hops, kind: tx.TransactionType, t: when || Date.now() }); } }
  recent.sort((x, y) => x.t - y.t); const cut = Date.now() - 30 * 60e3; while (recent.length && (recent[0].t < cut || recent.length > 200)) { const r = recent.shift(); recentSeen.delete(r.hash + ':' + r.amm); }
  status.trades15m = recent.length;
}
async function connect() {
  const url = WSS[wsi++ % WSS.length]; status.stream = 'connecting';
  try {
    const c = new xrpl.Client(url, { connectionTimeout: 15e3 }); await c.connect(); ws = c; status.stream = 'live ' + url;
    const accts = eco.pools.filter(p => p.amm && !p.promoted).map(p => p.amm);   // promoted pools ride their own shards (connectPromoted)
    await c.request({ command: 'subscribe', accounts: accts, streams: ['ledger'] });
    c.on('ledgerClosed', l => { status.ledger = l.ledger_index; });
    c.on('transaction', t => { if (!t.validated) return; const s = JSON.stringify(t.meta || {}) + JSON.stringify(t.tx_json || t.transaction || {});
      for (const a of accts) if (s.includes(a)) queue(a); try { trades(t); } catch {} });
    c.on('disconnected', () => { status.stream = 'reconnecting'; ws = null; setTimeout(connect, 5e3); });
  } catch (e) { status.stream = 'error'; status.err = 'ws ' + e.message; ws = null; setTimeout(connect, 10e3); }
}
// promoted pools: their own small subscription shards (public servers cap a connection at ~100 subscription units, and the
// city's own 75 pools already use most of one), each on the next endpoint in the list; same handlers as the main stream
const PSUB = 40; let pws = [], pgen = 0;
async function connectPromoted() {
  if (process.env.ECO_NO_WS === '1') return;   // tests
  const gen = ++pgen; const old = pws; pws = []; for (const c of old) { try { c.removeAllListeners('disconnected'); await c.disconnect(); } catch {} }
  const accts = eco.pools.filter(p => p.amm && p.promoted).map(p => p.amm); status.promotedStream = [];
  for (let i = 0, k = 0; i < accts.length; i += PSUB, k++) shard(accts.slice(i, i + PSUB), k, 0, gen);
}
async function shard(list, k, tries, gen) {
  if (gen !== pgen) return; const url = WSS[(k + 1 + tries) % WSS.length];
  try { const c = new xrpl.Client(url, { connectionTimeout: 15e3 }); await c.connect(); if (gen !== pgen) { try { await c.disconnect(); } catch {} return; }
    await c.request({ command: 'subscribe', accounts: list }); pws.push(c); status.promotedStream[k] = 'live ' + url + ' (' + list.length + ')';
    c.on('transaction', t => { if (!t.validated) return; const s = JSON.stringify(t.meta || {}) + JSON.stringify(t.tx_json || t.transaction || {}); for (const a of list) if (s.includes(a)) queue(a); try { trades(t); } catch {} });
    c.on('disconnected', () => { pws = pws.filter(x => x !== c); status.promotedStream[k] = 'reconnecting'; setTimeout(() => shard(list, k, tries + 1, gen), 5e3); });
  } catch (e) { status.promotedStream[k] = 'error ' + String(e.message).slice(0, 80); setTimeout(() => shard(list, k, tries + 1, gen), 15e3); }
}
async function resubscribe(newAmms) { if (!ws || !newAmms.length) return; try { await ws.request({ command: 'subscribe', accounts: newAmms }); } catch {}
  // also make the tx filter see them: simplest is a reconnect
  try { ws.removeAllListeners('disconnected'); await ws.disconnect(); } catch {} ws = null; connect(); }

// ---- market stats: XRPLMeta every 15 min (price, 24h/7d change, volume, holders, market cap, takers) ----
// xrpl.to adds the 1h change and 24h unique traders once every 6 h (35 tokens = 35 of the ~250/day shared budget per pass);
// those values persist on the data volume so a redeploy neither loses them nor triggers an extra pass.
const XT_FILE = path.join(process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data')), 'eco-xrplto.json');
let xt = null; const XT_FRESH = 8 * 3600e3;
function xtLoad() { if (xt) return xt; try { xt = JSON.parse(fs.readFileSync(XT_FILE, 'utf8')); } catch { xt = {}; } if (!xt || typeof xt !== 'object') xt = {}; return xt; }
function xtSave() { try { fs.mkdirSync(path.dirname(XT_FILE), { recursive: true }); fs.writeFileSync(XT_FILE, JSON.stringify(xt)); } catch {} }
const splitKey = k => [k.slice(0, k.indexOf('-')), k.slice(k.indexOf('-') + 1)];
function applyMeta(n, m) {
  if (m.exch != null) n.price_xrp = m.exch; if (m.pro24h != null) n.pro24h = m.pro24h; if (m.pro7d != null) n.pro7d = m.pro7d;
  if (m.vol24hxrp != null) n.vol24h = m.vol24hxrp; if (m.holders != null) n.holders = m.holders; if (m.marketcap != null) n.mcap_xrp = m.marketcap;
}
function applyXt(n) { const x = xtLoad()[n.key]; const fresh = x && Date.now() - x.ts < XT_FRESH;
  if (fresh && x.pro1h != null) n.pro1h = x.pro1h;
  if (fresh && x.traders != null) { n.active = x.traders; n.active_src = 'traders24h'; return true; } return false; }
async function market() {
  const { byKey } = idx(); let ok = 0;
  for (const n of Object.values(byKey)) { if (n.promoted) { promotedMeta(n); continue; } const [iss, cur] = splitKey(n.key); const m = await XM.token(cur, iss);
    if (m) { ok++; applyMeta(n, m); if (!applyXt(n)) { if (m.takers24h != null) { n.active = m.takers24h; n.active_src = 'takers24h'; } else if (m.holders != null) { n.active = m.holders; n.active_src = 'holders'; } } }
    else applyXt(n); }   // XRPLMeta miss: keep the last values
  status.market = new Date().toISOString(); status.marketOk = ok; recompute(); publish();
}
// promoted nodes reuse the memes-circle member metrics (XRPLMeta, hourly) instead of their own XRPLMeta calls
function promotedMeta(n) { let rows = null; try { rows = require('./memes-circle').members(); } catch {} const r = rows && rows.rows && rows.rows.find(x => x.issuer + '-' + x.currency === n.key);
  if (!r || !r.m) return false; applyMeta(n, r.m); if (r.m.takers24h != null) { n.active = r.m.takers24h; n.active_src = 'takers24h'; } else if (r.m.holders != null) { n.active = r.m.holders; n.active_src = 'holders'; } return true; }
async function xrpltoPass() {
  if (Date.now() - XrplTo.lastRun('eco-pass') < XRPLTO_EVERY) return; XrplTo.markRun('eco-pass');
  const { byKey } = idx(); xtLoad(); let got = 0;
  for (const n of Object.values(byKey)) { if (n.promoted) continue; let t;
    try { t = await xrplto(n.key); } catch (e) { if (e.code === 'budget' || e.code === 'cooldown' || e.code === 'http_429') { status.err = 'xrpl.to ' + e.code; break; } continue; }
    if (!t || t.exch == null) continue; got++;
    xt[n.key] = { ts: Date.now(), pro1h: t.pro1h ?? null, traders: t.uniqueTraders24h ?? null };
    if (n.price_xrp == null) applyMeta(n, { exch: +t.exch, pro24h: t.pro24h, pro7d: t.pro7d, vol24hxrp: t.vol24h, holders: t.holders, marketcap: t.marketcap });
    applyXt(n); }
  if (got) { xtSave(); status.xrplto = new Date().toISOString(); recompute(); publish(); }
}
// ---- hourly: supply, full pool + LP sweep, discovery of new AMM pools holding city tokens ----
async function sweep() {
  const { byKey } = idx();
  for (const p of eco.pools) if (p.amm) { try { await readPool(p, true); } catch {} await sleep(100); }
  for (const n of Object.values(byKey)) { const [iss, cur] = [n.key.slice(0, n.key.indexOf('-')), n.key.slice(n.key.indexOf('-') + 1)];
    try { const g = await rpc('gateway_balances', { account: iss, ledger_index: 'validated' }); const ob = (g.obligations || {})[cur]; if (ob != null) n.circ = +ob; } catch {} await sleep(120); }
  recompute(); publish();
  try { await discover(); } catch (e) { status.err = 'discover ' + e.message; }
  saveDiscovered();
  status.sweep = new Date().toISOString();
}
async function discover() {
  const { byKey, byName } = idx(), known = new Set(eco.pools.map(p => p.amm)), checked = new Set(), added = [];
  for (const n of Object.values(byKey).filter(x => !x.discovered && !x.promoted)) {
    if (n.name === 'RLUSD') continue;   // stablecoin: huge holder list, and its pools with city tokens already show up via the other side
    const [iss, cur] = [n.key.slice(0, n.key.indexOf('-')), n.key.slice(n.key.indexOf('-') + 1)]; const pr = n.price_amm || n.price_xrp || 0;
    let marker, pages = 0, cands = [];
    do { const al = await rpc('account_lines', { account: iss, ledger_index: 'validated', limit: 400, ...(marker ? { marker } : {}) }); await sleep(100);
      for (const l of al.lines || []) if (l.currency === cur && -l.balance * pr >= DISCOVER_MIN_TVL / 2 && !known.has(l.account)) cands.push(l.account);
      marker = al.marker; pages++; } while (marker && pages < 30);
    for (const acct of cands) { if (checked.has(acct) || notAmm.has(acct)) continue; checked.add(acct);
      const ad = (await rpc('account_info', { account: acct, ledger_index: 'validated' })).account_data; await sleep(60); if (!ad || !ad.AMMID) { if (ad) notAmm.add(acct); continue; }
      const r = await rpc('amm_info', { amm_account: acct, ledger_index: 'validated' }); if (!r.amm) continue;
      const A = side(r.amm.amount), B = side(r.amm.amount2); const nm = s => { if (s.cur === 'XRP') return 'XRP'; const k = s.iss + '-' + s.cur; if (byKey[k]) return byKey[k].name;
        let name = curName(s.cur); if (byName[name]) name = name + '·' + s.iss.slice(1, 5); const node = { name, key: k, tvl: 0, pools: 0, top: [], scars: [], burn_txs: 0, discovered: new Date().toISOString().slice(0, 10) };
        eco.nodes.push(node); byKey[k] = node; byName[name] = node; return name; };
      const p = { a: nm(A), b: nm(B), amm: acct, tvl_xrp: 0, fee_pct: (r.amm.trading_fee || 0) / 1000, locked_pct: 0, insider_pct: 0, lp_holders: 0, top_lp: [], discovered: new Date().toISOString().slice(0, 10) };
      res[acct] = { A, B, lp: r.amm.lp_token }; eco.pools.push(p); known.add(acct); recompute();
      const isNew = s => byKey[s.cur === 'XRP' ? '' : s.iss + '-' + s.cur]?.discovered, newTok = isNew(A) || isNew(B);
      // a new token is only as valuable as the real XRP liquidity behind its partner's price: cap the partner side at that depth
      // (stops e.g. millions of a thinly priced token parked against a fresh meme token from showing up as a 190M XRP pool)
      const kside = newTok ? (isNew(A) ? B : A) : null, kn = kside && (kside.cur === 'XRP' ? null : byKey[kside.iss + '-' + kside.cur]);
      const realTvl = !newTok ? p.tvl_xrp : kside.cur === 'XRP' ? p.tvl_xrp : 2 * Math.min(p.tvl_xrp / 2, (kn && kn.price_depth) || 0);
      if (realTvl < (newTok ? DISCOVER_NEW_TOKEN_TVL : DISCOVER_MIN_TVL) || (newTok && eco.nodes.filter(x => x.discovered).length > DISCOVER_MAX_NEW)) { eco.pools.pop(); delete res[acct]; known.delete(acct);
        const orphan = x => x.discovered && !eco.pools.some(q => q.a === x.name || q.b === x.name);
        for (const x of eco.nodes.filter(orphan)) { delete byKey[x.key]; delete byName[x.name]; } eco.nodes = eco.nodes.filter(x => !orphan(x)); continue; }
      await readLP(p); added.push(acct); status.discovered.push(p.a + '/' + p.b);
    }
  }
  if (added.length) { // fill market stats for any new tokens, then subscribe to the new pools
    for (const n of eco.nodes.filter(x => x.discovered && x.circ == null)) { const i = n.key.indexOf('-');
      try { const g = await rpc('gateway_balances', { account: n.key.slice(0, i), ledger_index: 'validated' }); const ob = (g.obligations || {})[n.key.slice(i + 1)]; if (ob != null) n.circ = +ob; } catch {} await sleep(120); }
    for (const n of eco.nodes.filter(x => x.discovered && x.price_xrp == null)) { const [iss, cur] = splitKey(n.key); const m = await XM.token(cur, iss); if (m) applyMeta(n, m); }   // XRPLMeta: no xrpl.to budget
    recompute(); publish(); await resubscribe(added);
  }
}

// ---- promoted meme districts: server/memes-promote.js hands the member + pool list (an empty list under MEMES_PROMOTE=0) ----
// Promoted nodes carry `promoted: { q, rank, erank, alpha, since }`, promoted pools `promoted: 1`. They are ordinary city nodes and
// pools from here on (prices, TVL, subscription, sweep, trades, /api/amm-lock), except: no xrpl.to pass, no issuer-trustline
// discovery scan, metrics from the memes snapshot, and live swaps re-read reserves only (LP lines on the hourly sweep).
const pstat = { members: 0, pools: 0, dropped: [], ts: null, busy: false };
let promoteRun = Promise.resolve();
const realTvl = p => { if (p.a === 'XRP' || p.b === 'XRP') return p.tvl_xrp || 0; const { byName } = idx(); const d = Math.min(byName[p.a]?.price_depth || 0, byName[p.b]?.price_depth || 0);
  return 2 * Math.min((p.tvl_xrp || 0) / 2, d); };
function applyPromoted(members, plist) {
  if (!eco) return null;
  const want = new Map((members || []).map(m => [m.key, m]));
  const gone = eco.nodes.filter(n => n.promoted && !want.has(n.key)), goneN = new Set(gone.map(n => n.name));
  const listAmms = new Set((plist || []).map(p => p.amm));
  const dropP = p => goneN.has(p.a) || goneN.has(p.b) || (p.promoted && !listAmms.has(p.amm));
  for (const p of eco.pools.filter(dropP)) delete res[p.amm];
  eco.pools = eco.pools.filter(p => !dropP(p)); eco.nodes = eco.nodes.filter(n => !goneN.has(n.name));
  const { byKey, byName } = idx(), fresh = [], newPools = [], day = new Date().toISOString().slice(0, 10);
  for (const m of members || []) { let n = byKey[m.key]; if (n && !n.promoted) continue;   // already a city district some other way: never twice
    if (!n) { let name = safeNodeName(m.name, m.key); if (byName[name]) name = (name.slice(0, 40) + '\u00B7' + m.issuer.slice(1, 5));
      if (byName[name]) continue; n = { name, key: m.key, tvl: 0, pools: 0, top: [], scars: [], burn_txs: 0 }; eco.nodes.push(n); byKey[m.key] = n; byName[name] = n; fresh.push(n); }
    n.promoted = { q: m.q, rank: m.rank, erank: m.erank, alpha: m.alpha, since: new Date(m.since || Date.now()).toISOString().slice(0, 10) }; }
  const amms = new Set(eco.pools.map(p => p.amm));
  for (const q of plist || []) { const A = q.a === 'XRP' ? 'XRP' : byKey[q.a]?.name, B = q.b === 'XRP' ? 'XRP' : byKey[q.b]?.name; if (!A || !B || amms.has(q.amm)) continue;
    const p = { a: A, b: B, amm: q.amm, tvl_xrp: 0, fee_pct: q.fee_pct || 0, locked_pct: 0, insider_pct: 0, lp_holders: 0, top_lp: [], promoted: 1, since: day }; eco.pools.push(p); amms.add(q.amm); newPools.push(p); }
  pstat.members = eco.nodes.filter(n => n.promoted).length; pstat.ts = new Date().toISOString();
  promoteRun = promoteRun.then(() => promoteRead(fresh, newPools, gone.length > 0)).catch(e => { status.err = 'promote ' + e.message; });
  return { members: pstat.members, pools: eco.pools.filter(p => p.promoted).length, added: fresh.length, removed: gone.length };
}
async function promoteRead(fresh, newPools, removed) {
  pstat.busy = true;
  try {
    for (const p of newPools) { try { await readPool(p, false); } catch {} await sleep(100); }   // reserves first (cheap); LP lines only for pools that stay
    recompute();
    // a cross pool must carry real liquidity (partner depth-capped, like discovery); a district with no pool left is dropped
    const thin = newPools.filter(p => p.a !== 'XRP' && p.b !== 'XRP' && realTvl(p) < Promote.MIN_POOL_TVL || p.gone || (p.tvl_xrp || 0) < Promote.MIN_POOL_TVL);
    if (thin.length) { const t = new Set(thin); for (const p of thin) delete res[p.amm]; eco.pools = eco.pools.filter(p => !t.has(p)); pstat.dropped = thin.map(p => p.a + '/' + p.b).slice(0, 40); try { Promote.markThin(thin.map(p => p.amm)); } catch {} }
    const lone = eco.nodes.filter(n => n.promoted && !eco.pools.some(p => p.a === n.name || p.b === n.name));
    if (lone.length) { const l = new Set(lone); eco.nodes = eco.nodes.filter(n => !l.has(n)); }
    for (const p of newPools.filter(p => eco.pools.includes(p))) { try { await readLP(p); } catch {} await sleep(100); }
    for (const n of fresh.filter(n => eco.nodes.includes(n))) { const [iss, cur] = splitKey(n.key);
      try { const g = await rpc('gateway_balances', { account: iss, ledger_index: 'validated' }); const ob = (g.obligations || {})[cur]; if (ob != null) n.circ = +ob; } catch {} await sleep(120);
      promotedMeta(n); }
    recompute(); pstat.members = eco.nodes.filter(n => n.promoted).length; pstat.pools = eco.pools.filter(p => p.promoted).length; publish(); saveDiscovered();
    if (newPools.some(p => eco.pools.includes(p)) || removed || !pws.length) await connectPromoted();
  } finally { pstat.busy = false; }
}

async function start() {
  try { eco = loadBase(); publish(); } catch (e) { console.error('eco base', e.message); return; }
  connect(); connectPromoted();
  setTimeout(async () => { for (const p of eco.pools) if (p.amm) { try { await readPool(p, false); } catch {} } recompute(); publish();
    for (const p of eco.pools) if (p.amm) { try { const r = await rpc('account_tx', { account: p.amm, limit: 25 }); for (const t of r.transactions || []) { const dt = (t.tx_json || t.tx || {}).date, w = t.close_time_iso ? Date.parse(t.close_time_iso) : dt ? (dt + 946684800) * 1000 : null; if (w && Date.now() - w < 30 * 60e3) trades({ ...t, tx_json: t.tx_json || t.tx, hash: t.hash || (t.tx || {}).hash }, w); } await sleep(60); } catch {} } publish();
    try { await market(); } catch {} xrpltoPass().catch(() => {}); try { await sweep(); } catch (e) { console.error('eco sweep', e.message); } }, 3e3);
  setInterval(() => market().catch(() => {}), MARKET_EVERY);
  setInterval(() => xrpltoPass().catch(() => {}), 15 * 60e3);   // no-op until 6 h since the last (persisted) pass
  setInterval(() => sweep().catch(() => {}), SWEEP_EVERY);
}
function send(req, res_, o, type) {
  if (req.headers['if-none-match'] === o.etag) { res_.writeHead(304, { etag: o.etag, 'cache-control': 'no-cache' }); res_.end(); return true; }
  res_.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', etag: o.etag }); res_.end(req.method === 'HEAD' ? undefined : o.body); return true;
}
module.exports = {
  start, applyPromoted, _connectPromoted: connectPromoted, status: () => ({ ...status, keyed: XrplTo.keyed(), xrplto: XrplTo.stats(), xrplmeta: XM.stats(), promoted: { ...Promote.status(), ...pstat, streams: status.promotedStream || [], nodes: eco ? eco.nodes.filter(n => n.promoted).map(n => n.name) : [] } }), _promoteRun: () => promoteRun, _xrpltoPass: xrpltoPass, data: () => eco, rpc: (m, p) => rpc(m, p), _load: () => { eco = loadBase(); }, _readPool: async p => { await readPool(p, true); recompute(); return p; }, _bhCache: bhCache, _trades: trades, _recent: () => recent, _sweep: sweep, _market: market, _discover: discover, _curName: curName, _safeNodeName: safeNodeName,
  serve: (req, r) => out ? send(req, r, out, 'application/javascript; charset=utf-8') : false,
  serveLive: (req, r) => live ? send(req, r, live, 'application/json') : false,
};
