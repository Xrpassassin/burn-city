'use strict';
const assert = require('node:assert/strict');
const { allocateOwnerProfit } = require('../server/estate-owner-rewards');

const holdings = [
  { propertyId: 'trailer-01', acct: 'rOwnerA' },
  { propertyId: 'starter-01', acct: 'rOwnerA' },
  { propertyId: 'family-01', acct: 'rOwnerB' },
  { propertyId: 'mansion-01', acct: 'rOwnerC' }
];
const result = allocateOwnerProfit(1000000, holdings); // 1 XRP in drops
assert.deepEqual(result.map(r => [r.acct, r.weight, r.amountDrops]), [
  ['rOwnerA', 26, 147727],
  ['rOwnerB', 50, 284091],
  ['rOwnerC', 100, 568182]
]);
assert.equal(result.reduce((sum, row) => sum + row.amountDrops, 0), 1000000);
assert.deepEqual(result[0].propertyIds, ['starter-01', 'trailer-01']);
assert.equal(allocateOwnerProfit(0, holdings).every(r => r.amountDrops === 0), true);
assert.deepEqual(allocateOwnerProfit(10, []).map(r => r.amountDrops), []);
assert.throws(() => allocateOwnerProfit(-1, holdings), /nonnegative/);
assert.throws(() => allocateOwnerProfit(1.5, holdings), /safe_integer/);
assert.throws(() => allocateOwnerProfit(1, [{ propertyId: 'missing', acct: 'rA' }]), /invalid_property/);
assert.throws(() => allocateOwnerProfit(1, [
  { propertyId: 'trailer-01', acct: 'rA' },
  { propertyId: 'trailer-01', acct: 'rB' }
]), /duplicate_property/);
assert.throws(() => allocateOwnerProfit(1, [{ propertyId: 'trailer-01', acct: '' }]), /invalid_property/);
console.log('estate combined-owner reward allocation tests passed');
