'use strict';
// Exercise the actual Homefront API with two accounts. Profiles live in the
// RPG save and may never be supplied by world movement/repair request bodies.
const assert=require('node:assert/strict');
const {handle}=require('../server/homefront');
const Rpg=require('../server/homefront-rpg');
const E=require('../server/homefront-cinders-effects');
const files=new Map();
const store={
  load:(name,fallback)=>files.has(name)?JSON.parse(JSON.stringify(files.get(name))):fallback,
  save:(name,val)=>files.set(name,JSON.parse(JSON.stringify(val)))
};
async function call(method,path,account,payload={}) {
  const response={};
  await handle({method},response,new URL('http://localhost'+path),{
    who:()=>account?{acct:account}:null,gate:()=>false,ip:'127.0.0.1',
    body:async()=>payload,json:(_res,status,data)=>Object.assign(response,{status,data}),store
  });
  return response;
}
const A='cinders-effects-a',B='cinders-effects-b';
(async()=>{
  assert.equal((await call('GET','/api/homefront/world/rpg',null)).status,401);
  assert.equal((await call('GET','/api/homefront',A)).status,200);
  assert.equal((await call('GET','/api/homefront',B)).status,200);
  const profile=Rpg.defaultProfile();
  profile.backfilled=true;
  profile.xp=Rpg.xpForLevel(30);
  profile.attributes={...profile.attributes,cinderheart:10,dexterity:9};
  files.set(Rpg.FILE,{[A]:profile});
  const before=(await call('GET','/api/homefront/world/rpg',A)).data.sheet;
  assert.equal(before.level,30);
  assert.equal(before.attributePoints,0);
  assert.equal(before.gameplayEffects.staminaSavingsPct,9.5,
    'server shows actual, budget-bound movement effect');
  const fresh=(await call('GET','/api/homefront/world/rpg',B)).data.sheet;
  assert.equal(fresh.gameplayEffects.staminaSavingsPct,0);
  const entrantA=await call('POST','/api/homefront/world/enter',A,
    {cindersEffects:{staminaScale:0,needScale:0,repairHpBonus:999},xp:999999});
  assert.equal(entrantA.status,200,JSON.stringify(entrantA.data));
  assert.equal((await call('POST','/api/homefront/world/enter',B,{})).status,200);
  let world=files.get('homefront-world.json');
  assert.equal(world.players[A].cindersEffects.staminaScale,0.905,
    'world movement cache uses the saved RPG attributes, not request payload');
  assert.deepEqual(world.players[B].cindersEffects,E.BASE,
    'separate account without trained stats receives baseline rules');
  assert.equal((await call('GET','/api/homefront/world/rpg',B)).data.sheet.attributePoints,7);
  assert.equal(world.players[A].cindersEffects.repairHpBonus,0);
  assert.equal(world.players[A].cindersEffects.needScale,0.93);
  // An earned attribute spend must refresh this player's movement modifier
  // cache without modifying another survivor's cached stats.
  const second=Rpg.defaultProfile();
  second.backfilled=true;
  second.xp=Rpg.xpForLevel(3);
  files.set(Rpg.FILE,{...files.get(Rpg.FILE),[B]:second});
  const trained=await call('POST','/api/homefront/world/rpg',B,
    {action:'train-attribute',attribute:'dexterity',cindersEffects:{staminaScale:0}});
  assert.equal(trained.status,200,JSON.stringify(trained.data));
  world=files.get('homefront-world.json');
  assert.equal(world.players[B].cindersEffects.staminaScale,0.99,
    'server refreshes movement effects when an attribute is legally purchased');
  assert.equal(world.players[A].cindersEffects.staminaScale,0.905,
    'the other player is never changed');
  assert.equal((await call('POST','/api/homefront/world/rpg',B,
    {action:'train-attribute',attribute:'unknown'})).status,400);
  assert.equal(files.get('homefront-world.json').players[B].cindersEffects.staminaScale,0.99);
  // Repair one refuge with max Engineering and one with no Engineering.
  const engineer=Rpg.defaultProfile();
  engineer.xp=Rpg.xpForLevel(30);engineer.backfilled=true;
  engineer.attributes={...engineer.attributes,engineering:10};
  files.set(Rpg.FILE,{...files.get(Rpg.FILE),[A]:engineer});
  const bases=files.get('homefront.json');
  bases[A].baseHp=200;bases[B].baseHp=200;files.set('homefront.json',bases);
  const repairedA=await call('POST','/api/homefront/action',A,{action:{type:'repair',target:'base',repairHpBonus:999}});
  const repairedB=await call('POST','/api/homefront/action',B,{action:{type:'repair',target:'base',repairHpBonus:999}});
  assert.equal(repairedA.status,200,JSON.stringify(repairedA.data));
  assert.equal(repairedB.status,200,JSON.stringify(repairedB.data));
  assert.equal(repairedA.data.base.baseHp,285);
  assert.equal(repairedB.data.base.baseHp,275);
  assert.equal(repairedA.data.base.resources.wood,repairedB.data.base.resources.wood);
  assert.equal(repairedA.data.base.resources.scrap,repairedB.data.base.resources.scrap,
    'an engineering bonus cannot waive required building resources');
  assert.equal((await call('GET','/api/homefront/world/rpg',A)).data.sheet.attributePoints,6,
    'server derives the effect from the real earned engineering spend');
  assert.equal((await call('GET','/api/homefront/world/rpg',B)).data.sheet.attributePoints,
    Rpg.Cinders.earnedAttributePoints(3)-1);
  console.log('CINDERS two-account API: live effects, forgery rejection and repair-cost parity passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
