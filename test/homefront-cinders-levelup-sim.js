'use strict';
const assert=require('node:assert/strict');
const RPG=require('../server/homefront-rpg');
const data=new Map();
const store={
  load:(name,fallback)=>data.has(name)?JSON.parse(JSON.stringify(data.get(name))):fallback,
  save:(name,value)=>data.set(name,JSON.parse(JSON.stringify(value)))
};
const acct='cinders-zero-xp-loop';
const profile=RPG.defaultProfile();
profile.backfilled=true;
profile.quests.first_steps='done';
profile.quests.cartographer='done';
profile.tracked=null;
profile.counters.enter_world=75;
data.set(RPG.FILE,{[acct]:profile});
for(let i=0;i<80;i++){
  const awarded=RPG.award(store,acct,'enter_world',{now:1800000000000+i});
  assert.equal(awarded.xp,0,
    'zero-XP world entry must stay at zero regardless of trained familiarity');
}
let result=RPG.sheet(RPG.get(store,acct));
assert.equal(result.level,1);
assert.equal(result.xp,0);
assert.equal(result.skillPoints,0);
assert.equal(result.perkPoints,0);
assert.equal(result.attributePoints,7);
assert.equal(result.log.filter(entry=>entry.text.includes('Reached level')).length,0);
// Actual server-authorized events can still receive a small practice bonus.
const repeat='cinders-practiced-discovery';
const trained=RPG.defaultProfile();
trained.backfilled=true;
trained.quests.cartographer='done';
trained.quests.first_steps='done';
trained.counters.discover=10;
data.set(RPG.FILE,{...data.get(RPG.FILE),[repeat]:trained});
const earned=RPG.award(store,repeat,'discover',{now:1800000001000});
assert.equal(earned.xp,RPG.XP.discover+1,
  '10 verified discoveries grant the capped Spark familiarity bonus');
const practice=RPG.sheet(RPG.get(store,repeat)).skills.find(skill=>skill.id==='wayfinder').practice;
assert.equal(practice.count,11);
assert.equal(practice.tier,1);
assert.equal(practice.label,'Spark');
assert.equal(practice.next,30);
const veteran='cinders-veteran-practice';
const high=RPG.defaultProfile();high.backfilled=true;high.quests.cartographer='done';
high.counters.discover=70;data.set(RPG.FILE,{...data.get(RPG.FILE),[veteran]:high});
assert.equal(RPG.award(store,veteran,'discover').xp,RPG.XP.discover+2,
  'even repeated verified actions add no more than two XP');
assert.equal(RPG.award(store,veteran,'__proto__'),null);
assert.equal(RPG.award(store,veteran,'constructor'),null);
console.log('CINDERS zero-XP world entry and capped skill-familiarity award tests passed.');
