// ORIGINAL Zombies: location-based environmental sound director.
// Uses the existing Safari-gesture-unlocked shared SFX graph, its spatial
// panner and master mute/volume. This code never owns an AudioContext,
// never plays copyrighted music and never mutates server map/gameplay state.
import {planZombiesRuinedArchitecture} from './zombies-ruined-architecture-plan.mjs';

const cueForTheme=Object.freeze({
 lab:'pressure',cold:'pressure',furnace:'steam',slag:'steam',pump:'steam',
 generator:'arc',control:'arc',chapel:'creak',archive:'creak',
 warehouse:'metal',loading:'metal',corridor:'metal',courtyard:'metal',
 spawn:'creak',industrial:'creak'
});
export function zombiesAmbientSites(layout,{mobile=false}={}){
 const plan=planZombiesRuinedArchitecture(layout,{low:mobile});
 return plan.clusters.map((s,i)=>Object.freeze({
  x:s.x,z:s.z,y:2.45,zone:s.zone,
  hash:s.hash,cue:cueForTheme[s.theme]||'creak',
  // Subtle, not meant to compete with gunfire and existing infected sounds.
  gain:mobile?0.37:0.47,id:i
 }));
}
export function createZombiesMapAmbience(sfx,{mobile=false}={}){
 let sites=[],active=false,elapsed=0,nextCue=0,nPlayed=0,lastSite=-1;
 const interval=mobile?13.5:10.5,range=mobile?19:24;
 const ready=()=>sfx&&sfx.muted!==true&&sfx.vol>0&&
  sfx.ctx_?.state==='running'&&typeof sfx.zombieEnvironmentCue==='function';
 return {
  start(layout){
   sites=zombiesAmbientSites(layout,{mobile});
   active=sites.length>0;elapsed=0;nPlayed=0;lastSite=-1;
   // Start after player has had a chance to hear existing weapons/intro.
   nextCue=6+(sites[0]?.hash||0)%4;
   return {sites:sites.length,active};
  },
  tick(dt,player,enabled=true){
   if(!active)return false;
   if(!Number.isFinite(dt)||dt<=0)return false;
   // Only active simulation frames advance scheduling. Skipped frames never
   // cause a burst of queued noises when the tab/window becomes visible.
   elapsed+=Math.min(.2,dt);
   if(elapsed<nextCue)return false;
   const attempt=nPlayed++;
   const spread=(((sites[attempt%sites.length]?.hash||0)>>>5)%6);
   nextCue=elapsed+interval+spread;
   if(!enabled||!player||!Number.isFinite(player.x)||!Number.isFinite(player.z)||!ready())return false;
   // Don't sound a control room from the other floor or across the map.
   const y=Number.isFinite(player.y)?player.y:0;
   const near=sites.filter(site=>Math.hypot(site.x-player.x,site.z-player.z)<range &&
    Math.abs(site.y-(y+1.6))<5.5)
    .sort((a,b)=>{
     const da=Math.hypot(a.x-player.x,a.z-player.z),
           db=Math.hypot(b.x-player.x,b.z-player.z);
     return da-db||a.id-b.id;
    });
   if(!near.length)return false;
   const list=near.slice(0,Math.min(4,near.length));
   const wanted=list[(attempt+Math.floor(elapsed/19))%list.length];
   const chosen=(wanted.id===lastSite&&list.length>1)?list.find(s=>s.id!==lastSite):wanted;
   lastSite=chosen.id;
   return !!sfx.zombieEnvironmentCue(chosen.cue,chosen.x,chosen.y,chosen.z,chosen.gain);
  },
  stop(){
   sites=[];active=false;elapsed=nextCue=0;nPlayed=0;lastSite=-1;
  },
  get size(){return sites.length;},
  get active(){return active;}
 };
}
