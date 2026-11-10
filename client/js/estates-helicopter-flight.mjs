// Island-scoped helicopter flight approximation. Deterministic game motion, not an aviation simulator.
// No financial rewards, speed exploits across world instances, or client-side unlock authority.
export const HELICOPTER_PRICE_XRP=60;
// Aircraft sit on a raised roof pad: ground pads cannot fit inside 20×18 Estates lots.
export const HELIPAD_OFFSET=Object.freeze({x:0,z:0});
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
export function estateHelipadAltitude(lot){
 const height=lot?.buildingFootprint?.height??(lot?.tier==='mansion'?8:6);
 if(!Number.isFinite(height)||height<3||height>30)throw TypeError('invalid_rooftop_helipad_height');
 return height+1.4;
}
export function createEstateHelicopterFlight(lot){
 const pad=estateHelipadPosition(lot),padAltitude=estateHelipadAltitude(lot);
 let position={x:pad.x,z:pad.z,altitude:padAltitude};
 let velocity={x:0,z:0,vertical:0},rotor=0,elapsed=0,visited=new Set();
 const nearPad=(p=position)=>Math.hypot(p.x-pad.x,p.z-pad.z)<=3.6;
 function tick({dt=0,yaw=0,forward=0,strafe=0,ascend=0,descend=0}={}){
  if(![dt,yaw,forward,strafe,ascend,descend].every(Number.isFinite))throw TypeError('invalid_flight_input');
  const step=clamp(dt,0,.05),front=clamp(forward,-1,1),side=clamp(strafe,-1,1);
  const rise=clamp(ascend,0,1),fall=clamp(descend,0,1);
  elapsed+=step;rotor=(rotor+step*20)%(Math.PI*2);
  const targetV=clamp((rise-fall)*9,-7,9);
  const smoothV=1-Math.exp(-3.6*step);
  velocity.vertical+=(targetV-velocity.vertical)*smoothV;
  const nextAltitude=clamp(position.altitude+velocity.vertical*step,padAltitude,FLIGHT_LIMITS.maxAltitude);
  const canMove=nextAltitude>=FLIGHT_LIMITS.minCruiseAltitude;
  const length=Math.hypot(front,side),weight=length>1?1/length:1;
  const vx=(-Math.sin(yaw)*front+Math.cos(yaw)*side)*weight*FLIGHT_LIMITS.maxSpeed;
  const vz=(-Math.cos(yaw)*front-Math.sin(yaw)*side)*weight*FLIGHT_LIMITS.maxSpeed;
  const blend=1-Math.exp(-2.2*step);
  velocity.x+=(canMove?vx-velocity.x:-velocity.x)*blend;
  velocity.z+=(canMove?vz-velocity.z:-velocity.z)*blend;
  let x=clamp(position.x+velocity.x*step,-FLIGHT_LIMITS.radiusX,FLIGHT_LIMITS.radiusX);
  let z=clamp(position.z+velocity.z*step,-FLIGHT_LIMITS.radiusZ,FLIGHT_LIMITS.radiusZ);
  if(x===-FLIGHT_LIMITS.radiusX||x===FLIGHT_LIMITS.radiusX)velocity.x=0;
  if(z===-FLIGHT_LIMITS.radiusZ||z===FLIGHT_LIMITS.radiusZ)velocity.z=0;
  // Low hover is permitted over the owner's roof, but a moving aircraft must
  // NEVER escape the pad radius at roof height and instantly snap up to 11 m.
  // Keep the craft inside the safe hovering circle until it can cruise.
  if(nextAltitude<FLIGHT_LIMITS.minCruiseAltitude&&nearPad(position)&&!nearPad({x,z})){
   const dx=x-pad.x,dz=z-pad.z,dist=Math.hypot(dx,dz);
   if(dist>0){x=pad.x+dx/dist*3.5;z=pad.z+dz/dist*3.5;}
   else{x=pad.x;z=pad.z;}
   velocity.x=0;velocity.z=0;
  }
  const approaching=nearPad({x,z});
  // Beyond the pad, maintain the 11 m obstacle clearance without teleporting
  // a low-flying aircraft upward when it crosses the roof's hover boundary.
  const altitude=approaching?nextAltitude:Math.max(FLIGHT_LIMITS.minCruiseAltitude,nextAltitude);
  position={x,z,altitude};
  if(!approaching&&position.altitude===FLIGHT_LIMITS.minCruiseAltitude&&velocity.vertical<0)velocity.vertical=0;
  const speed=Math.hypot(velocity.x,velocity.z);
  let landmark=null;
  for(const stop of FLIGHT_ROUTE){
   if(position.altitude>=stop.altitude-12&&Math.hypot(x-stop.x,z-stop.z)<=stop.radius){
    landmark=stop.name;visited.add(stop.id);
   }
  }
  return {position:{...position},velocity:{...velocity},speed,rotor,elapsed,landmark,
   routeVisited:[...visited],canLand:approaching&&position.altitude<=padAltitude+1.6&&speed<=3.5,nearHelipad:approaching};
 }
 function land(){
  if(!nearPad()||position.altitude>padAltitude+1.6||Math.hypot(velocity.x,velocity.z)>3.5)return false;
  position={x:pad.x,z:pad.z,altitude:padAltitude};
  velocity={x:0,z:0,vertical:0};return true;
 }
 function reset(){
  position={x:pad.x,z:pad.z,altitude:padAltitude};
  velocity={x:0,z:0,vertical:0};rotor=0;elapsed=0;visited.clear();
  return {position:{...position},pad:{...pad}};
 }
 return Object.freeze({tick,land,reset,get pad(){return {...pad}},get position(){return {...position}},
  get elapsed(){return elapsed},get routeVisited(){return [...visited]}});
}
