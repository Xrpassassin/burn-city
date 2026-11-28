// XRPLMeta (https://xrplmeta.org) token metrics, keyless: GET https://s1.xrplmeta.org/v2/token/<currency>:<issuer>?include_changes=true
// (v1 /tokens is deprecated 2027-01-01; v2 has no multi-token lookup, so it is one call per token). Values are in XRP.
// Shared by eco.js (city market stats) and memes-circle.js (Memes metrics). One call at a time, >= 350 ms apart; a 429/5xx
// pauses the queue (Retry-After honoured, else 2 min) and falls back to s2. Never throws: returns null on any failure.
'use strict';
const HOSTS = ['https://s1.xrplmeta.org', 'https://s2.xrplmeta.org'];
const GAP = () => (process.env.XRPLMETA_GAP_MS != null ? +process.env.XRPLMETA_GAP_MS : 350);
let fetchImpl = (...a) => fetch(...a), chain = Promise.resolve(), last = 0, pauseUntil = 0;
const stats = { calls: 0, ok: 0, fail: 0, r429: 0, lastOk: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const n = v => { const x = +v; return Number.isFinite(x) ? x : null; };

// normalise to the field names the city already uses (xrpl.to's): marketcap, holders, vol24hxrp, vol7dxrp, pro24h, pro7d, exch ...
function norm(j) {
  const m = j && j.metrics; if (!m) return null;
  const c24 = (m.changes || {})['24h'] || {}, c7 = (m.changes || {})['7d'] || {};
  return { exch: n(m.price), marketcap: n(m.marketcap), holders: n(m.holders), trustlines: n(m.trustlines), supply: n(m.supply),
    vol24hxrp: n(m.volume_24h), vol7dxrp: n(m.volume_7d), takers24h: n(m.takers_24h), takers7d: n(m.takers_7d),
    pro24h: c24.price ? n(c24.price.percent) : null, pro7d: c7.price ? n(c7.price.percent) : null,
    holders24h: c24.holders ? n(c24.holders.delta) : null, name: j.meta && j.meta.token && typeof j.meta.token.name === 'string' ? j.meta.token.name : null };
}
async function once(currency, issuer) {
  const wait = Math.max(0, last + GAP() - Date.now(), pauseUntil - Date.now()); if (wait) await sleep(wait);
  for (const h of HOSTS) {
    last = Date.now(); stats.calls++;
    try { const r = await fetchImpl(`${h}/v2/token/${encodeURIComponent(currency)}:${encodeURIComponent(issuer)}?include_changes=true`, { headers: { 'user-agent': 'burn-city/1' }, signal: AbortSignal.timeout(15e3) });
      if (r.status === 429 || r.status >= 500) { if (r.status === 429) stats.r429++; const ra = r.headers && r.headers.get ? +r.headers.get('retry-after') : NaN;
        pauseUntil = Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 120e3); continue; }
      if (!r.ok) { stats.fail++; return null; }
      const v = norm(await r.json()); if (v) { stats.ok++; stats.lastOk = new Date().toISOString(); } else stats.fail++; return v;
    } catch { /* try the next host */ }
  }
  stats.fail++; return null;
}
// token(currency, issuer) -> normalised metrics or null (serialised across callers)
function token(currency, issuer) { const p = chain.then(() => once(currency, issuer)); chain = p.catch(() => {}); return p; }
module.exports = { token, norm, stats: () => ({ ...stats, paused: pauseUntil > Date.now() }), ATTRIBUTION: 'XRPLMeta (https://xrplmeta.org)',
  _setFetch: f => { fetchImpl = f; }, _reset: () => { chain = Promise.resolve(); last = 0; pauseUntil = 0; Object.assign(stats, { calls: 0, ok: 0, fail: 0, r429: 0, lastOk: null }); } };
