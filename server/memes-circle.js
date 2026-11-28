// Circle of XRPL Memes: the City's meme districts (client/js/memes-circle.mjs), served at GET /api/memes-circle (behind
// server.js's shared per-IP limiter). Scoring lives in server/memes-circle-score.js.
// Sources (xrpl.to's anonymous limit is 30/min + 333/day per IP, shared with eco.js and nft.js, so it is used sparingly):
//   membership  xrpl.to 'Memes'-tagged tokens (8 pages), at most once a day (one attempt per 6 h) through the shared budget in
//               server/xrplto.js; the top 180 by the universe rank (+ the holder-health fields only xrpl.to has) persist in
//               <data>/memes-circle-members.json and are reused.
//   metrics     hourly from XRPLMeta (keyless, server/xrplmeta.js): price, market cap, holders, 24h/7d volume, 24h/7d change,
//               24h holder change, takers. TVL from our own XRPL ledger read (amm_info on each token's XRP pool).
//   seed        no snapshot, no members and xrpl.to unreadable: server/memes-circle-seed.json (ids only) + XRPLMeta.
// Fail soft: a token XRPLMeta misses keeps its last good metrics; a failed refresh keeps the last snapshot (memory, else the
// saved file, which is served immediately on boot); with nothing at all the route says warming_up.
// Kill switch: MEMES_CIRCLE=0 (env / Fly secret) stops the fetch and the route answers { ok:false, enabled:false }, which the
// client reads as "don't build the quarter".
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Score = require('./memes-circle-score');
const XrplTo = require('./xrplto');   // shared xrpl.to queue + daily budget (memes = 2nd priority); X-Api-Key when XRPLTO_API_KEY is set
const XM = require('./xrplmeta');

const API = 'https://api.xrpl.to/v1/tokens';
const EVERY = 60 * 60e3, RETRY = 10 * 60e3, PAGE = 100, MEMBERS_EVERY = 24 * 3600e3, MEMBERS_TRY = 6 * 3600e3, KEEP_N = 180;
// pages pulled per membership read: the top of the Memes tag by each ranking the universe uses (union, deduped)
const PULLS = [['marketcap', 0], ['marketcap', 100], ['marketcap', 200], ['marketcap', 300], ['tvl', 0], ['tvl', 100], ['holders', 0], ['holders', 100]];
const ATTRIBUTION = 'Data by xrpl.to (https://xrpl.to) · XRPLMeta (https://xrplmeta.org)';
// xrpl.to-only fields kept per member (refreshed with the daily membership read)
const KEEP = ['issuer', 'currency', 'name', 'md5', 'tags', 'AMM', 'top10', 'creatorHoldingPercent', 'insiderPct', 'lpBurnedPercent', 'creatorLastAction', 'buyerPressure', 'creatorTokenCount', 'highConcentrationRisk'];
const METRICS = ['marketcap', 'tvl', 'holders', 'vol7dxrp', 'vol24hxrp', 'pro24h', 'pro7d', 'holders24h', 'exch', 'takers24h'];

const enabled = () => String(process.env.MEMES_CIRCLE ?? '1') !== '0';
const dataDir = () => process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
const FILE = () => path.join(dataDir(), 'memes-circle.json');
const MFILE = () => path.join(dataDir(), 'memes-circle-members.json');
const SEED = path.join(__dirname, 'memes-circle-seed.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = (o, ks) => { const r = {}; for (const k of ks) if (o[k] !== undefined && o[k] !== null) r[k] = o[k]; return r; };

let cache = null, out = null, timer = null, running = false, members = null;
const status = { ok: false, ts: null, err: null, fetched: 0, lastTry: null, metricsOk: 0, membersTs: null, membersSource: null };
let fetchImpl = null;   // test hook for the xrpl.to membership pull (default: the shared XrplTo queue)
let rpcImpl = (m, p) => require('./eco').rpc(m, p);
let rpcGap = 120;

function setCache(c) {
  cache = c; const body = JSON.stringify(c);
  out = { body, etag: '"m' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"' };
  Object.assign(status, { ok: true, ts: c.ts });
}

async function pull(sortBy, start) {
  const u = `${API}?start=${start}&limit=${PAGE}&sortBy=${sortBy}&sortType=desc&tag=Memes`;
  const r = fetchImpl ? await fetchImpl(u, { headers: XrplTo.headers({ 'user-agent': 'burn-city/1' }), signal: AbortSignal.timeout(20e3) })
    : await XrplTo.request(u, { prio: 'memes', headers: { 'user-agent': 'burn-city/1' }, timeout: 20e3 });
  if (!r.ok) { const e = new Error('xrpl.to ' + r.status); if (r.status === 429) e.code = 'http_429'; throw e; }
  const j = await r.json(); if (!j || !Array.isArray(j.tokens)) throw new Error('xrpl.to bad body'); return j.tokens;
}

// ---- membership: xrpl.to Memes tag, at most daily ----
function saveMembers() { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(MFILE(), JSON.stringify(members)); } catch (e) { console.error('[memes-circle] save members', e.message); } }
function loadMembers() { try { const m = JSON.parse(fs.readFileSync(MFILE(), 'utf8')); if (m && Array.isArray(m.rows) && m.rows.length) return m; } catch {} return null; }
function setMembers(m) { members = m; status.membersTs = m.ts ? new Date(m.ts).toISOString() : null; status.membersSource = m.source; }
async function pullMembers() {
  if (!fetchImpl && Date.now() - XrplTo.lastRun('memes-members') < MEMBERS_TRY) return false;
  // a 429 / budget / cooldown stop costs at most one call and the shared limiter's pause covers the retry, so only a read
  // that actually ran (ok or failing pages) starts the 6 h wait
  const raw = []; let fails = 0;
  for (const [s, st] of PULLS) {
    let got = null; for (let k = 0; k < 2 && !got; k++) { try { got = await pull(s, st); }
      catch (e) { status.err = e.message; if (['budget', 'cooldown', 'busy', 'http_429'].includes(e.code)) throw e; } }   // the shared limiter already spaces calls
    if (got) raw.push(...got); else fails++; }
  if (!fetchImpl) XrplTo.markRun('memes-members');
  if (fails > PULLS.length / 2 || raw.length < 50) throw new Error(`xrpl.to: ${fails}/${PULLS.length} pages failed`);
  const seen = new Set(), memes = [];
  for (const t of raw) { if (!t || !t.issuer || !t.currency) continue; const k = t.issuer + '-' + t.currency; if (seen.has(k)) continue;
    if (Array.isArray(t.tags) && !t.tags.includes('Memes')) continue; seen.add(k); memes.push(t); }
  const U = Score.pickUniverse(memes, KEEP_N), now = Date.now();
  const prev = new Map((members ? members.rows : []).map(r => [r.issuer + '-' + r.currency, r]));
  const rows = U.map(t => { const p = prev.get(t.issuer + '-' + t.currency); const m = { ...(p && p.m || {}), ...pick(t, ['marketcap', 'tvl', 'holders', 'vol7dxrp', 'vol24hxrp', 'pro24h', 'pro7d', 'holders24h']) };
    return { ...pick(t, KEEP), m, m_ts: now }; });
  setMembers({ ts: now, source: 'xrpl.to', rows }); saveMembers(); return true;
}
function seedMembers() {
  try { const s = JSON.parse(fs.readFileSync(SEED, 'utf8')); const rows = (s.ids || []).filter(a => Array.isArray(a) && a[0] && a[1]).map(([issuer, currency]) => ({ issuer, currency, tags: ['Memes'], m: {} }));
    if (rows.length) return { ts: 0, source: 'seed', rows }; } catch {} return null;
}
function membersFromSnapshot(c) {   // a snapshot without a members file (first boot after this change): reuse its token ids + last metrics
  if (!c || !Array.isArray(c.tokens) || !c.tokens.length) return null;
  return { ts: 0, source: 'snapshot', rows: c.tokens.map(t => ({ issuer: t.issuer, currency: t.currency, name: t.name, md5: t.md5 || undefined, tags: ['Memes'], AMM: t.amm || undefined,
    top10: t.top10, lpBurnedPercent: t.lp_burned, m: { marketcap: t.mcap, tvl: t.tvl, holders: t.holders, vol7dxrp: t.vol7d, pro24h: t.pro24h, pro7d: t.pro7d }, m_ts: Date.parse(c.ts) || 0 })) };
}

// ---- metrics: XRPLMeta + our own AMM read for TVL ----
const xrpSide = a => typeof a === 'string' ? +a / 1e6 : null;
async function ammTvl(r) {
  const q = r.AMM ? { amm_account: r.AMM } : { asset: { currency: r.currency, issuer: r.issuer }, asset2: { currency: 'XRP' } };
  try { const j = await rpcImpl('amm_info', { ...q, ledger_index: 'validated' }); const a = j && j.amm; if (!a) return null;
    if (!r.AMM && typeof a.account === 'string') r.AMM = a.account;
    const x = xrpSide(a.amount) ?? xrpSide(a.amount2); if (x != null) return 2 * x;
    const mine = [a.amount, a.amount2].find(v => v && v.issuer === r.issuer && v.currency === r.currency), px = r.m && r.m.exch;
    return mine && px ? 2 * (+mine.value) * px : null;
  } catch { return null; }
}
async function refreshMetrics() {
  let ok = 0; const now = Date.now();
  for (const r of members.rows) {
    const x = await XM.token(r.currency, r.issuer);
    if (x) { ok++; r.m = { ...(r.m || {}), ...pick(x, METRICS) }; r.m_ts = now; if (!r.name && x.name) r.name = x.name; }
    const tvl = await ammTvl(r); if (tvl != null && Number.isFinite(tvl)) r.m = { ...(r.m || {}), tvl };
    if (rpcGap) await sleep(rpcGap);
  }
  status.metricsOk = ok; saveMembers(); return ok;
}
function build() {
  const raw = members.rows.filter(r => r.m && +r.m.marketcap > 0).map(r => { const { m, m_ts, ...rest } = r; return { ...rest, ...m }; });
  const { tokens, counts } = Score.score(raw);
  if (tokens.length < 20) throw new Error('too few memes tokens (' + tokens.length + ')');
  const c = { ok: true, enabled: true, v: 2, ts: new Date().toISOString(), source: 'xrpl.to+xrplmeta', attribution: ATTRIBUTION,
    sources: { members: members.source, members_ts: members.ts ? new Date(members.ts).toISOString() : null, metrics: 'XRPLMeta', tvl: 'XRPL ledger (amm_info)' },
    method: 'Top 150 xrpl.to Memes-tagged tokens by average rank of market cap, AMM TVL and holders (membership read daily from xrpl.to; market cap, holders, volume and changes from XRPLMeta; TVL from the XRPL ledger). Market Strength = percentiles of mcap 25, TVL 25, holders 20, 7d volume 15 (X followers not used, weights renormalised). Holder Health starts at 60 and moves with top-10 concentration, creator %, insider %, LP burned %, sell pressure, serial creator, recent creator exits and TVL/mcap. Alpha = 50% Market Strength + 35% Holder Health + 15% Momentum; Watchline tokens are left off the Alpha List. On-chain data signals only, not an accusation, not financial advice.',
    counts, tokens };
  setCache(c); status.fetched++;
  try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(FILE(), out.body); } catch (e) { console.error('[memes-circle] save', e.message); }
}

async function refresh() {
  if (!enabled() || running) return false; running = true; status.lastTry = new Date().toISOString();
  try {
    if (!members) { const m = loadMembers() || membersFromSnapshot(cache); if (m) setMembers(m); }
    if (!members || members.source !== 'xrpl.to' || Date.now() - members.ts > MEMBERS_EVERY) {
      try { if (await pullMembers()) status.err = null; else if (members && members.source !== 'xrpl.to') status.err = 'membership read waits (6 h between attempts)'; } catch (e) { status.err = e.message; console.error('[memes-circle] members', e.message); } }
    if (!members) { const m = seedMembers(); if (!m) throw new Error('no members (xrpl.to unreadable, no seed)'); setMembers(m); }
    await refreshMetrics();
    build(); return true;
  } catch (e) { status.err = e.message; console.error('[memes-circle]', e.message); return false; }
  finally { running = false; }
}

function loadSaved() { try { const c = JSON.parse(fs.readFileSync(FILE(), 'utf8')); if (c && Array.isArray(c.tokens) && c.tokens.length) { setCache(c); status.ts = c.ts; return true; } } catch {} return false; }

function start() {
  if (!enabled() || timer) return false; loadSaved();
  const m = loadMembers(); if (m) setMembers(m);
  if (!cache && members && members.rows.some(r => r.m && r.m.marketcap > 0)) { try { build(); } catch {} }   // districts show at once from saved metrics
  const age = cache ? Date.now() - Date.parse(cache.ts) : Infinity;
  const tick = async () => { const ok = await refresh(); timer = setTimeout(tick, ok ? EVERY : RETRY); timer.unref?.(); };
  timer = setTimeout(tick, age < EVERY ? EVERY - age : 8e3); timer.unref?.();
  return true;
}

// GET /api/memes-circle  (?status=1 = refresh health incl. `keyed`; optional ?top=N trims the token list; the Alpha List order is the list order)
function handle(req, res, url, { json }) {
  if (url.pathname !== '/api/memes-circle') return false;
  if (url.searchParams.get('status') === '1') { json(res, 200, { ...status, enabled: enabled(), keyed: XrplTo.keyed(), xrplto: XrplTo.stats(), xrplmeta: XM.stats() }); return true; }   // ?status=1: refresh health (never the key itself)
  if (!enabled()) { json(res, 200, { ok: false, enabled: false }); return true; }
  if (!out) { json(res, 503, { ok: false, enabled: true, error: 'warming_up', keyed: XrplTo.keyed(), err: status.err }); return true; }
  const top = Math.max(0, Math.min(150, parseInt(url.searchParams.get('top') || '0', 10) || 0));
  if (top) { json(res, 200, { ...cache, tokens: cache.tokens.slice(0, top) }); return true; }
  if (req.headers['if-none-match'] === out.etag) { res.writeHead(304, { etag: out.etag }); res.end(); return true; }
  const og = req.headers.origin;
  res.writeHead(200, { 'content-type': 'application/json', etag: out.etag, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff',
    'access-control-allow-origin': og && /^(?:https:\/\/xrpassassin\.github\.io|https:\/\/burn-city-game\.fly\.dev|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/.test(og) ? og : 'https://xrpassassin.github.io', vary: 'Origin' });
  res.end(out.body); return true;
}

module.exports = { start, refresh, handle, status: () => ({ ...status, enabled: enabled(), keyed: XrplTo.keyed() }), data: () => cache, members: () => members,
  _setFetch: f => { fetchImpl = f; }, _setRpc: (f, gap = 0) => { rpcImpl = f; rpcGap = gap; }, _setCache: setCache, _reset: () => { cache = null; out = null; members = null; if (timer) clearTimeout(timer); timer = null; Object.assign(status, { ok: false, ts: null, err: null }); }, ATTRIBUTION, PULLS };
