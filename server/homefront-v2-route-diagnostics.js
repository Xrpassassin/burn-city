'use strict';
// Diagnostic only: expose actionable failed segment details for v2 world planning.
// This does not change the world or authorize migration.
const { auditV2Journeys } = require('./homefront-v2-journey-audit');
const { auditV2TravelPreview } = require('./homefront-v2-travel-audit');
const { homefrontRoadNetworkPreview } = require('../client/arena/homefront-road-network-preview.mjs');
const { createV2CollisionPreview, pointBlockedV2, canTraverseV2Preview } = require('./homefront-v2-collision-preview');
const Terrain = require('./homefront-terrain');

function diagnoseV2Routes({network=homefrontRoadNetworkPreview(),catalog=createV2CollisionPreview(),
  connectors, sampleStep=0.75,radius=0.55}={}) {
  const args={network,catalog,connectors,sampleStep,radius};
  const travel=auditV2TravelPreview(args);
  const journey=auditV2Journeys(args);
  const failures=travel.failedRoads.map(({id})=>{
    const road=network.roads.find(r=>r.id===id);
    const length=Math.hypot(road.to.x-road.from.x,road.to.z-road.from.z);
    const steps=Math.max(1,Math.ceil(length/sampleStep));
    let cause={kind:'unknown',x:road.from.x,z:road.from.z};
    for(let i=0;i<=steps;i++) {
      const t=i/steps,x=road.from.x+(road.to.x-road.from.x)*t,z=road.from.z+(road.to.z-road.from.z)*t;
      const obstruction=pointBlockedV2(catalog,x,z,radius);
      if(obstruction){cause={kind:'building',obstacleId:obstruction.id,x,z};break;}
      if(Math.hypot(x,z)>100-radius){cause={kind:'world-boundary',x,z};break;}
      if(i) {
        const prior={x:road.from.x+(road.to.x-road.from.x)*(i-1)/steps,z:road.from.z+(road.to.z-road.from.z)*(i-1)/steps};
        if(!Terrain.canTraverse(prior.x,prior.z,x,z)){cause={kind:'terrain-grade',x,z};break;}
      }
    }
    return {roadId:id,kind:cause.kind,obstacleId:cause.obstacleId??null,
      at:{x:Number(cause.x.toFixed(3)),z:Number(cause.z.toFixed(3))}};
  });
  return {version:2,previewOnly:true,roadFailures:failures,
    destinationFailures:journey.failedDestinations.map(d=>({
      siteId:d.siteId,roadId:d.roadId,reason:d.reason
    })),allJourneysPass:journey.allJourneysPass,
    scope:'diagnostic-only-not-live-navigation'};
}
module.exports={diagnoseV2Routes};
if(require.main===module) process.stdout.write(JSON.stringify(diagnoseV2Routes(),null,2)+'\n');
