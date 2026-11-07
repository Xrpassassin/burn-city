// Shared drivable route reservations used by BOTH the browser scenery
// generator and the server's collision catalog. Dense debris remains beyond
// the shoulder while a 2.1m salvage rover can negotiate road clearances.
// Foot-only creek trails stay narrow; no global forest flattening.
import {inPineCrossing,PINE_CROSSING_ROUTES} from './homefront-pine-crossing.mjs';
export const CITY_BLOCK_SPACING=20;
export const CITY_DRIVE_HALF_WIDTH=3.8;
export const MIN_DRIVE_ROUTE_WIDTH=3.8;
function segmentDistance(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz;
 const t=len2?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/len2)):0;
 return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function cityRoadDistance(coordinate){
 const q=Math.abs(coordinate)%CITY_BLOCK_SPACING;
 return Math.min(q,CITY_BLOCK_SPACING-q);
}
export function vehicleCorridorAt(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 if(inPineCrossing(x,z,3)){
  for(const route of PINE_CROSSING_ROUTES){
   if(route.width<MIN_DRIVE_ROUTE_WIDTH)continue;
   for(let i=1;i<route.points.length;i++){
    if(segmentDistance(x,z,route.points[i-1],route.points[i])<=route.width/2+0.95)return true;
   }
  }
  return false;
 }
 return cityRoadDistance(x)<=CITY_DRIVE_HALF_WIDTH ||
   cityRoadDistance(z)<=CITY_DRIVE_HALF_WIDTH;
}
