// Circle of XRPL Memes (Phase 1): hourly read of xrpl.to 'Memes'-tagged tokens -> scored + quadrant-tagged list for the
// City's meme districts (client/js/memes-circle.mjs). Read-only public requests, cached in memory and on the data volume,
// served at GET /api/memes-circle (behind server.js's shared per-IP limiter). Scoring lives in server/memes-circle-score.js.
// Fail soft: a failed refresh keeps the last good list (memory, else the saved file); with nothing yet the route says warming_up.
// Kill switch: MEMES_CIRCLE=0 (env / Fly secret) stops the fetch and the route answers { ok:false, enabled:false }, which the
// client reads as "don't build the quarter".
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Score = require('./memes-circle-score');
const XrplTo = require('./xrplto');   // X-Api-Key when XRPLTO_API_KEY is set

const API = 'https://api.xrpl.to/v1/tokens';
const EVERY = 60 * 60e3, RETRY = 5 * 60e3, PAGE = 100;
// pages pulled per refresh: the top of the Memes tag by each ranking the universe uses (union, deduped)
const PULLS = [['marketcap', 0], ['marketcap', 100], ['marketcap', 200], ['marketcap', 300], ['tvl', 0], ['tvl', 100], ['holders', 0], ['holders', 100]];
const ATTRIBUTION = 'Data by xrpl.to (https://xrpl.to)';

const enabled = () => String(process.env.MEMES_CIRCLE ?? '1') !== '0';
const dataDir = () => process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
const FILE = () => path.join(dataDir(), 'memes-circle.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let cache = null, out = null, timer = null, running = false;
const status = { ok: false, ts: null, err: null, fetched: 0, lastTry: null };
let fetchImpl = (...a) => fetch(...a);

function setCache(c) {
  cache = c; const body = JSON.stringify(c);
  out = { body, etag: '"m' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"' };
  Object.assign(status, { ok: true, ts: c.ts });
}

async function pull(sortBy, start) {
  const u = `${API}?start=${start}&limit=${PAGE}&sortBy=${sortBy}&sortType=desc&tag=Memes`;
  const r = await fetchImpl(u, { headers: XrplTo.headers({ 'user-agent': 'burn-city/1' }), signal: AbortSignal.timeout(20e3) });
  if (!r.ok) throw new Error('xrpl.to ' + r.status);
  const j = await r.json(); if (!j || !Array.isArray(j.tokens)) throw new Error('xrpl.to bad body'); return j.tokens;
}

async function refresh({ gap = 2000 } = {}) {
  if (!enabled() || running) return false; running = true; status.lastTry = new Date().toISOString();
  try {
    const raw = []; let fails = 0;
    for (const [s, st] of PULLS) {
      let got = null; for (let k = 0; k < 2 && !got; k++) { try { got = await pull(s, st); } catch (e) { status.err = e.message; if (gap) await sleep(gap * 4); } }   // one polite retry (429s happen)
      if (got) raw.push(...got); else fails++; if (gap) await sleep(gap); }
    if (fails > PULLS.length / 2 || raw.length < 50) throw new Error(`xrpl.to: ${fails}/${PULLS.length} pages failed`);
    const { tokens, counts } = Score.score(raw);
    if (tokens.length < 20) throw new Error('too few memes tokens (' + tokens.length + ')');
    const c = { ok: true, enabled: true, v: 1, ts: new Date().toISOString(), source: 'xrpl.to', attribution: ATTRIBUTION,
      method: 'Top 150 xrpl.to Memes-tagged tokens by average rank of market cap, AMM TVL and holders. Market Strength = percentiles of mcap 25, TVL 25, holders 20, 7d volume 15 (X followers not used, weights renormalised). Holder Health starts at 60 and moves with top-10 concentration, creator %, insider %, LP burned %, sell pressure, serial creator, recent creator exits and TVL/mcap. Alpha = 50% Market Strength + 35% Holder Health + 15% Momentum; Watchline tokens are left off the Alpha List. On-chain data signals only, not an accusation, not financial advice.',
      counts, tokens };
    setCache(c); status.err = fails ? status.err : null; status.fetched++;
    try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(FILE(), out.body); } catch (e) { console.error('[memes-circle] save', e.message); }
    return true;
  } catch (e) { status.err = e.message; console.error('[memes-circle]', e.message); return false; }
  finally { running = false; }
}

function loadSaved() { try { const c = JSON.parse(fs.readFileSync(FILE(), 'utf8')); if (c && Array.isArray(c.tokens) && c.tokens.length) { setCache(c); status.ts = c.ts; return true; } } catch {} return false; }

function start() {
  if (!enabled() || timer) return false; loadSaved();
  const age = cache ? Date.now() - Date.parse(cache.ts) : Infinity;
  const tick = async () => { const ok = await refresh(); timer = setTimeout(tick, ok ? EVERY : RETRY); timer.unref?.(); };
  timer = setTimeout(tick, age < EVERY ? EVERY - age : 8e3); timer.unref?.();
  return true;
}

// GET /api/memes-circle  (?status=1 = refresh health incl. `keyed`; optional ?top=N trims the token list; the Alpha List order is the list order)
function handle(req, res, url, { json }) {
  if (url.pathname !== '/api/memes-circle') return false;
  if (url.searchParams.get('status') === '1') { json(res, 200, { ...status, enabled: enabled(), keyed: XrplTo.keyed() }); return true; }   // ?status=1: refresh health (never the key itself)
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

module.exports = { start, refresh, handle, status: () => ({ ...status, enabled: enabled(), keyed: XrplTo.keyed() }), data: () => cache,
  _setFetch: f => { fetchImpl = f; }, _setCache: setCache, _reset: () => { cache = null; out = null; if (timer) clearTimeout(timer); timer = null; Object.assign(status, { ok: false, ts: null, err: null }); }, ATTRIBUTION, PULLS };
