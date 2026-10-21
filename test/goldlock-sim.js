// Strict gold / black-hole lock rule (client/js/goldlock.js) + server/eco.js LP sweep on fixtures. No network: fetch is stubbed.
'use strict';
const assert = require('assert'), G = require('../client/js/goldlock.js');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const DM = G.LSF_DISABLE_MASTER;
const ai = (Flags, extra = {}, v2signers) => ({ account_data: { Account: 'rX', Flags, ...extra }, ...(v2signers ? { signer_lists: v2signers } : {}) });

(async () => {
  await t('black hole: master disabled, no regular key, no signer list', () => assert.equal(G.isBlackholedInfo(ai(DM)), true));
  await t('master enabled is not a black hole', () => { assert.equal(G.isBlackholedInfo(ai(0)), false); assert.equal(G.isBlackholedInfo(ai(0x00010000)), false); });
  await t('regular key: known black-hole address ok, any other key not', () => {
    for (const k of G.BH_KEYS) assert.equal(G.isBlackholedInfo(ai(DM, { RegularKey: k })), true);
    assert.equal(G.isBlackholedInfo(ai(DM, { RegularKey: 'rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST' })), false);
  });
  await t('signer list (API v1 nested and v2 top-level) is not a black hole', () => {
    assert.equal(G.isBlackholedInfo(ai(DM, { signer_lists: [{ SignerQuorum: 1 }] })), false);
    assert.equal(G.isBlackholedInfo(ai(DM, {}, [{ SignerQuorum: 1 }])), false);
    assert.equal(G.isBlackholedInfo(ai(DM, { signer_lists: [] }, [])), true);
  });
  await t('missing / deleted account is not a black hole', () => { assert.equal(G.isBlackholedInfo({ error: 'actNotFound' }), false); assert.equal(G.isBlackholedInfo(null), false); });
  await t('lockedPct sums only black-holed holders', () => {
    assert.equal(G.lockedPct([{ v: 95, bh: true }, { v: 5 }], 100), 95);
    assert.equal(G.lockedPct([{ v: 50, bh: true }, { v: 50, bh: true }], 100), 100);
    assert.equal(G.lockedPct([{ v: 1, bh: true }], 0), 0);
  });
  await t('gold needs >=95% black-holed AND TVL >= 5000 XRP', () => {
    assert.equal(G.GOLD_MIN_LOCK_PCT, 95); assert.equal(G.GOLD_MIN_TVL_XRP, 5000);
    assert.equal(G.isGold({ a: 'XRP', b: 'T', locked_pct: 95, tvl_xrp: 5000 }), true);
    assert.equal(G.isGold({ a: 'XRP', b: 'T', locked_pct: 94.9, tvl_xrp: 1e6 }), false);    // partly locked: zero gold
    assert.equal(G.isGold({ a: 'XRP', b: 'T', locked_pct: 89.8, tvl_xrp: 16316 }), false);
  });
  await t('locked pool below 5k XRP is NOT gold', () => {
    assert.equal(G.isGold({ a: 'XRP', b: 'T', locked_pct: 100, tvl_xrp: 4999.99 }), false);
    assert.match(G.verdict({ a: 'XRP', b: 'T', locked_pct: 100, tvl_xrp: 1263 }), /TVL 1263 < 5000/);
  });
  await t('non-XRP pair must be priced; gone pools never gold', () => {
    assert.equal(G.isGold({ a: 'A', b: 'B', locked_pct: 100, tvl_xrp: 9e9 }), false);
    assert.equal(G.isGold({ a: 'A', b: 'B', locked_pct: 100, tvl_xrp: 9e9, tvl_priced: false }), false);
    assert.equal(G.isGold({ a: 'A', b: 'B', locked_pct: 100, tvl_xrp: 9e3, tvl_priced: true }), true);
    assert.equal(G.isGold({ a: 'XRP', b: 'B', locked_pct: 100, tvl_xrp: 9e3, gone: true }), false);
  });

  // ---- server/eco.js sweep on fixtures (stubbed JSON-RPC) ----
  const LPC = '03ABCDEF0123456789ABCDEF0123456789ABCDEF', ISS = 'rFixtureIssuerXXXXXXXXXXXXXXXXXXX';
  const BH1 = 'rBlackHoleOneXXXXXXXXXXXXXXXXXXXX', BH2 = 'rBlackHoleTwoXXXXXXXXXXXXXXXXXXXX', HOT = 'rHotWalletXXXXXXXXXXXXXXXXXXXXXXX', MULTI = 'rMultiSigXXXXXXXXXXXXXXXXXXXXXXXX', RK = 'rRegKeyXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const ACCTS = { [BH1]: ai(DM), [BH2]: ai(DM, { RegularKey: G.BH_KEYS[0] }), [HOT]: ai(0), [MULTI]: ai(DM, {}, [{ SignerQuorum: 2 }]), [RK]: ai(DM, { RegularKey: HOT }) };
  const POOLS = {
    rAmmGold: { xrp: 3000e6, lp: 100, lines: { [BH1]: 60, [BH2]: 36, [HOT]: 4 } },          // 96% BH, TVL 6000 -> GOLD
    rAmmSmall: { xrp: 2000e6, lp: 100, lines: { [BH1]: 100 } },                             // 100% BH, TVL 4000 -> not gold (<5k)
    rAmmFakes: { xrp: 9000e6, lp: 100, lines: { [BH1]: 40, [MULTI]: 40, [RK]: 20 } },        // multisig + live regular key are NOT BH -> 40%
    rAmmEdge: { xrp: 9000e6, lp: 100000, lines: { [BH1]: 94960, [HOT]: 5040 } },            // 94.96% must not round up to 95
    rAmmUnpriced: { tok: true, lp: 100, lines: { [BH1]: 100 } },                            // non-XRP pair, both sides unpriced
  };
  global.fetch = async (u, o) => { const { method, params: [p] } = JSON.parse(o.body); let result;
    if (method === 'amm_info') { const P = POOLS[p.amm_account];
      result = P ? { amm: { account: p.amm_account, amount: P.tok ? { currency: 'ZZZ', issuer: ISS, value: '1000' } : String(P.xrp), amount2: { currency: 'QQQ', issuer: ISS, value: '1000' }, lp_token: { currency: LPC, issuer: p.amm_account, value: String(P.lp) }, trading_fee: 500 }, ledger_index: 1 } : { status: 'error', error: 'actNotFound' }; }
    else if (method === 'account_lines') { const P = POOLS[p.account]; result = { lines: Object.entries(P.lines).map(([account, v]) => ({ account, currency: LPC, balance: String(-v) })) }; }
    else if (method === 'account_info') result = ACCTS[p.account] || { status: 'error', error: 'actNotFound' };
    else result = {};
    return { json: async () => ({ result }) }; };
  const eco = require('../server/eco.js'); eco._load(); const E = eco.data();
  const pool = (amm, tok) => { const p = { a: tok ? 'ZZZ' : 'XRP', b: 'QQQ', amm, tvl_xrp: 0, locked_pct: 0, top_lp: [] }; E.pools.push(p); return p; };
  await t('eco sweep: 96% black-holed + 6000 XRP TVL is gold', async () => { const p = await eco._readPool(pool('rAmmGold')); assert.equal(p.locked_pct, 96); assert.equal(p.tvl_xrp, 6000); assert.equal(p.gold, true); assert.equal(p.top_lp[0].tag, 'BH'); });
  await t('eco sweep: 100% black-holed but 4000 XRP TVL is not gold', async () => { const p = await eco._readPool(pool('rAmmSmall')); assert.equal(p.locked_pct, 100); assert.equal(p.tvl_xrp, 4000); assert.equal(p.gold, false); });
  await t('eco sweep: SignerList and live RegularKey holders do not count as locked', async () => { const p = await eco._readPool(pool('rAmmFakes')); assert.equal(p.locked_pct, 40); assert.equal(p.gold, false); });
  await t('eco sweep: 94.96% floors to 94.9 (no round-up into gold)', async () => { const p = await eco._readPool(pool('rAmmEdge')); assert.equal(p.locked_pct, 94.9); assert.equal(p.gold, false); });
  await t('eco sweep: unpriced non-XRP pair is not gold', async () => { const p = await eco._readPool(pool('rAmmUnpriced', true)); assert.equal(p.locked_pct, 100); assert.equal(p.tvl_priced, false); assert.equal(p.gold, false); });
  console.log(n, 'goldlock tests passed'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
