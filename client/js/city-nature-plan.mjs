// Pure deterministic foliage placements. Cosmetic only; never changes collision/navigation.
export function planCityNature({nodes=[],onRoad=()=>false,colliders=[],tier='medium',seed=731}={}) {
 const caps={low:140,medium:540,high:1200},max=caps[tier]??caps.medium;
 let state=(seed>>>0)||1;const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 const result=[];
 // Never place cosmetics outside a district footprint or inside a neighboring district.
 const districts=nodes.filter(n=>n?.pos&&Number.isFinite(n.pos.x)&&Number.isFinite(n.pos.z)&&Number.isFinite(n.distR)&&n.distR>=12);
 for(let tries=0;tries<max*18&&result.length<max;tries++){
  const n=districts[Math.floor(rand()*districts.length)];
  if(!n?.pos||!Number.isFinite(n.distR)||n.distR<12)continue;
  const radius=12+rand()*Math.min(Math.max(0,n.distR-17),62),theta=rand()*Math.PI*2;
  const x=n.pos.x+Math.cos(theta)*radius,z=n.pos.z+Math.sin(theta)*radius;
  if(Math.hypot(x,z)<75||onRoad(x,z,2.5))continue;
  if(Math.hypot(x-n.pos.x,z-n.pos.z)>n.distR-3)continue;
  if(districts.some(v=>Math.hypot(v.pos.x-x,v.pos.z-z)<(v.w||5)*2.8+3))continue;
  if(colliders.some(c=>Number.isFinite(c?.x)&&Number.isFinite(c?.z)&&Math.hypot(c.x-x,c.z-z)<(c.r||0)+2))continue;
  result.push({x,z,height:.35+rand()*.65,rotation:rand()*6.283,flower:rand()<.07});
 }
 return result;
}
