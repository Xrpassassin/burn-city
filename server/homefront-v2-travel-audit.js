'use strict';
// Read-only v2 traversal audit using proposed building collision and current terrain.
// Audits road segments and destination connectors; does not activate movement.
const { createV2CollisionPreview, canTraverseV2Preview } = require('./homefront-v2-collision-preview');
const { homefrontRoadNetworkPreview } = require('../client/arena/homefront-road-network-preview.mjs');
const { previewDestinationConnectors } = require('../client/arena/homefront-destination-connectors.mjs');
const { previewDestinationDetours } = require('../client/arena/homefront-destination-detours.mjs');
function auditV2TravelPreview({ network=homefrontRoadNetworkPreview(), connectors, catalog=createV2CollisionPreview(),
  radius=0.55, sampleStep=0.75 } = {}) {
  if (!Array.isArray(network?.roads)) throw new TypeError('invalid road network');
  const roads=network.roads.map(road=>{
    const pass=canTraverseV2Preview(catalog,road.from,road.to,{radius,sampleStep});
    return {id:road.id,pass};
  });
  const roadPass=new Map(roads.map(r=>[r.id,r.pass]));
  const access=connectors??previewDestinationConnectors({
    roads:network.roads,
    sites:catalog.protectedSites,
    buildings:catalog.obstacles.map(b=>({id:b.id,x:b.x,z:b.z,w:b.halfX*2,d:b.halfZ*2,rotation:b.rotation}))
  }).connectors;
  const detourCandidates=previewDestinationDetours({connectors:access,buildings:catalog.obstacles.map(b=>({id:b.id,x:b.x,z:b.z,w:b.halfX*2,d:b.halfZ*2,rotation:b.rotation}))}).routes;
  const destinations=access.map(c=>{
    const direct=c.status==='candidate' && !!c.connector && canTraverseV2Preview(catalog,c.connector.from,c.connector.to,{radius,sampleStep});
    const detour=detourCandidates.find(d=>d.siteId===c.siteId);
    const alternate=!direct && detour?.status==='detour-candidate' && detour.segments.every(s=>canTraverseV2Preview(catalog,s.from,s.to,{radius,sampleStep}));
    const pass=roadPass.get(c.roadId)===true && (direct||alternate);
    return {siteId:c.siteId,roadId:c.roadId??null,pass,
      reason:pass?null:c.status!=='candidate'?'connector-'+c.status:
        !roadPass.get(c.roadId)?'road-impassable':'connector-impassable'};
  });
  return {version:2,previewOnly:true,roadCount:roads.length,
    failedRoads:roads.filter(x=>!x.pass),destinations,
    failedDestinations:destinations.filter(x=>!x.pass),
    allPass:roads.every(x=>x.pass)&&destinations.length>0&&destinations.every(x=>x.pass),
    scope:'sampled-proposed-building-and-current-terrain-not-live-approval'};
}
module.exports={auditV2TravelPreview};
