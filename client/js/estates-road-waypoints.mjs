// Conservative routing on the connected public road spine.
// Never claim road access for lots beyond the spine; the final leg is direct.
const MAIN_NS={x:0,minZ:-90,maxZ:90};
const MAIN_EW={z:8,minX:-75,maxX:75};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const length=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function estateRoadWaypoints(from,to){
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 if(!valid(from)||!valid(to))throw new TypeError('invalid_estate_route_coordinates');
 const west={x:clamp(from.x,MAIN_EW.minX,MAIN_EW.maxX),z:MAIN_EW.z};
 const north={x:MAIN_NS.x,z:clamp(from.z,MAIN_NS.minZ,MAIN_NS.maxZ)};
 const targetWest={x:clamp(to.x,MAIN_EW.minX,MAIN_EW.maxX),z:MAIN_EW.z};
 const targetNorth={x:MAIN_NS.x,z:clamp(to.z,MAIN_NS.minZ,MAIN_NS.maxZ)};
 const junction={x:0,z:8};
 // Two public-road candidates; select shorter approach from the current location.
 const paths=[
  [west,junction,targetNorth,to],
  [north,junction,targetWest,to]
 ];
 const scored=paths.map(path=>{
  const cleaned=path.filter((p,i)=>i===0||length(p,path[i-1])>.01);
  const points=[from,...cleaned];
  return {path:cleaned,distance:points.slice(1).reduce((sum,p,i)=>sum+length(points[i],p),0)};
 });
 scored.sort((a,b)=>a.distance-b.distance);
 return Object.freeze(scored[0].path.map(p=>Object.freeze({x:p.x,z:p.z})));
}
export function estateNextWaypoint(from,waypoints,{radius=5}={}){
 if(!from||!Number.isFinite(from.x)||!Number.isFinite(from.z)||!Array.isArray(waypoints)||!Number.isFinite(radius)||radius<=0)throw new TypeError('invalid_estate_waypoints');
 return waypoints.find(p=>length(from,p)>radius)??waypoints.at(-1)??null;
}
