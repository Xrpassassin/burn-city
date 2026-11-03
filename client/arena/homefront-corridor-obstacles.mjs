// Preview-only swept corridor audit against version 2 retained footprints.
// Uses conservative circle bounds; final validation needs server swept collision.
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';
import { buildableOrganicSitesPreview, roadBuildingClearance } from './homefront-road-clearance.mjs';
import { reserveOrganicLandmarkClearance } from './homefront-landmark-reservations.mjs';

export function auditOrganicCorridorObstacles({ roads = homefrontRoadNetworkPreview().roads,
  buildings = reserveOrganicLandmarkClearance().buildings, playerRadius = 0.55,
  shoulder = 0.5 } = {}) {
  if (![playerRadius, shoulder].every(Number.isFinite) || playerRadius < 0 || shoulder < 0)
    throw new RangeError('invalid player or shoulder clearance');
  const conflicts = [];
  for (const road of roads) for (const building of buildings) {
    const clearance = roadBuildingClearance(road, building);
    if (clearance < playerRadius + shoulder)
      conflicts.push({ roadId: road.id, buildingId: building.id,
        clearance: Number(clearance.toFixed(3)) });
  }
  return { roadCount: roads.length, buildingCount: buildings.length,
    playerRadius, shoulder, conflicts, pass: conflicts.length === 0,
    scope: 'v2-preview-buildings-only' };
}
