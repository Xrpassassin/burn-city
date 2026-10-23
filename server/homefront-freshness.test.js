'use strict';
const assert = require('node:assert/strict');
const F = require('./homefront-freshness');
const hour = 60 * 60 * 1000;
const start = 1_000_000;
const legacy = F.normalizeBatches(null, { rawFood: 3, food: 2 }, start);
assert.deepEqual(legacy.rawFood, [{ qty: 3, acquiredAt: start }], 'legacy counts migrate to one persisted batch timestamp');
assert.deepEqual(F.normalizeBatches(legacy, { rawFood: 3, food: 2 }, start + hour), legacy, 'later normalization must not refresh migrated stock');
let batches = F.addBatch(legacy, 'rawFood', 2, start + hour);
assert.deepEqual(batches.rawFood, [{ qty: 3, acquiredAt: start }, { qty: 2, acquiredAt: start + hour }], 'new supplies get their own batch timestamp');
const summary = F.summarize(batches, { rawFood: 5, food: 2 }, start + 2 * hour, start);
assert.equal(summary.rawFood.fresh, 2);
assert.equal(summary.rawFood.aging, 3);
assert.equal(summary.rawFood.spoiled, 0);
const old = F.summarize(batches, { rawFood: 5, food: 2 }, start + 4.5 * hour, start);
assert.equal(old.rawFood.spoiled, 3, 'raw food can become spoiled after its shelf life');
assert.equal(old.rawFood.count, 5, 'spoilage is reported without silently deleting inventory');
const taken = F.takeBatches(batches, 'rawFood', 2, { rawFood: 5 }, start);
assert.deepEqual(taken.taken, [{ qty: 2, acquiredAt: start }], 'consumption takes oldest batches first');
assert.deepEqual(taken.batches.rawFood, [{ qty: 1, acquiredAt: start }, { qty: 2, acquiredAt: start + hour }]);
assert.throws(() => F.takeBatches(batches, 'rawFood', 9, { rawFood: 5 }, start), /not_carrying_rawFood/);
assert.throws(() => F.addBatch(batches, 'water', 1, start), /not_perishable_water/);
const Core = require('./homefront-core');
const owner = 'freshness-regression-owner';
const base = Core.createBase(owner, start);
const marketBuy = Core.applyAction(base, owner, { type: 'buy_materials', resource: 'food' }, start + hour);
assert.equal(marketBuy.resources.food, 34);
assert.deepEqual(marketBuy.resources.freshness.food, [
  { qty: 24, acquiredAt: start }, { qty: 10, acquiredAt: start + hour }
], 'new refuge stock receives its own timestamp without refreshing existing food');
const rallyBase = Core.applyAction({ ...marketBuy, survivors: [{ id: 's1', name: 'Rook', role: 'idle', morale: 50 }] }, owner, { type: 'rally' }, start + 2 * hour);
assert.equal(rallyBase.resources.food, 30);
assert.deepEqual(rallyBase.resources.freshness.food, [
  { qty: 20, acquiredAt: start }, { qty: 10, acquiredAt: start + hour }
], 'settlement consumption removes oldest food batches first');
console.log('Homefront freshness batch rules passed.');
