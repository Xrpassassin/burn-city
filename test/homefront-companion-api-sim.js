'use strict';
const assert=require('node:assert/strict');
const {handle}=require('../server/homefront');
const Core=require('../server/homefront-core');
const World=require('../server/homefront-world');

const files=new Map();
const store={
  load:(name,fallback)=>files.has(name)?JSON.parse(JSON.stringify(files.get(name))):fallback,
  save:(name,val)=>files.set(name,JSON.parse(JSON.stringify(val)))
};
async function call(method,path,account,payload={}){
  const response={};
  await handle({method},response,new URL('http://localhost'+path),{
    json:(_res,status,data)=>Object.assign(response,{status,data}),
    gate:()=>false,ip:'127.0.0.1',body:async()=>payload,
    who:()=>account?{acct:account}:null,store
  });
  return response;
}
const a='npc-owner-a',b='npc-owner-b';
(async()=>{
  let camp=Core.createBase(a);
  camp.survivors.push({id:'legendary-owner-a',name:'Sable',role:'guard',rarity:'legendary',morale:84});
  camp.survivors.push({id:'ordinary-owner-a',name:'Niko',role:'medic',rarity:'common',morale:99});
  const other=Core.createBase(b);
  other.survivors.push({id:'epic-owner-b',name:'Cora',role:'medic',rarity:'epic',morale:79});
  files.set('homefront.json',{[a]:camp,[b]:other});
  assert.equal((await call('POST','/api/homefront/action',null,
    {action:{type:'assign_expedition_companion',survivorId:'legendary-owner-a'}})).status,401);
  assert.equal((await call('POST','/api/homefront/action',a,
    {action:{type:'assign_expedition_companion',survivorId:'ordinary-owner-a'}})).data.error,
    'companion_requires_epic_or_legendary');
  assert.equal((await call('POST','/api/homefront/action',a,
    {action:{type:'assign_expedition_companion',survivorId:'epic-owner-b'}})).data.error,
    'unknown_survivor','player A cannot enlist survivor from player B wallet');
  const before=files.get('homefront.json')[a];
  const baseFood=before.resources.food,baseAmmo=before.resources.ammo;
  const picked=await call('POST','/api/homefront/action',a,
    {action:{type:'assign_expedition_companion',survivorId:'legendary-owner-a',
      extraHp:999,extraAmmo:999}});
  assert.equal(picked.status,200,JSON.stringify(picked.data));
  assert.equal(picked.data.base.expeditionCompanionId,'legendary-owner-a');
  assert.equal(picked.data.base.resources.food,baseFood);
  assert.equal(picked.data.base.resources.ammo,baseAmmo);
  assert.equal(Core.threatProfile(picked.data.base).guards,0,'escorted guard is unavailable to defend camp');

  const entered=await call('POST','/api/homefront/world/enter',a,{summon:'epic-owner-b'});
  assert.equal(entered.status,200,JSON.stringify(entered.data));
  assert.equal(entered.data.companions.length,1);
  assert.equal(entered.data.companions[0].name,'Sable');
  assert.equal(entered.data.companions[0].ownerId,a);
  assert.equal(entered.data.companions[0].rarity,'legendary');
  assert.equal(entered.data.players.length,1,'escort is never a second account');
  assert.equal((await call('POST','/api/homefront/action',a,
    {action:{type:'assign_expedition_companion',survivorId:null}})).data.error,
    'return_to_refuge_to_change_companion',
    'cannot teleport between rare companions during an active run');
  assert.equal((await call('GET','/api/homefront/world',a)).data.companions.length,1,
    'GET world refresh keeps the same singular companion without duplication');
  const wentOther=await call('POST','/api/homefront/world/enter',b);
  assert.equal(wentOther.status,200);
  assert.equal(wentOther.data.companions.length,0,
    'another account with an unassigned Epic survivor has no helper');
  assert.equal(wentOther.data.players.every(p=>p.id!==entered.data.companions[0].id),true);
  assert.equal(files.get('homefront.json')[b].expeditionCompanionId,null);
  let updated=files.get('homefront-world.json');
  assert.equal(updated.players[a].companion.id,'legendary-owner-a');
  assert.equal(updated.players[b].companion,null);
  // Return to camp restores the survivor to the permanent roster. Selection
  // remains until explicitly recalled, so subsequent legitimate trips retain it.
  const left=await call('POST','/api/homefront/world/leave',a);
  assert.equal(left.status,200,JSON.stringify(left.data));
  assert.equal(files.get('homefront-world.json').players[a],undefined);
  assert.ok(files.get('homefront.json')[a].survivors.some(s=>s.id==='legendary-owner-a'));
  const recalled=await call('POST','/api/homefront/action',a,
    {action:{type:'assign_expedition_companion',survivorId:null}});
  assert.equal(recalled.status,200,JSON.stringify(recalled.data));
  assert.equal(recalled.data.base.expeditionCompanionId,null);
  assert.equal(Core.threatProfile(recalled.data.base).guards,1,
    'guard duty resumes after survivor is recalled');
  const reentered=await call('POST','/api/homefront/world/enter',a);
  assert.equal(reentered.status,200,JSON.stringify(reentered.data));
  assert.equal(reentered.data.companions.length,0);
  assert.equal(reentered.data.players.length,1);
  assert.equal(files.get('homefront-world.json').players[a].companion,null);
  console.log('Homefront authenticated companion assignment, own-roster checks, field travel, return and recall passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
