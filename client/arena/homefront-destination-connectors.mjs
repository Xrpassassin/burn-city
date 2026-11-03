import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';
import { protectedOrganicSitesPreview, reserveOrganicLandmarkClearance } from './homefront-landmark-reservations.mjs';
import { roadBuildingClearance } from './homefront-road-clearance.mjs';

// Planning-only access connectors. These are not approved traversal routes.
// Prefer a clear alternate approach over a blocked nearest approach.
export function previewDestinationConnectors({
  roads = homefrontRoadNetworkPreview().roads,
  sites = protectedOrganicSitesPreview(),
  buildings = reserveOrganicLandmarkClearance().buildings
} = {}) {
  const result = [];
  for (const site of sites) {
    const options = [];
    for (const road of roads) {
      const dx = road.to.x - road.from.x, dz = road.to.z - road.from.z;
      const length2 = dx * dx + dz * dz;
      const t = length2 ? Math.max(0, Math.min(1, ((site.x-road.from.x)*dx+(site.z-road.from.z)*dz)/length2)) : 0;
      const x = road.from.x + t*dx, z = road.from.z + t*dz;
      const distance = Math.hypot(site.x-x,site.z-z);
      const connector = {from:{x,z},to:{x:site.x,z:site.z},width:2.2};
      const conflicts = buildings.filter(b => roadBuildingClearance(connector,b) < 0.55).map(b=>b.id);
      options.push({siteId:site.id,roadId:road.id,connector,conflicts,distance,
        status:conflicts.length?'blocked':'candidate'});
    }
    options.sort((a,b)=>a.distance-b.distance || String(a.roadId).localeCompare(String(b.roadId)));
    // Cap the detour to avoid an apparently clear connector crossing the whole map.
    const nearest = options[0];
    const acceptable = options.find(o => o.status==='candidate' &&
      o.distance <= Math.max(18,(nearest?.distance??0)+12));
    const chosen = acceptable ?? nearest;
    result.push(chosen ? {
      siteId:chosen.siteId,roadId:chosen.roadId,connector:chosen.connector,
      conflicts:chosen.conflicts,status:chosen.status,
      alternateApproach:chosen!==nearest
    } : {siteId:site.id,status:'no-road'});
  }
  return {version:2,connectors:result,blocked:result.filter(r=>r.status!=='candidate'),
    scope:'geometry-preview-only'};
}
