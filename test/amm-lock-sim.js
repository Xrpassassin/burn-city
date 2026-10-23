// server/amm-lock.js: LP lock + black-hole supply classification and maths on a mocked XRPL. No network.
'use strict';
const assert = require('assert'), L = require('../server/amm-lock.js'), G = require('../client/js/goldlock.js');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const DM = G.LSF_DISABLE_MASTER, BH1 = 'rrrrrrrrrrrrrrrrrrrrBZbvji', BH0 = 'rrrrrrrrrrrrrrrrrrrrrhoLvTp';
const LPC = '03AABBCCDDEEFF00112233445566778899AABBCC';
// ---- mock ledger ----
const ACC = {
  rBH: { Flags: DM },                                   // master off, no keys: black hole
  rBHK: { Flags: DM, RegularKey: BH1 },                  // black-hole regular key
  rBHK0: { Flags: DM, RegularKey: BH0 },
  rKEY: { Flags: DM, RegularKey: 'rSomeRealKeyHolder111111111111' },   // master off, real regular key: NOT permanent
  rSIG: { Flags: DM, __signers: [{ SignerQuorum: 2 }] },                // master off, signer list: NOT permanent
  rDEV: { Flags: 0 }, rx1: { Flags: 0 }, rx2: { Flags: 0 },                                    // normal wallet
  rAMM2: { Flags: DM, AMMID: 'AB' },                     // another AMM holding the token: never "burned"
  rISS: { Flags: DM }, rISS2: { Flags: 0 }, rISS3: { Flags: DM },
};
const mkInfo = a => { const d = ACC[a]; if (!d) return { error: 'actNotFound' }; const { __signers, ...ad } = d; return { account_data: { Account: a, ...ad }, signer_lists: __signers || [] }; };
const POOLS = {
  rP_big: { lp: 1e6, a: 'XRP', b: 'TOK', lines: [['rBHK', 905000], ['rDEV', 90000], ['rx1', 4000], ['rx2', 1000]] },    // 90.5% locked
  rP_small: { lp: 100, a: 'XRP', b: 'TOK', lines: [['rDEV', 100]] },                                                        // 0%
  rP_full: { lp: 5000, a: 'TOK', b: 'OTH', lines: [['rBH', 3000], ['rBHK0', 2000]] },                                       // 100%
  rP_keys: { lp: 1000, a: 'XRP', b: 'OTH', lines: [['rKEY', 600], ['rSIG', 300], ['rBH', 100]] },                          // 10%: key + signer holders are held
  rP_fail: { lp: 1000, a: 'XRP', b: 'TOK2', lines: [['rFAIL', 700], ['rBH', 300]] },                                       // holder read fails -> unverified
  rP_gone: { gone: true, a: 'XRP', b: 'TOK2' },
  rP_esc: { lp: 1000, a: 'XRP', b: 'OTH', lines: [['rBH', 500], ['rDEV', 300]], esc: 200 },                               // 50% permanent + 20% time-locked
};
const TOKS = {   // issuer -> { cur, supply, holders }
  rISS: { cur: 'TOK', supply: 1000, holders: [['rBH', 100], ['rBHK', 50], ['rP_big', 300], ['rAMM2', 200], ['rDEV', 300], ['rKEY', 50]] },  // 15% burned
  rISS2: { cur: 'OTH', supply: 500, holders: [['rDEV', 500]] },                                  // issuer has keys; nothing burned
  rISS3: { cur: 'TOK2', supply: 800, holders: [['rDEV', 800]] },                                  // issuer blackholed but no burned balance
};
let failGw = false, calls = [];
const rpc = async (m, p) => { calls.push(m);
  if (m === 'account_info') { if (p.account === 'rFAIL') throw new Error('timeout'); return mkInfo(p.account); }
  if (m === 'amm_info') { const P = POOLS[p.amm_account]; if (!P || P.gone) return { error: 'actNotFound' }; return { amm: { lp_token: { currency: LPC, issuer: p.amm_account, value: String(P.lp) } }, ledger_index: 100 }; }
  if (m === 'account_lines') { const P = POOLS[p.account]; if (P) return { lines: P.lines.map(([a, v]) => ({ account: a, currency: LPC, balance: String(-v) })) };
    const T = TOKS[p.account]; if (T) return { lines: T.holders.map(([a, v]) => ({ account: a, currency: T.cur, balance: String(-v) })) }; return { lines: [] }; }
  if (m === 'account_objects') { const P = POOLS[p.account]; return { account_objects: P && P.esc ? [{ LedgerEntryType: 'Escrow', Account: 'rDEV', Amount: { currency: LPC, issuer: p.account, value: String(P.esc) }, FinishAfter: 900000000 }] : [] }; }
  if (m === 'gateway_balances') { if (failGw) throw new Error('down'); const T = TOKS[p.account]; return { obligations: T ? { [T.cur]: String(T.supply) } : {} }; }
  return { error: 'unknown' }; };
const eco = () => ({ pools: Object.entries(POOLS).map(([amm, P]) => ({ amm, a: P.a, b: P.b, locked_pct: amm === 'rP_big' ? 89.8 : 0, tvl_xrp: P.lp, ...(P.gone ? { gone: false } : {}) })),
  nodes: [{ name: 'XRP', key: 'XRP' }, { name: 'TOK', key: 'rISS-TOK' }, { name: 'OTH', key: 'rISS2-OTH' }, { name: 'TOK2', key: 'rISS3-TOK2' }] });

(async () => {
  let clock = Date.parse('2026-10-22T12:00:00Z');
  const inst = L.create({ rpc, gap: 0, now: () => clock });
  await inst.refresh(eco); const s = inst.snapshot(), P = s.pools, T = s.tokens;

  await t('classify: master off + no keys / black-hole regular key = blackhole; key, signer list, master on, AMM = not', () => {
    assert.equal(L.classifyAccount(mkInfo('rBH')).cls, 'blackhole'); assert.equal(L.classifyAccount(mkInfo('rBHK')).cls, 'blackhole'); assert.equal(L.classifyAccount(mkInfo('rBHK0')).cls, 'blackhole');
    assert.equal(L.classifyAccount(mkInfo('rKEY')).cls, 'designated'); assert.equal(L.classifyAccount(mkInfo('rSIG')).cls, 'designated');
    assert.equal(L.classifyAccount(mkInfo('rDEV')).cls, 'held'); assert.equal(L.classifyAccount(mkInfo('rAMM2')).cls, 'amm');
    assert.equal(L.classifyAccount({ __err: 'timeout' }).cls, 'unknown'); assert.equal(L.classifyAccount(null).cls, 'unknown');
  });
  await t('large pool, partial lock: 90.5% of LPTokenBalance, sources + destinations', () => {
    const p = P.rP_big; assert.equal(p.status, 'verified'); assert.equal(p.locked_pct, 90.5); assert.equal(p.lp_supply, 1e6);
    assert.match(p.lp_supply_src, /amm_info\(rP_big\)\.lp_token/); assert.equal(p.reported_pct, 89.8); assert.ok(p.reported_note);
    const d = p.destinations.find(x => x.acct === 'rBHK'); assert.equal(d.cls, 'permanent'); assert.equal(d.source, 'account_info(rBHK)');
    assert.equal(p.destinations.find(x => x.acct === 'rDEV').cls, 'held');
    assert.equal(p.unchecked_pct, 0);   // the 0.1% holder is still checked (threshold is inclusive)
  });
  await t('small pool, 0% locked is a verified 0 (not unknown)', () => { assert.equal(P.rP_small.status, 'verified'); assert.equal(P.rP_small.locked_pct, 0); });
  await t('100% verified lock across two black-hole destinations', () => { const p = P.rP_full; assert.equal(p.status, 'verified'); assert.equal(p.locked_pct, 100); assert.equal(p.destinations.filter(d => d.cls === 'permanent').length, 2); });
  await t('LP holder with a regular key or signer list is "held", never permanent', () => {
    const p = P.rP_keys; assert.equal(p.locked_pct, 10); assert.equal(p.held_pct, 90);
    assert.equal(p.destinations.find(d => d.acct === 'rKEY').cls, 'held'); assert.equal(p.destinations.find(d => d.acct === 'rSIG').cls, 'held');
  });
  await t('failed holder fetch -> UNVERIFIED, no % (only a lower bound)', () => { const p = P.rP_fail; assert.equal(p.status, 'unverified'); assert.equal(p.locked_pct, null); assert.equal(p.locked_pct_min, 30); });
  await t('escrowed LP is time-locked, not permanent; unaccounted share reported', () => { const p = P.rP_esc; assert.equal(p.locked_pct, 50); assert.equal(p.time_locked_pct, 20); assert.equal(p.unaccounted_pct, 0);
    assert.equal(p.destinations.find(d => d.cls === 'time_locked').lp, 200); });
  await t('token burn: black-hole balances / obligations; AMM + keyed holders excluded; one entry per token across pools', () => {
    const k = T.TOK; assert.equal(k.status, 'verified'); assert.equal(k.supply, 1000); assert.match(k.supply_src, /gateway_balances\(rISS\)\.obligations/);
    assert.equal(k.burned, 150); assert.equal(k.burned_pct, 15);   // rBH 100 + rBHK 50; rP_big (AMM-held) and rAMM2 are pool liquidity, not burn
    assert.equal(k.black_holes.filter(b => b.cls === 'burned').length, 2); assert.equal(k.black_holes.find(b => b.acct === 'rKEY').cls, 'designated');
    assert.deepEqual(k.pools.sort(), ['rP_big', 'rP_full', 'rP_small']);
    assert.equal(Object.keys(T).filter(x => x === 'TOK').length, 1);
  });
  await t('issuer black-holed but nothing burned: issuer_keys_disabled, burned 0%', () => { const k = T.TOK2; assert.equal(k.issuer_keys_disabled, true); assert.equal(k.burned, 0); assert.equal(k.burned_pct, 0); assert.equal(k.status, 'verified'); });
  await t('issuer with keys: issuer_keys_disabled false', () => assert.equal(T.OTH.issuer_keys_disabled, false));
  await t('XRP has no token entry; gone pool skipped by refresh, unverified when read', () => { assert.equal(T.XRP, undefined);
    const g = L.computePoolLock({ error: 'actNotFound' }, null, {}, null, { amm: 'rP_gone' }); assert.equal(g.status, 'unverified'); assert.equal(g.locked_pct, null); });
  await t('gateway_balances fails: supply from complete trustline sum (stated)', async () => { failGw = true; const i2 = L.create({ rpc, gap: 0, now: () => clock }); await i2.refresh(eco); failGw = false;
    const k = i2.snapshot().tokens.TOK; assert.match(k.supply_src, /sum of account_lines/); assert.equal(k.supply, 1000); assert.equal(k.burned_pct, 15); });
  await t('stale data (> 6 h) is served UNVERIFIED with no %', () => { clock += 7 * 3600e3; const s2 = inst.snapshot(); assert.equal(s2.pools.rP_big.status, 'unverified'); assert.equal(s2.pools.rP_big.locked_pct, null);
    assert.equal(s2.pools.rP_big.last_verified_pct, 90.5); assert.equal(s2.tokens.TOK.burned_pct, null); clock -= 7 * 3600e3; });
  await t('rpc failure for everything: all unverified, never 0% or 100%', async () => { const i3 = L.create({ rpc: async () => { throw new Error('offline'); }, gap: 0, now: () => clock }); await i3.refresh(eco);
    const s3 = i3.snapshot(); for (const p of Object.values(s3.pools)) { assert.equal(p.status, 'unverified'); assert.equal(p.locked_pct, null); }
    for (const k of Object.values(s3.tokens)) { assert.equal(k.status, 'unverified'); assert.equal(k.burned_pct, null); assert.equal(k.issuer_keys_disabled, null); } });
  await t('locked % floors (never rounds 94.996 up to 95)', () => { const r = L.computePoolLock({ amm: { lp_token: { currency: LPC, value: '100000' } } }, [{ account: 'rBH', currency: LPC, balance: '-94996' }, { account: 'rDEV', currency: LPC, balance: '-5004' }], { rBH: mkInfo('rBH'), rDEV: mkInfo('rDEV') }, [], { amm: 'x' });
    assert.equal(r.locked_pct, 94.99); });
  await t('account_info is cached across pools and tokens (rate limit)', () => { assert.ok(calls.filter(c => c === 'account_info').length < 40); });
  console.log(`amm-lock-sim: ${n} passed`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
