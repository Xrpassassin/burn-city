'use strict';
const assert=require('node:assert/strict');
const {inspectEstateTierFundingCapacity:inspect}=require('./estate-rlusd-tier-funding-capacity');
const tiers=require('../client/data/estate-catalog.json').tiers;
const report=inspect({tiers,indicativeMaxPurchaseDrops:'9097480'});
assert.equal(report.readOnly,true);
assert.equal(report.poolCapacityIsIndicative,true);
assert.equal(report.capitalAllocationPolicy,'IMG/RLUSD');
assert.equal(report.tiers.length,5);
assert.equal(report.tiers[0].priceXrp,3);
assert.equal(report.tiers[0].plannedImgRlusdCapitalDrops,'2970000');
assert.equal(report.tiers[0].plannedOperatingReserveDrops,'30000');
assert.equal(report.tiers[0].indicativeSinglePurchaseWithinMaxImpact,true);
assert.equal(report.tiers[1].indicativeSinglePurchaseWithinMaxImpact,false);
assert.equal(report.tiers[2].indicativeSinglePurchaseWithinMaxImpact,false);
assert.equal(report.tiers[3].indicativeSinglePurchaseWithinMaxImpact,false);
assert.equal(report.tiers[4].indicativeSinglePurchaseWithinMaxImpact,false);
assert.deepEqual(report.tiersExceedingIndicativeSinglePurchaseCapacity,
 ['apartment','starter','family','mansion']);
assert.equal(report.stagingOrDeeperLiquidityReviewNeeded,true);
assert.equal(report.automaticFundingAuthorized,false);
assert.equal(report.propertySalesAuthorized,false);
for(const t of report.tiers){
 assert.equal(BigInt(t.plannedImgRlusdCapitalDrops)+
  BigInt(t.plannedOperatingReserveDrops),BigInt(t.purchaseDrops));
 assert.equal(t.immediateFullSinglePurchaseFundingVerified,false);
 assert.equal(t.newPurchasePrincipalIsNotIncome,true);
}
const deep=inspect({tiers,indicativeMaxPurchaseDrops:'300000000'});
assert.equal(deep.stagingOrDeeperLiquidityReviewNeeded,false);
assert.equal(deep.automaticFundingAuthorized,false);
assert.equal(deep.propertySalesAuthorized,false);
assert.throws(()=>inspect({tiers,indicativeMaxPurchaseDrops:'9.5'}),/indicative_pool_capacity_required/);
assert.throws(()=>inspect({tiers,indicativeMaxPurchaseDrops:'-1'}),/indicative_pool_capacity_required/);
assert.throws(()=>inspect({tiers:[tiers[0],tiers[0]],indicativeMaxPurchaseDrops:'3000000'}),/invalid_property_sale_tier/);
assert.throws(()=>inspect({tiers:[{id:'fake',price:0}],indicativeMaxPurchaseDrops:'0'}),/invalid_property_sale_tier/);
assert.throws(()=>inspect({tiers:[],indicativeMaxPurchaseDrops:'0'}),/known_current_capital_policy_required/);
console.log('Estate catalog IMG/RLUSD capacity: five-tier depth, 99/1 capital, no activation and principal safeguards passed');
