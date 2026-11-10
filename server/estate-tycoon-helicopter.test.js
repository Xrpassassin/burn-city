'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createEstateTycoonStore,ITEM_BY_ID}=require('./estate-tycoon');
const {estateHelicopterAccess}=require('./estate-tycoon-rooms');
const owner='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',guest='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
for(const [i,id,price,shares]of [['B','trailer-01',3,1],['C','starter-01',75,25],['D','family-01',150,50],['E','mansion-01',300,100]])
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run(id,owner,i.repeat(64),price*1000000,shares,1);
const store=createEstateTycoonStore(db),item=ITEM_BY_ID.get('estate-helicopter');
assert(item);
assert.equal(item.priceXrp,180);assert.equal(item.priceDrops,180000000);assert.equal(item.shareUnitsDelta,60);
assert.deepEqual(item.eligibleTiers,['family','mansion']);
const acl=(acct,id)=>{
 const current=db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(id);
 return current?.acct===acct?{allowed:true,role:'owner',permissions:['enter','inspect','build']}:
   acct===guest?{allowed:true,role:'guest',permissions:['enter','inspect']}:{allowed:false,reason:'no_access',permissions:[]};
};
for(const id of ['trailer-01','starter-01']){
 const q=store.quote({propertyId:id,buyer:owner,itemId:'estate-helicopter'});
 assert.equal(q.tierEligible,false);assert.equal(q.canPurchase,false);
 assert.throws(()=>store.reserve({propertyId:id,buyer:owner,itemId:'estate-helicopter',
  orderId:'tycoon_'+'a'.repeat(40),now:1800000000000}),/upgrade_tier_restricted/);
 assert.equal(estateHelicopterAccess({propertyId:id,acct:owner,accessFor:acl,tycoonStore:store}).error,'helicopter_tier_restricted');
}
for(const [idx,id] of ['family-01','mansion-01'].entries()){
 const q=store.quote({propertyId:id,buyer:owner,itemId:'estate-helicopter'});
 assert.equal(q.canPurchase,true);
 assert.equal(q.projectedValueDrops,(id==='family-01'?150:300)*1000000+180000000);
 assert.equal(q.projectedShareUnits,(id==='family-01'?50:100)+60);
 assert.equal(estateHelicopterAccess({propertyId:id,acct:owner,accessFor:acl,tycoonStore:store}).error,'helicopter_not_unlocked');
 const orderId='tycoon_'+String(idx+1).repeat(40);
 const reserved=store.reserve({propertyId:id,buyer:owner,itemId:'estate-helicopter',orderId,now:1800000000000+idx*1000});
 assert.equal(reserved.price_drops,180000000);
 assert.equal(reserved.share_delta,60);
 assert.throws(()=>store.reserve({propertyId:id,buyer:guest,itemId:'estate-helicopter',orderId:'tycoon_'+'c'.repeat(40),now:1800000000000}),/property_owner_required/);
 const settled=store.settle({orderId,buyer:owner,txHash:(idx===0?'F':'A').repeat(64),ledgerIndex:300+idx,now:1800000001000+idx*1000});
 assert.equal(settled.recordedShareUnits,(id==='family-01'?50:100)+60);
 assert.equal(settled.liveRewardShareUnits,id==='family-01'?50:100,'existing payout allocation is unchanged');
 assert.equal(estateHelicopterAccess({propertyId:id,acct:owner,accessFor:acl,tycoonStore:store}).pilotAuthorized,true);
 assert.equal(estateHelicopterAccess({propertyId:id,acct:guest,accessFor:acl,tycoonStore:store}).error,'property_owner_required');
}
db.prepare("UPDATE estate_property_ownership SET acct=? WHERE property_id='mansion-01'").run(guest);
assert.equal(estateHelicopterAccess({propertyId:'mansion-01',acct:owner,accessFor:acl,tycoonStore:store}).error,'property_owner_required');
assert.equal(estateHelicopterAccess({propertyId:'mansion-01',acct:guest,accessFor:acl,tycoonStore:store}).pilotAuthorized,true,
 'verified aircraft follows estate on resale rather than old wallet');
assert(!JSON.stringify(estateHelicopterAccess({propertyId:'mansion-01',acct:guest,accessFor:acl,tycoonStore:store})).includes(guest));
db.close();
console.log('Estates aviation: tier gates, 180 XRP receipts, replay-resistant ownership, resale, recorded shares and denied guests passed');
