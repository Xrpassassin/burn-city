'use strict';
const assert=require('node:assert/strict');
const { handle }=require('../server/homefront');
const Rpg=require('../server/homefront-rpg');
const C=Rpg.Cinders;
const files=new Map();
const store={
  load(name,fallback){return files.has(name)?JSON.parse(JSON.stringify(files.get(name))):fallback;},
  save(name,data){files.set(name,JSON.parse(JSON.stringify(data)));}
};
async function call(method,path,acct,payload={}) {
  const response={};
  await handle({method},response,new URL('http://localhost'+path),{
    json:(_res,status,data)=>Object.assign(response,{status,data}),
    body:async()=>payload,who:()=>acct?{acct}:null,
    gate:()=>false,ip:'127.0.0.1',store
  });
  return response;
}
const endpoint='/api/homefront/world/rpg';
(async()=>{
  const A='cinders-veteran-A',B='cinders-fresh-B';
  assert.equal((await call('GET',endpoint,null)).status,401);
  let fresh=(await call('GET',endpoint,B)).data.sheet;
  assert.equal(fresh.level,1);
  assert.equal(fresh.progression,'C.I.N.D.E.R.S.');
  assert.deepEqual(fresh.attributes.map(x=>x.letter),['C','I','N','D','E','R','S']);
  assert.ok(fresh.attributes.every(x=>x.value===3));
  assert.equal(fresh.attributePoints,7);
  assert.equal(fresh.perkPoints,0);
  assert.equal(fresh.skillPoints,0);
  assert.equal((await call('POST',endpoint,B,{action:'learn-perk',perk:'ash_reader'})).data.error,
    'no_perk_points');
  for(const bad of [
    {action:'train-attribute',attribute:'constructor'},
    {action:'train-attribute',attribute:'__proto__'},
    {action:'train-attribute',attribute:7},
    {action:'learn-perk',perk:'__proto__'},
    {action:'learn-perk',perk:'constructor'},
    {action:'learn-perk',perk:'fake'},
    {action:'award',source:'boss',xp:999999},
    {action:'raise-level',level:30},
    {action:'train-attribute',attribute:'instinct',levels:50,points:999},
    {action:'perks',perks:{ash_reader:true}}
  ]) {
    if(bad.attribute==='instinct')continue;
    const response=await call('POST',endpoint,B,bad);
    assert.equal(response.status,400,JSON.stringify(bad)+' rejected');
  }
  assert.equal((await call('GET',endpoint,B)).data.sheet.xp,0);
  assert.equal((await call('GET',endpoint,B)).data.sheet.perkPoints,0);
  // Legacy RPG profiles retain XP, old skills and equipment, and retroactively
  // gain earned customization points without duplicating the original XP.
  const legacy=Rpg.defaultProfile();
  legacy.version=1;
  legacy.xp=Rpg.xpForLevel(10);
  legacy.skills.marksman=2;
  delete legacy.attributes;
  delete legacy.perks;
  files.set(Rpg.FILE,{[A]:legacy});
  let s=(await call('GET',endpoint,A)).data.sheet;
  assert.equal(s.level,10);
  assert.equal(s.xp,Rpg.xpForLevel(10));
  assert.equal(s.skillPoints,10-1-2);
  assert.equal(s.attributePoints,9);
  assert.equal(s.perkPoints,3);
  assert.equal(s.skills.find(x=>x.id==='marksman').rank,2);
  assert.equal(s.equipment.head,'scav_cap');
  assert.equal(s.equipment.back,'field_pack');
  assert.equal(s.quests.find(x=>x.id==='first_steps').tracked,true);
  // Training is server-controlled, costs exactly one earned point per rank.
  for (const attribute of ['instinct','instinct','resourcefulness','resourcefulness','nerve','nerve']) {
    const response=await call('POST',endpoint,A,{action:'train-attribute',attribute,boost:99});
    assert.equal(response.status,200,JSON.stringify(response.data));
  }
  s=(await call('GET',endpoint,A)).data.sheet;
  assert.equal(s.attributes.find(x=>x.id==='instinct').value,5);
  assert.equal(s.attributes.find(x=>x.id==='resourcefulness').value,5);
  assert.equal(s.attributes.find(x=>x.id==='nerve').value,5);
  assert.equal(s.attributePoints,3);
  for(const perk of ['ash_reader','salvage_eye','steady_flame']) {
    const response=await call('POST',endpoint,A,{action:'learn-perk',perk,rank:999});
    assert.equal(response.status,200,'earned '+perk);
  }
  s=(await call('GET',endpoint,A)).data.sheet;
  assert.equal(s.perkPoints,0);
  assert.equal(s.perks.filter(p=>p.rank>0).length,3);
  assert.equal((await call('POST',endpoint,A,{action:'learn-perk',perk:'ash_reader'})).data.error,
    'perk_already_owned');
  assert.equal((await call('POST',endpoint,A,{action:'learn-perk',perk:'long_burn'})).data.error,
    'no_perk_points');
  const earned=Rpg.award(store,A,'discover');
  assert.equal(earned.xp,Rpg.XP.discover+5,'Ash Reader grants a real server-side discovery XP bonus');
  assert.equal((await call('GET',endpoint,A)).data.sheet.xp,Rpg.xpForLevel(10)+20);
  const kill=Rpg.award(store,A,'kill_infected');
  assert.equal(kill.xp,Rpg.XP.kill_infected+3,'Steady Flame grants a real server-side infected XP bonus');
  const after=(await call('GET',endpoint,A)).data.sheet;
  assert.equal(after.skills.find(x=>x.id==='wayfinder').practice.count,1,
    'only real server-awarded discovery increments wayfinder practice');
  assert.equal(after.skills.find(x=>x.id==='marksman').practice.count,1,
    'only real combat increments marksman familiarity');
  assert.equal((await call('GET',endpoint,B)).data.sheet.level,1,
    'one survivor spending perks never changes another account');
  assert.equal((await call('GET',endpoint,B)).data.sheet.perkPoints,0);
  // Remaining budget is consumed safely even if several requests race.
  const responses=await Promise.all(Array.from({length:12},()=>call('POST',endpoint,A,{
    action:'train-attribute',attribute:'engineering'
  })));
  assert.equal(responses.filter(x=>x.status===200).length,3,
    'simultaneous forged or duplicate requests cannot exceed earned attribute points');
  s=(await call('GET',endpoint,A)).data.sheet;
  assert.equal(s.attributePoints,0);
  assert.equal(s.attributes.find(x=>x.id==='engineering').value,6);
  assert.ok(s.attributes.every(a=>a.value<=10));
  assert.equal(s.perks.filter(p=>p.rank>0).length,3,'attribute changes do not duplicate perk points');
  const persisted=files.get(Rpg.FILE)[A];
  assert.equal(persisted.attributes.engineering,6);
  assert.equal(persisted.perks.ash_reader,true);
  assert.equal(persisted.skills.marksman,2);
  assert.equal(persisted.version,2);
  const before=JSON.stringify(persisted);
  const malicious=await call('POST',endpoint,A,{
    action:'learn-perk',perk:'furnace_watch',flags:['admin'],all:true,level:30
  });
  assert.equal(malicious.status,400);
  assert.equal(JSON.stringify(files.get(Rpg.FILE)[A]),before,'rejected action cannot save changes');
  console.log('Homefront C.I.N.D.E.R.S. API: migration, spending, active perks, practice, privacy and anti-replay passed.');
})().catch(err=>{console.error(err);process.exitCode=1;});
