import { verifiedSupplyFraction } from './verified-supply-visual.mjs';
import { verifiedEcosystemSupplyFraction } from './verified-ecosystem-supply-visual.mjs';
import { blackHoleAltitude } from './blackhole-altitude.mjs';
// One inexpensive normalized visual descriptor for each building.
// Does not allocate particles, meshes, materials, timers, or network requests.
export function verifiedBlackHoleVisual({name,tokenKey,record,rooftop=0,now=Date.now()}={}) {
 const fraction=name==='BURN' ? verifiedSupplyFraction(record,tokenKey,now) :
   verifiedEcosystemSupplyFraction(record,name,now);
 if(fraction===null) return {verified:false,fraction:null,radius:2,
   altitude:blackHoleAltitude({rooftop,radius:2,fraction:0,verified:false})};
 const radius=2+14*Math.sqrt(fraction);
 return {verified:true,fraction,radius,
   altitude:blackHoleAltitude({rooftop,radius,fraction,verified:true})};
}
