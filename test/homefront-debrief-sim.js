'use strict';
const assert = require('node:assert/strict');
const { buildReturnDebrief } = require('../server/homefront');

const start = {
  at: 1000,
  embers: 50,
  resources: { wood: 40, scrap: 30, food: 24, water: 18, meds: 5, ammo: 18 },
  repelledCount: 2
};
const base = {
  embers: 83,
  repelledCount: 4,
  resources: { wood: 45, scrap: 26, food: 20, water: 17, meds: 6, ammo: 14 }
};
const packed = { stored: { food: 2, scrap: 3, ammo: 1 } };
const report = buildReturnDebrief(start, base, packed, 2000);

assert.equal(report.startedAt, 1000);
assert.equal(report.endedAt, 2000);
assert.equal(report.embersNet, 33, 'report uses the server-saved Ember balance delta');
assert.deepEqual(report.resourceNet, {
  wood: 5, scrap: -4, food: -4, water: -1, meds: 1, ammo: -4
}, 'each stored resource has an independently calculated net change');
assert.equal(report.attacksRepelled, 2, 'only successful repelled incidents tracked by the server count');
assert.equal(report.fieldSuppliesReturned, 6, 'returned field items are totaled from the authoritative stash result');

const legacy = buildReturnDebrief(null, { embers: 12, resources: { wood: 4 }, repelledCount: 9 }, null, 3000);
assert.equal(legacy.embersNet, 0, 'legacy sessions do not fabricate an earnings delta');
assert.equal(legacy.attacksRepelled, 0, 'legacy sessions do not fabricate a repelled-attack delta');
assert.deepEqual(legacy.resourceNet, { wood: 0, scrap: 0, food: 0, water: 0, meds: 0, ammo: 0 });
assert.equal(legacy.fieldSuppliesReturned, 0);
console.log('homefront debrief accounting simulation passed');
