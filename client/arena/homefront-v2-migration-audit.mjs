// Preview-only migration gate. Do not use this to activate v2 gameplay:
// geometric clearance and graph connectivity do not prove physical walkability.
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';
import { auditOrganicRoadGrades } from './homefront-road-grade-audit.mjs';
import { auditOrganicRoadWidth } from './homefront-road-width-audit.mjs';
import { auditOrganicCorridorObstacles } from './homefront-corridor-obstacles.mjs';
import { auditOrganicRouteReachability } from './homefront-route-reachability.mjs';
import { buildableOrganicSitesPreview, auditOrganicRoadClearance } from './homefront-road-clearance.mjs';
import { reserveOrganicLandmarkClearance, protectedOrganicSitesPreview } from './homefront-landmark-reservations.mjs';

export function auditHomefrontV2MigrationReadiness() {
  const network = homefrontRoadNetworkPreview();
  const topology = auditOrganicRouteReachability(network);
  const terrainGrades = auditOrganicRoadGrades({ roads: network.roads });
  const roadWidth = auditOrganicRoadWidth({ roads: network.roads });
  const roadSites = buildableOrganicSitesPreview({ roads: network.roads });
  const reserved = reserveOrganicLandmarkClearance({ buildings: roadSites.buildings });
  const clearance = auditOrganicRoadClearance({ roads: network.roads, buildings: reserved.buildings });
  const corridorObstacles = auditOrganicCorridorObstacles({ roads: network.roads, buildings: reserved.buildings });
  const checks = {
    roadGraphConnected: topology.connected && topology.disconnectedSpurs.length === 0,
    roadCorridorsClear: clearance.clear,
    previewBuildingCorridorsClear: corridorObstacles.pass,
    roadGradesWithinPreviewLimit: terrainGrades.acceptable,
    roadWidthSlopesWithinPreviewLimit: roadWidth.acceptable,
    protectedSitesReserved: reserved.buildings.every(b => protectedOrganicSitesPreview().every(site =>
      Math.hypot(b.x-site.x,b.z-site.z) >= site.radius + Math.hypot(b.w,b.d)/2 + 1))
  };
  const requiredBeforeActivation = [
    'verify full-width road sweep collision against server geometry',
    'validate physical spawn-to-landmark routes and terrain slopes',
    'version and migrate saved coordinates, interiors, AI and POI references',
    'complete desktop, mobile and two-player traversal tests'
  ];
  return { version: 2, checks, topology, terrainGrades, roadWidth, corridorObstacles,
    summary: { roadCount: network.roads.length, retainedBuildings: reserved.buildings.length,
      excludedForRoads: roadSites.excluded.length, excludedForLandmarks: reserved.excluded.length,
      protectedSites: reserved.protectedSites },
    blockers: Object.entries(checks).filter(([,pass])=>!pass).map(([name])=>name),
    requiredBeforeActivation,
    readyForActivation: false };
}
