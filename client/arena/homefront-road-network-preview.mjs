// Homefront v2 road-network proposal. Preview only: not an authority for
// collision, traversal, spawns, POIs, or persisted coordinates.
import { homefrontOrganicLayoutPreview, HOMEFRONT_ORGANIC_LAYOUT_VERSION } from './homefront-building-layout.mjs';

export const HOMEFRONT_ROAD_PREVIEW_VERSION = HOMEFRONT_ORGANIC_LAYOUT_VERSION;
export function homefrontRoadNetworkPreview() {
  // A reproducible bent backbone and short district spurs, built from
  // geometric nodes instead of a global 20-unit street lattice.
  const spine = [];
  for (let i = -8; i <= 8; i++) {
    const z = i * 11;
    const x = Math.sin(i * 0.51) * 13 + Math.sin(i * 1.17) * 3;
    spine.push({ id: 'spine:' + i, x, z });
  }
  const roads = [];
  for (let i = 1; i < spine.length; i++) {
    roads.push({ id: 'backbone:' + i, from: spine[i - 1], to: spine[i], width: 5.2, kind: 'arterial' });
  }
  const buildings = [...homefrontOrganicLayoutPreview()];
  const districts = new Map();
  for (const b of buildings) {
    const key = b.district;
    const d = districts.get(key) || { x: 0, z: 0, count: 0 };
    d.x += b.x; d.z += b.z; d.count++;
    districts.set(key, d);
  }
  for (const [id, district] of [...districts.entries()].sort((a, b) => a[0] - b[0])) {
    const center = { id: 'district:' + id, x: district.x / district.count, z: district.z / district.count };
    const anchor = spine.reduce((best, p) => !best ||
      Math.hypot(center.x - p.x, center.z - p.z) < Math.hypot(center.x - best.x, center.z - best.z) ? p : best, null);
    if (anchor && Math.hypot(center.x - anchor.x, center.z - anchor.z) > 5) {
      roads.push({ id: 'spur:' + id, from: anchor, to: center, width: 3.5, kind: 'district' });
    }
  }
  return { version: HOMEFRONT_ROAD_PREVIEW_VERSION, nodes: spine, roads };
}
