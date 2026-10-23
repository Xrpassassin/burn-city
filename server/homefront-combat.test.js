'use strict';
const assert=require('node:assert/strict'),C=require('./homefront-combat');
const base=()=>({resources:{ammo:50,scrap:0,food:10},embers:0,survivors:[{id:'s1',role:'guard',morale:80}],log:[]}),player={x:0,z:0};
const a=C.spawn({encounters:{},account:'a',player,now:100000,seed:4});assert.ok(a.encounter.id.startsWith('enc-'));
const Terrain=require('./homefront-terrain');assert.equal(Terrain.isSafePosition(a.encounter.x,a.encounter.z,{bounds:100}),true,'infected encounters spawn on a safe terrain footprint');
assert.equal(a.encounter.range,C.STATS[a.encounter.event].range,'public encounter exposes server-owned attack range for contextual UI');
assert.deepEqual(C.WEAPON_FIRE_INTERVAL,{pipe_blade:900,pump_shotgun:1150,marksman_rifle:1350,shock_maul:950},'weapon-specific fire cadence is defined on the server');
assert.deepEqual(C.WEAPON_MAGAZINE_CAPACITY,{pipe_blade:0,pump_shotgun:6,marksman_rifle:5,shock_maul:0},'only firearms use finite magazines; melee weapons never consume bullets');
const cooldownSpawn=C.spawn({encounters:{},account:'cooldown-test',player,now:700000,seed:3});
const cooldownBase=weapon=>({...base(),equippedWeapon:weapon});
const firstShot=C.attack({encounters:cooldownSpawn.encounters,account:'cooldown-test',player,base:cooldownBase('pump_shotgun'),now:701000});
assert.throws(()=>C.attack({encounters:firstShot.encounters,account:'cooldown-test',player,base:cooldownBase('pump_shotgun'),now:702000}),/attack_cooldown/,'server rejects shotgun attacks faster than its authoritative fire interval');
assert.doesNotThrow(()=>C.attack({encounters:firstShot.encounters,account:'cooldown-test',player,base:cooldownBase('pump_shotgun'),now:702150}),'shotgun becomes available at its server-enforced fire interval');
assert.throws(()=>C.attack({encounters:a.encounters,account:'a',player,base:base(),now:101000,targetId:'enc-forged'}),/target_mismatch/,'server rejects client-selected targets that are not the player-owned encounter');
const aimSpawn=C.spawn({encounters:{},account:'aim-test',player,now:600000,seed:8});
const aimBase=()=>base();
const aimPoint={x:aimSpawn.encounter.x,y:2.3,z:aimSpawn.encounter.z};
const unaimed=C.attack({encounters:aimSpawn.encounters,account:'aim-test',player,base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint});
assert.equal(unaimed.aimed,false,'a client-supplied aim point cannot grant precision without a server-owned aiming stance');
const aimedPlayer={...player,aiming:true,aimStartedAt:600000,accuracyRecoverUntil:0};
const aimedHead=C.attack({encounters:aimSpawn.encounters,account:'aim-test',player:aimedPlayer,base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint});
assert.equal(aimedHead.aimed,true,'server confirms aim only after the weapon-specific ADS time');
assert.equal(aimedHead.hitZone,'head','a stable server-confirmed aim point can produce a headshot');
assert.deepEqual(Object.keys(C.WEAPON_HANDLING),['pipe_blade','pump_shotgun','marksman_rifle','shock_maul']);
assert.ok(C.WEAPON_HANDLING.marksman_rifle.adsMs>C.WEAPON_HANDLING.pump_shotgun.adsMs,'marksman rifle takes longer to aim down sights than shotgun');
const sprintRecovery=C.attack({encounters:aimSpawn.encounters,account:'aim-test',player:{...aimedPlayer,accuracyRecoverUntil:601900},base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint});
assert.equal(sprintRecovery.aimed,false,'post-sprint recovery blocks immediate precision headshots even while aiming');
assert.ok(sprintRecovery.aimStability<aimedHead.aimStability,'post-sprint recovery lowers server-calculated stability');
assert.throws(()=>C.attack({encounters:aimSpawn.encounters,account:'aim-test',player,base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint:{x:aimSpawn.encounter.x+5,y:2.3,z:aimSpawn.encounter.z}}),/invalid_aim_point/,'server rejects aim points outside the target hitbox');
assert.doesNotThrow(()=>C.attack({encounters:a.encounters,account:'a',player,base:base(),now:101000,targetId:a.encounter.id}),'server accepts the exact active encounter target');
assert.equal(C.spawn({encounters:a.encounters,account:'a',player,now:100100}).encounter.id,a.encounter.id);
assert.throws(()=>C.attack({encounters:a.encounters,account:'a',player:{x:100,z:100},base:base(),now:101000}),/enemy_out_of_range/);
let state=a.encounters,b=base(),r;for(let i=0;i<20;i++){r=C.attack({encounters:state,account:'a',player,base:b,now:101000+i*1000,weaponPower:5,seed:i});state=r.encounters;b=r.base;if(r.killed)break;}
assert.ok(['head','torso','limb'].includes(r.hitZone),'server returns a calculated hit zone');
const zoneSpawn=C.spawn({encounters:{},account:'zone-test',player,now:500000,seed:7});
const zoneA=C.attack({encounters:zoneSpawn.encounters,account:'zone-test',player,base:base(),now:501000,weaponPower:3,seed:9});
const zoneB=C.attack({encounters:zoneSpawn.encounters,account:'zone-test',player,base:base(),now:501000,weaponPower:3,seed:9});
assert.equal(zoneA.hitZone,zoneB.hitZone,'hit-zone calculation is deterministic for the same server encounter and attack clock');
assert.equal(zoneA.damage,zoneB.damage,'hit-zone damage is deterministic for the same authoritative inputs');
assert.ok(r.killed);assert.ok(r.reward.scrap>0);assert.ok(b.resources.scrap>0);assert.ok(b.revision>0,'combat mutations advance the persistent refuge revision');
const pursuer={...a.encounters.a,x:10,z:0,lastAiAt:100000,expiresAt:300000};
const advanced=C.advance({encounters:{a:pursuer},players:{a:{x:0,z:0}},now:101000});
assert.ok(advanced.a.x<10&&advanced.a.x>2.2,'infected pursues the player without teleporting into contact');
assert.equal(advanced.a.z,0);
assert.equal(C.advance({encounters:{a:pursuer},players:{a:{x:0,z:0}},now:101000}).a.x,advanced.a.x,'pursuit is deterministic for the same state and clock');
const leashed=C.advance({encounters:{a:{...pursuer,x:40,z:0,pursuitRadius:20,lastKnownX:40,lastKnownZ:0,lastKnownAt:100000,investigateUntil:0}},players:{a:{x:0,z:0}},now:101000});
assert.equal(leashed.a.x,40,'infected stop extending pursuit after the player breaks their leash radius');
const noiseDrawn=C.advance({encounters:{a:{...pursuer,x:40,z:0,pursuitRadius:20,lastKnownX:40,lastKnownZ:0,lastKnownAt:100000,investigateUntil:0}},players:{a:{x:0,z:0,lastNoiseAt:100500,noiseLevel:95,noiseX:30,noiseZ:0}},now:101000});
assert.ok(noiseDrawn.a.x<40,'recent gunfire pulls infected toward its recorded sound location rather than the fleeing player');
assert.equal(noiseDrawn.a.lastKnownX,30,'infected retain the authoritative noise source as their last-known position');

const hard=C.resolveSpawn({account:'x',x:0,z:0,district:'research_lab',risk:5,now:123000});assert.equal(hard.risk,5);
assert.equal(Object.keys(C.normalizeEncounters({x:{...hard,expiresAt:1000}},2000)).length,0);
const noAmmo=C.spawn({encounters:{},account:'b',player,now:200000});assert.throws(()=>C.attack({encounters:noAmmo.encounters,account:'b',player,base:{...base(),resources:{ammo:0},equippedWeapon:'pump_shotgun'},now:201000}),/insufficient_ammo/);
const meleeSpawn=C.spawn({encounters:{},account:'melee',player,now:210000});
const melee=C.attack({encounters:meleeSpawn.encounters,account:'melee',player,base:{...base(),resources:{ammo:0},equippedWeapon:'pipe_blade'},now:211000});
assert.equal(melee.ammoCost,0,'melee attacks do not consume firearm ammunition');
const tiredSpawn=C.spawn({encounters:{},account:'tired',player,now:300000});
const tiredBase=base();
const tired=C.attack({encounters:tiredSpawn.encounters,account:'tired',player,base:tiredBase,survival:{stamina:10,health:100},now:301000,weaponPower:1});
assert.equal(tired.survival.stamina,2,'each attack consumes eight stamina');
const restedSpawn=C.spawn({encounters:{},account:'rested',player,now:400000});
const rested=C.attack({encounters:restedSpawn.encounters,account:'rested',player,base:base(),survival:{stamina:100,health:100},now:401000,weaponPower:1});
assert.ok(tired.damage<rested.damage,'low stamina reduces attack damage');

const Director = require('./homefront-director');
const lowRiskPlan = Director.planEncounter({ zoneId: 'outskirts', risk: 1, seed: 'low-risk-test' });
const highRiskPlan = Director.planEncounter({ zoneId: 'research_lab', risk: 5, seed: 'high-risk-test' });
assert.equal(lowRiskPlan.zoneId, 'outskirts');
assert.equal(highRiskPlan.zoneId, 'research_lab');
assert.ok(highRiskPlan.threat > lowRiskPlan.threat, 'director threat increases with district risk');
assert.ok(highRiskPlan.recommendedMaxAlive > lowRiskPlan.recommendedMaxAlive, 'recommended infected cap scales with district risk');
assert.ok(highRiskPlan.spawnIntervalMs < lowRiskPlan.spawnIntervalMs, 'higher-risk districts recommend faster reinforcements');
assert.equal(Director.planEncounter({ zoneId: 'research_lab', risk: 5, seed: 'repeatable' }).event,
  Director.planEncounter({ zoneId: 'research_lab', risk: 5, seed: 'repeatable' }).event,
  'encounter decisions are deterministic for a fixed seed and context');
assert.ok(Director.planEncounter({ zoneId: 'outskirts', risk: 1, playerCount: 4, seed: 'group' }).pressure >
  Director.planEncounter({ zoneId: 'outskirts', risk: 1, playerCount: 1, seed: 'group' }).pressure,
  'nearby player count contributes to director pressure');
assert.ok(Director.planEncounter({ zoneId: 'outskirts', risk: 1, noise: 80, seed: 'noise' }).weights.special >
  Director.planEncounter({ zoneId: 'outskirts', risk: 1, noise: 0, seed: 'noise' }).weights.special,
  'noise raises special-infected probability');
assert.equal(Director.planEncounter({ zoneId: 'invalid-zone', risk: 99, seed: 'bounds' }).zoneId, 'outskirts',
  'invalid districts fall back to safe defaults');


const initialDirectorTick = Director.advanceDirector({}, { zoneId: 'outskirts', risk: 1, activeEncounters: 0, now: 100000, seed: 'scheduler' });
assert.equal(initialDirectorTick.decision, 'spawn', 'director seeds an empty area with baseline infected');
const cooldownDirectorTick = Director.advanceDirector(initialDirectorTick.state, { zoneId: 'outskirts', risk: 1, activeEncounters: 1, now: 101000, seed: 'scheduler' });
assert.equal(cooldownDirectorTick.decision, 'cooldown', 'director observes reinforcement cadence');
const capDirectorTick = Director.advanceDirector(initialDirectorTick.state, { zoneId: 'outskirts', risk: 1, activeEncounters: initialDirectorTick.plan.recommendedMaxAlive, now: 200000, seed: 'scheduler' });
assert.equal(capDirectorTick.decision, 'hold', 'director never recommends exceeding local infected cap');
const noiseDirectorTick = Director.advanceDirector({}, { zoneId: 'outskirts', risk: 1, noise: 90, activeEncounters: 0, now: 300000, seed: 'noise-trigger' });
assert.equal(noiseDirectorTick.state.phase, 'assault', 'loud player actions can escalate the director phase');
assert.equal(noiseDirectorTick.decision, 'spawn', 'noise-triggered pressure requests a spawn when under cap');

console.log('Homefront authoritative combat tests passed.');
