'use strict';
const assert=require('node:assert/strict');
const {planFreeplayWave,chooseFreeplayZombieType,STYLES}=require('../server/zombie-wave-director');
const {Room}=require('../server/game');

const p=args=>planFreeplayWave(args);
const choose=(plan,baseType,spawnIndex)=>chooseFreeplayZombieType({plan,baseType,spawnIndex});
for(const mapId of ['refinery','cosmodrome']){
 for(const count of [1,2,4,8]){
  for(let wave=1;wave<=24;wave++){
   const a=p({roomId:'unit',mapId,wave,partySize:count});
   const b=p({roomId:'unit',mapId,wave,partySize:count});
   assert.deepEqual(a,b,'same map / room / wave / party must have identical plan');
   assert(a.spawnGapMultiplier>=0.88&&a.spawnGapMultiplier<=1.1);
   assert.equal(a.partySize,count);
   assert.equal(a.initialSpawnDelaySeconds,2.5);
   assert.equal(a.rankedOrDailyAllowed,false);
   assert.equal(a.combatOrHitboxChanges,false);
   for(let i=1;i<=120;i++){
    for(let base=0;base<=8;base++){
     const ty=choose(a,base,i);
     assert(Number.isInteger(ty)&&ty>=0&&ty<=8);
     if(base>=3||wave<4)assert.equal(ty,base,'special types and early waves never changed');
     if(ty===5&&base!==5)assert(wave>=6,'new crawler ambush not before wave 6');
     if(ty===2&&base!==2)assert(wave>=5,'new brute push not before wave 5');
     if(mapId==='refinery'&&base<=2)assert(ty<=5,'refinery never acquires map-2 types');
    }
   }
   assert.equal(choose(a,8,1),8,'Cosmodrome Warden is never remapped');
  }
 }
}
for(const style of STYLES){
 const match=Array.from({length:150},(_,i)=>p({roomId:'styles',wave:i+4,partySize:2})).find(x=>x.style===style);
 assert(match,'every wave style occurs under seeded plans');
 assert(match.warning&&match.warning.length<100,'warning is bounded');
 const sample=Array.from({length:55},(_,i)=>choose(match,0,i+1));
 if(style==='runner_surge')assert(sample.includes(1),'runner surge gives a scheduled fast infected');
 if(style==='crawler_ambush'&&match.wave>=6)assert(sample.includes(5));
 if(style==='brute_push'&&match.wave>=5)assert(sample.includes(2));
}
for(const base of [3,4,5,6,7,8]){
 const x=p({roomId:'test',mapId:'cosmodrome',wave:20,partySize:8});
 for(let i=1;i<150;i++)assert.equal(choose(x,base,i),base);
}
assert.throws(()=>chooseFreeplayZombieType({plan:p(),baseType:-1,spawnIndex:1}),/archetype/);
assert.throws(()=>chooseFreeplayZombieType({plan:p(),baseType:1,spawnIndex:0}),/spawn_index/);

function newRoom(name){
 const room=new Room(name,'zombie','refinery');
 room.add({name:'Tester'});
 return room;
}
const free=newRoom('new-freeplay');
free.wave=4;free.waveDelay=0;free.toSpawn=0;free.zombies.clear();free.events=[];
free.step(0.1);
assert.equal(free.wave,5);
assert.equal(free.events.filter(e=>e.e==='zpressure').length,1);
assert.equal(free.events.filter(e=>e.e==='wave').length,1);
assert(Math.abs(free.spawnT-2.4)<1e-9,'existing 2.5-second initial spawn delay decrements by the simulated 0.1-second tick');
assert(free.freeplayWavePlan);
free.events=[];
free.step(0.1);
assert.equal(free.events.filter(e=>e.e==='zpressure').length,0,'only warn once per wave');
assert(free.zombies.size<=40,'existing live zombie cap remains');

const daily=newRoom('daily-unchanged');
daily.daily={seed:1};daily.wave=4;daily.waveDelay=0;daily.toSpawn=0;daily.zombies.clear();daily.events=[];
daily.step(0.1);
assert.equal(daily.events.filter(e=>e.e==='zpressure').length,0);
assert.equal(daily.freeplayWavePlan,null);
assert.equal(daily.wave,5);
const ranked=newRoom('ranked-unchanged');
ranked.ranked={state:'live',startT:0,cap:99999};ranked.wave=4;ranked.waveDelay=0;ranked.toSpawn=0;ranked.zombies.clear();ranked.events=[];
ranked.step(0.1);
assert.equal(ranked.events.filter(e=>e.e==='zpressure').length,0);
assert.equal(ranked.freeplayWavePlan,null);
assert.equal(ranked.wave,5);
console.log('Zombies encounter director: deterministic pressure patterns, legal special types, 1–8 players, <=40 cap, one warning per freeplay wave, ranked/daily unchanged passed');
