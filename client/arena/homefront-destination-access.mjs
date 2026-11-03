// Preview-only destination-access diagnostics. This measures the off-road
// connector required to reach each authored site; it does not assert walkability.
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';
import { protectedOrganicSitesPreview } from './homefront-landmark-reservations.mjs';

export function auditOrganicDestinationAccess({ roads = homefrontRoadNetworkPreview().roads,
  sites = protectedOrganicSitesPreview(), maxConnectorLength = 18 } = {}) {
  if (!Number.isFinite(maxConnectorLength) || maxConnectorLength < 0)
    throw new RangeError('invalid destination connector threshold');
  const destinations = sites.map(site => {
    let nearest = null;
    for (const road of roads) {
      const dx = road.to.x - road.from.x, dz = road.to.z - road.from.z;
      const length2 = dx*dx + dz*dz;
      const t = length2 ? Math.max(0, Math.min(1, ((site.x-road.from.x)*dx+(site.z-road.from.z)*dz)/length2)) : 0;
      const x = road.from.x + t*dx, z = road.from.z + t*dz;
      const distance = Math.hypot(site.x-x,site.z-z);
      if (!nearest || distance < nearest.distance)
        nearest = { roadId: road.id, distance, x, z };
    }
    const gap = nearest ? Math.max(0, nearest.distance - (roads.find(r=>r.id===nearest.roadId)?.width || 0)/2 - site.radius) : Infinity;
    return { siteId: site.id, roadId: nearest?.roadId || null,
      connectorGap: Number.isFinite(gap) ? Number(gap.toFixed(3)) : null,
      reachableByConnector: gap <= maxConnectorLength };
  });
  return { total: destinations.length, connected: destinations.filter(d=>d.reachableByConnector).length,
    missing: destinations.filter(d=>!d.reachableByConnector), destinations,
    allWithinConnectorRange: destinations.every(d=>d.reachableByConnector),
    scope: 'distance-only-not-traversal' };
}
