// holder flair tier logic (pure, no network)
const F = require('../server/flair'), assert = require('assert'); let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const [, T1, T2, T3] = F.TIERS;
t('zero / junk is tier 0', () => { assert.equal(F.tierFor(0), 0); assert.equal(F.tierFor(-5), 0); assert.equal(F.tierFor('x'), 0); assert.equal(F.tierFor(T1 - 1), 0); });
t('thresholds inclusive', () => { assert.equal(F.tierFor(T1), 1); assert.equal(F.tierFor(T2 - 1), 1); assert.equal(F.tierFor(T2), 2); assert.equal(F.tierFor(T3), 3); assert.equal(F.tierFor(F.SUPPLY), 3); });
t('thresholds ascend and are a sane share of supply', () => { assert(T1 < T2 && T2 < T3); assert(T3 / F.SUPPLY <= 0.01); });
t('LP share -> BURN', () => { assert.equal(F.lpToBurn(10, 100, 5e9), 5e8); assert.equal(F.lpToBurn(0, 100, 5e9), 0); assert.equal(F.lpToBurn(10, 0, 5e9), 0); assert.equal(F.lpToBurn(-1, 100, 5e9), 0); });
t('direct + LP crosses a tier', () => { assert.equal(F.tierFor(T2 * .6), 1); assert.equal(F.tierFor(T2 * .6 + F.lpToBurn(1, 2, T2)), 2); });
t('OG after 30 days', () => { const now = 1e13; assert.equal(F.isOg(now - 31 * 864e5, now), true); assert.equal(F.isOg(now - 864e5, now), false); assert.equal(F.isOg(null, now), false); });
console.log(n, 'flair tests passed');
