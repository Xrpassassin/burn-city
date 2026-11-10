// Island-scoped helicopter flight approximation. Deterministic game motion, not an aviation simulator.
// No financial rewards, speed exploits across world instances, or client-side unlock authority.
export const HELICOPTER_PRICE_XRP=180;
export const HELIPAD_OFFSET=Object.freeze({x:8.2,z:-5.5});
export const FLIGHT_LIMITS=Object.freeze({radiusX:138,radiusZ:147,maxAltitude:92,minCruiseAltitude:11,maxSpeed:28});
export const FLIGHT_ROUTE=Object.freeze([
 Object.freeze({id:'north-lookout',name:'North Shore Panorama',x:0,z:-111,altitude:27,radius:18}),
 Object.freeze({id:'east-coast',name:'Eastern Lake Lookout',x:101,z:-8,altitude:31,radius:18}),
 Object.freeze({id:'south-lake',name:'Southern Lake Overlook',x:6,z:111,altitude:25,radius:18})
]);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function estateHelipadPosition(lot){
 if(!lot||![lot.position?.x,lot.position?.z].every(Number.isFinite))throw TypeError('valid_estate_lot_required');
 return {x:lot.position.x+HELIPAD_OFFSET.x,z:lot.position.z+HELIPAD_OFFSET.z};
}
export function createEstateHelicopterFlight(lot){
 const pad=estateHelipadPosition(lot);
 let position={x:pad.x,z:pad.z,altitude:1.4};
 let velocity={x:0,z:0,vertical:0},rotor=0,elapsed=0,visited=new Set();
 const nearPad=(p=position)=>Math.hypot(p.x-pad.x,p.z-pad.z)<=6;
 function tick({dt=0,yaw=0,forward=0,strafe=0,ascend=0,descend=0}={}){
  if(![dt,yaw,forward,strafe,ascend,descend].every(Number.isFinite))throw TypeError('invalid_flight_input');
  const step=clamp(dt,0,.05),front=clamp(forward,-1,1),side=clamp(strafe,-1,1);
  const rise=clamp(ascend,0,1),fall=clamp(descend,0,1);
  elapsed+=step;rotor=(rotor+step*20)%(Math.PI*2);
  const targetV=clamp((rise-fall)*9,-7,9);
  const smoothV=1-Math.exp(-3.6*step);
  velocity.vertical+=(targetV-velocity.vertical)*smoothV;
  const nextAltitude=clamp(position.altitude+velocity.vertical*step,1.4,FLIGHT_LIMITS.maxAltitude);
  const canMove=nextAltitude>=FLIGHT_LIMITS.minCruiseAltitude;
  const length=Math.hypot(front,side),weight=length>1?1/length:1;
  const vx=(-Math.sin(yaw)*front+Math.cos(yaw)*side)*weight*FLIGHT_LIMITS.maxSpeed;
  const vz=(-Math.cos(yaw)*front-Math.sin(yaw)*side)*weight*FLIGHT_LIMITS.maxSpeed;
  const blend=1-Math.exp(-2.2*step);
  velocity.x+=(canMove?vx-velocity.x:-velocity.x)*blend;
  velocity.z+=(canMove?vz-velocity.z:-velocity.z)*blend;
  const x=clamp(position.x+velocity.x*step,-FLIGHT_LIMITS.radiusX,FLIGHT_LIMITS.radiusX);
  const z=clamp(position.z+velocity.z*step,-FLIGHT_LIMITS.radiusZ,FLIGHT_LIMITS.radiusZ);
  if(x===-FLIGHT_LIMITS.radiusX||x===FLIGHT_LIMITS.radiusX)velocity.x=0;
  if(z===-FLIGHT_LIMITS.radiusZ||z===FLIGHT_LIMITS.radiusZ)velocity.z=0;
  const approaching=nearPad({x,z});
  // Prevent low-altitude collisions with unmodeled trees/buildings everywhere but the landing pad.
  position={x,z,altitude:approaching?nextAltitude:Math.max(FLIGHT_LIMITS.minCruiseAltitude,nextAltitude)};
  if(!approaching&&position.altitude===FLIGHT_LIMITS.minCruiseAltitude&&velocity.vertical<0)velocity.vertical=0;
  const speed=Math.hypot(velocity.x,velocity.z);
  let landmark=null;
  for(const stop of FLIGHT_ROUTE){
   if(position.altitude>=stop.altitude-12&&Math.hypot(x-stop.x,z-stop.z)<=stop.radius){
    landmark=stop.name;visited.add(stop.id);
   }
  }
  return {position:{...position},velocity:{...velocity},speed,rotor,elapsed,landmark,
   routeVisited:[...visited],canLand:approaching&&position.altitude<=3&&speed<=3.5,nearHelipad:approaching};
 }
 function land(){
  if(!nearPad()||position.altitude>3||Math.hypot(velocity.x,velocity.z)>3.5)return false;
  position={x:pad.x,z:pad.z,altitude:1.4};
  velocity={x:0,z:0,vertical:0};return true;
 }
 function reset(){
  position={x:pad.x,z:pad.z,altitude:1.4};
  velocity={x:0,z:0,vertical:0};rotor=0;elapsed=0;visited.clear();
  return {position:{...position},pad:{...pad}};
 }
 return Object.freeze({tick,land,reset,get pad(){return {...pad}},get position(){return {...position}},
  get elapsed(){return elapsed},get routeVisited(){return [...visited]}});
}
