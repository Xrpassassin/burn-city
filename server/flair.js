'use strict';
// Holder flair: server-side BURN tier per signed-in wallet. Never trusts the client.
// Effective BURN = direct trustline balance + BURN share of any BURN AMM LP tokens held.
const C = require('./config'), { curHex } = require('./burn');
const SUPPLY = 34.84e12;                        // BURN outstanding (gateway_balances, Oct 2026)
const TIERS = [0, +(C.FLAIR_T1 || 10e9), +(C.FLAIR_T2 || 100e9), +(C.FLAIR_T3 || 1e12)]; // 10B / 100B / 1T (~0.029% / 0.29% / 2.9% of supply)
const NAMES = ['', 'holder', 'big holder', 'whale'];
const OG_MS = 30 * 864e5;                       // profile older than 30 days
const tierFor = b => { b = +b || 0; for (let i = 3; i > 0; i--) if (b >= TIERS[i]) return i; return 0; };
const lpToBurn = (lpBal, lpTotal, poolBurn) => (+lpBal > 0 && +lpTotal > 0 && +poolBurn > 0) ? (+lpBal / +lpTotal) * +poolBurn : 0;
const isOg = (created, now = Date.now()) => !!created && now - created >= OG_MS;

const cache = new Map(), amm = new Map(), TTL = 600e3;
let rpc = null, pools = () => [], used = [], busy = 0;
function init(o) { rpc = o.rpc; pools = o.pools; }
const budget = () => { const t = Date.now(); used = used.filter(x => t - x < 60e3); if (used.length >= 30 || busy >= 3) return false; used.push(t); return true; };
async function ammBurn(acct) {          // { lpCur, lpTotal, burn } or null if not a BURN pool; cached 10 min
  const c = amm.get(acct); if (c && Date.now() - c.t < TTL) return c.v;
  const r = await rpc('amm_info', { amm_account: acct, ledger_index: 'validated' }), a = r && r.amm; let v = null;
  if (a) { const cur = curHex(C.BURN_CURRENCY), s = [a.amount, a.amount2].find(x => x && typeof x === 'object' && x.issuer === C.BURN_ISSUER && x.currency === cur);
    if (s) v = { lpCur: a.lp_token.currency, lpTotal: +a.lp_token.value, burn: +s.value }; }
  amm.set(acct, { t: Date.now(), v }); return v;
}
async function effective(acct) {
  const ammSet = new Set(pools().map(p => p.amm)), cur = curHex(C.BURN_CURRENCY); let direct = 0, lp = 0, marker, n = 0;
  do { const r = await rpc('account_lines', { account: acct, ledger_index: 'validated', limit: 400, ...(marker ? { marker } : {}) }); if (!r || r.error) break;
    for (const l of r.lines || []) { const b = +l.balance; if (!(b > 0)) continue;
      if (l.account === C.BURN_ISSUER && l.currency === cur) direct += b;
      else if (ammSet.has(l.account)) { const p = await ammBurn(l.account); if (p && l.currency === p.lpCur) lp += lpToBurn(b, p.lpTotal, p.burn); } }
    marker = r.marker; } while (marker && ++n < 5);
  return { direct, lp, total: direct + lp };
}
// returns cached tier synchronously (0 while unknown); refreshes in background and calls cb(tier) when it changes
function tier(acct, cb) {
  if (!acct || !rpc) return 0; const c = cache.get(acct);
  if ((!c || Date.now() - c.t > TTL) && !(c && c.p) && budget()) {
    const e = c || { t: 0, v: 0 }; e.p = true; cache.set(acct, e); busy++;
    effective(acct).then(r => { const v = tierFor(r.total), old = e.v; Object.assign(e, { t: Date.now(), v, bal: r }); if (v !== old && cb) cb(v); })
      .catch(() => { e.t = Date.now() - TTL + 60e3; }).finally(() => { e.p = false; busy--; });
  }
  return c ? c.v : 0;
}
module.exports = { init, tier, tierFor, lpToBurn, isOg, TIERS, NAMES, SUPPLY, _cache: cache };
