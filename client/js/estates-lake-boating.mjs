// Estates lake navigation geometry, independent of ownership and payouts.
const ok=n=>Number.isFinite(n);
export const lakeBounds=Object.freeze({inner:156,outer:227});
export function onLake(x,z){const r=Math.hypot(x,z);return ok(r)&&r>=lakeBounds.inner&&r<=lakeBounds.outer;}
export function steerBoat({x,z,heading,throttle,turn,dt}){
 if(![x,z,heading,throttle,turn,dt].every(ok)||Math.abs(throttle)>1||Math.abs(turn)>1)return null;
 if(!onLake(x,z))return {x,z,heading,blocked:true};
 const t=Math.min(Math.max(dt,0),0.1),angle=heading+turn*t*1.4;
 const step=throttle*t*12,parts=Math.max(1,Math.ceil(Math.abs(step)/0.5));
 for(let i=0;i<parts;i++){const nx=x+Math.sin(angle)*step/parts,nz=z-Math.cos(angle)*step/parts;
 if(!onLake(nx,nz))return {x,z,heading:angle,blocked:true};x=nx;z=nz;}
 return {x,z,heading:angle,blocked:false};
}
export function canBoatFish({x,z,anchored}){return anchored===true&&onLake(x,z);}
