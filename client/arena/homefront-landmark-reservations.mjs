// Protected authored gameplay sites for the proposed Homefront v2 map.
// Preview only: the live server remains authoritative for POIs and respawns.
import { LANDMARKS } from './homefront-exploration-content.mjs';
import { homefrontOrganicLayoutPreview } from './homefront-building-layout.mjs';
import { buildableOrganicSitesPreview } from './homefront-road-clearance.mjs';

export const HOMEFRONT_V2_SITE_RADIUS = 7;
const FIXED_SITES = Object.freeze([
  { id: 'world:spawn', x: 0, z: 0, radius: 19 },
  { id: 'rescue:stranded_bus', x: 35, z: -42, radius: 7 },
  { id: 'rescue:collapsed_apartments', x: -22, z: 48, radius: 7 },
  { id: 'rescue:quarantine_shelter', x: 36, z: 38, radius: 7 }
]);

export function protectedOrganicSitesPreview() {
  return [
    ...FIXED_SITES,
    ...LANDMARKS.map(site => ({ id: 'landmark:' + site.id, x: site.x, z: site.z, radius: HOMEFRONT_V2_SITE_RADIUS }))
  ];
}

export function reserveOrganicLandmarkClearance({ buildings = buildableOrganicSitesPreview().buildings,
  sites = protectedOrganicSitesPreview(), margin = 1 } = {}) {
  if (!Number.isFinite(margin) || margin < 0) throw new RangeError('invalid landmark margin');
  const kept = [], excluded = [];
  for (const building of buildings) {
    const extent = Math.hypot(building.w, building.d) / 2;
    const blockers = sites.filter(site => Math.hypot(building.x - site.x, building.z - site.z)
      < site.radius + extent + margin).map(site => site.id);
    if (blockers.length) excluded.push({ id: building.id, siteIds: blockers });
    else kept.push(building);
  }
  return { version: 2, buildings: kept, excluded, protectedSites: sites.length,
    sourceSites: [...homefrontOrganicLayoutPreview()].length };
}
