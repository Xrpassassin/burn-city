'use strict';
const assert=require('node:assert/strict'),I=require('./homefront-inventory');
const hour=3600000,now=100*hour;
let bag=I.normalize({food:2,water:2,meds:1,ammo:4},now);assert.equal(I.used(bag),9);
let add=I.add(bag,'scrap',4,now);bag=add.inventory;assert.equal(add.accepted,4);assert.equal(I.used(bag),17);
assert.equal(I.remove(bag,'food',1,now).inventory.food,1);assert.throws(()=>I.remove(bag,'water',9,now),/not_carrying_water/);
assert.equal(I.add({food:8,water:8,meds:5,ammo:12,scrap:8,wood:8},'food',1,now).accepted,0);
const resources=I.normalizeResources({food:20,water:20,meds:10,ammo:30,scrap:10,wood:10},now);
const take=I.withdraw({},resources,'water',3,now);assert.equal(take.inventory.water,3);assert.equal(take.resources.water,17);
assert.throws(()=>I.withdraw({food:8,water:8,meds:5,ammo:12,scrap:8,wood:8},resources,'food',1,now),/inventory_full/);
const packed=I.stash(take.inventory,take.resources,now);assert.equal(packed.inventory.water,0);assert.equal(packed.stored.water,3);
let field=I.normalize({rawFood:2,dirtyWater:2,wood:2},now);field=I.remove(field,'rawFood',1,now).inventory;assert.equal(field.rawFood,1);
assert.equal(I.add(field,'food',1,now+hour).accepted,1);
const fieldStash=I.stash(I.normalize({rawFood:2,dirtyWater:3},now),I.normalizeResources({food:5,water:4},now),now+hour);
assert.equal(fieldStash.stored.rawFood,2);assert.equal(fieldStash.stored.dirtyWater,3);assert.equal(fieldStash.inventory.rawFood,0);assert.equal(fieldStash.inventory.dirtyWater,0);
const base=I.normalizeResources({rawFood:2,food:1},now),old=base.freshness.rawFood[0].acquiredAt;
const pulled=I.withdraw({},base,'rawFood',1,now+hour);assert.equal(pulled.inventory.freshness.rawFood[0].acquiredAt,old);
const returned=I.stash(pulled.inventory,pulled.resources,now+2*hour);assert.equal(returned.resourceFreshness.rawFood[0].acquiredAt,old);
const cooked=I.add({},'food',1,now+3*hour);assert.equal(cooked.inventory.freshness.food[0].acquiredAt,now+3*hour);
const expired=I.normalize({food:1,freshness:{food:[{qty:1,acquiredAt:now-25*hour}],rawFood:[]}},now);
assert.throws(()=>I.removeUsable(expired,'food',1,now),/food_spoiled/);
const mixed=I.normalize({food:2,freshness:{food:[{qty:1,acquiredAt:now-25*hour},{qty:1,acquiredAt:now-hour}],rawFood:[]}},now);
const edible=I.removeUsable(mixed,'food',1,now);assert.equal(edible.inventory.food,1);assert.equal(edible.inventory.freshness.food[0].acquiredAt,now-25*hour);
console.log('Homefront carried inventory freshness rules passed.');
// Refuge-only construction materials survive field packing (withdraw/stash replace base.resources).
{const stock=I.normalizeResources({food:5,water:5,seeds:4,stone:12,steel:7},now);if(stock.stone!==12||stock.steel!==7||stock.seeds!==4)throw new Error('normalizeResources dropped refuge-only materials');
 const w=I.withdraw(I.normalize({},now),{food:5,water:5,stone:12,steel:7},'food',1,now);if(w.resources.stone!==12||w.resources.steel!==7)throw new Error('withdraw dropped stone/steel');
 const old=I.normalizeResources({food:5},now);if('stone' in old&&old.stone!==0)throw new Error('old saves get no phantom stone');console.log('refuge-only materials survive packing');}
