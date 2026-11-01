'use strict';
const assert = require('node:assert/strict');
const E = require('./homefront-cinders-effects');
const RPG = require('./homefront-rpg');
const S = require('./homefront-survival');
const Core = require('./homefront-core');
const Combat = require('./homefront-combat');
const World = require('./homefront-world');
const C=RPG.Cinders;

assert.deepEqual(E.fromAttributes(C.defaultAttributes()),E.BASE,
  'unspent level-1 character has identical original gameplay balance');
const each={};
for(const attribute of C.ATTRIBUTES){
  const trained=E.fromAttributes({[attribute.id]:10});
  assert.ok(Object.values(trained).every(Number.isFinite));
  each[attribute.letter]=trained;
}
assert.equal(each.C.needScale,0.93,'Cinderheart reduces passive needs by at most seven percent');
assert.equal(each.D.staminaScale,0.93,'Dexterity saves at most seven percent of stamina');
assert.equal(each.I.lootNoiseScale,0.895,'Instinct reduces ordinary search noise by at most 10.5 percent');
assert.ok(Math.abs(each.N.aimStabilityBonus-0.063)<1e-9);
assert.equal(each.E.repairHpBonus,10,'Engineering adds at most ten repair HP per operation');
assert.equal(each.R.foodRestoreBonus,8.75,'Resourcefulness restores no more than 9 additional hunger');
assert.equal(each.S.restRestoreBonus,10.5,'Spirit restores no more than 11 additional stamina');
const high=E.fromAttributes(Object.fromEntries(C.ATTRIBUTES.map(a=>[a.id,10])));
assert.equal(high.staminaScale,0.895,'even maximal C+Dex never saves more than 10.5 percent');
assert.deepEqual(E.fromAttributes({nerve:'10',engineering:Infinity,resourcefulness:NaN}),
  E.BASE,'invalid and client-like data never yields gameplay benefits');
assert.equal(E.normalizeEffects({staminaScale:0,lootNoiseScale:-1,aimStabilityBonus:999,repairHpBonus:999}).staminaScale,0.895,
  'reloaded world modifier values are independently clamped');
assert.equal(E.normalizeEffects({staminaScale:0,lootNoiseScale:-1,aimStabilityBonus:999,repairHpBonus:999}).aimStabilityBonus,0.063);
assert.equal(E.normalizeEffects(null).needScale,1);
assert.equal(E.summary(high).repairBonusHp,10);

const now=100000,initial=S.normalize(null,now);
const decayed=S.tick(initial,now+10000);
const tough=S.tick(initial,now+10000,each.C);
assert.ok(tough.hunger>decayed.hunger && tough.thirst>decayed.thirst);
assert.equal(tough.health,decayed.health,'resilience does not directly add health or immunity');
const walking=S.move(initial,now+1000,12);
const trainedWalking=S.move(initial,now+1000,12,high);
assert.ok(trainedWalking.stamina>walking.stamina);
assert.ok(trainedWalking.stamina-walking.stamina<=0.5250001,
  'travel savings never exceed the specified cap');
const running=S.moveContinuous(initial,now+1000,12);
const trainedRunning=S.moveContinuous(initial,now+1000,12,high);
assert.ok(Math.abs((trainedRunning.stamina-running.stamina)-
  (trainedWalking.stamina-walking.stamina))<1e-8,
  'legacy and continuous movement get consistent cost savings');
assert.equal(S.moveContinuous(initial,now+1000,0,high).stamina,100,
  'idle input cannot generate additional stamina');
const ate=S.act({...initial,hunger:30},'eat',now+1000,each.R);
const plainFood=S.act({...initial,hunger:30},'eat',now+1000);
assert.ok(ate.hunger>plainFood.hunger && ate.hunger-plainFood.hunger<=8.750001);
const rested=S.act({...initial,stamina:20},'catch_breath',now+1000,each.S);
assert.equal(rested.stamina,75.5);
const medic=S.act({...initial,health:30,infection:20},'bandage',now+1000,high);
const plainMedic=S.act({...initial,health:30,infection:20},'bandage',now+1000);
assert.deepEqual(medic,plainMedic,'field aid health and infection remain identical for PvP balance');

const owner='cinders-crafting-test',base=Core.createBase(owner,now);
base.baseHp=200;
const normal=Core.applyAction(base,owner,{type:'repair',target:'base'},now);
const improved=Core.applyAction(base,owner,{type:'repair',target:'base'},now,each.E);
assert.equal(improved.baseHp,normal.baseHp+10);
assert.equal(normal.baseHp,275);
assert.equal(improved.baseHp,285);
assert.equal(improved.resources.wood,normal.resources.wood);
assert.equal(improved.resources.scrap,normal.resources.scrap);
assert.equal(improved.embers,normal.embers,'Engineering does not mint currency or waive repair resources');
assert.equal(base.baseHp,200,'source refuge is never mutated by the repair comparison');

const player={x:0,z:0};
const spawned=Combat.spawn({encounters:{},account:'a',player,now,seed:4});
const fieldBase=()=>({resources:{ammo:50,scrap:0,food:10},embers:0,
  survivors:[{id:'s1',role:'guard',morale:80}],log:[]});
const location={x:spawned.encounter.x,z:spawned.encounter.z};
const combatArgs={encounters:spawned.encounters,account:'a',player:location,
  base:fieldBase(),now:now+2000,weaponPower:1,seed:42};
const untrained=Combat.attack(combatArgs);
const precise=Combat.attack({...combatArgs,base:fieldBase(),
  aimTrainingBonus:each.N.aimStabilityBonus});
assert.ok(precise.aimStability>=untrained.aimStability);
assert.ok(precise.aimStability-untrained.aimStability<=0.06300001);
assert.equal(precise.ammoCost,untrained.ammoCost);
assert.ok(precise.damage<=untrained.damage*1.1+1,
  'aim training cannot become a large weapon damage modifier');
const capped=Combat.attack({...combatArgs,base:fieldBase(),aimTrainingBonus:1e6});
assert.equal(capped.aimStability,precise.aimStability,'even direct server helper calls clamp aim input');

const playerWorld=World.enter(World.defaultWorld(),'a',now,high).world;
assert.equal(playerWorld.players.a.cindersEffects.staminaScale,0.895);
assert.equal(World.normalizeWorld(playerWorld).players.a.cindersEffects.staminaScale,0.895);
assert.equal(World.normalizeWorld({...playerWorld,players:{
  a:{...playerWorld.players.a,cindersEffects:{staminaScale:-99,needScale:-12,repairHpBonus:999}}
}}).players.a.cindersEffects.needScale,0.93,
  'world saves cannot bypass modifier bounds');
assert.equal(World.enter(playerWorld,'a',now+1000,E.BASE).world.players.a.cindersEffects.staminaScale,1,
  'refreshed server RPG profile replaces old active bonuses');

console.log('Homefront seven CINDERS effects: stat limits, movement parity, PvE, repair costs and save clamps passed.');
