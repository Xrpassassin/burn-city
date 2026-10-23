'use strict';
const assert=require('node:assert/strict'),C=require('./homefront-combat');
const base=()=>({resources:{ammo:50,scrap:0,food:10},embers:0,survivors:[{id:'s1',role:'guard',morale:80}],log:[]}),player={x:0,z:0};
const a=C.spawn({encounters:{},account:'a',player,now:100000,seed:4});assert.ok(a.encounter.id.startsWith('enc-'));
assert.equal(C.spawn({encounters:a.encounters,account:'a',player,now:100100}).encounter.id,a.encounter.id);
assert.throws(()=>C.attack({encounters:a.encounters,account:'a',player:{x:100,z:100},base:base(),now:101000}),/enemy_out_of_range/);
let state=a.encounters,b=base(),r;for(let i=0;i<20;i++){r=C.attack({encounters:state,account:'a',player,base:b,now:101000+i*1000,weaponPower:5,seed:i});state=r.encounters;b=r.base;if(r.killed)break;}
assert.ok(r.killed);assert.ok(r.reward.scrap>0);assert.ok(b.resources.scrap>0);
const hard=C.resolveSpawn({account:'x',x:0,z:0,district:'research_lab',risk:5,now:123000});assert.equal(hard.risk,5);
assert.equal(Object.keys(C.normalizeEncounters({x:{...hard,expiresAt:1000}},2000)).length,0);
const noAmmo=C.spawn({encounters:{},account:'b',player,now:200000});assert.throws(()=>C.attack({encounters:noAmmo.encounters,account:'b',player,base:{...base(),resources:{ammo:0}},now:201000}),/insufficient_ammo/);
console.log('Homefront authoritative combat tests passed.');
