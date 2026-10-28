// AMM locked-liquidity + black-hole supply verification (GET /api/amm-lock). Read-only XRPL, server side, cached.
//   Per POOL : % of the AMM's LP token supply (amm_info.lp_token = LPTokenBalance) held by VERIFIED permanent-lock accounts.
//   Per TOKEN: amount + % of the token's total issued supply (gateway_balances obligations) held by VERIFIED black-hole accounts.
// The two are never mixed: LP tokens are pool shares, burned supply is token units that are not in any pool.
// Verified permanent / black hole = account_info shows lsfDisableMaster AND (no RegularKey, or RegularKey is a known black-hole address)
// AND no SignerList (client/js/goldlock.js isBlackholedInfo, the same rule as strict gold) AND the account is not an AMM pseudo-account.
// Anything else is "held" (keys exist), "time-locked" (LP in an Escrow), "unaccounted" or UNVERIFIED (fetch failed / stale). Never assumed 0% or 100%.
'use strict';
const G = require('../client/js/goldlock.js');
const { auditBurnSupply } = require('./burn-supply-audit');
const { BURN_ISSUER, BURN_CURRENCY } = require('./issuer-return-history');
const BURN_KEY = BURN_ISSUER + '-' + BURN_CURRENCY;
const { attachIssuerReturnHistory } = require('./issuer-return-api-contract');

const REFRESH_MS = 2 * 3600e3;        // full re-verification every 2 h
const STALE_MS = 6 * 3600e3;          // anything older than 6 h is served as UNVERIFIED (stale)
const ACCT_TTL = 6 * 3600e3;          // account_info cache
const MIN_GAP_MS = 150;               // rate limit: >= 150 ms between our XRPL calls (~6/s, single flight)
const LP_CHECK_MIN = 0.001;           // LP holders >= 0.1% of LP supply are classified (smaller ones are "not checked")
const LP_CHECK_MAX = 60;              // at most 60 LP holders classified per pool
const TOK_PAGES = 25;                 // issuer trustline pages (400 each, 10k lines) scanned per token
const TOK_CHECK_MIN = 0.0001;         // token holders >= 0.01% of supply are classified
const TOK_CHECK_MAX = 30;             // at most 30 holders classified per token
const SKIP_TOKENS = new Set(['XRP', 'RLUSD']);   // XRP has no issuer; RLUSD: 60k+ trustlines, not a city burn token
const BH_SET = new Set(G.BH_KEYS);
const p2 = x => String(x).padStart(2, '0');
// own UTC ISO formatter (some hosts patch Date.prototype.toISOString); every record also carries t_ms for the staleness maths
const iso = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + 'Z'; };

// ---------- pure classification + maths (unit tested in test/amm-lock-sim.js) ----------
// r = account_info result (signer_lists:true). Returns { cls, reason }:
//   cls 'blackhole' (verified permanent), 'amm' (AMM pseudo-account), 'held' (keys exist), 'designated' (master off but a key/signers exist), 'unknown'
function classifyAccount(r) {
  if (!r || r.__err) return { cls: 'unknown', reason: 'account_info failed' + (r && r.__err ? ': ' + r.__err : '') };
  if (r.error === 'actNotFound') return { cls: 'unknown', reason: 'account not found' };
  const ad = r.account_data; if (!ad) return { cls: 'unknown', reason: 'no account_data' };
  if (ad.AMMID) return { cls: 'amm', reason: 'AMM pool account' };
  const masterOff = ((Number(ad.Flags) || 0) & G.LSF_DISABLE_MASTER) !== 0;
  const sl = r.signer_lists || ad.signer_lists || [];
  if (G.isBlackholedInfo(r)) return { cls: 'blackhole', reason: ad.RegularKey ? 'master disabled, regular key ' + ad.RegularKey + ' (black hole), no signers' : 'master disabled, no regular key, no signers' };
  if (!masterOff) return { cls: 'held', reason: 'master key enabled' };
  return { cls: 'designated', reason: sl.length ? 'master disabled but a signer list exists' : 'master disabled but regular key ' + ad.RegularKey };
}
const pct = (x, tot) => (tot > 0 ? Math.min(100, (100 * x) / tot) : null);
const floor2 = x => (x == null ? null : Math.floor(100 * x + 1e-9) / 100);   // never round a lock up

// ammInfo: amm_info result; lines: AMM account_lines (all pages); infos: {acct: account_info result}; escrows: account_objects(type escrow) on the AMM or null
function computePoolLock(ammInfo, lines, infos, escrows, ctx = {}) {
  const now = ctx.now || Date.now(), base = { amm: ctx.amm, pair: ctx.pair, ts: iso(now), t_ms: now, ledger: ammInfo && ammInfo.ledger_index || null,
    reported_pct: ctx.reported_pct != null ? +ctx.reported_pct : null, reported_src: 'data.js locked_pct (served, not re-verified here)' };
  if (!ammInfo || ammInfo.__err || !ammInfo.amm) return { ...base, status: 'unverified', reason: ammInfo && ammInfo.error === 'actNotFound' ? 'AMM not found (pool gone?)' : 'amm_info failed', locked_pct: null };
  if (!lines) return { ...base, status: 'unverified', reason: 'account_lines failed', locked_pct: null };
  const lp = ammInfo.amm.lp_token, tot = +lp.value;
  const out = { ...base, lp_currency: lp.currency, lp_supply: tot, lp_supply_src: 'amm_info(' + ctx.amm + ').lp_token (LPTokenBalance)', holders_src: 'account_lines(' + ctx.amm + ')' };
  if (!(tot > 0)) return { ...out, status: 'verified', reason: 'empty pool (no LP tokens)', locked_pct: 0, locked_lp: 0, destinations: [] };
  const hs = lines.filter(l => l.currency === lp.currency && Math.abs(+l.balance) > 0).map(l => ({ acct: l.account, lp: Math.abs(+l.balance) })).sort((a, b) => b.lp - a.lp);
  let locked = 0, held = 0, unknown = 0, unchecked = 0, onLines = 0; const dest = [];
  hs.forEach((h, i) => { onLines += h.lp;
    if (h.lp / tot < LP_CHECK_MIN || i >= LP_CHECK_MAX) { unchecked += h.lp; return; }
    const c = classifyAccount(infos[h.acct]); const d = { acct: h.acct, lp: h.lp, pct: floor2(pct(h.lp, tot)), cls: c.cls === 'blackhole' ? 'permanent' : c.cls === 'unknown' ? 'unknown' : 'held', reason: c.reason, source: 'account_info(' + h.acct + ')' };
    if (d.cls === 'permanent') locked += h.lp; else if (d.cls === 'unknown') unknown += h.lp; else held += h.lp; dest.push(d); });
  // LP tokens in an Escrow are not on any trustline: time-locked (released at FinishAfter), never permanent
  let tl = 0; const tld = [];
  for (const e of (escrows || [])) { const a = e.Amount; if (a && typeof a === 'object' && a.currency === lp.currency && (!a.issuer || a.issuer === ctx.amm)) { tl += +a.value; tld.push({ acct: e.Account, lp: +a.value, pct: floor2(pct(+a.value, tot)), cls: 'time_locked', reason: 'Escrow' + (e.FinishAfter ? ' FinishAfter ' + iso((e.FinishAfter + 946684800) * 1000).slice(0, 10) : '') + (e.CancelAfter ? ' CancelAfter ' + iso((e.CancelAfter + 946684800) * 1000).slice(0, 10) : ''), source: 'account_objects(' + ctx.amm + ', escrow)' }); } }
  const unacc = Math.max(0, tot - onLines - tl);
  out.locked_lp = locked; out.locked_pct_min = floor2(pct(locked, tot));
  out.time_locked_lp = tl; out.time_locked_pct = floor2(pct(tl, tot)); out.time_locked_src = escrows ? 'account_objects(' + ctx.amm + ', escrow)' : 'not checked (escrow lookup failed)';
  out.held_pct = floor2(pct(held, tot)); out.unchecked_pct = floor2(pct(unchecked, tot)); out.unknown_pct = floor2(pct(unknown, tot)); out.unaccounted_pct = floor2(pct(unacc, tot));
  out.lp_holders = hs.length; out.destinations = dest.concat(tld);
  if (unknown > 0) { out.status = 'unverified'; out.reason = 'could not read ' + dest.filter(d => d.cls === 'unknown').length + ' LP holder account(s)'; out.locked_pct = null; }
  else { out.status = 'verified'; out.locked_pct = out.locked_pct_min; out.reason = unchecked > 0 ? 'holders below 0.1% not checked (' + out.unchecked_pct + '% of LP, counted as not locked)' : 'all LP holders checked'; }
  if (out.reported_pct != null && out.locked_pct != null && Math.abs(out.reported_pct - out.locked_pct) >= 0.5) out.reported_note = 'served locked_pct differs from the verified value';
  return out;
}

// gw: gateway_balances(issuer) result; lines: issuer account_lines pages {lines, complete}; infos: {acct: account_info}; issuerInfo: account_info(issuer)
function computeTokenBurn(gw, scan, infos, issuerInfo, ctx = {}) {
  const now = ctx.now || Date.now(), { issuer, currency } = ctx;
  const out = { token: ctx.name, issuer, currency, ts: iso(now), t_ms: now, pools: ctx.pools || [] };
  const ic = classifyAccount(issuerInfo);
  out.issuer_keys_disabled = ic.cls === 'unknown' ? null : ic.cls === 'blackhole'; out.issuer_src = 'account_info(' + issuer + ')'; out.issuer_note = ic.reason;
  const lines = scan && scan.lines; const holders = (lines || []).filter(l => l.currency === currency && +l.balance < 0).map(l => ({ acct: l.account, amt: -l.balance }));
  let supply = null, src = null;
  const ob = gw && !gw.__err && gw.obligations ? gw.obligations[currency] : undefined;
  if (ob != null) { supply = +ob; src = 'gateway_balances(' + issuer + ').obligations'; }
  else if (scan && scan.complete) { supply = holders.reduce((s, h) => s + h.amt, 0); src = 'sum of account_lines(' + issuer + ') balances'; }
  out.supply = supply; out.supply_src = src;
  if (supply == null) return { ...out, status: 'unverified', reason: 'total supply unavailable (gateway_balances failed and trustline scan incomplete)', burned: null, burned_pct: null };
  if (!lines) return { ...out, status: 'unverified', reason: 'issuer account_lines failed', burned: null, burned_pct: null };
  holders.sort((a, b) => b.amt - a.amt); let burned = 0, unknown = 0; const bh = [];
  holders.forEach((h, i) => { if (h.acct === issuer || i >= TOK_CHECK_MAX || !(supply > 0) || h.amt / supply < TOK_CHECK_MIN) return;
    const c = classifyAccount(infos[h.acct]); if (c.cls === 'blackhole') { burned += h.amt; bh.push({ acct: h.acct, amount: h.amt, pct: pct(h.amt, supply), cls: 'burned', reason: c.reason, source: 'account_info(' + h.acct + ')' }); }
    else if (c.cls === 'designated') bh.push({ acct: h.acct, amount: h.amt, pct: pct(h.amt, supply), cls: 'designated', reason: 'sent to designated address: ' + c.reason, source: 'account_info(' + h.acct + ')' });
    else if (c.cls === 'unknown') { unknown += h.amt; bh.push({ acct: h.acct, amount: h.amt, pct: pct(h.amt, supply), cls: 'unknown', reason: c.reason, source: 'account_info(' + h.acct + ')' }); } });
  out.burned = burned; out.burned_pct = pct(burned, supply); out.black_holes = bh; out.holders_src = 'account_lines(' + issuer + ')';
  out.scanned = { lines: holders.length, complete: !!scan.complete, rule: 'top ' + TOK_CHECK_MAX + ' holders >= 0.01% of supply' };
  if (unknown > 0) { out.status = 'unverified'; out.reason = 'could not read a large holder account'; out.burned_pct = null; out.burned_min = burned; }
  else if (!scan.complete) { out.status = 'partial'; out.reason = 'trustline scan incomplete: burned amount is a lower bound'; }
  else { out.status = 'verified'; out.reason = 'top holders checked'; }
  return out;
}
// stale / failed -> UNVERIFIED for serving (keeps the last figures for context, never presents them as current)
function servable(o, now = Date.now()) {
  if (!o) return o; const age = now - (o.t_ms != null ? o.t_ms : Date.parse(o.ts));
  if (!(age <= STALE_MS) && o.status !== 'unverified') return { ...o, status: 'unverified', stale: true, reason: 'stale: last verified ' + Math.round(age / 3600e3) + ' h ago', locked_pct: null, burned_pct: null, last_verified_pct: o.locked_pct != null ? o.locked_pct : o.burned_pct };
  return o;
}

// ---------- XRPL fetch layer (rate-limited, cached) ----------
function create(opts = {}) {
  // Trusted, server-populated audit map only; no client-submitted claims.
  const audits = opts.issuerReturnAudits instanceof Map ? opts.issuerReturnAudits : new Map();
  const rpc0 = opts.rpc, now = opts.now || (() => Date.now()), gap = opts.gap != null ? opts.gap : MIN_GAP_MS;
  const S = { pools: {}, tokens: {}, run: null, last_ok: null, last_err: null, calls: 0, started: null }, acct = new Map();
  let lastCall = 0; const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function call(m, p) { const w = lastCall + gap - Date.now(); if (w > 0) await sleep(w); lastCall = Date.now(); S.calls++;
    try { const r = await rpc0(m, p); if (r && r.error && r.error !== 'actNotFound') return { __err: r.error }; return r || { __err: 'empty' }; } catch (e) { return { __err: e.message || String(e) }; } }
  async function info(a) { const c = acct.get(a); if (c && now() - c.t < ACCT_TTL) return c.r; const r = await call('account_info', { account: a, ledger_index: 'validated', signer_lists: true });
    if (!r.__err) acct.set(a, { r, t: now() }); return r; }
  async function pool(p) {
    const ai = await call('amm_info', { amm_account: p.amm, ledger_index: 'validated' });
    let lines = null;
    if (ai.amm) { lines = []; let marker, pages = 0;
      do { const al = await call('account_lines', { account: p.amm, ledger_index: 'validated', limit: 400, ...(marker ? { marker } : {}) }); if (al.__err) { lines = null; break; }
        lines.push(...(al.lines || [])); marker = al.marker; pages++; } while (marker && pages < 10); }
    const infos = {};
    if (ai.amm && lines) { const tot = +ai.amm.lp_token.value; const hs = lines.filter(l => l.currency === ai.amm.lp_token.currency && Math.abs(+l.balance) / tot >= LP_CHECK_MIN).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, LP_CHECK_MAX);
      for (const h of hs) infos[h.account] = await info(h.account); }
    let esc = null; if (ai.amm) { const r = await call('account_objects', { account: p.amm, type: 'escrow', ledger_index: 'validated', limit: 200 }); if (!r.__err) esc = r.account_objects || []; }
    return computePoolLock(ai, lines, infos, esc, { amm: p.amm, pair: p.a + '/' + p.b, reported_pct: p.locked_pct, now: now() });
  }
  async function token(n, pools) {
    if(n.key === BURN_KEY) {
      let record;
      try { record = await auditBurnSupply({rpc:call,now:now()}); }
      catch(e) { record = {status:'unverified',reason:e.message}; }
      return {name:n.name,issuer:BURN_ISSUER,currency:BURN_CURRENCY,status:record.status,
        t_ms:now(),ts:iso(now()),issuer_keys_disabled:record.status==='verified'?true:null,
        supply_reconciliation:record,pools:pools.filter(p=>p.a===n.name||p.b===n.name).map(p=>p.amm)};
    }
    const i = n.key.indexOf('-'), issuer = n.key.slice(0, i), currency = n.key.slice(i + 1);
    const gw = await call('gateway_balances', { account: issuer, ledger_index: 'validated' });
    const lines = []; let marker, pages = 0, ok = true;
    do { const al = await call('account_lines', { account: issuer, ledger_index: 'validated', limit: 400, ...(marker ? { marker } : {}) }); if (al.__err) { ok = false; break; }
      lines.push(...(al.lines || [])); marker = al.marker; pages++; } while (marker && pages < TOK_PAGES);
    const scan = ok ? { lines, complete: !marker } : null;
    const issuerInfo = await info(issuer);
    const ammSet = new Set(pools.map(p => p.amm)); const infos = {};
    if (scan) { const supply = gw.obligations && gw.obligations[currency] != null ? +gw.obligations[currency] : lines.filter(l => l.currency === currency && +l.balance < 0).reduce((s, l) => s - l.balance, 0);
      const hs = lines.filter(l => l.currency === currency && +l.balance < 0 && l.account !== issuer).sort((a, b) => a.balance - b.balance).slice(0, TOK_CHECK_MAX);
      for (const h of hs) { if (supply > 0 && -h.balance / supply < TOK_CHECK_MIN) continue; infos[h.account] = ammSet.has(h.account) ? { account_data: { AMMID: 'known', Flags: 0 } } : await info(h.account); } }
    return computeTokenBurn(gw, scan, infos, issuerInfo, { name: n.name, issuer, currency, pools: pools.filter(p => p.a === n.name || p.b === n.name).map(p => p.amm), now: now() });
  }
  async function refresh(data) {
    if (S.run) return S.run;
    S.run = (async () => { S.started = iso(now());
      try { const d = data(); if (!d) throw new Error('no eco data');
        const pools = d.pools.filter(p => p.amm && !p.gone);
        const burn = d.nodes.find(n=>n.key===BURN_KEY);
        if(burn) S.tokens[burn.name] = await token(burn,pools);
        for (const p of pools) S.pools[p.amm] = await pool(p);
        for (const n of d.nodes) { if (!n.key || n.key===BURN_KEY || !n.key.includes('-') || SKIP_TOKENS.has(n.name)) continue; S.tokens[n.name] = await token(n, pools); }
        S.last_ok = iso(now()); S.last_err = null;
      } catch (e) { S.last_err = e.message; } finally { S.run = null; } })();
    return S.run;
  }
  function snapshot() { const t = now(), P = {}, T = {};
    for (const [k, v] of Object.entries(S.pools)) P[k] = servable(v, t);
    for (const [k, v] of Object.entries(S.tokens)) T[k] = servable(v, t);
    return { v: 1, ts: iso(t), t_ms: t, refresh_s: REFRESH_MS / 1e3, stale_after_h: STALE_MS / 3600e3, last_ok: S.last_ok, last_err: S.last_err, running: !!S.run, calls: S.calls,
      rules: { permanent: 'account_info: lsfDisableMaster AND (no RegularKey or RegularKey in ' + G.BH_KEYS.join(', ') + ') AND no SignerList AND not an AMM account',
        lock_pct: 'LP held by permanent accounts / amm_info.lp_token (LPTokenBalance); holders < 0.1% not checked (counted as not locked)',
        supply_reconciliation: 'BURN: verified fixed issuance minus outstanding obligations, frozen balances and escrow at one validated ledger; includes transfer-fee reductions',
        burn_pct: 'token balance held by black-hole accounts (issuer excluded) / gateway_balances obligations (or sum of issuer trustlines)',
        issuer_keys_disabled: 'separate fact; never counted as burned supply', unverified: 'fetch failed or older than ' + STALE_MS / 3600e3 + ' h: no % is shown' },
      pools: P, tokens: attachIssuerReturnHistory(T, audits, t) }; }
  return { refresh, snapshot, _state: S };
}

let inst = null, timer = null;
function start(eco) {
  if (process.env.AMM_LOCK === '0') return;
  inst = create({ rpc: (m, p) => eco.rpc(m, p) });
  const go = () => inst.refresh(() => eco.data()).catch(() => {});
  setTimeout(go, +process.env.AMM_LOCK_DELAY_MS || 90e3);   // after eco's first pool reads
  timer = setInterval(go, REFRESH_MS); if (timer.unref) timer.unref();
}
function handle(req, res, url, { json }) {
  if (url.pathname !== '/api/amm-lock') return false;
  if (!inst) { json(res, 503, { error: 'disabled' }); return true; }
  const s = inst.snapshot(); if (!s.last_ok && !Object.keys(s.pools).length) { json(res, 503, { ...s, error: 'warming_up' }); return true; }
  json(res, 200, s); return true;
}
module.exports = { start, handle, create, classifyAccount, computePoolLock, computeTokenBurn, servable, REFRESH_MS, STALE_MS, LP_CHECK_MIN, _inst: () => inst };
