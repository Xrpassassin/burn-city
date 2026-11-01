'use strict';
// Read-only journey audit: requires a traversable continuous road graph from spawn.
const { auditV2TravelPreview } = require('./homefront-v2-travel-audit');
const { homefrontRoadNetworkPreview } = require('../client/arena/homefront-road-network-preview.mjs');
const { previewDestinationConnectors } = require('../client/arena/homefront-destination-connectors.mjs');
const { createV2CollisionPreview } = require('./homefront-v2-collision-preview');
function auditV2Journeys({network=homefrontRoadNetworkPreview(), catalog=createV2CollisionPreview(),
  connectors, radius=0.55, sampleStep=0.75}={}) {
  const access=connectors??previewDestinationConnectors({
    roads:network.roads,sites:catalog.protectedSites,
    buildings:catalog.obstacles.map(b=>({id:b.id,x:b.x,z:b.z,w:2*b.halfX,d:2*b.halfZ,rotation:b.rotation}))
  }).connectors;
  const travel=auditV2TravelPreview({network,catalog,connectors:access,radius,sampleStep});
  const passRoads=new Set(network.roads.filter(r=>!travel.failedRoads.some(f=>f.id===r.id)).map(r=>r.id));
  const adjacency=new Map();
  const link=(a,b)=>{if(!adjacency.has(a))adjacency.set(a,new Set());adjacency.get(a).add(b);};
  for(const road of network.roads) if(passRoads.has(road.id)) {
    link(road.from.id,road.to.id);link(road.to.id,road.from.id);
  }
  const spawn=access.find(c=>c.siteId==='world:spawn');
  const origin=network.roads.find(r=>r.id===spawn?.roadId);
  const spawnPass=travel.destinations.find(d=>d.siteId==='world:spawn')?.pass===true;
  const visited=new Set(),queue=[];
  if(spawnPass && origin && passRoads.has(origin.id))for(const node of [origin.from.id,origin.to.id]){
    visited.add(node);queue.push(node);
  }
  for(let i=0;i<queue.length;i++)for(const node of adjacency.get(queue[i])??[]){
    if(!visited.has(node)){visited.add(node);queue.push(node);}
  }
  const destinations=travel.destinations.map(d=>{
    const road=network.roads.find(r=>r.id===d.roadId);
    const reachable=!!road && passRoads.has(road.id) &&
      (visited.has(road.from.id)||visited.has(road.to.id));
    const pass=spawnPass && d.pass && reachable;
    return {...d,pass:!!pass,graphReachable:reachable,
      reason:pass?null:!spawnPass?'spawn-connector-failed':
        !d.pass?d.reason:'no-traversable-route-from-spawn'};
  });
  return {version:2,previewOnly:true,originRoadId:spawnPass?origin?.id??null:null,
    traversableRoadCount:passRoads.size,reachableNodeCount:visited.size,
    destinations,failedDestinations:destinations.filter(d=>!d.pass),
    allJourneysPass:destinations.length>0 && destinations.every(d=>d.pass),
    scope:'sampled-segment-graph-preview-not-physical-playtest-or-production'};
}
module.exports={auditV2Journeys};
