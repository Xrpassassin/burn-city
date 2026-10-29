// Pure, renderer-independent guidance for a selected Estates lot.
export function estateWalkingGuidance(from,to,{arrivalRadius=5}={}){
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 if(!valid(from)||!valid(to)||!Number.isFinite(arrivalRadius)||arrivalRadius<=0)throw new TypeError('invalid_estate_guidance_coordinates');
 const dx=to.x-from.x,dz=to.z-from.z;
 const distance=Math.hypot(dx,dz);
 return Object.freeze({distance,arrived:distance<=arrivalRadius,
   bearingRadians:Math.atan2(dx,-dz),
   direction:distance>0?Object.freeze({x:dx/distance,z:dz/distance}):Object.freeze({x:0,z:0})});
}
