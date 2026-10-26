// Pure spatial contracts. No economy, wallet access, or client-authoritative rewards.
const finite = v => typeof v === 'number' && Number.isFinite(v);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export const ESTATES_WATERFRONT = Object.freeze({
  islandRadius: 140, waterOuterRadius: 230,
  shoreCastingBand: Object.freeze({min:130,max:155}),
  dockCastingRadius: 18,
  fishingSpotIds: Object.freeze(['north-bank','east-pier','south-bank','west-bank','public-dock'])
});
export function classifyEstatesWaterfront(position) {
  if(!position || !finite(position.x) || !finite(position.z)) return 'invalid';
  const r=Math.hypot(position.x,position.z);
  if(r<ESTATES_WATERFRONT.shoreCastingBand.min) return 'inland';
  if(r<=ESTATES_WATERFRONT.shoreCastingBand.max) return 'shore';
  if(r<=ESTATES_WATERFRONT.waterOuterRadius) return 'water';
  return 'outside';
}
export function estatesFishingAccess({playerPosition,castPosition,atPublicDock=false,maxCastDistance=24}={}) {
  if(!playerPosition||!castPosition||![playerPosition.x,playerPosition.z,castPosition.x,castPosition.z,maxCastDistance].every(finite)||maxCastDistance<=0) return Object.freeze({allowed:false,reason:'invalid-position'});
  const playerZone=classifyEstatesWaterfront(playerPosition);
  const castZone=classifyEstatesWaterfront(castPosition);
  if(distance(playerPosition,castPosition)>maxCastDistance) return Object.freeze({allowed:false,reason:'out-of-range'});
  if(castZone!=='water') return Object.freeze({allowed:false,reason:'cast-not-in-water'});
  if(playerZone!=='shore' && !atPublicDock) return Object.freeze({allowed:false,reason:'not-at-fishing-access'});
  return Object.freeze({allowed:true,reason:'valid-cast'});
}
// This only validates a client-side interaction candidate. Server validates
// player position, fishing eligibility, species, rewards and rate limits.
export function estateInteriorDestination({propertyId,interiorId,authorized=false}={}) {
  if(typeof propertyId!=='string'||!propertyId.trim()||typeof interiorId!=='string'||!interiorId.trim()) return Object.freeze({ok:false,reason:'invalid-property'});
  if(!authorized) return Object.freeze({ok:false,reason:'authorization-required'});
  return Object.freeze({ok:true,instanceKey:'estate-interior:'+propertyId,interiorId,returnAnchor:'estate-exterior:'+propertyId});
}
