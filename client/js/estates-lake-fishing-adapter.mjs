// Estates Lake fishing eligibility. The existing city fishing engine uses a different
// lake volume, so do not call its cast action until a lake-aware target adapter exists.
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function nearbyEstatesFishingSpot({spots,position,activeIsland,verifiedPropertyIds=[],radius=8}={}){
 if(!Array.isArray(spots)||!position||!finite(position.x)||!finite(position.z)||!finite(radius)||radius<=0)throw new TypeError('valid fishing spots, position and radius required');
 if(!activeIsland)return null;
 let best=null,bestDistance=radius;
 for(const spot of spots){
  if(spot.access==='property-rights'&&!verifiedPropertyIds.includes(spot.propertyId))continue;
  const distance=Math.hypot(position.x-spot.position.x,position.z-spot.position.z);
  if(distance<bestDistance){best=spot;bestDistance=distance;}
 }
 return best?Object.freeze({spot:best,distance:bestDistance}):null;
}
