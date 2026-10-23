'use strict';
// Authoritative, renderer-independent combat for Homefront's shared Graveyard.
const { ARCHETYPES, QUALITY_ORDER } = require('./homefront-director');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const ENCOUNTER_TTL=180000, ATTACK_COOLDOWN=900;
const STATS=Object.freeze({wandering_infected:{hp:32,damage:2,ammo:1,range:18},infected_horde:{hp:76,damage:5,ammo:2,range:20},special_infected:{hp:105,damage:7,ammo:2,range:22}});
function enemyName(zone,event){const a=ARCHETYPES[zone]||ARCHETYPES.outskirts;return event==='special_infected'?a.special:event==='infected_horde'?a.horde:a.wanderer;}
function resolveSpawn({account,x,z,district,risk=1,now=Date.now(),seed=0}){
 risk=clamp(Math.floor(risk),1,5);const roll=hash(account+':'+district+':'+Math.floor(x)+':'+Math.floor(z)+':'+Math.floor(now/30000)+':'+seed)%100;
 const event=roll<13+risk*4?'special_infected':roll<42+risk*5?'infected_horde':'wandering_infected',s=STATS[event],id='enc-'+hash(account+':'+now+':'+x+':'+z).toString(36);
 return {id,owner:account,event,enemy:enemyName(district,event),district,x:clamp(x+(hash(id+':x')%13-6),-100,100),z:clamp(z+(hash(id+':z')%13-6),-100,100),hp:s.hp+risk*7,maxHp:s.hp+risk*7,damage:s.damage+Math.max(0,risk-1),ammoCost:s.ammo,range:s.range,risk,createdAt:now,lastAttackAt:0,lastAiAt:now,expiresAt:now+ENCOUNTER_TTL,defeated:false};
}
function publicEncounter(e){return e?{id:e.id,event:e.event,enemy:e.enemy,district:e.district,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,risk:e.risk,range:e.range,expiresAt:e.expiresAt,defeated:!!e.defeated}:null;}
function normalizeEncounters(input,now=Date.now()){
 const out={};if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [owner,e] of Object.entries(input)){if(!e||typeof e!=='object'||typeof e.id!=='string'||!STATS[e.event]||!Number.isFinite(e.expiresAt)||e.expiresAt<=now)continue;
 out[owner]={id:e.id.slice(0,80),owner,event:e.event,enemy:String(e.enemy||'Stray Runner').slice(0,80),district:String(e.district||'outskirts').slice(0,40),x:clamp(e.x,-100,100),z:clamp(e.z,-100,100),hp:clamp(e.hp,0,10000),maxHp:clamp(e.maxHp,1,10000),damage:clamp(e.damage,1,50),ammoCost:clamp(e.ammoCost,1,5),range:clamp(e.range,1,40),risk:clamp(e.risk,1,5),createdAt:clamp(e.createdAt,0,Number.MAX_SAFE_INTEGER),lastAttackAt:clamp(e.lastAttackAt,0,Number.MAX_SAFE_INTEGER),lastAiAt:clamp(e.lastAiAt??e.createdAt,0,Number.MAX_SAFE_INTEGER),expiresAt:e.expiresAt,defeated:!!e.defeated};}
 return out;
}
function spawn({encounters,account,player,now=Date.now(),seed=0}){
 const clean=normalizeEncounters(encounters,now),old=clean[account];if(old&&!old.defeated&&old.hp>0)return{encounters:clean,encounter:publicEncounter(old),reused:true};
 const depth=100-Math.hypot(player.x,player.z),risk=depth<25?1:depth<45?1:depth<62?2:depth<76?3:depth<88?4:5,district=risk>=5?'research_lab':risk>=4?'industrial':risk>=3?'commercial':risk===2?'residential':'outskirts';
 const e=resolveSpawn({account,x:player.x,z:player.z,district,risk,now,seed});clean[account]=e;return{encounters:clean,encounter:publicEncounter(e),reused:false};
}

function advance({encounters,players,now=Date.now(),speed=2.8,maxElapsed=2.5}){
 const clean=normalizeEncounters(encounters,now);
 for(const [account,e] of Object.entries(clean)){
  if(e.defeated||e.hp<=0)continue;
  const player=players?.[account];
  if(!player||!Number.isFinite(player.x)||!Number.isFinite(player.z)){e.lastAiAt=now;continue;}
  const elapsed=clamp((now-e.lastAiAt)/1000,0,maxElapsed);
  e.lastAiAt=now;
  if(elapsed<=0)continue;
  const dx=player.x-e.x,dz=player.z-e.z,distance=Math.hypot(dx,dz);
  const stopDistance=2.2;
  if(distance<=stopDistance)continue;
  const step=Math.min(distance-stopDistance,speed*elapsed);
  e.x=clamp(e.x+dx/distance*step,-100,100);
  e.z=clamp(e.z+dz/distance*step,-100,100);
 }
 return clean;
}
function attack({encounters,account,player,base,survival=null,now=Date.now(),weaponPower=1,seed=0}){
 const clean=normalizeEncounters(encounters,now),e=clean[account];if(!e||e.defeated||e.hp<=0)throw Error('no_active_encounter');if(now>e.expiresAt)throw Error('encounter_expired');
 if(Math.hypot(player.x-e.x,player.z-e.z)>e.range)throw Error('enemy_out_of_range');if(now-e.lastAttackAt<ATTACK_COOLDOWN)throw Error('attack_cooldown');
 if((base.resources?.ammo||0)<e.ammoCost)throw Error('insufficient_ammo');base.resources.ammo-=e.ammoCost;base.revision=(Number.isSafeInteger(base.revision)?base.revision:0)+1;
 const power=clamp(Math.floor(weaponPower),1,20);const field=survival&&typeof survival==='object'?{...survival}:null;const staminaBefore=field?clamp(field.stamina,0,100):100;const fatigueScale=staminaBefore<15?0.55:staminaBefore<35?0.75:1;
 // Hit zones are rolled on the server from encounter and attack clock; clients cannot submit a headshot claim.
 const zoneRoll=hash(e.id+':'+now+':'+seed)%100;
 const hitZone=zoneRoll<8?'head':zoneRoll<30?'limb':'torso';
 const zoneMultiplier=hitZone==='head'?1.8:hitZone==='limb'?0.75:1;
 const damage=Math.max(5,Math.floor(Math.max(8,12+(power-1)*7+Math.floor(e.risk*1.5))*fatigueScale*zoneMultiplier));if(field)field.stamina=clamp(staminaBefore-8,0,100);e.hp=Math.max(0,e.hp-damage);e.lastAttackAt=now;
 if(e.hp===0){e.defeated=true;const q=hash(e.id+':'+seed)%100,quality=q<2?'Legendary':q<8?'Epic':q<22?'Rare':q<48?'Uncommon':'Common',qi=QUALITY_ORDER.indexOf(quality),scrap=2+e.risk+qi*2,embers=e.risk+qi;
 base.resources.scrap=Math.min(999999,(base.resources.scrap||0)+scrap);base.embers=Math.min(999999999,(base.embers||0)+embers);
 if(Array.isArray(base.log)){base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'combat',at:now,text:'Defeated '+e.enemy+' and recovered '+quality.toLowerCase()+'-grade salvage: +'+scrap+' scrap and +'+embers+' Embers.'});base.log=base.log.slice(-20);}
 return{encounters:clean,encounter:publicEncounter(e),killed:true,damage,hitZone,enemyDamage:0,ammoCost:e.ammoCost,reward:{quality,scrap,embers},base,survival:field};}
 const guards=Array.isArray(base.survivors)?base.survivors.filter(s=>s.role==='guard').length:0,enemyDamage=Math.max(1,e.damage-Math.min(3,guards));
 if(Array.isArray(base.survivors)&&base.survivors.length){const target=base.survivors.reduce((a,s)=>!a||(s.morale||0)<(a.morale||0)?s:a,null);if(target)target.morale=clamp((target.morale||0)-enemyDamage*2,0,100);}else base.resources.food=Math.max(0,(base.resources.food||0)-Math.max(1,Math.ceil(enemyDamage/3)));
 if(Array.isArray(base.log)){base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'combat',at:now,text:'Hit '+e.enemy+' for '+damage+' damage. It retaliated for '+enemyDamage+' pressure.'});base.log=base.log.slice(-20);}
 return{encounters:clean,encounter:publicEncounter(e),killed:false,damage,hitZone,enemyDamage,ammoCost:e.ammoCost,reward:null,base,survival:field};
}
module.exports={ENCOUNTER_TTL,ATTACK_COOLDOWN,STATS,normalizeEncounters,resolveSpawn,publicEncounter,spawn,advance,attack};
