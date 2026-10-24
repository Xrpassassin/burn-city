'use strict';
const assert = require('node:assert/strict');
const { CATALOG, propertyWeight, allocateProfit, buildWeeklySnapshot } = require('../server/estate-economy');
assert.equal(CATALOG.properties.length, 21);
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

const weekly = buildWeeklySnapshot({
  weekStart: '2026-10-19', sourceWallet: 'rTreasuryPublicAddress', sourceLedgerIndex: 123456,
  realizedProfitDrops: 1000000, feesDrops: 100000, realizedLossesDrops: 50000, reserveDrops: 250000,
  verificationRef: 'weekly-reconciliation:2026-10-19:v1',
  holdings: [
    { propertyId: 'trailer-01', acct: 'rOwnerA' },
    { propertyId: 'starter-01', acct: 'rOwnerA' },
    { propertyId: 'family-01', acct: 'rOwnerB' },
    { propertyId: 'mansion-01', acct: 'rOwnerC' }
  ]
});
assert.equal(weekly.distributableDrops, 600000);
assert.equal(weekly.status, 'draft');
assert.equal(weekly.allocations.find(x => x.acct === 'rOwnerA').weight, 4, 'multiple properties combine into one owner weight');
assert.equal(weekly.allocations.reduce((n, x) => n + x.amountDrops, 0), 600000, 'weekly allocations reconcile exactly');
assert.equal(weekly.ownershipCount, 4);
assert.equal(weekly.ownershipHash.length, 64);
assert.throws(() => buildWeeklySnapshot({ weekStart:'2026-10-20', sourceWallet:'rT', sourceLedgerIndex:1, realizedProfitDrops:0, feesDrops:0, realizedLossesDrops:0, reserveDrops:0, verificationRef:'x', holdings:[] }), /monday/);
assert.throws(() => buildWeeklySnapshot({ weekStart:'2026-10-19', sourceWallet:'rT', sourceLedgerIndex:1, realizedProfitDrops:10, feesDrops:0, realizedLossesDrops:0, reserveDrops:0, verificationRef:'x', holdings:[] }), /no_eligible_owners/);
assert.equal(buildWeeklySnapshot({ weekStart:'2026-10-19', sourceWallet:'rT', sourceLedgerIndex:1, realizedProfitDrops:0, feesDrops:0, realizedLossesDrops:0, reserveDrops:0, verificationRef:'x', holdings:[] }).distributableDrops, 0);
assert.throws(() => buildWeeklySnapshot({ weekStart:'2026-10-19', sourceWallet:'rT', sourceLedgerIndex:1, realizedProfitDrops:-1, feesDrops:0, realizedLossesDrops:0, reserveDrops:0, verificationRef:'x', holdings:[] }), /nonnegative/);
assert.throws(() => buildWeeklySnapshot({ weekStart:'2026-10-19', sourceWallet:'rT', sourceLedgerIndex:1, realizedProfitDrops:1, feesDrops:0, realizedLossesDrops:0, reserveDrops:0, verificationRef:'', holdings:[] }), /verification_ref/);

assert.equal(new Set(CATALOG.properties.map(p => p.id)).size, CATALOG.properties.length, 'catalog property IDs are unique');
assert.equal(CATALOG.world.id, 'estates-island-lake');
assert.equal(CATALOG.world.topology, 'single_buildable_island_surrounded_by_a_continuous_lake');
assert.equal(CATALOG.world.lake.surroundsIsland, true);
assert(CATALOG.properties.every(p => p.lot && Number.isFinite(p.lot.x) && Number.isFinite(p.lot.z)), 'all catalog lots have deterministic layout coordinates');
