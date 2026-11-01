'use strict';
const assert=require('node:assert/strict');
const C=require('./homefront-cinders');

assert.equal(C.ATTRIBUTES.map(a=>a.letter).join(''),'CINDERS');
assert.equal(C.ATTRIBUTES.length,7,'the unique framework has seven named primary attributes');
assert.equal(new Set(C.ATTRIBUTES.map(a=>a.id)).size,7);
assert.equal(C.ATTR_BASE,3);
assert.equal(C.ATTR_MAX,10);
assert.equal(C.earnedAttributePoints(1),7,'fresh survivor receives seven customizable origin points');
assert.equal(C.earnedAttributePoints(4),7);
assert.equal(C.earnedAttributePoints(5),8);
assert.equal(C.earnedAttributePoints(30),13);
assert.equal(C.earnedPerkPoints(1),0);
assert.equal(C.earnedPerkPoints(2),0);
assert.equal(C.earnedPerkPoints(3),1);
assert.equal(C.earnedPerkPoints(6),2);
assert.equal(C.earnedPerkPoints(30),10);
assert.equal(C.attributePoints(1,C.defaultAttributes()),7);
const novice=C.defaultAttributes();
const trained={...novice,instinct:5,resourcefulness:6,engineering:5};
assert.equal(C.attributePoints(1,trained),0);
assert.deepEqual(C.normalizeAttributes(trained,1),trained);
const malicious=C.normalizeAttributes({
  ...trained,cinderheart:99,nerve:NaN,dexterity:'10',spirit:-2,
  __proto__:{constructor:999},constructor:10
},1);
assert.equal(malicious.instinct,3);
assert.equal(malicious.resourcefulness,3);
assert.equal(malicious.engineering,3,
  'forged attribute increases beyond earned budget are removed, not minted');
assert.equal(malicious.cinderheart,10,'the first safe catalog attribute may spend up to its cap');
assert.ok(Object.values(malicious).reduce((n,x)=>n+x-3,0)<=7);
assert.equal(malicious.nerve,3);
assert.equal(malicious.spirit,3);
const minimum={...novice,instinct:5};
const owned={ash_reader:true};
assert.equal(C.perkRequirement(C.PERKS[0],2,minimum,{}),'level');
assert.equal(C.perkRequirement(C.PERKS[0],3,novice,{}),'attribute');
assert.equal(C.perkRequirement(C.PERKS[0],3,minimum,{}),null);
assert.deepEqual(Object.keys(C.normalizePerks(owned,2,minimum)),[]);
assert.equal(C.normalizePerks(owned,3,minimum).ash_reader,true);
assert.equal(C.perkPoints(3,{ash_reader:true}),0);
assert.equal(C.perkPoints(6,{ash_reader:true}),1);
assert.equal(C.normalizePerks({ash_reader:'true'},3,minimum).ash_reader,undefined,
  'string and number perk ownership are never accepted');
assert.equal(C.normalizePerks({ash_reader:true,constructor:true,__proto__:true},3,minimum).ash_reader,true);
assert.equal(C.normalizePerks({ash_reader:true,constructor:true},3,minimum).constructor,undefined,
  'forged proto-name entries never become catalog perks');
assert.equal(C.perkRequirement(C.PERKS.find(p=>p.id==='furnace_watch'),30,
  {...novice,engineering:6},{engineer:1}),'skill');
assert.equal(C.normalizePerks({furnace_watch:true},30,
  {...novice,engineering:6},{engineer:1}).furnace_watch,undefined);
assert.equal(C.normalizePerks({furnace_watch:true},30,
  {...novice,engineering:6},{engineer:2}).furnace_watch,true);
assert.equal(C.bonusExperience('discover',{ash_reader:true}),5);
assert.equal(C.bonusExperience('discover',{ash_reader:true,dust_runner:true}),9);
assert.equal(C.bonusExperience('loot',{ash_reader:true}),0);
assert.equal(C.bonusExperience('__proto__',{ash_reader:true}),0);
assert.equal(C.gearFindChance({}),15);
assert.equal(C.gearFindChance({salvage_eye:true}),20);
assert.equal(C.gearFindChance({salvage_eye:3}),15);
const firstUnlock=C.perksForSheet(3,minimum,{},C.normalizePerks({},3,minimum))[0];
assert.equal(firstUnlock.canLearn,true);
assert.equal(firstUnlock.blockedBy,null);
assert.equal(C.perksForSheet(2,minimum,{},{}).find(p=>p.id==='ash_reader').canLearn,false);
assert.equal(C.perksForSheet(3,minimum,{},owned)[0].rank,1);
console.log('C.I.N.D.E.R.S. attributes, perk prerequisites and server XP bounds passed.');
