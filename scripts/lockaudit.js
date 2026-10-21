#!/usr/bin/env node
// Lock audit: for every AMM pool the city tracks, read the LP holders straight from the XRP Ledger (public JSON-RPC, read-only)
// and check each holder against the strict black-hole rule in client/js/goldlock.js. Prints a markdown report.
//   node scripts/lockaudit.js [data.js url or path] > lock-audit.md
// Default source: https://burn-city-game.fly.dev/data.js (live ECO incl. discovered pools), fallback client/data.js.
'use strict';
const fs = require('fs'), path = require('path'), G = require('../client/js/goldlock.js');
const RPC = ['https://xrplcluster.com/', 'https://s1.ripple.com:51234/', 'https://s2.ripple.com:51234/'];
const SRC = process.argv[2] || 'https://burn-city-game.fly.dev/data.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rpc(method, p) { let err;
  for (let a = 0; a < 3; a++) for (const u of RPC) {
    try { const r = (await (await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params: [p] }), signal: AbortSignal.timeout(20e3) })).json()).result || {};
      if (r.status === 'error') { if (r.error === 'actNotFound') return r; err = r.error; continue; } return r; } catch (e) { err = e.message; }
    await sleep(500); }
  throw new Error(method + ': ' + err); }
const parse = s => JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
async function load() {
  try { if (/^https?:/.test(SRC)) return { eco: parse(await (await fetch(SRC, { signal: AbortSignal.timeout(30e3) })).text()), src: SRC };
    return { eco: parse(fs.readFileSync(SRC, 'utf8')), src: SRC }; }
  catch (e) { const f = path.join(__dirname, '..', 'client', 'data.js'); return { eco: parse(fs.readFileSync(f, 'utf8')), src: f + ' (fallback: ' + e.message + ')' }; } }
const bh = new Map();
async function holderInfo(acct) { if (bh.has(acct)) return bh.get(acct); const pr = holderInfo2(acct); bh.set(acct, pr); return pr; }
async function holderInfo2(acct) {
  const r = await rpc('account_info', { account: acct, ledger_index: 'validated', signer_lists: true }), ad = r.account_data || {};
  const sl = r.signer_lists || ad.signer_lists || [];
  const o = { bh: G.isBlackholedInfo(r), master: ad.Flags != null ? !((ad.Flags & G.LSF_DISABLE_MASTER) !== 0) : null, rk: ad.RegularKey || '', signers: sl.length, missing: !r.account_data };
  return o; }
const why = h => h.bh ? 'black-holed' : h.missing ? 'account not found' : [h.master ? 'master key enabled' : '', h.rk && !G.BH_KEYS.includes(h.rk) ? 'RegularKey ' + h.rk.slice(0, 8) + '…' : '', h.signers ? 'SignerList' : ''].filter(Boolean).join(', ') || 'not black-holed';
(async () => {
  const { eco, src } = await load(), byKey = {}, byName = {};
  for (const n of eco.nodes) { byName[n.name] = n; if (n.key && n.key.includes('-')) byKey[n.key] = n; }
  const price = s => { if (typeof s === 'string') return { v: +s / 1e6, x: +s / 1e6, cur: 'XRP' }; const n = byKey[s.issuer + '-' + s.currency], pr = n && (n.price_amm || n.price_xrp);
    return { v: +s.value, x: pr ? +s.value * pr : null, cur: n ? n.name : s.currency }; };
  const rows = [], ledger = { i: null };
  const todo = eco.pools.filter(p => p.amm), CONC = +process.env.CONC || 8;
  const one = async p => {
    const r = { p, holders: [], err: null };
    try {
      const a = (await rpc('amm_info', { amm_account: p.amm, ledger_index: 'validated' }));
      if (!a.amm) { r.err = 'AMM gone'; rows.push(r); return; } ledger.i = a.ledger_index || ledger.i;
      const A = price(a.amm.amount), B = price(a.amm.amount2), tot = +a.amm.lp_token.value;
      r.tvl = A.cur === 'XRP' ? 2 * A.v : B.cur === 'XRP' ? 2 * B.v : (A.x != null && B.x != null ? A.x + B.x : null);
      r.priced = r.tvl != null; const lines = []; let marker;
      do { const al = await rpc('account_lines', { account: p.amm, ledger_index: 'validated', limit: 400, ...(marker ? { marker } : {}) });
        for (const l of al.lines || []) if (l.currency === a.amm.lp_token.currency && Math.abs(+l.balance) > 0) lines.push({ acct: l.account, v: Math.abs(+l.balance) });
        marker = al.marker; } while (marker && lines.length < 4000);
      lines.sort((x, y) => y.v - x.v);
      for (const l of lines) if (l.v / tot >= 0.001) { const h = await holderInfo(l.acct); l.bh = h.bh; l.why = why(h); }
      r.lines = lines; r.tot = tot; r.lp_holders = lines.length;
      r.lockPct = Math.floor(10 * G.lockedPct(lines, tot) + 1e-9) / 10;
      r.holders = lines.slice(0, 5).map(l => ({ acct: l.acct, pct: 100 * l.v / tot, bh: !!l.bh, why: l.why || 'below 0.1% (not checked)' }));
    } catch (e) { r.err = e.message; }
    rows.push(r); };
  let qi = 0; await Promise.all(Array.from({ length: CONC }, async () => { while (qi < todo.length) await one(todo[qi++]); }));
  // before = PR #29 client rules on the served locked_pct: forever b.L>=.95 (no TVL check); LOCKED FOREVER label at >=10%; gold tint for any L>0
  const out = [];
  out.push('# Burn City AMM lock audit', '');
  out.push(`Generated ${new Date().toISOString()} by scripts/lockaudit.js from ${src}; XRPL validated ledger ~${ledger.i}.`, '');
  out.push(`Rule (client/js/goldlock.js): gold = >= ${G.GOLD_MIN_LOCK_PCT}% of LP supply held by black-holed accounts (lsfDisableMaster set, RegularKey none or a known black-hole address, no SignerList) AND pool TVL >= ${G.GOLD_MIN_TVL_XRP} XRP (XRP pair = 2x XRP side; other pairs priced from ECO XRP prices; unpriced = not gold).`, '');
  out.push('Before = PR #29 (bc-v45) client: forever when served locked_pct >= 95 (no TVL check); "LOCKED FOREVER" label shown at >= 10%; rails/core/seal gold tint scaled by locked % for any pool > 0%.', '');
  out.push('| Pool | AMM account | TVL (XRP) | LP holders | Top LP holders (% of LP, black-holed?) | Black-holed % (ledger) | Served % | Before | Final verdict |', '|---|---|---:|---:|---|---:|---:|---|---|');
  let nGold = 0, nChanged = 0;
  for (const r of rows.sort((x, y) => (y.lockPct || 0) - (x.lockPct || 0) || (y.tvl || 0) - (x.tvl || 0))) {
    const p = r.p, served = +p.locked_pct || 0;
    const before = served >= 95 ? 'forever (gold)' : served >= 10 ? `partial gold + "LOCKED FOREVER" label` : served > 0 ? 'partial gold tint' : 'none';
    const v = r.err ? 'ERROR: ' + r.err : G.verdict({ a: p.a, b: p.b, locked_pct: r.lockPct, tvl_xrp: r.tvl || 0, tvl_priced: r.priced });
    if (v === 'GOLD') nGold++; if (before !== 'none' && !(before.startsWith('forever') && v === 'GOLD')) nChanged++;
    const hs = r.holders.map(h => `${h.acct.slice(0, 10)}… ${h.pct.toFixed(2)}% ${h.bh ? 'BH ✓' : '✗ (' + h.why + ')'}`).join('<br>');
    out.push(`| ${p.a}/${p.b} | ${p.amm} | ${r.tvl == null ? (r.err ? '?' : 'unpriced') : r.tvl.toFixed(0)} | ${r.lp_holders ?? '?'} | ${hs || '-'} | ${r.lockPct ?? '?'} | ${served} | ${before} | ${v} |`);
  }
  out.push('', `Pools audited: ${rows.length}. Gold now: ${nGold}. Pools whose gold/lock display changes vs before: ${nChanged}.`);
  const bad = rows.filter(r => r.lockPct != null && Math.abs(r.lockPct - (+r.p.locked_pct || 0)) >= 0.5);
  out.push('', '## Served locked_pct vs ledger (difference >= 0.5 pt)', '', bad.length ? bad.map(r => `- ${r.p.a}/${r.p.b}: served ${r.p.locked_pct}% vs ledger ${r.lockPct}%`).join('\n') : '- none');
  const unp = rows.filter(r => !r.err && !r.priced);
  out.push('', '## Pools that could not be priced in XRP (never gold)', '', unp.length ? unp.map(r => `- ${r.p.a}/${r.p.b} (${r.p.amm})`).join('\n') : '- none');
  const errs = rows.filter(r => r.err);
  if (errs.length) out.push('', '## Errors', '', errs.map(r => `- ${r.p.a}/${r.p.b}: ${r.err}`).join('\n'));
  console.log(out.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
