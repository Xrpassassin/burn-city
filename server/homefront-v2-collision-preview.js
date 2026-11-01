'use strict';
// Isolated v2 proposed obstacle catalog. Does not change live v1 collision.
const { homefrontOrganicLayoutPreview } = require('../client/arena/homefront-building-layout.mjs');
const { homefrontRoadNetworkPreview } = require('../client/arena/homefront-road-network-preview.mjs');
const { buildableOrganicSitesPreview } = require('../client/arena/homefront-road-clearance.mjs');
const { reserveOrganicLandmarkClearance, protectedOrganicSitesPreview } = require('../client/arena/homefront-landmark-reservations.mjs');
const Terrain = require('./homefront-terrain');
const VERSION = 2;
function createV2CollisionPreview() {
  const network = homefrontRoadNetworkPreview();
  const roadSites = buildableOrganicSitesPreview({roads:network.roads,buildings:[...homefrontOrganicLayoutPreview()]});
  const reserved = reserveOrganicLandmarkClearance({buildings:roadSites.buildings});
  const obstacles = reserved.buildings.map(b=>Object.freeze({
    id:b.id,type:'rotated-rect',x:b.x,z:b.z,halfX:b.w/2,halfZ:b.d/2,rotation:b.rotation
  }));
  return Object.freeze({version:VERSION,previewOnly:true,obstacles:Object.freeze(obstacles),
    protectedSites:Object.freeze(protectedOrganicSitesPreview()),
    removedForRoads:roadSites.excluded.length,removedForSites:reserved.excluded.length});
}
function pointBlockedV2(catalog,x,z,radius=0.55) {
  if(catalog?.version!==VERSION||!catalog.previewOnly) throw new TypeError('expected v2 preview catalog');
  if(![x,z,radius].every(Number.isFinite)||radius<0)throw new TypeError('invalid position');
  for(const b of catalog.obstacles){
    const dx=x-b.x,dz=z-b.z,c=Math.cos(b.rotation),s=Math.sin(b.rotation);
    const lx=dx*c-dz*s,lz=dx*s+dz*c;
    const ex=Math.max(Math.abs(lx)-b.halfX,0),ez=Math.max(Math.abs(lz)-b.halfZ,0);
    if(Math.hypot(ex,ez)<radius)return b;
  }
  return null;
}
function canTraverseV2Preview(catalog,from,to,{radius=0.55,sampleStep=0.75,bounds=100}={}) {
  if(![from?.x,from?.z,to?.x,to?.z,radius,sampleStep,bounds].every(Number.isFinite)||
      radius<0||sampleStep<=0||bounds<=0)throw new TypeError('invalid traversal');
  const distance=Math.hypot(to.x-from.x,to.z-from.z);
  const steps=Math.max(1,Math.ceil(distance/sampleStep));
  for(let i=0;i<=steps;i++){
    const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
    if(Math.hypot(x,z)>bounds-radius||pointBlockedV2(catalog,x,z,radius))return false;
    if(i && !Terrain.canTraverse(from.x+(to.x-from.x)*(i-1)/steps,from.z+(to.z-from.z)*(i-1)/steps,x,z))return false;
  }
  return true;
}
module.exports={VERSION,createV2CollisionPreview,pointBlockedV2,canTraverseV2Preview};
