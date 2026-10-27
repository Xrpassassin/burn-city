'use strict';
const assert=require('node:assert/strict');
const {CATALOG,propertyWeight,allocateProfit}=require('./estate-economy.js');
const expected={trailer:[3,1],apartment:[15,5],starter:[75,25],family:[150,50],mansion:[300,100]};
assert.equal(CATALOG.saleStatus,'not_configured');
for(const tier of CATALOG.tiers){const [price,units]=expected[tier.id];assert.equal(tier.price,price);assert.equal(tier.shareUnits,units);}
for(const property of CATALOG.properties){assert.equal(propertyWeight(property.id),expected[property.tier][1]);}
const holdings=CATALOG.tiers.map(t=>({propertyId:CATALOG.properties.find(p=>p.tier===t.id).id,acct:'r'+t.id}));
const result=allocateProfit(181000000,holdings);
assert.equal(result.reduce((sum,r)=>sum+r.amountDrops,0),181000000);
for(const row of result){const tier=CATALOG.properties.find(p=>p.id===row.propertyId).tier;assert.equal(row.amountDrops,expected[tier][1]*1000000);}
console.log('Draft price-proportional Estates allocation weights passed');
