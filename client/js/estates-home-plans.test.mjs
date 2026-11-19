import assert from 'node:assert/strict';
import {createHomePlan,exteriorOpenings,HOME_FOOTPRINT,HOME_FLOORS,INTERIOR_MODEL_SIZE} from './estates-home-plans.mjs';
import {createEstateHomeLayout} from './estates-home-layout.mjs';
import {resolveSecretRoomMotion,secretRoomInteraction} from './estates-secret-layout.mjs';
import {estateHouseParts} from './estates-house-design.mjs';
import {readFileSync} from 'node:fs';
const R=.35,ALL=['game-lounge','hobby-workshop','grow-lounge','grow-lounge-deluxe','security-upgrade','hidden-hatch','underground-bunker','roof-garden','bunker-arcade'];
const free=(layout,x,z)=>Math.abs(x)<=layout.bounds.x-R&&Math.abs(z)<=layout.bounds.z-R&&
 !layout.obstacles.some(o=>Math.abs(x-o.x)<o.halfX+R&&Math.abs(z-o.z)<o.halfZ+R);
// Flood fill on a 10 cm grid using the same circle-vs-box rule as the room controller.
function reachable(layout,start){
 const s=.1,nx=Math.floor(2*layout.bounds.x/s)+1,nz=Math.floor(2*layout.bounds.z/s)+1,seen=new Uint8Array(nx*nz);
 const ix=x=>Math.round((x+layout.bounds.x)/s),iz=z=>Math.round((z+layout.bounds.z)/s),X=i=>i*s-layout.bounds.x,Z=k=>k*s-layout.bounds.z;
 const q=[[ix(start.x),iz(start.z)]];seen[q[0][0]*nz+q[0][1]]=1;
 while(q.length){const [i,k]=q.pop();for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+a,nk=k+b;
  if(ni<0||nk<0||ni>=nx||nk>=nz||seen[ni*nz+nk]||!free(layout,X(ni),Z(nk)))continue;seen[ni*nz+nk]=1;q.push([ni,nk]);}}
 return (x,z,r)=>{for(let i=0;i<nx;i++)for(let k=0;k<nz;k++)if(seen[i*nz+k]&&Math.hypot(X(i)-x,Z(k)-z)<=r)return true;return false;};
}
const exteriorDoor=tier=>{const [w,d]=HOME_FOOTPRINT[tier];const f={width:w,depth:d,height:{trailer:3,apartment:10,starter:5,family:6,mansion:8}[tier]};
 return estateHouseParts({tier,buildingFootprint:f}).find(p=>p.name==='entry-door');};
let checks=0;
for(const tier of Object.keys(HOME_FOOTPRINT)){
 const door=exteriorDoor(tier);
 for(const upgrades of [[],ALL])for(let floor=0;floor<HOME_FLOORS[tier];floor++){
  const plan=createHomePlan({tier,floor,upgrades});
  const layout=createEstateHomeLayout({tier,floor,upgrades,furniture:[]});
  // 1. Door lines up with the exterior front door; windows sit where the facade's windows are.
  if(floor===0){
   assert(Math.abs(plan.doorX-door.x)<1e-9,tier+' interior door matches exterior door x');
   const panel=layout.items.find(i=>i.id==='home-exit-panel');assert(Math.abs(panel.x-door.x)<1e-9);
  }
  const ext=exteriorOpenings(tier).windows.filter(w=>w.floor===floor);
  for(const w of ext){
   const glass=layout.items.filter(i=>i.mat==='home-window');
   assert(glass.some(g=>w.wall==='east'?Math.abs(g.z-w.z)<1e-6&&g.x>0:Math.abs(g.x-w.x)<1e-6&&Math.sign(g.z)===(w.wall==='front'?1:-1)),tier+' window '+w.wall+' '+w.x);checks++;
  }
  // 2. Spawn/arrival are clear and every room and interaction is reachable on foot.
  assert(free(layout,layout.spawn.x,layout.spawn.z),tier+' f'+floor+' spawn clear '+JSON.stringify(layout.obstacles.filter(o=>Math.abs(layout.spawn.x-o.x)<o.halfX+R&&Math.abs(layout.spawn.z-o.z)<o.halfZ+R).map(o=>o.id)));
  const can=reachable(layout,layout.spawn);
  for(const room of plan.rooms){const cx=(room.x0+room.x1)/2,cz=(room.z0+room.z1)/2,r=Math.min(room.x1-room.x0,room.z1-room.z0)/2;
   assert(can(cx,cz,r),tier+' f'+floor+' room reachable: '+room.name+(upgrades.length?' (all upgrades)':''));checks++;}
  for(const it of layout.interactions){assert(can(it.x,it.z,it.radius),tier+' f'+floor+' interaction reachable: '+it.id);checks++;}
  // 3. Collision: walls stop the player (no walking through partitions or the shell).
  const walls=layout.obstacles.filter(o=>o.id.startsWith('partition-'));
  if(walls.length){const w=walls.find(o=>o.halfX<.1||o.halfZ<.1&&true)||walls[0];
   const vertical=w.halfX<w.halfZ,start=vertical?{x:w.x-.8,z:w.z}:{x:w.x,z:w.z-.8};
   if(free(layout,start.x,start.z)){let p=start;for(let i=0;i<40;i++)p=resolveSecretRoomMotion(p,vertical?{x:.05,z:0}:{x:0,z:.05},layout);
    assert(vertical?p.x<w.x-w.halfX:p.z<w.z-w.halfZ,tier+' partition blocks movement');checks++;}}
  let p=layout.spawn;for(let i=0;i<200;i++)p=resolveSecretRoomMotion(p,{x:0,z:.1},layout);
  assert(p.z<=layout.bounds.z-R+1e-9,'front wall blocks');
  // 4. Fixed solids never overlap each other (furniture sits in rooms, not in walls).
  const solid=layout.obstacles.filter(o=>!o.id.startsWith('partition-')&&!o.id.startsWith('stair'));
  for(let i=0;i<solid.length;i++)for(let k=i+1;k<solid.length;k++){const a=solid[i],b=solid[k];
   const ox=a.halfX+b.halfX-Math.abs(a.x-b.x),oz=a.halfZ+b.halfZ-Math.abs(a.z-b.z);
   assert(!(ox>.03&&oz>.03),tier+' f'+floor+' overlap '+a.id+' / '+b.id);}
  for(const o of solid){assert(Math.abs(o.x)+o.halfX<=layout.bounds.x+.02&&Math.abs(o.z)+o.halfZ<=layout.bounds.z+.02,tier+' inside shell '+o.id);
   for(const w of walls){const ox=o.halfX+w.halfX-Math.abs(o.x-w.x),oz=o.halfZ+w.halfZ-Math.abs(o.z-w.z);assert(!(ox>.03&&oz>.03),tier+' f'+floor+' '+o.id+' cuts into '+w.id);}}
 }
 // 5. Rooms scale with tier and upgrades appear inside.
 const base=createHomePlan({tier}),full=createHomePlan({tier,upgrades:ALL});
 for(const id of ['upgrade-arcade-cabinet','upgrade-security-monitor','upgrade-hatch-door'])assert(full.items.some(i=>i.id===id),tier+' shows '+id);
 assert(full.items.some(i=>i.id.startsWith('upgrade-workshop'))&&full.items.some(i=>i.id.startsWith('upgrade-garden')),tier+' workshop + garden');
 assert(!base.items.some(i=>i.id.startsWith('upgrade-')),tier+' nothing installed by default');
 assert.equal(full.interactions.find(i=>i.id==='portal').title.startsWith('Bunker hatch'),true);
}
assert.equal(createHomePlan({tier:'trailer'}).rooms.length,2);
assert(createHomePlan({tier:'mansion'}).rooms.length+createHomePlan({tier:'mansion',floor:1}).rooms.length>=9,'mansion has many rooms over two floors');
assert(createHomePlan({tier:'mansion'}).items.some(i=>i.model?.id==='chandelier'),'mansion foyer chandelier');
assert(createHomePlan({tier:'family'}).interactions.some(i=>i.id==='stairs-up'));
// Every model referenced by the plans has a shipped asset with matching size.
for(const [id,size] of Object.entries(INTERIOR_MODEL_SIZE)){
 const info=JSON.parse(readFileSync(new URL('../assets/estates-interiors/'+id+'.json',import.meta.url),'utf8'));
 size.forEach((v,i)=>assert(Math.abs(v-info.size[i])<.02,id+' size matches built asset'));
}
// Owner furniture that would block a doorway or sit inside a fixed fixture is hidden, not saved over.
const blocked=createEstateHomeLayout({tier:'starter',furniture:[{id:'x',type:'sofa',x:-1.5,z:2.5,rotation:0},{id:'ok',type:'plant',x:0,z:-2,rotation:0}]});
assert.deepEqual(blocked.hiddenFurniture,['x']);
console.log('Estates walk-in home plans: 5 tiers, 7 floors, door/window alignment, reachability, collision and upgrades ('+checks+' checks) passed');
