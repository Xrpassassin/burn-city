'use strict';
const assert = require('node:assert/strict');
const { CATALOG, propertyWeight, allocateProfit } = require('../server/estate-economy');
assert.equal(CATALOG.properties.length, 9);
assert.equal(new Set(CATALOG.properties.map(p => p.id)).size, 9);
assert.equal(propertyWeight('trailer-01'), 1);
assert.equal(propertyWeight('apartment-01'), 2);
assert.equal(propertyWeight('starter-01'), 3);
assert.equal(propertyWeight('family-01'), 5);
assert.equal(propertyWeight('mansion-01'), 10);
assert.equal(propertyWeight('not-a-property'), 0);
const holdings = [
  { acct: 'rA', propertyId: 'trailer-01' },
  { acct: 'rB', propertyId: 'family-01' },
  { acct: 'rC', propertyId: 'mansion-01' }
];
const split = allocateProfit(16001, holdings);
assert.equal(split.reduce((n, r) => n + r.amountDrops, 0), 16001, 'all integer drops are allocated exactly once');
assert.deepEqual(split.map(r => r.amountDrops), [5000, 10001, 1000]);
const equal = allocateProfit(5, [{acct:'rB',propertyId:'trailer-01'},{acct:'rA',propertyId:'trailer-02'}]);
assert.equal(equal.reduce((n,r)=>n+r.amountDrops,0),5);
assert.equal(equal.find(r=>r.propertyId==='trailer-01').amountDrops,3,'ties break deterministically by property ID');
assert.deepEqual(allocateProfit(0, holdings).map(r=>r.amountDrops), [0,0,0]);
assert.throws(() => allocateProfit(-1, holdings), /nonnegative/);
assert.throws(() => allocateProfit(1.5, holdings), /safe_integer/);
assert.throws(() => allocateProfit(1, [{acct:'rA',propertyId:'not-a-property'}]), /invalid_property/);
assert.throws(() => allocateProfit(1, [{acct:'rA',propertyId:'trailer-01'},{acct:'rB',propertyId:'trailer-01'}]), /duplicate/);
console.log('Estates share-weight and weekly allocation simulation: 17 assertions passed');
