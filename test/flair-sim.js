// holder flair tier logic (pure, no network)
const F = require('../server/flair'), assert = require('assert'); let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const [, T1, T2, T3] = F.TIERS;
t('zero / junk is tier 0', () => { assert.equal(F.tierFor(0), 0); assert.equal(F.tierFor(-5), 0); assert.equal(F.tierFor('x'), 0); assert.equal(F.tierFor(T1 - 1), 0); });
t('thresholds inclusive', () => { assert.equal(F.tierFor(T1), 1); assert.equal(F.tierFor(T2 - 1), 1); assert.equal(F.tierFor(T2), 2); assert.equal(F.tierFor(T3), 3); assert.equal(F.tierFor(F.SUPPLY), 3); });
t('thresholds ascend and are a sane share of supply', () => { assert(T1 < T2 && T2 < T3); assert(T3 / F.SUPPLY <= 0.05); });
t('LP share -> BURN', () => { assert.equal(F.lpToBurn(10, 100, 5e9), 5e8); assert.equal(F.lpToBurn(0, 100, 5e9), 0); assert.equal(F.lpToBurn(10, 0, 5e9), 0); assert.equal(F.lpToBurn(-1, 100, 5e9), 0); });
t('direct + LP crosses a tier', () => { assert.equal(F.tierFor(T2 * .6), 1); assert.equal(F.tierFor(T2 * .6 + F.lpToBurn(1, 2, T2)), 2); });
t('OG after 30 days', () => { const now = 1e13; assert.equal(F.isOg(now - 31 * 864e5, now), true); assert.equal(F.isOg(now - 864e5, now), false); assert.equal(F.isOg(null, now), false); });
t('default edges 10B / 100B / 1T', () => { if (process.env.FLAIR_T1 || process.env.FLAIR_T2 || process.env.FLAIR_T3) return; assert.deepEqual([T1, T2, T3], [10e9, 100e9, 1e12]); assert.equal(F.tierFor(9999999999), 0); assert.equal(F.tierFor(10e9), 1); assert.equal(F.tierFor(99999999999), 1); assert.equal(F.tierFor(100e9), 2); assert.equal(F.tierFor(999999999999), 2); assert.equal(F.tierFor(1e12), 3); });
console.log(n, 'flair tests passed');
