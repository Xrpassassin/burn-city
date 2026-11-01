// Preview-only geometric audit. No mutation of server collision or live road layout.
import { homefrontOrganicLayoutPreview } from './homefront-building-layout.mjs';
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';

export function roadBuildingClearance(road, building) {
  const ax = road.from.x, az = road.from.z, bx = road.to.x, bz = road.to.z;
  const dx = bx - ax, dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1,
    ((building.x - ax) * dx + (building.z - az) * dz) / length2)) : 0;
  const distance = Math.hypot(building.x - (ax + t * dx), building.z - (az + t * dz));
  // Conservative circumscribed radius accounts for rotated rectangular footprints.
  const footprint = Math.hypot(building.w, building.d) / 2;
  return distance - footprint - road.width / 2;
}

export function auditOrganicRoadClearance({ roads = homefrontRoadNetworkPreview().roads,
  buildings = [...homefrontOrganicLayoutPreview()], margin = 1 } = {}) {
  if (!Number.isFinite(margin) || margin < 0) throw new RangeError('invalid road clearance margin');
  const conflicts = [];
  for (const road of roads) for (const building of buildings) {
    const clearance = roadBuildingClearance(road, building);
    if (clearance < margin) conflicts.push({
      roadId: road.id, buildingId: building.id,
      clearance: Math.round(clearance * 1000) / 1000
    });
  }
  return { roadCount: roads.length, buildingCount: buildings.length, conflicts,
    clear: conflicts.length === 0 };
}
