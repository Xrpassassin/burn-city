// Live city data (window.ECO). Every AMM pool in the city is subscribed on the XRP Ledger: any validated transaction that
// touches a pool re-reads its reserves within ~2 s, re-prices every token and republishes. Market stats (24h change,
// volume, holders, traders) from xrpl.to every 2 min. Outstanding supply + LP-lock sweep + new-pool discovery hourly.
// Read-only public requests. Base structure (burn history, scars, holder bands) comes from client/data.js.
// GET /data.js = full ECO for page load · GET /api/eco/live = compact live values for in-page polling · GET /api/eco = status.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), xrpl = require('xrpl');
const FILE = path.join(__dirname, '..', 'client', 'data.js');
const RPC = ['https://xrplcluster.com/', 'https://s2.ripple.com:51234/', 'https://s1.ripple.com:51234/'];
const WSS = ['wss://xrplcluster.com', 'wss://s2.ripple.com', 'wss://s1.ripple.com'];
const BH_KEYS = new Set(['rrrrrrrrrrrrrrrrrrrrrhoLvTp', 'rrrrrrrrrrrrrrrrrrrrBZbvji', 'rrrrrrrrrrrrrrrrrrrn5RM1rHd']);
const MARKET_EVERY = 2 * 60e3, SWEEP_EVERY = 60 * 60e3, DISCOVER_MIN_TVL = 50, DISCOVER_NEW_TOKEN_TVL = 2500, DISCOVER_MAX_NEW = 12;
let eco = null, out = null, live = null, ver = 0, ws = null, wsi = 0, lastLedger = null;
const status = { ok: false, ts: null, pools: 0, tokens: 0, stream: 'off', ledger: null, poolUpdates: 0, lastPoolUpdate: null, market: null, sweep: null, discovered: [], err: null };
const res = {}, bhCache = new Map(), notAmm = new Set(), pending = new Set(); let flushT = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const side = x => typeof x === 'string' ? { cur: 'XRP', v: +x / 1e6 } : { cur: x.currency, iss: x.issuer, v: +x.value };
const curName = c => c.length === 40 ? Buffer.from(c, 'hex').toString('latin1').replace(/\0/g, '').trim() || c : c;

const DISC_FILE = fs.existsSync('/data') ? '/data/eco-discovered.json' : path.join(__dirname, 'eco-discovered.json');
// discovered pools/tokens survive restarts, so towers are right from the first page load instead of after the hourly sweep
function loadBase() { const s = fs.readFileSync(FILE, 'utf8'); const e = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  try { const d = JSON.parse(fs.readFileSync(DISC_FILE, 'utf8')); const keys = new Set(e.nodes.map(n => n.key)), names = new Set(e.nodes.map(n => n.name)), amms = new Set(e.pools.map(p => p.amm));
    for (const n of d.nodes || []) if (!keys.has(n.key) && !names.has(n.name)) { e.nodes.push(n); keys.add(n.key); names.add(n.name); }
    for (const p of d.pools || []) if (!amms.has(p.amm) && names.has(p.a) && names.has(p.b)) { e.pools.push(p); amms.add(p.amm); }
  } catch {}
  return e; }
function saveDiscovered() { try { fs.writeFileSync(DISC_FILE, JSON.stringify({ ts: new Date().toISOString(), nodes: eco.nodes.filter(n => n.discovered), pools: eco.pools.filter(p => p.discovered) })); } catch (e) { console.error('save discovered', e.message); } }
async function rpc(method, p) {
  if (ws && ws.isConnected()) { try { const r = (await ws.request({ command: method, ...p })).result; return r; } catch (e) { if (e.data && e.data.error === 'actNotFound') return { error: 'actNotFound' }; } }
  let err;
  for (const u of RPC) {
    try { const r = (await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params: [p] }), signal: AbortSignal.timeout(20e3) })).json()).result || {};
      if (r.status === 'error') { err = r.error; if (r.error === 'actNotFound') return r; continue; } return r; } catch (e) { err = e.message; }
  }
  throw new Error(String(err));
}
async function xrplto(key) { try { const j = await (await fetch('https://api.xrpl.to/v1/token/' + key, { headers: { 'user-agent': 'burn-city/1' }, signal: AbortSignal.timeout(15e3) })).json(); return j.token || j; } catch { return null; } }
async function isBlackhole(acct) {
  const c = bhCache.get(acct); if (c && Date.now() - c.t < 6 * 3600e3) return c.bh; let bh = false;
  try { const ad = (await rpc('account_info', { account: acct, ledger_index: 'validated' })).account_data;
    bh = !!ad && (ad.Flags & 0x00100000) !== 0 && (!ad.RegularKey || BH_KEYS.has(ad.RegularKey)); } catch { return c ? c.bh : false; }
  bhCache.set(acct, { bh, t: Date.now() }); return bh;
}
const idx = () => { const byKey = {}, byName = {}; for (const n of eco.nodes) { byName[n.name] = n; if (n.key && n.key.includes('-')) byKey[n.key] = n; } return { byKey, byName }; };

// ---- per-pool ledger reads ----
async function readPool(p, withLines) {
  const r = await rpc('amm_info', { amm_account: p.amm, ledger_index: 'validated' });
  if (r.error === 'actNotFound' || !r.amm) { delete res[p.amm]; p.tvl_xrp = 0; p.gone = true; return; }
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
  p.locked_pct = +(100 * locked / tot).toFixed(1); p.lp_holders = lines.length;
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
  for (const p of eco.pools) { const r = res[p.amm]; if (!r) continue;
    p.tvl_xrp = +(r.A.cur === 'XRP' ? 2 * r.A.v : r.B.cur === 'XRP' ? 2 * r.B.v : val(r.A) + val(r.B)).toFixed(2); }
  for (const n of eco.nodes) {
    const ps = eco.pools.filter(p => p.a === n.name || p.b === n.name);
    n.tvl = +ps.reduce((s, p) => s + (p.tvl_xrp || 0), 0).toFixed(2); n.pools = ps.filter(p => !p.gone).length;
    if (!byKey[n.key]) continue; const pr = price[n.name];
    if (pr) { n.price_amm = pr.v; n.price_src = pr.src; n.price_depth = +pr.d.toFixed(2); n.price_thin = pr.d < 1000; n.mcap_amm = n.circ != null && pr.d >= 100 ? n.circ * pr.v : null; }
    else n.mcap_amm = null;
    // headline market cap (drives tower height): AMM price when >=1,000 XRP of liquidity backs it; otherwise xrpl.to's market cap;
    // otherwise the thin AMM price (flagged). Stops a token with a few hundred XRP of liquidity from towering over real ones.
    if (n.mcap_amm != null && n.price_depth >= 1000) { n.mcap = n.mcap_amm; n.mcap_src = 'amm'; }
    else if (n.mcap_xrp > 0) { n.mcap = n.mcap_xrp; n.mcap_src = 'xrpl.to'; }
    else if (n.mcap_amm != null) { n.mcap = n.mcap_amm; n.mcap_src = 'amm-thin'; }
    else { n.mcap = null; n.mcap_src = null; }
    if (n.burn_complete && n.circ != null) n.burned_pct = +(100 * n.burn_vol / (n.burn_vol + n.circ)).toFixed(3);
  }
}
const NODE_LIVE = ['tvl', 'pools', 'price_xrp', 'price_amm', 'price_src', 'price_depth', 'price_thin', 'mcap_amm', 'mcap_xrp', 'mcap', 'mcap_src', 'circ', 'pro24h', 'pro1h', 'pro7d', 'vol24h', 'holders', 'active', 'active_src', 'burned_pct'];
const POOL_LIVE = ['tvl_xrp', 'fee_pct', 'locked_pct', 'lp_holders', 'top_lp', 'gone'];
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
    try { await readPool(p, true); status.poolUpdates++; } catch (e) { status.err = 'pool ' + e.message; } }
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
    const accts = eco.pools.filter(p => p.amm).map(p => p.amm);
    await c.request({ command: 'subscribe', accounts: accts, streams: ['ledger'] });
    c.on('ledgerClosed', l => { status.ledger = l.ledger_index; });
    c.on('transaction', t => { if (!t.validated) return; const s = JSON.stringify(t.meta || {}) + JSON.stringify(t.tx_json || t.transaction || {});
      for (const a of accts) if (s.includes(a)) queue(a); try { trades(t); } catch {} });
    c.on('disconnected', () => { status.stream = 'reconnecting'; ws = null; setTimeout(connect, 5e3); });
  } catch (e) { status.stream = 'error'; status.err = 'ws ' + e.message; ws = null; setTimeout(connect, 10e3); }
}
async function resubscribe(newAmms) { if (!ws || !newAmms.length) return; try { await ws.request({ command: 'subscribe', accounts: newAmms }); } catch {}
  // also make the tx filter see them: simplest is a reconnect
  try { ws.removeAllListeners('disconnected'); await ws.disconnect(); } catch {} ws = null; connect(); }

// ---- xrpl.to market stats ----
async function market() {
  const { byKey } = idx();
  for (const n of Object.values(byKey)) { const t = await xrplto(n.key); await sleep(100); if (!t || t.exch == null) continue;
    n.price_xrp = +t.exch; n.pro24h = t.pro24h; n.pro1h = t.pro1h; n.pro7d = t.pro7d; n.vol24h = t.vol24h; n.holders = t.holders;
    if (t.marketcap != null) n.mcap_xrp = t.marketcap;
    if (t.uniqueTraders24h != null) { n.active = +t.uniqueTraders24h; n.active_src = 'traders24h'; } else if (t.holders != null) { n.active = +t.holders; n.active_src = 'holders'; } }
  status.market = new Date().toISOString(); recompute(); publish();
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
  for (const n of Object.values(byKey).filter(x => !x.discovered)) {
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
    for (const n of eco.nodes.filter(x => x.discovered && x.price_xrp == null)) { const t = await xrplto(n.key); if (t && t.exch != null) { n.price_xrp = +t.exch; n.pro24h = t.pro24h; n.vol24h = t.vol24h; n.holders = t.holders; } }
    recompute(); publish(); await resubscribe(added);
  }
}

async function start() {
  try { eco = loadBase(); publish(); } catch (e) { console.error('eco base', e.message); return; }
  connect();
  setTimeout(async () => { for (const p of eco.pools) if (p.amm) { try { await readPool(p, false); } catch {} } recompute(); publish();
    for (const p of eco.pools) if (p.amm) { try { const r = await rpc('account_tx', { account: p.amm, limit: 25 }); for (const t of r.transactions || []) { const dt = (t.tx_json || t.tx || {}).date, w = t.close_time_iso ? Date.parse(t.close_time_iso) : dt ? (dt + 946684800) * 1000 : null; if (w && Date.now() - w < 30 * 60e3) trades({ ...t, tx_json: t.tx_json || t.tx, hash: t.hash || (t.tx || {}).hash }, w); } await sleep(60); } catch {} } publish();
    try { await market(); } catch {} try { await sweep(); } catch (e) { console.error('eco sweep', e.message); } }, 3e3);
  setInterval(() => market().catch(() => {}), MARKET_EVERY);
  setInterval(() => sweep().catch(() => {}), SWEEP_EVERY);
}
function send(req, res_, o, type) {
  if (req.headers['if-none-match'] === o.etag) { res_.writeHead(304, { etag: o.etag, 'cache-control': 'no-cache' }); res_.end(); return true; }
  res_.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', etag: o.etag }); res_.end(req.method === 'HEAD' ? undefined : o.body); return true;
}
module.exports = {
  start, status: () => status, data: () => eco, _load: () => { eco = loadBase(); }, _trades: trades, _recent: () => recent, _sweep: sweep, _market: market, _discover: discover,
  serve: (req, r) => out ? send(req, r, out, 'application/javascript; charset=utf-8') : false,
  serveLive: (req, r) => live ? send(req, r, live, 'application/json') : false,
};
