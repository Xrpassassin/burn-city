import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';
import { protectedOrganicSitesPreview } from './homefront-landmark-reservations.mjs';
import { reserveOrganicLandmarkClearance } from './homefront-landmark-reservations.mjs';
import { roadBuildingClearance } from './homefront-road-clearance.mjs';

// Planning-only access connectors. These are not approved traversal routes.
export function previewDestinationConnectors({
  roads = homefrontRoadNetworkPreview().roads,
  sites = protectedOrganicSitesPreview(),
  buildings = reserveOrganicLandmarkClearance().buildings
} = {}) {
  const result = [];
  for (const site of sites) {
    let best = null;
    for (const road of roads) {
      const dx = road.to.x - road.from.x, dz = road.to.z - road.from.z;
      const length2 = dx * dx + dz * dz;
      const t = length2 ? Math.max(0, Math.min(1, ((site.x-road.from.x)*dx+(site.z-road.from.z)*dz)/length2)) : 0;
      const x = road.from.x + t*dx, z = road.from.z + t*dz;
      const distance = Math.hypot(site.x-x,site.z-z);
      if (!best || distance < best.distance) best = { x, z, roadId: road.id, distance };
    }
    if (!best) { result.push({ siteId: site.id, status: 'no-road' }); continue; }
    const connector = { from: {x:best.x,z:best.z}, to:{x:site.x,z:site.z}, width:2.2 };
    const conflicts = buildings.filter(b => roadBuildingClearance(connector,b) < 0.55).map(b=>b.id);
    result.push({siteId:site.id,roadId:best.roadId,connector,conflicts,
      status: conflicts.length ? 'blocked' : 'candidate'});
  }
  return { version:2, connectors:result, blocked:result.filter(r=>r.status !== 'candidate'),
    scope:'geometry-preview-only' };
}
