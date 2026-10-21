// Gold = PERMANENTLY locked AMM pool. ONE shared source for the strict rule, used by server/eco.js (lock sweep),
// scripts/lockaudit.js (audit), test/goldlock-sim.js (unit test) and client/js/app.js (rails, LOCKED labels, swirls, sparks).
//   gold = >= GOLD_MIN_LOCK_PCT of the LP token supply held by black-holed accounts
//          AND pool TVL >= GOLD_MIN_TVL_XRP (both sides valued in XRP; an unpriced non-XRP pair is never gold)
//   black-holed = lsfDisableMaster set AND (no RegularKey, or RegularKey is a known black-hole address) AND no SignerList.
// Plain script: works as a CommonJS module (require) and in the browser (import './goldlock.js' -> globalThis.BCGold).
(function (root) {
  'use strict';
  const GOLD_MIN_LOCK_PCT = 95, GOLD_MIN_TVL_XRP = 5000;
  const LSF_DISABLE_MASTER = 0x00100000;
  const BH_KEYS = ['rrrrrrrrrrrrrrrrrrrrrhoLvTp', 'rrrrrrrrrrrrrrrrrrrrBZbvji', 'rrrrrrrrrrrrrrrrrrrn5RM1rHd'];
  const BH_SET = new Set(BH_KEYS);
  // r = account_info result (with signer_lists:true). Handles API v1 (account_data.signer_lists) and v2 (top-level signer_lists).
  function isBlackholedInfo(r) {
    const ad = r && r.account_data; if (!ad) return false;
    const sl = (r.signer_lists || ad.signer_lists || []);
    const flags = Number(ad.Flags) || 0;
    return (flags & LSF_DISABLE_MASTER) !== 0 && (!ad.RegularKey || BH_SET.has(ad.RegularKey)) && sl.length === 0;
  }
  // percent of LP supply (tot) held by holders flagged bh:true
  function lockedPct(lines, tot) {
    tot = +tot; if (!(tot > 0)) return 0; let s = 0;
    for (const l of lines || []) if (l.bh) s += Math.abs(+l.v);
    return Math.min(100, 100 * s / tot);
  }
  // pool: { a, b, locked_pct, tvl_xrp, tvl_priced? }. XRP pairs are always priced; any other pair needs tvl_priced === true.
  function poolPriced(p) { return !!p && (p.a === 'XRP' || p.b === 'XRP' || p.tvl_priced === true); }
  function isGold(p) {
    return !!p && !p.gone && (+p.locked_pct || 0) >= GOLD_MIN_LOCK_PCT && poolPriced(p) && (+p.tvl_xrp || 0) >= GOLD_MIN_TVL_XRP;
  }
  // why a pool is/is not gold (audit + debug)
  function verdict(p) {
    if (!p) return 'no pool';
    if (p.gone) return 'not gold: pool gone';
    const lk = (+p.locked_pct || 0) >= GOLD_MIN_LOCK_PCT, pr = poolPriced(p), tv = (+p.tvl_xrp || 0) >= GOLD_MIN_TVL_XRP;
    if (lk && pr && tv) return 'GOLD';
    const why = [];
    if (!lk) why.push(`black-holed ${(+p.locked_pct || 0).toFixed(1)}% < ${GOLD_MIN_LOCK_PCT}%`);
    if (!pr) why.push('pool not priced in XRP');
    else if (!tv) why.push(`TVL ${(+p.tvl_xrp || 0).toFixed(0)} < ${GOLD_MIN_TVL_XRP} XRP`);
    return 'not gold: ' + why.join('; ');
  }
  const api = { GOLD_MIN_LOCK_PCT, GOLD_MIN_TVL_XRP, LSF_DISABLE_MASTER, BH_KEYS, isBlackholedInfo, lockedPct, poolPriced, isGold, verdict };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BCGold = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
