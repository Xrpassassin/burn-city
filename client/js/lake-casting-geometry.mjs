// Renderer-independent lake casting geometry shared by fishing locations.
// Returns a valid water target or null; never silently casts into terrain.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function resolveLakeCast({origin,direction,power=0.5,inWater,maxDistance=26}={}){
 if(!origin||!direction||![origin.x,origin.z,direction.x,direction.z,power,maxDistance].every(finite)||typeof inWater!=='function')throw new TypeError('valid cast geometry and water predicate required');
 const norm=Math.hypot(direction.x,direction.z);
 if(norm<1e-6||power<0||power>1||maxDistance<=0)return null;
 const distance=Math.min(maxDistance,6+20*power);
 for(let d=distance;d>=4;d-=0.5){
  const x=origin.x+direction.x/norm*d,z=origin.z+direction.z/norm*d;
  if(inWater(x,z))return Object.freeze({x,z,distance:d});
 }
 return null;
}
// Match the island renderer's RingGeometry (inner = width * .32, outer = width * .5)
// and its depth/width scale; keeping these in sync avoids casting onto dry ground.
export function estatesLakeWaterAt({x,z,offsetX=650,innerX=147.2,innerZ=150.4,outerX=230,outerZ=235}={}){
 if(![x,z,offsetX,innerX,innerZ,outerX,outerZ].every(finite))return false;
 const dx=x-offsetX;
 const inner=(dx/innerX)**2+(z/innerZ)**2;
 const outer=(dx/outerX)**2+(z/outerZ)**2;
 return inner>1&&outer<1;
}
// Any reachable public shoreline can support fishing, not just named fishing spots.
export function nearEstatesLakeShore({x,z,offsetX=650,distance=12}={}) {
 if (![x,z,offsetX,distance].every(finite)||distance<=0) return false;
 if (estatesLakeWaterAt({x,z,offsetX})) return false;
 for(let radius=2;radius<=distance;radius+=2) for(let i=0;i<32;i++) {
  const a=i*Math.PI/16;
  if(estatesLakeWaterAt({x:x+Math.cos(a)*radius,z:z+Math.sin(a)*radius,offsetX})) return true;
 }
 return false;
}
