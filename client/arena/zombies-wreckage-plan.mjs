// Deterministic, visual-only street dressing for the original Zombies maps.
// Reads the server layout (never edits it). Props hug walls and stay off
// doors, windows, wall-buys, perks, the box, the Forge and the power switch.
import {zombieRoomTheme} from './zombies-room-dressing-plan.mjs';

function seedHash(value){
 let h=2166136261;
 for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;
}
const AROUND=[[0,-1],[-1,0],[0,1],[1,0]];

export function planZombiesWreckage(layout,{low=false}={}){
 const {grid:G,gw=G?.[0]?.length??0,gh=G?.length??0,cell=2,zones=[]}=layout||{};
 if(!Array.isArray(G)||!G.length||!Array.isArray(zones)||!zones.length||
  !Number.isFinite(cell)||cell<=0||gw<5||gh<5)return {sites:[],stains:[],lamps:[]};
 const seed=layout.seed??layout.name??'refinery';
 const occupied=new Set(),critical=new Set();
 for(const [c0,c1,r0,r1] of layout.obst||[]){
  for(let r=Math.max(0,r0);r<=Math.min(gh-1,r1);r++)
   for(let c=Math.max(0,c0);c<=Math.min(gw-1,c1);c++)occupied.add(r*gw+c);
 }
 const mark=(c,r,radius=1)=>{
  if(!Number.isFinite(c)||!Number.isFinite(r))return;
  for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){
   if(r+dr>=0&&r+dr<gh&&c+dc>=0&&c+dc<gw)critical.add((r+dr)*gw+(c+dc));
  }
 };
 for(let r=0;r<gh;r++)for(let c=0;c<gw;c++)if(G[r]?.[c]>=100)mark(c,r,2);
 for(const v of layout.windef||[])mark(v[0],v[1],1);
 for(const v of layout.windows||[])mark(v.c??Math.floor((v.x||0)/cell+gw/2),
  v.r??Math.floor((v.z||0)/cell+gh/2),1);
 const worldToCell=(x,z)=>[Math.floor(x/cell+gw/2),Math.floor(z/cell+gh/2)];
 for(const a of [...(layout.wallbuys||[]),
  ...(Array.isArray(layout.perks)?layout.perks:Object.values(layout.perks||{})),
  ...(layout.forge?[layout.forge]:[]),...(layout.power?[layout.power]:[])]){
  if(!Number.isFinite(a?.x)||!Number.isFinite(a?.z))continue;
  mark(...worldToCell(a.x,a.z),2);
 }
 for(const item of layout.box||[]){
  if(Array.isArray(item)&&Number.isFinite(item[0])&&Number.isFinite(item[1]))
   mark(...worldToCell(item[0],item[1]),2);
 }
 const wx=c=>(c-gw/2)*cell+1,wz=r=>(r-gh/2)*cell+1;
 const floor=(r,c)=>r>=0&&r<gh&&c>=0&&c<gw&&G[r][c]>=0&&G[r][c]<100&&!occupied.has(r*gw+c);
 const wall=(r,c)=>r<0||r>=gh||c<0||c>=gw||(G[r]?.[c]===-1&&!occupied.has(r*gw+c));
 const used=[];
 const far=(x,z,min)=>{
  for(const p of used)if(Math.hypot(p.x-x,p.z-z)<min)return false;
  return true;
 };
 const take=(site,min)=>{used.push(site);return site;};

 const edges=[];
 const openCorners=[];
 const roomCells=[];
 for(let i=0;i<zones.length;i++){
  const zone=zones[i];
  if(!zone||zone.lv)continue;
  const theme=zombieRoomTheme(zone.n??zone.name??'',i);
  const [c0,c1,r0,r1]=zone.r||[1,gw-2,1,gh-2];
  for(let r=Math.max(1,r0);r<=Math.min(gh-2,r1);r++)
   for(let c=Math.max(1,c0);c<=Math.min(gw-2,c1);c++){
    if(G[r]?.[c]!==i||occupied.has(r*gw+c))continue;
    roomCells.push({c,r,zone:i,theme});
    if(critical.has(r*gw+c))continue;
    let walls=0;
    for(const [dc,dr] of AROUND){
     if(!wall(r+dr,c+dc))continue;
     walls++;
     const hash=seedHash(seed+':e:'+i+':'+c+':'+r+':'+dc+':'+dr);
     edges.push({c,r,dc,dr,zone:i,theme,hash,x:wx(c)+dc*cell*0.42,z:wz(r)+dr*cell*0.42,
      yaw:dr<0?0:dr>0?Math.PI:dc<0?Math.PI/2:-Math.PI/2});
    }
    if(walls>=2){
     const hash=seedHash(seed+':k:'+i+':'+c+':'+r);
     openCorners.push({c,r,zone:i,theme,hash,x:wx(c),z:wz(r)});
    }
   }
 }

 const sites=[],stains=[],lamps=[];
 const cap=low?
  {car:2,fence:8,barricade:4,prop:10,lamp:2,stain:14,debris:6}:
  {car:7,fence:22,barricade:12,prop:22,lamp:6,stain:40,debris:16};

 // Wrecked cars: hug a long wall in larger rooms, never mid-corridor.
 const carThemes=new Set(['warehouse','loading','courtyard','spawn','industrial','generator']);
 const carEdges=edges.filter(e=>{
  if(!carThemes.has(e.theme))return false;
  const alongC=-e.dr,alongR=e.dc;
  return floor(e.r+alongR,e.c+alongC)&&floor(e.r-alongR,e.c-alongC);
 }).sort((a,b)=>a.hash-b.hash||a.r-b.r||a.c-b.c);
 const CAR=['sedan','taxi','van'];
 let nCar=0;
 for(const e of carEdges){
  if(nCar>=cap.car)break;
  const x=e.x,z=e.z;
  if(!far(x,z,5.4))continue;
  const tint=e.hash%7;
  sites.push(take({kind:'car',model:CAR[e.hash%3],x,z,y:0,yaw:e.yaw+(e.hash%2?0.12:-0.08),
   tilt:((e.hash>>>4)%5-2)*0.06,roll:((e.hash>>>8)%5-2)*0.04,theme:e.theme,zone:e.zone,hash:e.hash,tint},5.4));
  nCar++;
 }

 // Fences and construction barriers along walls.
 const FENCE=['wood-fence','wood-fence-fortified','iron-fence-damaged','grave-fence-damaged','work-fence'];
 const fenceEdges=[...edges].sort((a,b)=>((a.hash>>>3)-(b.hash>>>3))||a.r-b.r||a.c-b.c);
 let nFence=0;
 for(const e of fenceEdges){
  if(nFence>=cap.fence)break;
  if((e.hash>>>5)%(low?5:3))continue;
  const x=e.x,z=e.z;
  if(!far(x,z,2.6))continue;
  sites.push(take({kind:'fence',model:FENCE[e.hash%FENCE.length],x,z,y:0,yaw:e.yaw,
   theme:e.theme,zone:e.zone,hash:e.hash},2.6));
  nFence++;
 }

 // Barricades and cones tucked beside boarded windows, offset along the wall.
 const wins=layout.windows||[];
 let nBar=0;
 for(const w of wins){
  if(nBar>=cap.barricade)break;
  if(w.lv)continue;
  const c=w.c??Math.floor((w.x||0)/cell+gw/2),r=w.r??Math.floor((w.z||0)/cell+gh/2);
  const hash=seedHash(seed+':w:'+c+':'+r);
  const along=w.ax==='x'?1:0;
  const side=hash%2?1:-1;
  const x=(w.x||wx(c))+(along?side*1.55:0);
  const z=(w.z||wz(r))+(along?0:side*1.55);
  const cc=Math.floor(x/cell+gw/2),rr=Math.floor(z/cell+gh/2);
  if(!floor(rr,cc)||critical.has(rr*gw+cc)||!far(x,z,2.2))continue;
  const yaw=w.ax==='x'?0:Math.PI/2;
  sites.push(take({kind:'barricade',model:'barrier',x,z,y:0,yaw,theme:'window',hash},2.2));
  nBar++;
  if(!low&&(hash>>>4)%3===0){
   const cx=x+(along?side*0.7:0.15),cz=z+(along?0.15:side*0.7);
   if(far(cx,cz,1.1))sites.push(take({kind:'cone',model:'cone',x:cx,z:cz,y:0,yaw:hash%6,hash:hash^1},1.1));
  }
 }

 // Corner props: dumpsters, barrels, crates, rubble, car debris.
 const PROP=[
  ['dumpster',3.2],['barrel',1.8],['crate',1.7],['crate-large',2.0],
  ['rubble',2.0],['debris-tire',1.6],['debris-bumper',1.6],['debris-door',1.6]
 ];
 const corners=[...openCorners].sort((a,b)=>a.hash-b.hash||a.r-b.r||a.c-b.c);
 let nProp=0,nDebris=0;
 for(const k of corners){
  if(nProp>=cap.prop&&nDebris>=cap.debris)break;
  const [model,min]=PROP[k.hash%PROP.length];
  const isDebris=model.startsWith('debris')||model==='rubble';
  if(isDebris){if(nDebris>=cap.debris)continue;}
  else if(nProp>=cap.prop)continue;
  if(!far(k.x,k.z,min))continue;
  if((k.hash>>>6)%(low?3:2))continue;
  sites.push(take({kind:isDebris?'debris':'prop',model,x:k.x,z:k.z,y:0,
   yaw:((k.hash>>>2)%8)*0.8,theme:k.theme,zone:k.zone,hash:k.hash},min));
  if(isDebris)nDebris++;else nProp++;
 }

 // Flicker floodlights / lamp posts in room corners.
 const lampCorners=[...openCorners].sort((a,b)=>((a.hash>>>9)-(b.hash>>>9))||a.r-b.r);
 let nLamp=0;
 for(const k of lampCorners){
  if(nLamp>=cap.lamp)break;
  if((k.hash>>>2)%(low?4:3))continue;
  if(!far(k.x,k.z,3.4))continue;
  const model=k.hash%2?'lightpost':'work-light';
  const site=take({kind:'lamp',model,x:k.x,z:k.z,y:0,yaw:((k.hash>>>5)%4)*Math.PI/2,
   theme:k.theme,zone:k.zone,hash:k.hash,flicker:0.35+((k.hash>>>8)%40)/100},3.4);
  sites.push(site);
  lamps.push(site);
  nLamp++;
 }

 // Ground stains / oil / ash (procedural quads, no mesh download).
 const stainCells=[...roomCells].filter(v=>!critical.has(v.r*gw+v.c));
 stainCells.sort((a,b)=>seedHash(seed+':s:'+a.c+':'+a.r)-seedHash(seed+':s:'+b.c+':'+b.r));
 for(const v of stainCells){
  if(stains.length>=cap.stain)break;
  const hash=seedHash(seed+':s:'+v.c+':'+v.r);
  if(hash%7)continue;
  stains.push({x:wx(v.c)+(hash%11-5)*0.08,z:wz(v.r)+((hash>>>3)%11-5)*0.08,
   yaw:((hash>>>6)%16)*0.4,s:0.7+((hash>>>10)%10)*0.12,k:hash%3,hash});
 }

 sites.sort((a,b)=>a.hash-b.hash||a.z-b.z||a.x-b.x);
 return {sites,stains,lamps};
}
