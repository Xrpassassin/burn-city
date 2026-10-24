'use strict';
// Authoritative, renderer-independent combat for Homefront's shared Graveyard.
const { ARCHETYPES, QUALITY_ORDER, planEncounter, planHorde } = require('./homefront-director');
const Terrain = require('./homefront-terrain');
const Collision = require('./homefront-collision');
const InteriorRules = require('./homefront-interiors');
const InteriorCatalog = require('../client/arena/homefront-interior-world.mjs');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const ENCOUNTER_TTL=180000, ATTACK_COOLDOWN=900;
// Server-owned cadence keyed to the equipped weapon validated in the saved refuge.
// These minimum intervals also constrain callers that bypass the client autofire loop.
const WEAPON_FIRE_INTERVAL=Object.freeze({pipe_blade:900,pump_shotgun:1150,marksman_rifle:1350,shock_maul:950});
const WEAPON_MAGAZINE_CAPACITY=Object.freeze({pipe_blade:0,pump_shotgun:6,marksman_rifle:5,shock_maul:0});
const WEAPON_HANDLING=Object.freeze({pipe_blade:{adsMs:140,recoveryMs:450,aimMoveScale:0.62},pump_shotgun:{adsMs:280,recoveryMs:720,aimMoveScale:0.52},marksman_rifle:{adsMs:520,recoveryMs:1150,aimMoveScale:0.42},shock_maul:{adsMs:220,recoveryMs:560,aimMoveScale:0.56}});
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
function resolveSpawn({account,x,z,district,risk=1,now=Date.now(),seed=0}){
 risk=clamp(Math.floor(risk),1,5);
 const directorPlan=planEncounter({zoneId:district,risk,playerCount:1,activeEncounters:0,noise:0,seed:account+':'+Math.floor(x)+':'+Math.floor(z)+':'+Math.floor(now/30000)+':'+seed});
 const event=directorPlan.event,s=STATS[event],id='enc-'+hash(account+':'+now+':'+x+':'+z).toString(36);
 return {id,owner:account,event,enemy:directorPlan.enemy,directorPlan,packPlan:planHorde({event,risk,seed:id}),members:planHorde({event,risk,seed:id}).members.map(m=>({...m,x:clamp(x+m.offsetX,-100,100),z:clamp(z+m.offsetZ,-100,100),hp:Math.max(1,Math.round((s.hp+risk*7)*m.healthScale/Math.max(1,planHorde({event,risk,seed:id}).count))),maxHp:Math.max(1,Math.round((s.hp+risk*7)*m.healthScale/Math.max(1,planHorde({event,risk,seed:id}).count))),defeated:false,lastAttackAt:0})),district,x:clamp(x+(hash(id+':x')%13-6),-100,100),z:clamp(z+(hash(id+':z')%13-6),-100,100),hp:s.hp+risk*7,maxHp:s.hp+risk*7,damage:s.damage+Math.max(0,risk-1),ammoCost:s.ammo,range:s.range,risk,pursuitRadius:directorPlan.pursuitRadius,lastKnownX:x,lastKnownZ:z,lastKnownAt:now,investigateUntil:0,createdAt:now,lastAttackAt:0,lastAiAt:now,expiresAt:now+ENCOUNTER_TTL,defeated:false};
}
function publicEncounter(e){return e?{id:e.id,event:e.event,enemy:e.enemy,district:e.district,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,risk:e.risk,range:e.range,expiresAt:e.expiresAt,defeated:!!e.defeated,packPlan:e.packPlan||planHorde({event:e.event,risk:e.risk,seed:e.id}),members:(e.members||[]).map(m=>({id:m.id,role:m.role,x:m.x,z:m.z,hp:m.hp,maxHp:m.maxHp,defeated:!!m.defeated}))}:null;}
function normalizeEncounters(input,now=Date.now()){
 const out={};if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [owner,e] of Object.entries(input)){if(!e||typeof e!=='object'||typeof e.id!=='string'||!STATS[e.event]||!Number.isFinite(e.expiresAt)||e.expiresAt<=now)continue;
 out[owner]={id:e.id.slice(0,80),owner,event:e.event,enemy:String(e.enemy||'Stray Runner').slice(0,80),district:String(e.district||'outskirts').slice(0,40),x:clamp(e.x,-100,100),z:clamp(e.z,-100,100),hp:clamp(e.hp,0,10000),maxHp:clamp(e.maxHp,1,10000),damage:clamp(e.damage,1,50),ammoCost:clamp(e.ammoCost,1,5),range:clamp(e.range,1,40),risk:clamp(e.risk,1,5),pursuitRadius:clamp(e.pursuitRadius??26,8,60),lastKnownX:clamp(e.lastKnownX??e.x,-100,100),lastKnownZ:clamp(e.lastKnownZ??e.z,-100,100),lastKnownAt:clamp(e.lastKnownAt??e.createdAt,0,Number.MAX_SAFE_INTEGER),investigateUntil:clamp(e.investigateUntil??0,0,Number.MAX_SAFE_INTEGER),packPlan:planHorde({event:e.event,risk:e.risk,seed:e.id}),members:(Array.isArray(e.members)&&e.members.length?e.members:planHorde({event:e.event,risk:e.risk,seed:e.id}).members.map(m=>({...m,x:e.x+m.offsetX,z:e.z+m.offsetZ,hp:Math.max(1,Math.round(e.maxHp*m.healthScale/Math.max(1,planHorde({event:e.event,risk:e.risk,seed:e.id}).count))),maxHp:Math.max(1,Math.round(e.maxHp*m.healthScale/Math.max(1,planHorde({event:e.event,risk:e.risk,seed:e.id}).count))),defeated:false,lastAttackAt:0}))).map(m=>({id:String(m.id).slice(0,80),slot:clamp(m.slot??0,0,10),role:String(m.role||'stalker').slice(0,20),offsetX:clamp(m.offsetX??0,-20,20),offsetZ:clamp(m.offsetZ??0,-20,20),healthScale:clamp(m.healthScale??1,0.5,2),speedScale:clamp(m.speedScale??1,0.5,1.5),x:clamp(m.x??e.x,-100,100),z:clamp(m.z??e.z,-100,100),hp:clamp(m.hp,0,10000),maxHp:clamp(m.maxHp,1,10000),defeated:!!m.defeated,lastAttackAt:clamp(m.lastAttackAt??0,0,Number.MAX_SAFE_INTEGER)})),createdAt:clamp(e.createdAt,0,Number.MAX_SAFE_INTEGER),lastAttackAt:clamp(e.lastAttackAt,0,Number.MAX_SAFE_INTEGER),lastAiAt:clamp(e.lastAiAt??e.createdAt,0,Number.MAX_SAFE_INTEGER),expiresAt:e.expiresAt,defeated:!!e.defeated};}
 return out;
}
function spawn({encounters,account,player,interiors=null,now=Date.now(),seed=0}){
 const clean=normalizeEncounters(encounters,now),old=clean[account];if(old&&!old.defeated&&old.hp>0)return{encounters:clean,encounter:publicEncounter(old),reused:true};
 const depth=100-Math.hypot(player.x,player.z),risk=depth<25?1:depth<45?1:depth<62?2:depth<76?3:depth<88?4:5,district=risk>=5?'research_lab':risk>=4?'industrial':risk>=3?'commercial':risk===2?'residential':'outskirts';
 const e=resolveSpawn({account,x:player.x,z:player.z,district,risk,now,seed});e.hp=e.members.reduce((sum,m)=>sum+m.hp,0);e.maxHp=e.members.reduce((sum,m)=>sum+m.maxHp,0);const collisionOptions=interiorCollisionOptions(interiors,account);const safe=safeEnemyPosition(e.x,e.z,player.x,player.z,100,collisionOptions.removedObstacleIds);const shiftX=safe.x-e.x,shiftZ=safe.z-e.z;e.x=safe.x;e.z=safe.z;for(const m of e.members){m.x=clamp(m.x+shiftX,-100,100);m.z=clamp(m.z+shiftZ,-100,100);}clean[account]=e;return{encounters:clean,encounter:publicEncounter(e),reused:false};
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
function interiorCollisionOptions(interiors, account) {
 const owner = interiors?.[account], landmarkId = owner?.activeLandmarkId || null;
 const state = landmarkId ? owner.interiors?.[landmarkId] : null;
 const removedObstacleIds = Collision.INTERIOR_OBSTACLE_IDS.filter(id =>
  !landmarkId || id.split(':')[1] !== landmarkId ||
  (id.startsWith('interior-door:') && state?.openedDoors?.includes(id.split(':')[2])));
 return { removedObstacleIds, landmarkId, state };
}
function attemptInteriorBreach({ account, enemy, player, interiors, now, elapsed, collisionOptions, speed }) {
 const { landmarkId, state } = collisionOptions;
 if (!landmarkId || !state || !interiors) return false;
 const catalog = InteriorCatalog.interiorForLandmark(landmarkId), landmark = InteriorRules.LANDMARKS[landmarkId];
 if (!catalog || !landmark) return false;
 const opened = new Set(state.openedDoors || []), candidates = [];
 const seen = new Set();
 for (const room of catalog.rooms) for (const exit of room.exits) {
  if (seen.has(exit.id) || opened.has(exit.id) || exit.requires?.length) continue;
  seen.add(exit.id);
 }
 for (const room of catalog.rooms) for (const exit of room.exits) {
  if (opened.has(exit.id) || exit.requires?.length) continue;
  const doorKey = exit.id + ':' + room.id;
  const x = landmark.x + room.x + (exit.side === 'east' ? room.width / 2 : exit.side === 'west' ? -room.width / 2 : 0);
  const z = landmark.z + room.z + (exit.side === 'south' ? room.depth / 2 : exit.side === 'north' ? -room.depth / 2 : 0);
  const ax = landmark.x + room.x + (exit.side === 'east' ? room.width / 2 - 0.85 : exit.side === 'west' ? -room.width / 2 + 0.85 : 0);
  const az = landmark.z + room.z + (exit.side === 'south' ? room.depth / 2 - 0.85 : exit.side === 'north' ? -room.depth / 2 + 0.85 : 0);
  const enemyDistance = Math.hypot(enemy.x - ax, enemy.z - az);
  const playerDistance = Math.hypot(player.x - x, player.z - z);
  if (enemyDistance > 14 || playerDistance > 24) continue;
  const route = Collision.findPath(enemy.x, enemy.z, ax, az, { bounds: 100, maxExpanded: 1800, radius: 0.45, removedObstacleIds: collisionOptions.removedObstacleIds });
  if (!route || !route.length) continue;
  candidates.push({ room, exit, doorKey, x, z, ax, az, route, enemyDistance, score: enemyDistance + playerDistance * 0.45 });
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
function advance({encounters,players,interiors=null,now=Date.now(),speed=2.8,maxElapsed=2.5}){
 const clean=normalizeEncounters(encounters,now);
 for(const [account,e] of Object.entries(clean)){
  if(e.defeated||e.hp<=0)continue;
  const player=players?.[account];
  const collisionOptions=interiorCollisionOptions(interiors,account);
  if(!player||!Number.isFinite(player.x)||!Number.isFinite(player.z)){e.lastAiAt=now;continue;}
  const elapsed=clamp((now-e.lastAiAt)/1000,0,maxElapsed);
  e.lastAiAt=now;
  if(elapsed<=0)continue;
  const dx=player.x-e.x,dz=player.z-e.z,distance=Math.hypot(dx,dz);
  const stopDistance=2.2;
  // Infected remember the last known position, but do not pursue forever.
  // Recent gunfire extends investigation at that remembered location; otherwise
  // the infected disengages once the player breaks its archetype-derived leash.
  const recentNoise=Number.isFinite(player.lastNoiseAt)&&now-player.lastNoiseAt>=0&&now-player.lastNoiseAt<=15000&&Number.isFinite(player.noiseX)&&Number.isFinite(player.noiseZ);
  if(recentNoise){e.lastKnownX=clamp(player.noiseX,-100,100);e.lastKnownZ=clamp(player.noiseZ,-100,100);e.lastKnownAt=player.lastNoiseAt;e.investigateUntil=player.lastNoiseAt+15000;}
  else if(distance<=e.pursuitRadius){e.lastKnownX=player.x;e.lastKnownZ=player.z;e.lastKnownAt=now;}
  const investigating=distance>e.pursuitRadius||now<e.investigateUntil;
  const targetX=investigating?e.lastKnownX:player.x,targetZ=investigating?e.lastKnownZ:player.z;
  const targetDx=targetX-e.x,targetDz=targetZ-e.z,targetDistance=Math.hypot(targetDx,targetDz);
  if(targetDistance>stopDistance){
  const step=Math.min(targetDistance-stopDistance,speed*elapsed);
  const nextX=clamp(e.x+targetDx/targetDistance*step,-100,100),nextZ=clamp(e.z+targetDz/targetDistance*step,-100,100);
  // Prefer the direct step; only invoke bounded A* when terrain blocks the pursuit line.
  if(Terrain.canTraverse(e.x,e.z,nextX,nextZ)&&Collision.canTraverse(e.x,e.z,nextX,nextZ,{radius:0.45,bounds:100,removedObstacleIds:collisionOptions.removedObstacleIds})){e.x=nextX;e.z=nextZ;}
  else {
   const route=Collision.findPath(e.x,e.z,targetX,targetZ,{bounds:100,maxExpanded:2600,radius:0.45,removedObstacleIds:collisionOptions.removedObstacleIds});
   const handledByDoor = collisionOptions.landmarkId && attemptInteriorBreach({ account, enemy: e, player, interiors, now, elapsed, collisionOptions, speed });
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
   const slotX = clamp(e.x + (member.offsetX || 0), -100, 100), slotZ = clamp(e.z + (member.offsetZ || 0), -100, 100);
   const mdx = slotX - member.x, mdz = slotZ - member.z, md = Math.hypot(mdx, mdz);
   if (md <= 0.3) return;
   const memberStep = Math.min(md, speed * elapsed * (member.speedScale || 1));
   const mx = clamp(member.x + mdx / md * memberStep, -100, 100), mz = clamp(member.z + mdz / md * memberStep, -100, 100);
   if (Terrain.canTraverse(member.x, member.z, mx, mz) && Collision.canTraverse(member.x, member.z, mx, mz, {radius:0.4,bounds:100})) { member.x = mx; member.z = mz; }
   else if (Math.hypot(e.x - member.x, e.z - member.z) > 6) { member.x = e.x; member.z = e.z; }
  });
  e.hp = (e.members || []).reduce((sum,m)=>sum+(m.defeated?0:m.hp),0);
  e.maxHp = (e.members || []).reduce((sum,m)=>sum+m.maxHp,0);
 }
 return clean;
}
function attack({encounters,account,player,base,survival=null,now=Date.now(),weaponPower=1,seed=0,targetId=null,aimPoint=null}){
 const clean=normalizeEncounters(encounters,now),e=clean[account];if(!e||e.defeated||e.hp<=0)throw Error('no_active_encounter');if(now>e.expiresAt)throw Error('encounter_expired');
 const living=(e.members||[]).filter(m=>!m.defeated&&m.hp>0);
 if(targetId!=null&&(typeof targetId!=='string'||(targetId!==e.id&&!living.some(m=>m.id===targetId))))throw Error('target_mismatch');
 let target=targetId&&targetId!==e.id?living.find(m=>m.id===targetId):null;
 if(!target&&aimPoint&&living.length)target=living.reduce((best,m)=>!best||Math.hypot(m.x-aimPoint.x,m.z-aimPoint.z)<Math.hypot(best.x-aimPoint.x,best.z-aimPoint.z)?m:best,null);
 if(!target)target=living[0]||e;
 let aimedZone=null;
 if(aimPoint!=null&&(!aimPoint||![aimPoint.x,aimPoint.y,aimPoint.z].every(Number.isFinite)||Math.hypot(aimPoint.x-target.x,aimPoint.z-target.z)>1.75||aimPoint.y<0.05||aimPoint.y>2.7))throw Error('invalid_aim_point');
 if(Math.hypot(player.x-target.x,player.z-target.z)>e.range)throw Error('enemy_out_of_range');
 const weaponId=typeof base.equippedWeapon==='string'&&WEAPON_FIRE_INTERVAL[base.equippedWeapon]?base.equippedWeapon:'pipe_blade';
 const handling=WEAPON_HANDLING[weaponId]||WEAPON_HANDLING.pipe_blade;
 const aimElapsed=player.aiming===true&&Number.isFinite(player.aimStartedAt)?Math.max(0,now-player.aimStartedAt):0;
 const recoveryRemaining=Number.isFinite(player.accuracyRecoverUntil)?Math.max(0,player.accuracyRecoverUntil-now):0;
 const recoveryPenalty=clamp(recoveryRemaining/handling.recoveryMs,0,1)*0.55;
 const adsProgress=clamp(aimElapsed/handling.adsMs,0,1);
 const aimStability=clamp(1-recoveryPenalty+(player.aiming===true?adsProgress*0.18:0),0,1);
 const aimed=aimPoint!=null&&player.aiming===true&&aimElapsed>=handling.adsMs&&aimStability>=0.68;
 if(aimed)aimedZone=aimPoint.y>=1.88?'head':aimPoint.y<=0.68?'limb':'torso';
 const fireInterval=WEAPON_FIRE_INTERVAL[weaponId]||ATTACK_COOLDOWN;
 if(now-e.lastAttackAt<Math.max(ATTACK_COOLDOWN,fireInterval))throw Error('attack_cooldown');
 const ammoCost=WEAPON_MAGAZINE_CAPACITY[weaponId]>0?1:0;
 if((base.resources?.ammo||0)<ammoCost)throw Error('insufficient_ammo');base.resources.ammo-=ammoCost;base.revision=(Number.isSafeInteger(base.revision)?base.revision:0)+1;
 const power=clamp(Math.floor(weaponPower),1,20);const field=survival&&typeof survival==='object'?{...survival}:null;const staminaBefore=field?clamp(field.stamina,0,100):100;const fatigueScale=staminaBefore<15?0.55:staminaBefore<35?0.75:1;
 // Hit zones are rolled on the server from encounter and attack clock; clients cannot submit a headshot claim.
 const zoneRoll=hash(target.id+':'+now+':'+seed)%100;
 const hitZone=aimedZone || (zoneRoll < 8 + Math.floor(aimStability*4) ? 'head' : zoneRoll < 30 + Math.floor(aimStability*8) ? 'limb' : 'torso');
 const zoneMultiplier=hitZone==='head'?1.8:hitZone==='limb'?0.75:1;
 const accuracyScale=aimed?1:0.72+aimStability*0.28;
 const damage=Math.max(5,Math.floor(Math.max(8,12+(power-1)*7+Math.floor(e.risk*1.5))*fatigueScale*zoneMultiplier*accuracyScale));if(field)field.stamina=clamp(staminaBefore-8,0,100);target.hp=Math.max(0,target.hp-damage);target.lastAttackAt=now;if(target.hp===0){const wasAnchor=living[0]===target;target.defeated=true;const nextLead=living.find(m=>m!==target);if(wasAnchor&&nextLead){e.x=nextLead.x;e.z=nextLead.z;}}e.hp=(e.members||[]).reduce((sum,m)=>sum+(m.defeated?0:m.hp),0);e.maxHp=(e.members||[]).reduce((sum,m)=>sum+m.maxHp,0);e.lastAttackAt=now;
 if(e.hp===0){e.defeated=true;const q=hash(e.id+':'+seed)%100,quality=q<2?'Legendary':q<8?'Epic':q<22?'Rare':q<48?'Uncommon':'Common',qi=QUALITY_ORDER.indexOf(quality),scrap=2+e.risk+qi*2,embers=e.risk+qi;
 base.resources.scrap=Math.min(999999,(base.resources.scrap||0)+scrap);base.embers=Math.min(999999999,(base.embers||0)+embers);
 if(Array.isArray(base.log)){base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'combat',at:now,text:'Cleared '+e.enemy+' squad and recovered '+quality.toLowerCase()+'-grade salvage: +'+scrap+' scrap and +'+embers+' Embers.'});base.log=base.log.slice(-20);}
 return{encounters:clean,encounter:publicEncounter(e),killed:true,damage,hitZone,aimed,aimStability,adsProgress,enemyDamage:0,ammoCost,reward:{quality,scrap,embers},base,survival:field};}
 const guards=Array.isArray(base.survivors)?base.survivors.filter(s=>s.role==='guard').length:0,enemyDamage=Math.max(1,e.damage-Math.min(3,guards));
 if(Array.isArray(base.survivors)&&base.survivors.length){const target=base.survivors.reduce((a,s)=>!a||(s.morale||0)<(a.morale||0)?s:a,null);if(target)target.morale=clamp((target.morale||0)-enemyDamage*2,0,100);}else base.resources.food=Math.max(0,(base.resources.food||0)-Math.max(1,Math.ceil(enemyDamage/3)));
 if(Array.isArray(base.log)){base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'combat',at:now,text:'Hit '+target.role+' in '+e.enemy+' squad for '+damage+' damage. The squad retaliated for '+enemyDamage+' pressure.'});base.log=base.log.slice(-20);}
 return{encounters:clean,encounter:publicEncounter(e),killed:false,damage,hitZone,aimed,aimStability,adsProgress,enemyDamage,ammoCost,reward:null,base,survival:field};
}
module.exports={ENCOUNTER_TTL,ATTACK_COOLDOWN,WEAPON_FIRE_INTERVAL,WEAPON_MAGAZINE_CAPACITY,WEAPON_HANDLING,STATS,normalizeEncounters,resolveSpawn,publicEncounter,spawn,advance,attack};
