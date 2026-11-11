'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateHomeInteriorStore,validateFurniture,initialFurniture,dimensions,LAYOUTS}=require('./estate-home-interior');
const {createEstateTycoonStore}=require('./estate-tycoon');
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)");
const owner='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',guest='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',owner,'C'.repeat(64),3000000,1,1);
const tycoon=createEstateTycoonStore(db);
const accessFor=(acct,id)=>{
 const record=db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(id);
 if(!record)return {allowed:true,role:'tour',permissions:['enter']};
 if(record.acct===acct)return {allowed:true,role:'owner',permissions:['enter','build']};
 if(acct===guest)return {allowed:true,role:'guest',permissions:['enter']};
 return {allowed:false,role:'visitor',permissions:[]};
};
let time=100;let store=createEstateHomeInteriorStore({db,accessFor,tycoonStore:tycoon,clock:()=>++time});
assert.equal(LAYOUTS.length,6);
let s=store.state('trailer-01',owner);
assert(s.ok&&s.editable);assert.equal(s.costXrp,0);assert.equal(s.layoutId,'cozy');
assert(s.furniture.length>=1);assert(validateFurniture(s.furniture,'trailer').ok);
assert.equal(s.layouts.filter(l=>l.unlocked).length,3,'default three entirely free home layouts');
assert.deepEqual(s.layouts.filter(l=>!l.unlocked).map(x=>x.priceXrp),[9,12,30]);
assert.equal(store.state('trailer-01',guest).editable,false);
assert.equal(store.state('mansion-01',owner).error,'property_owner_or_invitation_required');
assert.equal(store.state('trailer-01','nope').ok,false);
assert.equal(store.save({propertyId:'trailer-01',acct:guest,layoutId:'open',furniture:[]}).error,'property_owner_required');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'bunker-suite',furniture:[]}).error,'home_layout_requires_verified_upgrade');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'unknown',furniture:[]}).error,'invalid_home_layout');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'cozy',furniture:[{id:'a',type:'sofa',x:100,z:0,rotation:0}]}).error,'furniture_outside_home');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'cozy',furniture:[{id:'a',type:'sofa',x:0,z:1.5,rotation:0}]}).error,'furniture_blocks_entrance');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'cozy',furniture:[
 {id:'a',type:'chair',x:-1,z:0,rotation:0},{id:'b',type:'sofa',x:-1,z:0,rotation:0}]}).error,'furniture_overlaps');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'cozy',furniture:[
 {id:'a',type:'chair',x:0.12,z:0,rotation:0}]}).error,'invalid_home_furniture');
const furnishings=[{id:'lamp-1',type:'floor-lamp',x:1.5,z:-1,rotation:90}];
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'open',furniture:furnishings}).ok,true);
store=createEstateHomeInteriorStore({db,accessFor,tycoonStore:tycoon});
assert.deepEqual(store.state('trailer-01',guest).furniture,furnishings,'invited guests see saved furnishings after restart');
assert.equal(store.state('trailer-01',owner).layoutId,'open');
let n=0;function unlock(id){
 const orderId='tycoon_'+String(++n).padStart(40,'a').replace(/[^0-9a-f]/g,'a');
 const row=tycoon.reserve({propertyId:'trailer-01',buyer:owner,itemId:id,orderId,now:1800000000000+n*1000});
 tycoon.settle({orderId:row.order_id,buyer:owner,txHash:String(n).padStart(64,'A'),ledgerIndex:100+n,now:1800000000000+n*1000+40});
}
unlock('game-lounge');
assert.equal(store.state('trailer-01',owner).layouts.find(l=>l.id==='arcade-suite').unlocked,true);
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'arcade-suite',furniture:furnishings}).ok,true);
assert.equal(tycoon.state('trailer-01').liveRewardShareUnits,1,'interior choices do not change payout shares');
const newOwner='rABCDEF12345'.padEnd(30,'5');
db.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=?').run(newOwner,'trailer-01');
assert.equal(store.save({propertyId:'trailer-01',acct:owner,layoutId:'cozy',furniture:[]}).error,'property_owner_required');
assert.equal(store.state('trailer-01',newOwner).layoutId,'arcade-suite','interior follows property on resale');
assert.equal(store.save({propertyId:'trailer-01',acct:newOwner,layoutId:'split',furniture:[]}).ok,true);
for(const tier of ['trailer','apartment','starter','family','mansion']){
 assert(dimensions(tier).halfX>2, tier+' has tier-correct room width');
 assert(validateFurniture(initialFurniture(tier),tier).ok,tier+' free starting furniture fits room');
}
db.close();
console.log('Estate home interiors: all tiers, owner vs guest, 3 free layouts, premium verification, collision and resale passed');
