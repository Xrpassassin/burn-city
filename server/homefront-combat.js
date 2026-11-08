'use strict';
// Authoritative, renderer-independent combat for Homefront's shared Graveyard.
const { ARCHETYPES, QUALITY_ORDER, planEncounter, planHorde } = require('./homefront-director');
const { PINE_PATROLS, inPineCrossing } = require('../client/arena/homefront-pine-crossing.mjs');
const Terrain = require('./homefront-terrain');
const { ZOMBIE_MELEE_REACH, ZOMBIE_MELEE_HEIGHT, ZOMBIE_IFRAME_SECONDS } = require('./zombie-contact');
const Collision = require('./homefront-collision');
const InteriorRules = require('./homefront-interiors');
const InteriorCatalog = require('../client/arena/homefront-interior-world.mjs');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const ENCOUNTER_TTL=180000, ATTACK_COOLDOWN=900;
// Server-owned cadence keyed to the equipped weapon validated in the saved refuge.
// These minimum intervals also constrain callers that bypass the client autofire loop.
const Firearms=require('./homefront-firearms');
const BASE_FIRE_INTERVAL={pipe_blade:900,pump_shotgun:1150,marksman_rifle:1350,shock_maul:950};
const BASE_MAGAZINE={pipe_blade:0,pump_shotgun:6,marksman_rifle:5,shock_maul:0};
const BASE_HANDLING={pipe_blade:{adsMs:140,recoveryMs:450,aimMoveScale:0.62},pump_shotgun:{adsMs:280,recoveryMs:720,aimMoveScale:0.52},marksman_rifle:{adsMs:520,recoveryMs:1150,aimMoveScale:0.42},shock_maul:{adsMs:220,recoveryMs:560,aimMoveScale:0.56}};
// Automatic firearm tiers (SMG → assault rifle → machine gun → heavy machine gun) come from one table.
for(const [id,t] of Object.entries(Firearms.FIREARM_TIERS)){BASE_FIRE_INTERVAL[id]=t.interval;BASE_MAGAZINE[id]=t.magazine;BASE_HANDLING[id]={...t.handling};}
const WEAPON_FIRE_INTERVAL=Object.freeze(BASE_FIRE_INTERVAL);
const WEAPON_MAGAZINE_CAPACITY=Object.freeze(BASE_MAGAZINE);
const WEAPON_HANDLING=Object.freeze(BASE_HANDLING);
const STATS=Object.freeze({wandering_infected:{hp:32,damage:2,ammo:1,range:18},infected_horde:{hp:76,damage:5,ammo:2,range:20},special_infected:{hp:105,damage:7,ammo:2,range:22}});
function enemyName(zone,event){const a=ARCHETYPES[zone]||ARCHETYPES.outskirts;return event==='special_infected'?a.special:event==='infected_horde'?a.horde:a.wanderer;}
function safeEnemyPosition(x, z, fallbackX, fallbackZ, bounds = 100, removedObstacleIds = Collision.INTERIOR_OBSTACLE_IDS) {
 const candidates=[{x,z}];
 for(let radius=2;radius<=12;radius+=2){
  for(let step=-radius;step<=radius;step+=2){
   candidates.push({x:x+step,z:z-radius},{x:x+step,z:z+radius});
   if(Math.abs(step)<radius)candidates.push({x:x-radius,z:z+step},{x:x+radius,z:z+step});
  }
 }
 candidates.push({x:fallbackX,z:fallbackZ});
 for(const point of candidates){
  const px=clamp(point.x,-bounds,bounds),pz=clamp(point.z,-bounds,bounds);
  if(Collision.isSafePosition(px,pz,{bounds,removedObstacleIds}))return{x:Math.round(px*10)/10,z:Math.round(pz*10)/10};
 }
 throw Error('no_safe_infected_spawn');
}
function resolveSpawn({account,x,z,district,risk=1,now=Date.now(),seed=0,plan=null}){
 risk=clamp(Math.floor(risk),1,5);
 const directorPlan=plan || planEncounter({zoneId:district,risk,playerCount:1,activeEncounters:0,noise:0,seed:account+':'+Math.floor(x)+':'+Math.floor(z)+':'+Math.floor(now/30000)+':'+seed});
 const event=directorPlan.event,s=STATS[event],id='enc-'+hash(account+':'+now+':'+x+':'+z).toString(36);
 const packPlan = planHorde({ event, risk, seed: id });
 // More distant hordes add members without dividing away each member's health.
 const memberHealth = plan && event === 'infected_horde'
  ? (s.hp + 7) / 2 + (risk - 1) * 5
  : (s.hp + risk * 7) / packPlan.count;
 const members = packPlan.members.map(m => {
  const hp = Math.max(1, Math.round(memberHealth * m.healthScale));
  return { ...m, x: clamp(x + m.offsetX, -100, 100), z: clamp(z + m.offsetZ, -100, 100),
   hp, maxHp: hp, defeated: false, lastAttackAt: 0 };
 });
 const hp = members.reduce((total, member) => total + member.hp, 0);
 return {id,owner:account,event,enemy:directorPlan.enemy,directorPlan,packPlan,members,district,x:clamp(x+(hash(id+':x')%13-6),-100,100),z:clamp(z+(hash(id+':z')%13-6),-100,100),hp,maxHp:hp,damage:s.damage+Math.max(0,risk-1),ammoCost:s.ammo,range:s.range,risk,pursuitRadius:directorPlan.pursuitRadius,lastKnownX:x,lastKnownZ:z,lastKnownAt:now,investigateUntil:0,createdAt:now,lastAttackAt:0,lastAiAt:now,expiresAt:now+ENCOUNTER_TTL,defeated:false};
}
function publicEncounter(e){return e?{id:e.id,event:e.event,enemy:e.enemy,district:e.district,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,risk:e.risk,range:e.range,expiresAt:e.expiresAt,defeated:!!e.defeated,packPlan:e.packPlan||planHorde({event:e.event,risk:e.risk,seed:e.id}),members:(e.members||[]).map(m=>({id:m.id,role:m.role,x:m.x,z:m.z,hp:m.hp,maxHp:m.maxHp,defeated:!!m.defeated}))}:null;}
function canEngage(encounter, account, players = {}) {
 const party = players[account]?.partyCode;
 return encounter.owner === account || !!(encounter.patrolId && party && players[encounter.owner]?.partyCode === party);
}
function nearbyPartyPatrols(encounters, account, players, now) {
 const player = players[account];
 if (!player?.partyCode) return [];
 return Object.values(encounters || {}).filter(e =>
  e.owner !== account && e.patrolId && !e.defeated && e.hp > 0 && e.expiresAt > now &&
  canEngage(e, account, players) && Math.hypot(player.x - e.x, player.z - e.z) <= 30
 );
}
function normalizeEncounters(input,now=Date.now()){
 const out={};if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [owner,e] of Object.entries(input)){if(!e||typeof e!=='object'||typeof e.id!=='string'||!STATS[e.event]||!Number.isFinite(e.expiresAt)||e.expiresAt<=now)continue;
 out[owner]={id:e.id.slice(0,80),owner,event:e.event,enemy:String(e.enemy||'Stray Runner').slice(0,80),district:String(e.district||'outskirts').slice(0,40),x:clamp(e.x,-100,100),z:clamp(e.z,-100,100),hp:clamp(e.hp,0,10000),maxHp:clamp(e.maxHp,1,10000),damage:clamp(e.damage,1,50),ammoCost:clamp(e.ammoCost,1,5),range:clamp(e.range,1,40),risk:clamp(e.risk,1,5),pursuitRadius:clamp(e.pursuitRadius??26,8,60),lastKnownX:clamp(e.lastKnownX??e.x,-100,100),lastKnownZ:clamp(e.lastKnownZ??e.z,-100,100),lastKnownAt:clamp(e.lastKnownAt??e.createdAt,0,Number.MAX_SAFE_INTEGER),investigateUntil:clamp(e.investigateUntil??0,0,Number.MAX_SAFE_INTEGER),packPlan:planHorde({event:e.event,risk:e.risk,seed:e.id}),members:(Array.isArray(e.members)&&e.members.length?e.members:planHorde({event:e.event,risk:e.risk,seed:e.id}).members.map(m=>({...m,x:e.x+m.offsetX,z:e.z+m.offsetZ,hp:Math.max(1,Math.round(e.maxHp*m.healthScale/Math.max(1,planHorde({event:e.event,risk:e.risk,seed:e.id}).count))),maxHp:Math.max(1,Math.round(e.maxHp*m.healthScale/Math.max(1,planHorde({event:e.event,risk:e.risk,seed:e.id}).count))),defeated:false,lastAttackAt:0}))).map(m=>({id:String(m.id).slice(0,80),slot:clamp(m.slot??0,0,10),role:String(m.role||'stalker').slice(0,20),offsetX:clamp(m.offsetX??0,-20,20),offsetZ:clamp(m.offsetZ??0,-20,20),healthScale:clamp(m.healthScale??1,0.5,2),speedScale:clamp(m.speedScale??1,0.5,1.5),x:clamp(m.x??e.x,-100,100),z:clamp(m.z??e.z,-100,100),hp:clamp(m.hp,0,10000),maxHp:clamp(m.maxHp,1,10000),defeated:!!m.defeated,lastAttackAt:clamp(m.lastAttackAt??0,0,Number.MAX_SAFE_INTEGER)})),createdAt:clamp(e.createdAt,0,Number.MAX_SAFE_INTEGER),lastAttackAt:clamp(e.lastAttackAt,0,Number.MAX_SAFE_INTEGER),lastAiAt:clamp(e.lastAiAt??e.createdAt,0,Number.MAX_SAFE_INTEGER),expiresAt:e.expiresAt,defeated:!!e.defeated};}
 for (const [owner, encounter] of Object.entries(out)) {
  const patrol = PINE_PATROLS.find(site => site.id === input[owner].patrolId);
  if (patrol) {
   encounter.patrolId = patrol.id;
   encounter.patrolIndex = Math.floor(clamp(input[owner].patrolIndex, 0, patrol.points.length - 1));
   encounter.lastMeleeAt = clamp(input[owner].lastMeleeAt, 0, Number.MAX_SAFE_INTEGER);
  }
 }
 return out;
}
function retainEncounter(encounter, account, player, players, now) {
 if (!encounter || encounter.defeated || encounter.hp <= 0 || encounter.expiresAt <= now) return false;
 const distanceTo = other => Math.hypot(other.x - encounter.x, other.z - encounter.z);
 if (distanceTo(player) <= Math.max(36, encounter.pursuitRadius + 12)) return true;
 return !!encounter.patrolId && !!player.partyCode && Object.entries(players).some(([id, other]) =>
  id !== account && other.partyCode === player.partyCode && now - other.lastSeen <= 45000 && distanceTo(other) <= 30);
}
function spawn({ encounters, account, player, players = {}, interiors = null, now = Date.now(), seed = 0, plan = null }) {
 const clean = normalizeEncounters(encounters, now), old = clean[account];
 if (retainEncounter(old, account, player, players, now)) return { encounters: clean, encounter: publicEncounter(old), reused: true };
 const shared = nearbyPartyPatrols(clean, account, players, now)[0];
 if (shared) return { encounters: clean, encounter: publicEncounter(shared), reused: true };
 const depth = 100 - Math.hypot(player.x, player.z);
 const risk = plan?.risk ?? (depth < 45 ? 1 : depth < 62 ? 2 : depth < 76 ? 3 : depth < 88 ? 4 : 5);
 const district = plan?.zoneId ?? (risk >= 5 ? 'research_lab' : risk >= 4 ? 'industrial' : risk >= 3 ? 'commercial' : risk === 2 ? 'residential' : 'outskirts');
 const collisionOptions = interiorCollisionOptions(interiors, account);
 const pine = inPineCrossing(player.x, player.z, 4);
 let patrol = null;
 if (pine) {
  const occupied = new Set(Object.values(clean).filter(e => !e.defeated && e.hp > 0).map(e => e.patrolId));
  const nearby = [player, ...Object.values(players).filter(other => other !== player)];
  let nearest = 30;
  for (const site of PINE_PATROLS) {
   const [x, z] = site.points[0];
   const distance = Math.hypot(player.x - x, player.z - z);
   if (occupied.has(site.id) || distance > nearest ||
       nearby.some(other => Math.hypot(other.x - x, other.z - z) < 11) ||
       !Collision.isSafePosition(x, z, { removedObstacleIds: collisionOptions.removedObstacleIds })) continue;
   patrol = site;
   nearest = distance;
  }
  if (!patrol) return { encounters: clean, encounter: null, reused: false };
 }
 const origin = patrol ? { x: patrol.points[0][0], z: patrol.points[0][1] } : player;
 const e = resolveSpawn({ account, ...origin, district, risk, now, seed, plan });
 const safe = patrol ? origin : safeEnemyPosition(e.x, e.z, player.x, player.z, 100, collisionOptions.removedObstacleIds);
 if (patrol) {
  e.patrolId = patrol.id;
  e.patrolIndex = 1;
  e.pursuitRadius = 12 + (risk - 1) * 2;
  e.lastKnownAt = 0;
 }
 e.x = safe.x; e.z = safe.z;
 for (const member of e.members) {
  const x = clamp(safe.x + member.offsetX, -100, 100);
  const z = clamp(safe.z + member.offsetZ, -100, 100);
  const clear = Collision.canTraverse(safe.x, safe.z, x, z, collisionOptions) &&
    (!patrol || Math.hypot(x - player.x, z - player.z) >= 9);
  member.x = clear ? x : safe.x;
  member.z = clear ? z : safe.z;
 }
 e.hp = e.members.reduce((sum, m) => sum + m.hp, 0);
 e.maxHp = e.members.reduce((sum, m) => sum + m.maxHp, 0);
 clean[account] = e;
 return { encounters: clean, encounter: publicEncounter(e), reused: false };
}

function advanceAlongTerrainPath(startX, startZ, path, distanceBudget) {
 let x=startX,z=startZ,remaining=distanceBudget;
 for(const waypoint of path){
  const dx=waypoint.x-x,dz=waypoint.z-z,distance=Math.hypot(dx,dz);
  if(distance<0.001)continue;
  if(distance<=remaining){x=waypoint.x;z=waypoint.z;remaining-=distance;if(remaining<0.001)break;}
  else{x+=dx/distance*remaining;z+=dz/distance*remaining;break;}
 }
 return{x:Math.round(x*10)/10,z:Math.round(z*10)/10};
}
function interiorCollisionOptions(interiors, account, sharedInteriors, destroyedObstacles = []) {
 const owner = interiors?.[account], landmarkId = owner?.activeLandmarkId || null;
 const state = landmarkId ? owner.interiors?.[landmarkId] : null;
 const openedDoors = InteriorRules.sharedOpenedDoors(sharedInteriors, landmarkId, state?.openedDoors);
 const interiorIds = Collision.interiorRemovedIds(landmarkId, openedDoors);
 const removedObstacleIds = destroyedObstacles.length ? [...interiorIds, ...destroyedObstacles] : interiorIds;
 return { removedObstacleIds, landmarkId, state, openedDoors };
}
function meleeContact({ encounter, player, account, interiors, sharedInteriors, destroyedObstacles, now }) {
 const victim = player?.survival;
 if (!victim || victim.health <= 0 || !encounter || encounter.defeated ||
     encounter.hp <= 0 || encounter.expiresAt <= now) return null;
 if (encounter.patrolId && encounter.lastMeleeAt > 0 &&
     now - encounter.lastMeleeAt < ZOMBIE_IFRAME_SECONDS * 1000) return null;
 const lastHitAt = player.infectedHit?.at;
 if (Number.isFinite(lastHitAt) && now - lastHitAt < ZOMBIE_IFRAME_SECONDS * 1000) return null;

 const { removedObstacleIds, landmarkId, state } = interiorCollisionOptions(interiors, account, sharedInteriors, destroyedObstacles);
 const landmark = InteriorRules.LANDMARKS[landmarkId];
 const room = InteriorCatalog.interiorRoom(InteriorCatalog.interiorForLandmark(landmarkId), state?.roomId);
 const victimY = room && landmark
  ? Terrain.terrainElevation(landmark.x, landmark.z) + (room.elevation || 0)
  : Terrain.terrainElevation(player.x, player.z);
 let closest = null, reach = ZOMBIE_MELEE_REACH;
 for (const member of encounter.members || []) {
  if (member.defeated || member.hp <= 0) continue;
  const distance = Math.hypot(member.x - player.x, member.z - player.z);
  if (distance > reach || Math.abs(Terrain.terrainElevation(member.x, member.z) - victimY) >= ZOMBIE_MELEE_HEIGHT) continue;
  if (!Collision.canTraverse(member.x, member.z, player.x, player.z, { radius: 0.1, sampleStep: 0.15, removedObstacleIds }) ||
      !Terrain.canTraverse(member.x, member.z, player.x, player.z)) continue;
  closest = member;
  reach = distance;
 }
 if (!closest) return null;
 return {
  at: now, encounterId: encounter.id, sourceId: closest.id, enemy: encounter.enemy,
  x: closest.x, z: closest.z, damage: Math.min(victim.health, encounter.damage)
 };
}
function attemptInteriorBreach({ account, enemy, player, interiors, now, elapsed, collisionOptions, speed }) {
 const { landmarkId, state, openedDoors } = collisionOptions;
 if (!landmarkId || !state || !interiors) return false;
 const catalog = InteriorCatalog.interiorForLandmark(landmarkId), landmark = InteriorRules.LANDMARKS[landmarkId];
 if (!catalog || !landmark) return false;
 const opened = new Set(openedDoors), candidates = [];
 const secureDoorIds = new Set(catalog.rooms.flatMap(room => room.exits.filter(exit => exit.requires?.length).map(exit => exit.id)));
 for (const room of catalog.rooms) for (const exit of room.exits) {
  if (opened.has(exit.id) || secureDoorIds.has(exit.id)) continue;
  const x = landmark.x + room.x + (exit.side === 'east' ? room.width / 2 : exit.side === 'west' ? -room.width / 2 : 0);
  const z = landmark.z + room.z + (exit.side === 'south' ? room.depth / 2 : exit.side === 'north' ? -room.depth / 2 : 0);
  const ax = landmark.x + room.x + (exit.side === 'east' ? room.width / 2 - 0.85 : exit.side === 'west' ? -room.width / 2 + 0.85 : 0);
  const az = landmark.z + room.z + (exit.side === 'south' ? room.depth / 2 - 0.85 : exit.side === 'north' ? -room.depth / 2 + 0.85 : 0);
  const enemyDistance = Math.hypot(enemy.x - ax, enemy.z - az);
  const playerDistance = Math.hypot(player.x - x, player.z - z);
  if (enemyDistance > 14 || playerDistance > 24) continue;
  const route = Collision.findPath(enemy.x, enemy.z, ax, az, { bounds: 100, maxExpanded: 1800, radius: 0.45, removedObstacleIds: collisionOptions.removedObstacleIds });
  if (!route || !route.length) continue;
  candidates.push({ room, exit, x, z, ax, az, route, enemyDistance, score: enemyDistance + playerDistance * 0.45 });
 }
 candidates.sort((a,b) => a.score - b.score);
 const chosen = candidates[0];
 if (!chosen) return false;
 const distance = Math.hypot(chosen.ax - enemy.x, chosen.az - enemy.z);
 if (distance <= 1.25) {
  try {
   const result = InteriorRules.breachDoor(interiors, { account, landmarkId, doorId: chosen.exit.id, damage: elapsed * 30, now });
   for (const key of Object.keys(interiors)) delete interiors[key];
   Object.assign(interiors, result.state);
   return true;
  } catch { return false; }
 }
 const step = Math.min(distance, speed * elapsed);
 const next = advanceAlongTerrainPath(enemy.x, enemy.z, chosen.route, step);
 if (Terrain.canTraverse(enemy.x, enemy.z, next.x, next.z) &&
     Collision.canTraverse(enemy.x, enemy.z, next.x, next.z, { radius: 0.45, bounds: 100, removedObstacleIds: collisionOptions.removedObstacleIds })) {
  enemy.x = next.x; enemy.z = next.z; return true;
 }
 return false;
}
function audibleThreat(enemy, player, now) {
 const age = now - player.lastNoiseAt;
 if (!Number.isFinite(age) || age < 0 || age > 15000 ||
     !Number.isFinite(player.noiseX) || !Number.isFinite(player.noiseZ)) return -Infinity;
 const level = Math.max(0, clamp(player.noiseLevel, 0, 100) - (enemy.patrolId ? age / 120 : 0));
 const distance = Math.hypot(enemy.x - player.noiseX, enemy.z - player.noiseZ);
 return level > 0 && distance <= 8 + level * 0.45 ? level - distance : -Infinity;
}
function advance({encounters,players,interiors=null,sharedInteriors,destroyedObstacles,now=Date.now(),speed=2.8,maxElapsed=2.5}){
 const clean=normalizeEncounters(encounters,now);
 for(const [account,e] of Object.entries(clean)){
  if(e.defeated||e.hp<=0)continue;
  const owner = players?.[account];
  if (!owner || !Number.isFinite(owner.x) || !Number.isFinite(owner.z)) { e.lastAiAt = now; continue; }
  const elapsed = clamp((now - e.lastAiAt) / 1000, 0, maxElapsed);
  e.lastAiAt = now;
  if (elapsed <= 0) continue;

  const candidates = [[account, owner]];
  if (e.patrolId && owner.partyCode) {
   for (const [otherAccount, other] of Object.entries(players)) {
    if (otherAccount !== account && other.partyCode === owner.partyCode && other.survival?.health !== 0) {
     candidates.push([otherAccount, other]);
    }
   }
  }
  let seen = null, heard = null, closest = e.pursuitRadius, loudest = -Infinity;
  for (const [id, candidate] of candidates) {
   const distance = Math.hypot(candidate.x - e.x, candidate.z - e.z);
   const tracked = e.lastKnownAt > 0 && !e.investigateUntil && now - e.lastKnownAt < 2200 &&
    Math.hypot(candidate.x - e.lastKnownX, candidate.z - e.lastKnownZ) <= 3;
   const sightRadius = e.patrolId && candidate.crouched && !tracked ? e.pursuitRadius * 0.56 : e.pursuitRadius;
   if (distance <= closest && distance <= sightRadius) {
    const options = interiorCollisionOptions(interiors, id, sharedInteriors, destroyedObstacles);
    if (Collision.canTraverse(e.x, e.z, candidate.x, candidate.z, { ...options, radius: 0.45 })) {
     seen = [id, candidate];
     closest = distance;
    }
   }
   const sound = audibleThreat(e, candidate, now);
   if (sound > loudest) { heard = [id, candidate]; loudest = sound; }
  }
  const [targetAccount, player] = seen || heard || candidates[0];
  const collisionOptions = interiorCollisionOptions(interiors, targetAccount, sharedInteriors, destroyedObstacles);
  const stopDistance = ZOMBIE_MELEE_REACH - 0.1;
  if (seen) {
   e.lastKnownX = player.x; e.lastKnownZ = player.z; e.lastKnownAt = now;
   e.investigateUntil = 0;
  } else if (heard) {
   e.lastKnownX = clamp(player.noiseX, -100, 100); e.lastKnownZ = clamp(player.noiseZ, -100, 100);
   e.lastKnownAt = player.lastNoiseAt;
   e.investigateUntil = player.lastNoiseAt + (e.patrolId && player.noiseLevel < 40 ? 4500 : 15000);
  }
  const patrol = PINE_PATROLS.find(site => site.id === e.patrolId);
  const patrolling = patrol && !seen && !heard &&
    now >= e.investigateUntil && (!e.lastKnownAt || now - e.lastKnownAt >= 6500);
  if (patrolling && Math.hypot(e.x - patrol.points[e.patrolIndex][0], e.z - patrol.points[e.patrolIndex][1]) < 0.65) {
   e.patrolIndex = (e.patrolIndex + 1) % patrol.points.length;
  }
  const targetX = patrolling ? patrol.points[e.patrolIndex][0] : e.lastKnownX;
  const targetZ = patrolling ? patrol.points[e.patrolIndex][1] : e.lastKnownZ;
  const stop = patrolling ? 0.2 : stopDistance;
  const moveSpeed = patrolling ? speed * 0.48 : speed;
  const targetDx=targetX-e.x,targetDz=targetZ-e.z,targetDistance=Math.hypot(targetDx,targetDz);
  if(targetDistance>stop){
  const step=Math.min(targetDistance-stop,moveSpeed*elapsed);
  const nextX=clamp(e.x+targetDx/targetDistance*step,-100,100),nextZ=clamp(e.z+targetDz/targetDistance*step,-100,100);
  // Prefer the direct step; only invoke bounded A* when terrain blocks the pursuit line.
  if(Terrain.canTraverse(e.x,e.z,nextX,nextZ)&&Collision.canTraverse(e.x,e.z,nextX,nextZ,{radius:0.45,bounds:100,removedObstacleIds:collisionOptions.removedObstacleIds})){e.x=nextX;e.z=nextZ;}
  else {
   const route=Collision.findPath(e.x,e.z,targetX,targetZ,{bounds:100,maxExpanded:2600,radius:0.45,removedObstacleIds:collisionOptions.removedObstacleIds});
   const handledByDoor = collisionOptions.landmarkId && attemptInteriorBreach({ account: targetAccount, enemy: e, player, interiors, now, elapsed, collisionOptions, speed });
   if(!handledByDoor && route&&route.length){
    const advanced=advanceAlongTerrainPath(e.x,e.z,route,step);
    if(Terrain.canTraverse(e.x,e.z,advanced.x,advanced.z)&&Collision.canTraverse(e.x,e.z,advanced.x,advanced.z,{radius:0.45,bounds:100,removedObstacleIds:collisionOptions.removedObstacleIds})){e.x=advanced.x;e.z=advanced.z;}
   }
  }
  }
  // Squad members follow the pathfinding anchor in formation. Only the anchor runs bounded A*,
  // so cost stays one route per encounter; members take direct steps toward their slot and
  // regroup onto the anchor's (traversable) position when terrain blocks them far behind.
  const living = (e.members || []).filter(m => !m.defeated && m.hp > 0);
  living.forEach((member, i) => {
   if (i === 0) { member.x = e.x; member.z = e.z; return; }
   // Spread nearby attackers across the pursuit line instead of stacking on the anchor.
   // Slots remain server-owned and collision-checked; no direct damage changes.
   const closeToTarget = !patrolling && Math.hypot(player.x - e.x, player.z - e.z) < 8;
   const facingX = player.x - e.x, facingZ = player.z - e.z;
   const facingLength = Math.max(0.001, Math.hypot(facingX, facingZ));
   const flank = closeToTarget ? (i % 2 ? 1 : -1) * (1.2 + Math.floor((i - 1) / 2) * 0.75) : 0;
   const slotX = clamp(e.x + (member.offsetX || 0) - facingZ / facingLength * flank, -100, 100);
   const slotZ = clamp(e.z + (member.offsetZ || 0) + facingX / facingLength * flank, -100, 100);
   const mdx = slotX - member.x, mdz = slotZ - member.z, md = Math.hypot(mdx, mdz);
   if (md <= 0.3) return;
   const memberStep = Math.min(md, speed * elapsed * (member.speedScale || 1));
   const mx = clamp(member.x + mdx / md * memberStep, -100, 100), mz = clamp(member.z + mdz / md * memberStep, -100, 100);
   const memberCollisionOptions = { radius: 0.4, bounds: 100, removedObstacleIds: collisionOptions.removedObstacleIds };
   if (Terrain.canTraverse(member.x, member.z, mx, mz) && Collision.canTraverse(member.x, member.z, mx, mz, memberCollisionOptions)) {
    member.x = mx; member.z = mz;
   } else if (md > 0.3) {
    // Followers must not teleport through a closed interior door or solid exterior obstacle.
    // Replan only when their direct formation step is blocked; keep the search bounded.
    const route = Collision.findPath(member.x, member.z, slotX, slotZ, {
     bounds: 100, maxExpanded: 900, radius: 0.4, removedObstacleIds: collisionOptions.removedObstacleIds
    });
    if (route && route.length) {
     const advanced = advanceAlongTerrainPath(member.x, member.z, route, memberStep);
     if (Terrain.canTraverse(member.x, member.z, advanced.x, advanced.z) &&
         Collision.canTraverse(member.x, member.z, advanced.x, advanced.z, memberCollisionOptions)) {
      member.x = advanced.x; member.z = advanced.z;
     }
    }
   }
  });
  e.hp = (e.members || []).reduce((sum,m)=>sum+(m.defeated?0:m.hp),0);
  e.maxHp = (e.members || []).reduce((sum,m)=>sum+m.maxHp,0);
 }
 return clean;
}
function attack({encounters,account,player,players={},interiors,sharedInteriors,destroyedObstacles,base,survival=null,now=Date.now(),weaponPower=1,seed=0,targetId=null,aimPoint=null,aimTrainingBonus=0,miss=false}){
 const clean = normalizeEncounters(encounters, now);
 const matches = encounter => encounter && (encounter.id === targetId || encounter.members.some(m => m.id === targetId && !m.defeated && m.hp > 0));
 const shared = nearbyPartyPatrols(clean, account, players, now);
 const own = clean[account];
 const e = targetId == null ? (own && !own.defeated && own.hp > 0 ? own : shared[0] || own)
  : [own, ...shared].find(matches);
 if (targetId != null && (typeof targetId !== 'string' || !e)) throw Error('target_mismatch');
 if (!miss && (!e || e.defeated || e.hp <= 0)) throw Error('no_active_encounter');
 const living = (e?.members || []).filter(m => !m.defeated && m.hp > 0);
 let target=targetId&&targetId!==e.id?living.find(m=>m.id===targetId):null;
 if(!target&&aimPoint&&living.length)target=living.reduce((best,m)=>!best||Math.hypot(m.x-aimPoint.x,m.z-aimPoint.z)<Math.hypot(best.x-aimPoint.x,best.z-aimPoint.z)?m:best,null);
 if(!target)target=living[0]||e;
 let aimedZone=null;
 if(aimPoint!=null&&(!aimPoint||![aimPoint.x,aimPoint.y,aimPoint.z].every(Number.isFinite)||Math.hypot(aimPoint.x-target.x,aimPoint.z-target.z)>1.75||aimPoint.y<0.05||aimPoint.y>2.7))throw Error('invalid_aim_point');
 if(!miss&&Math.hypot(player.x-target.x,player.z-target.z)>e.range)throw Error('enemy_out_of_range');
 const cover = e?.patrolId ? interiorCollisionOptions(interiors, account, sharedInteriors, destroyedObstacles) : null;
 const clearShot = member => !cover || Collision.canTraverse(player.x, player.z, member.x, member.z, { ...cover, radius: 0.1, sampleStep: 0.2 });
 if (!miss && !clearShot(target)) throw Error('infected_behind_cover');
 const weaponId=typeof base.equippedWeapon==='string'&&Object.prototype.hasOwnProperty.call(WEAPON_FIRE_INTERVAL,base.equippedWeapon)&&(!Array.isArray(base.weapons)||base.weapons.includes(base.equippedWeapon))?base.equippedWeapon:'pipe_blade';
 const tier=Firearms.isFirearmTier(weaponId)?Firearms.FIREARM_TIERS[weaponId]:null;
 if(tier){const u=Firearms.unlockStatus(base,weaponId);if(!u.unlocked)throw Error('weapon_locked');}
 const handling=WEAPON_HANDLING[weaponId]||WEAPON_HANDLING.pipe_blade;
 const aimElapsed=player.aiming===true&&Number.isFinite(player.aimStartedAt)?Math.max(0,now-player.aimStartedAt):0;
 const recoveryRemaining=Number.isFinite(player.accuracyRecoverUntil)?Math.max(0,player.accuracyRecoverUntil-now):0;
 const recoveryPenalty=clamp(recoveryRemaining/handling.recoveryMs,0,1)*0.55;
 const adsProgress=clamp(aimElapsed/handling.adsMs,0,1);
 const aimStability=clamp(1-recoveryPenalty+(player.aiming===true?adsProgress*0.18:0)+clamp(aimTrainingBonus,0,0.063),0,1);
 const aimed=aimPoint!=null&&player.aiming===true&&aimElapsed>=handling.adsMs&&aimStability>=0.68;
 if(aimed)aimedZone=aimPoint.y>=1.88?'head':aimPoint.y<=0.68?'limb':'torso';
 const fireInterval=WEAPON_FIRE_INTERVAL[weaponId]||ATTACK_COOLDOWN;
 // A patrol is shared. One teammate's fire cannot consume another's cooldown.
 const previousShotAt = Math.max(e?.patrolId ? 0 : e?.lastAttackAt || 0, player.lastWeaponFireAt || 0);
 if (now - previousShotAt < Math.max(ATTACK_COOLDOWN, fireInterval)) throw Error('attack_cooldown');
 // Automatic tiers fire a short server-resolved burst per request; the server decides how many rounds leave the magazine.
 const loadedAmmo=Math.max(0,Math.floor(base.resources?.ammo||0));
 const rounds=tier?Math.min(tier.rounds,loadedAmmo):1;
 const ammoCost=WEAPON_MAGAZINE_CAPACITY[weaponId]>0?Math.max(1,rounds):0;
 if(loadedAmmo<ammoCost)throw Error('insufficient_ammo');base.resources.ammo-=ammoCost;base.revision=(Number.isSafeInteger(base.revision)?base.revision:0)+1;
 if(miss)return {encounters:clean,encounter:e?publicEncounter(e):null,missed:true,killed:false,damage:0,hits:[],rounds:ammoCost,aimed:false,aimStability,adsProgress,enemyDamage:0,ammoCost,reward:null,base,survival};
 const power=clamp(Math.floor(weaponPower),1,20);const field=survival&&typeof survival==='object'?{...survival}:null;const staminaBefore=field?clamp(field.stamina,0,100):100;const fatigueScale=staminaBefore<15?0.55:staminaBefore<35?0.75:1;
 // Hit zones are rolled on the server from encounter and attack clock; clients cannot submit a headshot claim.
 const zoneRoll=hash(target.id+':'+now+':'+seed)%100;
 const hitZone=aimedZone || (zoneRoll < 8 + Math.floor(aimStability*4) ? 'head' : zoneRoll < 30 + Math.floor(aimStability*8) ? 'limb' : 'torso');
 const zoneMultiplier=hitZone==='head'?1.8:hitZone==='limb'?0.75:1;
 const accuracyScale=aimed?1:0.72+aimStability*0.28;
 const baseDamage=Math.max(8,12+(power-1)*7+Math.floor(e.risk*1.5))*fatigueScale*accuracyScale;const hits=[];let damage=0,current=target;for(let r=0;r<(tier?rounds:1);r++){if(!current||current.defeated||current.hp<=0){const anchor=current||target;let next=null,best=Infinity;for(const m of living){if(m.defeated||m.hp<=0)continue;const d=Math.hypot(m.x-anchor.x,m.z-anchor.z);if(d<=(tier?tier.spread:0)&&d<best&&Math.hypot(player.x-m.x,player.z-m.z)<=e.range&&clearShot(m)){best=d;next=m;}}if(!next)break;current=next;}const roll=r===0?zoneRoll:hash(current.id+':'+now+':'+seed+':'+r)%100;const zone=r===0?hitZone:(roll<6?'head':roll<30?'limb':'torso');const mult=zone==='head'?1.8:zone==='limb'?0.75:1;const roundDamage=Math.max(5,Math.floor(baseDamage*mult*(tier?Math.pow(tier.falloff,r):1)));const before=current.hp;current.hp=Math.max(0,current.hp-roundDamage);current.lastAttackAt=now;damage+=before-current.hp;let killedMember=false;if(current.hp===0&&current!==e){const wasAnchor=living.find(m=>!m.defeated&&m.hp>0||m===current)===current;current.defeated=true;killedMember=true;const nextLead=living.find(m=>!m.defeated&&m.hp>0);if(wasAnchor&&nextLead){e.x=nextLead.x;e.z=nextLead.z;}}hits.push({targetId:current.id,damage:before-current.hp,hitZone:zone,killed:killedMember});if(current===e)break;}if(field)field.stamina=clamp(staminaBefore-8,0,100);e.hp=(e.members||[]).reduce((sum,m)=>sum+(m.defeated?0:m.hp),0);e.maxHp=(e.members||[]).reduce((sum,m)=>sum+m.maxHp,0);e.lastAttackAt=now;
 if(e.hp===0){e.defeated=true;const q=hash(e.id+':'+seed)%100,bonus=(e.risk-1)*3,quality=q<2?'Legendary':q<8?'Epic':q<22+bonus?'Rare':q<48+bonus?'Uncommon':'Common',qi=QUALITY_ORDER.indexOf(quality),scrap=2+e.risk+qi*2,embers=e.risk+qi;
 base.resources.scrap=Math.min(999999,(base.resources.scrap||0)+scrap);base.embers=Math.min(999999999,(base.embers||0)+embers);
 if(Array.isArray(base.log)){base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'combat',at:now,text:'Cleared '+e.enemy+' squad and recovered '+quality.toLowerCase()+'-grade salvage: +'+scrap+' scrap and +'+embers+' Embers.'});base.log=base.log.slice(-20);}
 return{encounters:clean,encounter:publicEncounter(e),killed:true,damage,hitZone,hitTargetId:target.id,hits,rounds:ammoCost||hits.length,aimed,aimStability,adsProgress,enemyDamage:0,ammoCost,reward:{quality,scrap,embers},base,survival:field};}
 if(Array.isArray(base.log)){base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'combat',at:now,text:'Hit '+target.role+' in '+e.enemy+' squad for '+damage+' damage.'});base.log=base.log.slice(-20);}
 return{encounters:clean,encounter:publicEncounter(e),killed:false,damage,hitZone,hitTargetId:target.id,hits,rounds:ammoCost||hits.length,aimed,aimStability,adsProgress,enemyDamage:0,ammoCost,reward:null,base,survival:field};
}
module.exports={ENCOUNTER_TTL,ATTACK_COOLDOWN,WEAPON_FIRE_INTERVAL,WEAPON_MAGAZINE_CAPACITY,WEAPON_HANDLING,STATS,normalizeEncounters,resolveSpawn,publicEncounter,nearbyPartyPatrols,retainEncounter,spawn,advance,meleeContact,attack};
