// Planning-only spawn-to-destination corridor diagnostics.
// These are sampled visual-footprint checks, NOT authoritative server navigation.
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';
import { protectedOrganicSitesPreview } from './homefront-landmark-reservations.mjs';
import { previewDestinationConnectors } from './homefront-destination-connectors.mjs';
import { auditHomefrontRoadSweeps } from './homefront-road-sweep-audit.mjs';

export function auditHomefrontDestinationRoutes({ network = homefrontRoadNetworkPreview(),
  sites = protectedOrganicSitesPreview(), buildings = [], connectors = null } = {}) {
  const candidates = connectors ?? previewDestinationConnectors({
    roads: network.roads, sites, buildings
  }).connectors;
  const adjacency = new Map();
  const add = (a,b) => {
    if (!adjacency.has(a)) adjacency.set(a,new Set());
    adjacency.get(a).add(b);
  };
  for (const road of network.roads) {
    add(road.from.id,road.to.id);
    add(road.to.id,road.from.id);
  }
  const origin = candidates.find(c=>c.siteId === 'world:spawn');
  const originRoad = network.roads.find(r=>r.id === origin?.roadId);
  const visited=new Set();
  const queue=[];
  if (originRoad) for(const id of [originRoad.from.id,originRoad.to.id]){
    if (!visited.has(id)){visited.add(id);queue.push(id);}
  }
  for(let i=0;i<queue.length;i++) for(const neighbor of adjacency.get(queue[i])||[]) {
    if (!visited.has(neighbor)){visited.add(neighbor);queue.push(neighbor);}
  }
  const destinations=candidates.map(candidate=>{
    const road=network.roads.find(r=>r.id===candidate.roadId);
    const connected=!!road && (visited.has(road.from.id)||visited.has(road.to.id));
    const swept=candidate.connector && candidate.status==='candidate'
      ? auditHomefrontRoadSweeps({roads:[{...candidate.connector,id:'connector:'+candidate.siteId}],
        buildings,playerRadius:0.45,margin:0.3}) : null;
    const status=!originRoad?'no-spawn-anchor':
      candidate.status!=='candidate'?'connector-'+candidate.status:
      !connected?'disconnected-road-graph':
      !swept?.clear?'connector-footprint-blocked':'candidate';
    return {siteId:candidate.siteId,roadId:candidate.roadId??null,status,
      sampledConflicts:swept?.conflicts ?? [],graphConnected:connected};
  });
  return {version:2,originRoadId:originRoad?.id??null,destinations,
    blockers:destinations.filter(d=>d.status!=='candidate'),
    allCandidates:destinations.length>0 && destinations.every(d=>d.status==='candidate'),
    scope:'preview-only-not-authoritative-traversal'};
}
