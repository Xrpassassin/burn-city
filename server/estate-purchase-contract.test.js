'use strict';
const assert=require('node:assert/strict');
const {CATALOG}=require('./estate-economy');
const {quoteEstate,validateTierCapacity,MAX_PER_TIER}=require('./estate-purchase-contract');
const expected={trailer:[3,1],apartment:[15,5],starter:[75,25],family:[150,50],mansion:[300,100]};
assert.equal(MAX_PER_TIER,5);
assert.equal(CATALOG.saleStatus,'not_configured');
for(const p of CATALOG.properties){
 const q=quoteEstate(p.id);
 assert.equal(q.priceXrp,expected[p.tier][0]);
 assert.equal(q.priceDrops,expected[p.tier][0]*1000000);
 assert.equal(q.allocationUnits,expected[p.tier][1]);
 assert.equal(q.paymentEnabled,false);
 assert.equal(q.distributionsEnabled,false);
 assert.equal(q.maxPerTierPerWallet,5);
}
assert.equal(quoteEstate('nonexistent'),null);
assert.throws(()=>quoteEstate(null),/invalid_property_id/);
assert.deepEqual(validateTierCapacity({wallet:'rA',tierId:'starter',ownedPropertyIds:['starter-01'],reservedPropertyIds:['starter-02','starter-03','starter-04','cabin-01']}),{wallet:'rA',tierId:'starter',used:5,remaining:0,eligible:false});
assert.deepEqual(validateTierCapacity({wallet:'rA',tierId:'mansion',ownedPropertyIds:['starter-01']}),{wallet:'rA',tierId:'mansion',used:0,remaining:5,eligible:true});
assert.throws(()=>validateTierCapacity({wallet:'rA',tierId:'starter',ownedPropertyIds:['starter-01'],reservedPropertyIds:['starter-01']}),/duplicate_property_id/);
assert.throws(()=>validateTierCapacity({wallet:'rA',tierId:'starter',ownedPropertyIds:['bogus']}),/unknown_property_id/);
console.log('Estates read-only purchase contract tests passed');
