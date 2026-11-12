// Original Zombies: seed-stable, server-layout-authoritative architectural decay.
// No new walls, door blockers, enemy entities, colliders or network messages.
// Positions are derived from approved visual-only wall fixtures and real windows.
import {planZombiesRoomDressing} from './zombies-room-dressing-plan.mjs';

const ROOF_H=3.34; // game ground walls end at 3.4m; stays overhead
const WINDOW_LINTEL=2.46;
export function planZombiesRuinedArchitecture(layout,{low=false}={}){
 const fixtures=planZombiesRoomDressing(layout,{low});
 const byZone=new Map();
 for(const fixture of fixtures){
  // Prefer one ruined ceiling/cable cluster per accessible room, then add a
  // second where space allows. Every piece projects from an actual wall.
  const list=byZone.get(fixture.zone)||[];
  list.push(fixture);
  byZone.set(fixture.zone,list);
 }
 const max=low?9:18,clusters=[];
 for(const list of byZone.values()){
  if(clusters.length>=max)break;
  const site=list.sort((a,b)=>a.hash-b.hash)[0];
  if(site)clusters.push({...site,roofY:ROOF_H,damage:site.hash%3,
   kind:['lab','cold'].includes(site.theme)?'isolation':
        ['generator','control','pump'].includes(site.theme)?'power':
        ['furnace','slag'].includes(site.theme)?'furnace':'collapse'});
 }
 if(!low){
  for(const list of byZone.values()){
   if(clusters.length>=max)break;
   if(list.length>1){
    const s=list[1];
    if(!clusters.some(c=>Math.hypot(c.x-s.x,c.z-s.z)<4.0))
     clusters.push({...s,roofY:ROOF_H,damage:s.hash%3,kind:'collapse'});
   }
  }
 }
 const windows=[];
 const limit=low?12:36;
 for(const [index,w] of (layout?.windows||[]).entries()){
  if(w.lv&&(!layout.up||!Number.isFinite(layout.up.h)))continue;
  if(windows.length>=limit)break;
  // Glass occupies narrow wedges at the TOP of genuine boardable openings.
  // It never forms an intact invisible collision plane across zombie paths.
  windows.push({x:w.x,z:w.z,ax:w.ax,lv:w.lv||0,y:(w.lv?layout.up.h:0)+WINDOW_LINTEL,
   index,variant:index%4});
 }
 return {clusters,windows,roofClearance:ROOF_H,source:'authoritative-zombies-grid'};
}
