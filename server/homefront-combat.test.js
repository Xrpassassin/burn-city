'use strict';
const assert=require('node:assert/strict'),C=require('./homefront-combat');
const base=()=>({resources:{ammo:50,scrap:0,food:10},embers:0,survivors:[{id:'s1',role:'guard',morale:80}],log:[]}),player={x:0,z:0};
const a=C.spawn({encounters:{},account:'a',player,now:100000,seed:4});assert.ok(a.encounter.id.startsWith('enc-'));
const Terrain=require('./homefront-terrain');assert.equal(Terrain.isSafePosition(a.encounter.x,a.encounter.z,{bounds:100}),true,'infected encounters spawn on a safe terrain footprint');
assert.equal(a.encounter.range,C.STATS[a.encounter.event].range,'public encounter exposes server-owned attack range for contextual UI');
// Firearm tier ladder (#185–#188 combined): cadence/magazines come from one server table.
const F=require('./homefront-firearms');
assert.deepEqual(Object.keys(F.FIREARM_TIERS),['smg','assault_rifle','machine_gun','heavy_machine_gun','fifty_cal'],'five automatic tiers in order');
assert.deepEqual(Object.values(F.FIREARM_TIERS).map(t=>t.tier),[1,2,3,4,5]);
assert.ok(Object.values(F.FIREARM_TIERS).every((t,i,a)=>i===0||(t.level>=a[i-1].level&&t.power>a[i-1].power&&t.rounds>=a[i-1].rounds)),'each tier needs more settlement development and hits harder');
assert.deepEqual(C.WEAPON_FIRE_INTERVAL,{pipe_blade:900,pump_shotgun:1150,marksman_rifle:1350,shock_maul:950,smg:950,assault_rifle:950,machine_gun:1000,heavy_machine_gun:1050,fifty_cal:1150},'weapon-specific fire cadence is defined on the server');
assert.ok(Object.values(C.WEAPON_FIRE_INTERVAL).every(ms=>ms>=900),'no weapon can be fired faster than the 120/min world rate limit allows');
assert.deepEqual(C.WEAPON_MAGAZINE_CAPACITY,{pipe_blade:0,pump_shotgun:6,marksman_rifle:5,shock_maul:0,smg:30,assault_rifle:30,machine_gun:45,heavy_machine_gun:60,fifty_cal:100},'firearms use finite magazines; melee weapons never consume bullets');
const Core=require('./homefront-core');
// Unlock checks are server-side on craft, equip and fire.
const armory=Core.createBase('armory-test',1000);armory.resources.scrap=5000;armory.embers=5000;
assert.throws(()=>Core.applyAction(armory,'armory-test',{type:'craft_weapon',weapon:'smg'},1001),/weapon_requires_refuge_level_2/,'SMG needs refuge level 2');
const lvl3=Core.validateBase({...armory,level:3},'armory-test');
const withSmg=Core.applyAction(lvl3,'armory-test',{type:'craft_weapon',weapon:'smg'},1002);assert.ok(withSmg.weapons.includes('smg'));
const withAr=Core.applyAction(withSmg,'armory-test',{type:'craft_weapon',weapon:'assault_rifle'},1003);assert.ok(withAr.weapons.includes('assault_rifle'));
assert.throws(()=>Core.applyAction(withAr,'armory-test',{type:'craft_weapon',weapon:'machine_gun'},1004),/weapon_requires_refuge_level_4/);
const lvl5=Core.validateBase({...withAr,level:5},'armory-test');
assert.throws(()=>Core.applyAction(lvl5,'armory-test',{type:'craft_weapon',weapon:'machine_gun'},1005),/weapon_requires_zone_industrial/,'machine gun also needs the Industrial Yard surveyed');
const surveyed=Core.validateBase({...lvl5,exploration:{...lvl5.exploration,discoveredZones:['outskirts','industrial','research_lab']}},'armory-test');
const withMg=Core.applyAction(surveyed,'armory-test',{type:'craft_weapon',weapon:'machine_gun'},1006);
const withHmg=Core.applyAction(withMg,'armory-test',{type:'craft_weapon',weapon:'heavy_machine_gun'},1007);assert.ok(withHmg.weapons.includes('heavy_machine_gun'));
// A save that somehow owns a gun above its development cannot equip or fire it.
const forgedOwner=Core.validateBase({...armory,weapons:['pipe_blade','heavy_machine_gun']},'armory-test');
assert.throws(()=>Core.applyAction(forgedOwner,'armory-test',{type:'equip_weapon',weapon:'heavy_machine_gun'},1008),/weapon_requires_refuge_level_5/);
const tierSpawn=()=>{const sp=C.spawn({encounters:{},account:'mg-test',player,now:800000,seed:11,risk:3});for(const m of sp.encounters['mg-test'].members){m.hp=400;m.maxHp=400;m.x=player.x+3;m.z=player.z+(m.offsetZ||0)*0.2;}sp.encounters['mg-test'].hp=sp.encounters['mg-test'].members.reduce((a,m)=>a+m.hp,0);return sp;};
assert.throws(()=>C.attack({encounters:tierSpawn().encounters,account:'mg-test',player,base:{...base(),level:1,weapons:['pipe_blade','heavy_machine_gun'],equippedWeapon:'heavy_machine_gun'},now:801000,weaponPower:9}),/weapon_locked/,'combat refuses an above-tier gun even if the save lists it');
const fire=(id,lvl,ammo=90)=>C.attack({encounters:tierSpawn().encounters,account:'mg-test',player,base:{...base(),level:lvl,exploration:{discoveredZones:['outskirts','industrial','research_lab']},weapons:['pipe_blade',id],equippedWeapon:id,resources:{...base().resources,ammo}},now:801000,weaponPower:Core.WEAPONS[id].power,seed:4});
const shots=Object.fromEntries(['smg','assault_rifle','machine_gun','heavy_machine_gun'].map(id=>[id,fire(id,5)]));
assert.equal(shots.smg.ammoCost,3);assert.equal(shots.heavy_machine_gun.ammoCost,5,'server decides the burst and spends that many rounds');
assert.equal(shots.heavy_machine_gun.base.resources.ammo,85,'ammo deducted server-side');
assert.equal(shots.heavy_machine_gun.hits.length,5,'every round in the burst is a server-resolved hit');
assert.ok(shots.heavy_machine_gun.damage>shots.machine_gun.damage&&shots.machine_gun.damage>shots.assault_rifle.damage&&shots.assault_rifle.damage>shots.smg.damage,'each tier tears through more of the horde per burst');
const shortMag=fire('heavy_machine_gun',5,2);assert.equal(shortMag.ammoCost,2,'a burst never spends rounds that are not loaded');assert.equal(shortMag.hits.length,2);
assert.throws(()=>fire('heavy_machine_gun',5,0),/insufficient_ammo/);
const rifleShot=C.attack({encounters:tierSpawn().encounters,account:'mg-test',player,base:{...base(),equippedWeapon:'marksman_rifle'},now:801000,weaponPower:4,seed:4});
assert.equal(rifleShot.hits.length,1,'single-shot weapons resolve one round');
const firstBurst=fire('smg',5);assert.throws(()=>C.attack({encounters:firstBurst.encounters,account:'mg-test',player,base:{...base(),level:5,weapons:['pipe_blade','smg'],equippedWeapon:'smg'},now:801500,weaponPower:5}),/attack_cooldown/,'server cadence rejects burst spam');
// Bursts walk onto other squad members when the first target drops (tear through the squad).
const weak=C.spawn({encounters:{},account:'mg-walk',player,now:800000,seed:11});const wm=weak.encounters['mg-walk'].members;for(const m of wm){m.hp=10;m.maxHp=10;m.x=player.x+3;m.z=player.z;}weak.encounters['mg-walk'].hp=wm.length*10;
const walk=C.attack({encounters:weak.encounters,account:'mg-walk',player,base:{...base(),level:5,exploration:{discoveredZones:['industrial','research_lab']},weapons:['pipe_blade','heavy_machine_gun'],equippedWeapon:'heavy_machine_gun',resources:{...base().resources,ammo:60}},now:801000,weaponPower:9,seed:2});
assert.ok(new Set(walk.hits.map(h=>h.targetId)).size===Math.min(wm.length,5),'each round after a kill moves to the next living member');
assert.ok(walk.hitTargetId,'server returns the actual hit target');
const cooldownSpawn=C.spawn({encounters:{},account:'cooldown-test',player,now:700000,seed:3});
const cooldownBase=weapon=>({...base(),equippedWeapon:weapon});
const firstShot=C.attack({encounters:cooldownSpawn.encounters,account:'cooldown-test',player,base:cooldownBase('pump_shotgun'),now:701000});
assert.throws(()=>C.attack({encounters:firstShot.encounters,account:'cooldown-test',player,base:cooldownBase('pump_shotgun'),now:702000}),/attack_cooldown/,'server rejects shotgun attacks faster than its authoritative fire interval');
assert.doesNotThrow(()=>C.attack({encounters:firstShot.encounters,account:'cooldown-test',player,base:cooldownBase('pump_shotgun'),now:702150}),'shotgun becomes available at its server-enforced fire interval');
assert.throws(()=>C.attack({encounters:a.encounters,account:'a',player,base:base(),now:101000,targetId:'enc-forged'}),/target_mismatch/,'server rejects client-selected targets that are not the player-owned encounter');
const aimSpawn=C.spawn({encounters:{},account:'aim-test',player,now:600000,seed:8});
const aimBase=()=>base();
const aimTarget=aimSpawn.encounter.members.find(m=>!m.defeated);const aimPoint={x:aimTarget.x,y:2.3,z:aimTarget.z};
const unaimed=C.attack({encounters:aimSpawn.encounters,account:'aim-test',player,base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint});
assert.equal(unaimed.aimed,false,'a client-supplied aim point cannot grant precision without a server-owned aiming stance');
const aimedPlayer={...player,aiming:true,aimStartedAt:600000,accuracyRecoverUntil:0};
const aimedHead=C.attack({encounters:aimSpawn.encounters,account:'aim-test',player:aimedPlayer,base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint});
assert.equal(aimedHead.aimed,true,'server confirms aim only after the weapon-specific ADS time');
assert.equal(aimedHead.hitZone,'head','a stable server-confirmed aim point can produce a headshot');
assert.deepEqual(Object.keys(C.WEAPON_HANDLING),['pipe_blade','pump_shotgun','marksman_rifle','shock_maul','smg','assault_rifle','machine_gun','heavy_machine_gun','fifty_cal']);
assert.ok(C.WEAPON_HANDLING.marksman_rifle.adsMs>C.WEAPON_HANDLING.pump_shotgun.adsMs,'marksman rifle takes longer to aim down sights than shotgun');
const sprintRecovery=C.attack({encounters:aimSpawn.encounters,account:'aim-test',player:{...aimedPlayer,accuracyRecoverUntil:601900},base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint});
assert.equal(sprintRecovery.aimed,false,'post-sprint recovery blocks immediate precision headshots even while aiming');
assert.ok(sprintRecovery.aimStability<aimedHead.aimStability,'post-sprint recovery lowers server-calculated stability');
assert.throws(()=>C.attack({encounters:aimSpawn.encounters,account:'aim-test',player,base:aimBase(),now:601000,targetId:aimSpawn.encounter.id,aimPoint:{x:aimTarget.x+5,y:2.3,z:aimTarget.z}}),/invalid_aim_point/,'server rejects aim points outside the target hitbox');
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
const pursuer={...a.encounters.a,x:10,z:0,members:a.encounters.a.members.map((member,i)=>({...member,x:10+i*2,z:0})),lastKnownX:0,lastKnownZ:0,lastKnownAt:100000,investigateUntil:0,lastAiAt:100000,expiresAt:300000};
const advanced=C.advance({encounters:{a:pursuer},players:{a:{x:0,z:0}},now:101000});
assert.ok(advanced.a.members.some((member,i)=>Math.hypot(member.x,member.z)<Math.hypot(pursuer.members[i].x,pursuer.members[i].z)),'at least one infected squad member pursues the player without teleporting into contact');
assert.ok(advanced.a.members.every(member=>Math.hypot(member.x,member.z)>0.5),'infected squad members do not teleport into contact');
const advancedAgain=C.advance({encounters:{a:pursuer},players:{a:{x:0,z:0}},now:101000});
assert.deepEqual(advancedAgain.a.members.map(m=>[m.x,m.z]),advanced.a.members.map(m=>[m.x,m.z]),'squad pursuit is deterministic for the same state and clock');
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


const squadSpawn = C.spawn({ encounters: {}, account: 'squad-test', player: { x: -40, z: 30 }, now: 880000, seed: 17 });
assert.ok(Array.isArray(squadSpawn.encounters['squad-test'].members), 'encounters persist independently tracked infected members');
assert.equal(squadSpawn.encounters['squad-test'].members.length, squadSpawn.encounter.packPlan.count, 'spawned member state matches deterministic squad plan');
assert.ok(squadSpawn.encounters['squad-test'].members.every(m => m.id && Number.isFinite(m.x) && Number.isFinite(m.z) && m.hp > 0), 'each living member has an identity, position, and health');
const squadBefore = squadSpawn.encounters['squad-test'].members.map(m => ({ id: m.id, x: m.x, z: m.z }));
const squadAdvanced = C.advance({ encounters: squadSpawn.encounters, players: { 'squad-test': { x: -35, z: 25 } }, now: 880180 });
assert.ok(squadAdvanced['squad-test'].members.every(m => Number.isFinite(m.x) && Number.isFinite(m.z)), 'squad members retain valid independent coordinates through simulation');
assert.ok(squadAdvanced['squad-test'].members.some((m, i) => Math.hypot(m.x - squadBefore[i].x, m.z - squadBefore[i].z) > 0), 'infected members independently advance toward remembered player position');
assert.equal(C.publicEncounter(squadAdvanced['squad-test']).members.length, squadSpawn.encounter.packPlan.count, 'public world snapshots expose each squad member for client rendering');

console.log('Homefront authoritative combat tests passed.');

// Audit fixes (Oct 23): the pathfinding anchor drives the squad, members regroup instead of sticking
// behind terrain, member maxHp matches its spawned hp, and killing the lead hands the anchor to a survivor.
{
  const sq = C.spawn({ encounters: {}, account: 'hp-test', player: { x: -40, z: 30 }, now: 990000, seed: 6 });
  assert.ok(sq.encounters['hp-test'].members.length > 1, 'fixture is a multi-member horde');
  const e = sq.encounters['hp-test'];
  assert.ok(e.members.every(m => m.hp === m.maxHp), 'every squad member spawns at full health');
  assert.equal(e.hp, e.maxHp, 'encounter health starts full');
  const lead = e.members[0];
  const adv = C.advance({ encounters: sq.encounters, players: { 'hp-test': { x: -36, z: 26 } }, now: 990900 })['hp-test'];
  assert.equal(adv.members.filter(m => !m.defeated)[0].x, adv.x, 'the lead member is the pathfinding anchor');
  if (e.members.length > 1) {
    const killLead = { ...adv, members: adv.members.map((m, i) => i === 0 ? { ...m, hp: 1 } : m) };
    const r = C.attack({ encounters: { 'hp-test': killLead }, account: 'hp-test', player: { x: adv.x + 1, z: adv.z }, base: base(), now: 991500, targetId: killLead.members[0].id });
    const next = r.encounters['hp-test'].members.find(m => !m.defeated);
    assert.ok(next && Math.hypot(r.encounters['hp-test'].x - next.x, r.encounters['hp-test'].z - next.z) < 1e-9, 'killing the lead hands the anchor to the next living member without a jump');
  }
}
console.log('Homefront squad anchor audit tests passed.');

// Tier 5 .50 cal: refuge level 6, pierces in live sieges, still >= 900 ms between requests.
{const T5=F.FIREARM_TIERS.fifty_cal;assert.equal(T5.level,6);assert.ok(T5.interval>=900&&T5.pierce===3);
 const l5=Core.validateBase({...Core.createBase('t5-test',1),level:5,resources:{...Core.createBase('t5-test',1).resources,scrap:9999},embers:9999},'t5-test');
 assert.throws(()=>Core.applyAction(l5,'t5-test',{type:'craft_weapon',weapon:'fifty_cal'},2),/weapon_requires_refuge_level_6/);
 const l6=Core.applyAction({...l5,level:6},'t5-test',{type:'craft_weapon',weapon:'fifty_cal'},3);assert.ok(l6.weapons.includes('fifty_cal'));
 assert.equal(F.publicTiers().find(t=>t.id==='fifty_cal').pierce,3);}
console.log('fifty cal tier ok');
