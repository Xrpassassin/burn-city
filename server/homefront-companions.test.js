'use strict';
const assert=require('node:assert/strict');
const Core=require('./homefront-core');
const Companions=require('./homefront-companions');
const World=require('./homefront-world');

const at=200000,acct='owner-survivor-a';
const base=Core.createBase(acct,at);
base.survivors.push({id:'camp-guard',name:'Ordinary Guard',role:'guard',rarity:'common',morale:88});
base.survivors.push({id:'camp-epic',name:'Mara',role:'guard',rarity:'epic',morale:75});
base.survivors.push({id:'camp-legend',name:'Rook',role:'medic',rarity:'legendary',morale:84});
const unchanged=Core.validateBase(base,acct);
assert.equal(unchanged.expeditionCompanionId,null,'old saves are compatible without extra escort fields');
assert.equal(Companions.eligible(unchanged.survivors[0]),false);
assert.equal(Companions.eligible(unchanged.survivors[1]),true);
assert.equal(Companions.eligible(unchanged.survivors[2]),true);
assert.equal(Companions.eligible({...unchanged.survivors[1],morale:39}),false);
assert.equal(Companions.eligible({...unchanged.survivors[1],rarity:'rare'}),false);
assert.throws(()=>Core.applyAction(unchanged,acct,
 {type:'assign_expedition_companion',survivorId:'camp-guard'},at),/companion_requires_epic_or_legendary/);
assert.throws(()=>Core.applyAction(unchanged,acct,
 {type:'assign_expedition_companion',survivorId:'__proto__'},at),/unknown_survivor/);
assert.throws(()=>Core.applyAction(unchanged,acct,
 {type:'assign_expedition_companion',survivorId:undefined},at),/unknown_survivor/);
assert.throws(()=>Core.applyAction(unchanged,'not-owner',
 {type:'assign_expedition_companion',survivorId:'camp-epic'},at),/invalid_or_foreign_base/);
let assigned=Core.applyAction(unchanged,acct,
 {type:'assign_expedition_companion',survivorId:'camp-epic'},at);
assert.equal(assigned.expeditionCompanionId,'camp-epic');
assert.equal(assigned.survivors.find(s=>s.id==='camp-epic').task,'field_escort');
assert.ok(!Core.threatProfile(assigned).guards || Core.threatProfile(assigned).guards===1,
  'deployed rare guard cannot count toward local perimeter guard bonus');
assert.equal(unchanged.expeditionCompanionId,null,'original saved refuge is not mutated');
const unemployed=Core.applyAction(assigned,acct,{type:'assign_expedition_companion',survivorId:null},at+1);
assert.equal(unemployed.expeditionCompanionId,null);
assert.equal(unemployed.survivors.find(s=>s.id==='camp-epic').task,'perimeter_watch');
const legendary=Core.applyAction(unemployed,acct,
 {type:'assign_expedition_companion',survivorId:'camp-legend'},at+2);
assert.equal(legendary.expeditionCompanionId,'camp-legend');
assert.equal(legendary.survivors.find(s=>s.id==='camp-legend').task,'field_escort');
const restored=Core.validateBase(JSON.parse(JSON.stringify(legendary)),acct);
assert.equal(restored.expeditionCompanionId,'camp-legend','field assignment survives save/reload');
assert.equal(Core.validateBase({...restored,expeditionCompanionId:'forged'},acct).expeditionCompanionId,null,
  'invalid saved selection is discarded instead of becoming an invented NPC');

let w=World.enter(World.defaultWorld(),acct,at+1000,null,assigned).world;
const p=w.players[acct];
assert.equal(p.companion.id,'camp-epic');
assert.equal(p.companion.rarity,'epic');
assert.equal(World.snapshot(w,acct,at+1000).companions.length,1);
assert.equal(World.snapshot(w,acct,at+1000).companions[0].ownerId,acct);
assert.equal(World.snapshot(w,acct,at+1000).companions[0].kind,'survivor_escort');
assert.equal(World.snapshot(w,acct,at+1000).players.length,1,
 'escort does not become an account, fake player or PvP target');
const target={...p,x:p.x+6,z:p.z};
const initial={...p.companion};
Companions.advance(target,at+2000);
assert.ok(Math.hypot(target.companion.x-initial.x,target.companion.z-initial.z)<=Companions.GUARD_RANGE);
assert.ok(Math.hypot(target.companion.x-initial.x,target.companion.z-initial.z)<=7,
  'NPC follows in bounded steps, never jumps to requested position');
const stale=Companions.normalize({id:'camp-epic',rarity:'epic',name:'Mara',
 x:4000,z:-4000,lastStepAt:-5,lastGuardAt:Infinity,lastAssistAt:'bogus'});
assert.equal(stale.x,100);assert.equal(stale.z,-100);
assert.equal(stale.lastGuardAt,0);
assert.equal(stale.lastAssistAt,0);
assert.equal(Companions.normalize({id:'x',rarity:'common',x:0,z:0}),null);

const enemy={id:'infected-a',x:1,z:1,hp:25,maxHp:25,defeated:false};
const encounter={owner:acct,id:'encounter-1',hp:25,maxHp:25,
 members:[enemy],defeated:false};
const encounters={[acct]:encounter,'other':{
 owner:'other',id:'encounter-other',hp:25,maxHp:25,
 members:[{...enemy,id:'enemy-other'}],defeated:false
}};
let fighter={x:1,z:1,companion:Companions.normalize({
 id:'camp-epic',name:'Mara',rarity:'epic',x:1,z:1,lastGuardAt:at-10000,lastStepAt:at
})};
const assisted=Companions.guard(encounters,acct,fighter,at+1000);
assert.equal(assisted.damage,4);
assert.equal(enemy.hp,21);
assert.equal(encounters.other.members[0].hp,25,
 'guard never helps a stranger or attacks another player');
assert.equal(Companions.guard(encounters,acct,fighter,at+1001),null,
 'spam on world refresh and high-frequency input cannot duplicate companion attacks');
assert.equal(Companions.guard(encounters,acct,{...fighter,x:99,z:99},at+10000),null,
 'companion cannot remotely attack across the whole world');
const closer=Companions.guard(encounters,acct,fighter,at+10000);
assert.equal(closer.damage,4);
enemy.hp=2;encounter.hp=2;
const last=Companions.guard(encounters,acct,fighter,at+20000);
assert.equal(last.damage,1);
assert.equal(enemy.hp,1);
assert.equal(encounter.hp,1);
assert.equal(Companions.guard(encounters,acct,fighter,at+30000),null,
 'escort cannot deliver final blow, farm XP or claim kill rewards');
const legendFighter={x:1,z:1,companion:{
 ...fighter.companion,rarity:'legendary',lastGuardAt:at
}};
const secondEnemy={id:'infected-b',x:1,z:1,hp:30,maxHp:30,defeated:false};
const second={[acct]:{id:'e2',owner:acct,hp:30,maxHp:30,defeated:false,members:[secondEnemy]}};
assert.equal(Companions.guard(second,acct,legendFighter,at+10000).damage,6);
const noAlly=World.enter(w,acct,at+4000,null,unemployed).world;
assert.equal(noAlly.players[acct].companion,null,'recalling escort removes them on next signed-in world refresh');
assert.equal(World.snapshot(noAlly,acct,at+4000).companions.length,0);
console.log('Homefront Epic/Legendary escort selection, persistence, path bounds, PvE cooldown and reward safety passed.');
