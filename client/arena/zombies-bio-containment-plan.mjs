// Original Zombies: server-authoritative horror-containment visual scene plan.
// No new enemies, colliders, doors, damage, or interaction rules are authored
// here. Human-player, infected, boss and airlift movement remain unchanged.
import {planZombiesRoomDressing} from './zombies-room-dressing-plan.mjs';

const ACTIVE_THEMES=Object.freeze({
 lab:'surgical-ward',cold:'cryogenic-breach',
 furnace:'biofurnace',slag:'biofurnace',pump:'overflow-chamber',
 control:'quarantine-control',generator:'quarantine-control',
 chapel:'memorial-husk',archive:'memorial-husk'
});
const hash=(n)=>Math.imul((n>>>0)^((n>>>0)>>>16),2246822519)>>>0;
export function planZombiesBioContainment(layout,{low=false}={}){
 const source=planZombiesRoomDressing(layout,{low});
 const chosen=[],occupied=new Set(),max=low?4:8;
 // One signature room landmark per distinct server zone. Decals and organs
 // remain wall-anchored on sites already cleared by the existing safety plan.
 const prioritized=source.filter(site=>ACTIVE_THEMES[site.theme]);
 prioritized.sort((a,b)=>a.zone-b.zone||a.hash-b.hash);
 for(const site of prioritized){
  if(occupied.has(site.zone))continue;
  occupied.add(site.zone);
  chosen.push(Object.freeze({
   id:site.zone,zone:site.zone,hash:hash(site.hash),
   x:site.x,z:site.z,yaw:site.yaw,c:site.c,r:site.r,
   dc:site.dc,dr:site.dr,theme:site.theme,
   kind:ACTIVE_THEMES[site.theme],
   variant:site.hash%4,
   massCount:low?3:6
  }));
  if(chosen.length>=max)break;
 }
 // Early random worlds can roll no dedicated research room; always give the
 // player a limited thematic glimpse without opening or changing a door.
 if(!chosen.length&&source.length){
  const s=source.find(x=>x.zone>0)||source[0];
  chosen.push(Object.freeze({
   id:s.zone,zone:s.zone,hash:hash(s.hash),
   x:s.x,z:s.z,yaw:s.yaw,c:s.c,r:s.r,dc:s.dc,dr:s.dr,
   theme:s.theme,kind:'sealed-infirmary',variant:s.hash%4,
   massCount:low?3:6
  }));
 }
 return Object.freeze(chosen);
}
export function zombiesBioSpecialIdentity(type){
 // A Warden remains a Warden mechanically, and the crawler remains type 5.
 // Their artist-designed GLB skins are handled independently by
 // zombie-special-art.mjs when source files are legally downloaded.
 return type===8?'mutant-nurse':type===5?'living-flesh-blob':null;
}
