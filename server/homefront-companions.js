'use strict';
// One owned survivor can accompany the account that rescued them. Existing
// homefront.json rarity, morale and survivor IDs remain the only authority.
// A companion is *not* a player, PvP target, loot source or extra wallet.
const Collision=require('./homefront-collision');
const Terrain=require('./homefront-terrain');
const ELIGIBLE=new Set(['epic','legendary']);
const MIN_MORALE=40;
const FOLLOW_INTERVAL_MS=300;
const GUARD_COOLDOWN_MS=3500;
const GUARD_RANGE=9;
const FOLLOW_RANGE=2.8;
const MAX_FOLLOW_STEP=7;
function eligible(s) {
 return !!s && typeof s.id==='string' && ELIGIBLE.has(s.rarity) &&
   Number.isFinite(s.morale) && s.morale>=MIN_MORALE;
}
function selected(base) {
 if (!base || typeof base.expeditionCompanionId!=='string')return null;
 const s=(base.survivors||[]).find(v=>v.id===base.expeditionCompanionId);
 return eligible(s)?s:null;
}
const bounded=(x,min,max,fallback=0)=>Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback;
function normalize(raw) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||
   !ELIGIBLE.has(raw.rarity))return null;
 return {
   id:raw.id.slice(0,80),name:String(raw.name||'Survivor').slice(0,40),
   rarity:raw.rarity,role:typeof raw.role==='string'?raw.role.slice(0,20):'guard',
   x:bounded(raw.x,-100,100),z:bounded(raw.z,-100,100),
   lastStepAt:bounded(raw.lastStepAt,0,Number.MAX_SAFE_INTEGER),
   lastGuardAt:bounded(raw.lastGuardAt,0,Number.MAX_SAFE_INTEGER),
   lastAssistAt:bounded(raw.lastAssistAt,0,Number.MAX_SAFE_INTEGER)
 };
}
function assign(player,base,now=Date.now()) {
 const s=selected(base);
 if(!s||!player||!Number.isFinite(player.x)||!Number.isFinite(player.z)) {
   if(player)player.companion=null;
   return null;
 }
 const old=normalize(player.companion);
 const same=old?.id===s.id;
 const c={
   id:s.id,name:s.name,rarity:s.rarity,role:s.role,
   x:same?old.x:player.x,z:same?old.z:player.z,
   lastStepAt:same?old.lastStepAt:now,
   lastGuardAt:same?old.lastGuardAt:now,
   lastAssistAt:same?old.lastAssistAt:0
 };
 player.companion=c;
 return c;
}
function advance(player,now=Date.now(),blockedIds=[]) {
 const c=normalize(player?.companion);
 if(!c || !Number.isFinite(now) || !Number.isFinite(player.x)||!Number.isFinite(player.z))return null;
 if(now<c.lastStepAt){c.lastStepAt=now;player.companion=c;return c;}
 const delta=now-c.lastStepAt;
 if(delta<FOLLOW_INTERVAL_MS)return c;
 c.lastStepAt=now;
 const dx=player.x-c.x,dz=player.z-c.z,dist=Math.hypot(dx,dz);
 if(dist<=FOLLOW_RANGE||dist<0.01){player.companion=c;return c;}
 const step=Math.min(MAX_FOLLOW_STEP,Math.max(0,Math.min(delta/1000,1.5))*4.5,dist-FOLLOW_RANGE);
 const target={x:c.x+dx/dist*step,z:c.z+dz/dist*step};
 const opts={bounds:100,removedObstacleIds:blockedIds};
 const clear=(x1,z1,x2,z2)=>Terrain.canTraverse(x1,z1,x2,z2)&&
   Collision.canTraverse(x1,z1,x2,z2,opts);
 let next=target;
 if(!clear(c.x,c.z,target.x,target.z)){
   // Walk real collision-checked route segments; never teleport through walls.
   const path=Collision.findPath(c.x,c.z,player.x,player.z,{
      ...opts,maxExpanded:400
   });
   if(!Array.isArray(path)||!path.length){player.companion=c;return c;}
   let x=c.x,z=c.z,remaining=step;
   for(const waypoint of path) {
     if(!Number.isFinite(waypoint.x)||!Number.isFinite(waypoint.z))break;
     const vx=waypoint.x-x,vz=waypoint.z-z,d=Math.hypot(vx,vz);
     if(d<0.001)continue;
     const length=Math.min(remaining,d);
     const nx=x+vx/d*length,nz=z+vz/d*length;
     if(!clear(x,z,nx,nz))break;
     x=nx;z=nz;remaining-=length;
     if(remaining<0.001)break;
   }
   next={x,z};
 }
 if(clear(c.x,c.z,next.x,next.z)) {
   c.x=Math.round(next.x*10)/10;c.z=Math.round(next.z*10)/10;
 }
 player.companion=c;
 return c;
}
function guard(encounters,account,player,now=Date.now()) {
 const companion=normalize(player?.companion);
 const e=encounters?.[account];
 if(!companion||!e||e.defeated||e.hp<=1||!Number.isFinite(now)||
   now-companion.lastGuardAt<GUARD_COOLDOWN_MS ||
   Math.hypot(player.x-companion.x,player.z-companion.z)>14)return null;
 const targets=(e.members||[]).filter(m=>!m.defeated&&m.hp>1&&
   Number.isFinite(m.x)&&Number.isFinite(m.z)&&
   Math.hypot(companion.x-m.x,companion.z-m.z)<=GUARD_RANGE);
 if(!targets.length)return null;
 targets.sort((a,b)=>Math.hypot(companion.x-a.x,companion.z-a.z)-
                        Math.hypot(companion.x-b.x,companion.z-b.z));
 const target=targets[0],damage=companion.rarity==='legendary'?6:4;
 const dealt=Math.min(damage,target.hp-1); // Cannot deliver a kill, loot or XP.
 if(dealt<=0)return null;
 target.hp-=dealt;
 e.hp=Math.max(1,(e.members||[]).reduce((sum,m)=>sum+(m.defeated?0:m.hp),0));
 companion.lastGuardAt=now;companion.lastAssistAt=now;player.companion=companion;
 return {id:companion.id,targetId:target.id,damage:dealt,at:now};
}
function publicCompanion(owner,player) {
 const c=normalize(player?.companion);
 if(!c)return null;
 return { id:'escort:'+owner+':'+c.id,ownerId:owner,name:c.name,
   rarity:c.rarity,role:c.role,x:c.x,z:c.z,
   lastAssistAt:c.lastAssistAt,kind:'survivor_escort' };
}
module.exports={MIN_MORALE,FOLLOW_INTERVAL_MS,GUARD_COOLDOWN_MS,GUARD_RANGE,
 eligible,selected,normalize,assign,advance,guard,publicCompanion};
