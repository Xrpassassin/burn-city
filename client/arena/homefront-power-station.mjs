// Ashfall Thermal Station: distant, atmospheric landmark beyond the server's
// circular 100-unit world limit. Inspired by abandoned Soviet-era industrial
// architecture, not a 1:1 recreation of a real facility.
//
// Presentation-only skyline: NO loot, triggers, artificial collision, radiation
// damage, or interaction markers. Keeping every footprint outside the playable
// radius prevents scenery-only geometry from becoming an invisible-wall exploit.
export const POWER_STATION_SITE = Object.freeze({
  id: 'ashfall-thermal-station',
  label: 'Ashfall Thermal Station',
  x: -122, z: 34,
  playableRadius: 100,
  visualRadius: 32
});

const COLORS = Object.freeze({
  concrete: 0x686a63,
  stainedConcrete: 0x454b49,
  dark: 0x222a2c,
  reactor: 0x424e50,
  rust: 0x7a4a33,
  steel: 0x495553,
  window: 0x233f46,
  hazard: 0xbe974c,
  beacon: 0xf44d2d
});
const MATERIAL_CACHE = new WeakMap();
function stationMaterial(THREE, kind) {
  let cache = MATERIAL_CACHE.get(THREE);
  if (!cache) { cache = new Map(); MATERIAL_CACHE.set(THREE, cache); }
  if (!cache.has(kind)) {
    const color = COLORS[kind] ?? COLORS.concrete;
    cache.set(kind, new THREE.MeshStandardMaterial({
      color, roughness: kind === 'steel' || kind === 'reactor' ? 0.74 : 0.95,
      metalness: kind === 'steel' || kind === 'rust' ? 0.38 : 0.05,
      emissive: kind === 'beacon' ? color : 0x000000,
      emissiveIntensity: kind === 'beacon' ? 1.1 : 0
    }));
  }
  return cache.get(kind);
}

export function buildPowerStationSkyline(THREE, terrainY = 0) {
  if (!THREE || typeof THREE.Group !== 'function' ||
      typeof THREE.LatheGeometry !== 'function' ||
      typeof THREE.Vector2 !== 'function') throw new TypeError('Three.js with lathe support required');
  if (!Number.isFinite(terrainY)) throw new TypeError('finite terrain elevation required');
  const root = new THREE.Group();
  root.name = 'homefront-skyline:' + POWER_STATION_SITE.id;
  root.position.set(POWER_STATION_SITE.x, terrainY, POWER_STATION_SITE.z);
  root.userData = {
    visualOnly: true, interactive: false, collision: false,
    stationId: POWER_STATION_SITE.id, district: 'industrial'
  };
  const place = (geometry, material, x, y, z, halfX, tag) => {
    // All components, including their footprint, must remain beyond x=-100.
    if (POWER_STATION_SITE.x + x + halfX >= -POWER_STATION_SITE.playableRadius) {
      throw new Error('power_station_inside_playable_world:' + tag);
    }
    const mesh = new THREE.Mesh(geometry, stationMaterial(THREE, material));
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = { visualOnly: true, interactive: false, collision: false,
      stationId: POWER_STATION_SITE.id, part: tag, halfWidthX: halfX };
    root.add(mesh);
    return mesh;
  };
  const box = (w, h, d, x, y, z, material, tag) =>
    place(new THREE.BoxGeometry(w, h, d), material, x, y, z, w / 2, tag);
  const cylinder = (rTop, rBottom, h, x, y, z, material, tag, segments = 12) =>
    place(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material,
      x, y, z, Math.max(rTop, rBottom), tag);

  // The traversable ground mesh ends at x=-102. This static industrial
  // embankment meets that edge without crossing into the playable circle;
  // otherwise the distant station appears to float above empty sky.
  box(43, 1.8, 72, -1.5, -0.9, 0, 'stainedConcrete', 'station-cinder-foundation');
  box(40, 0.22, 68, -2.0, -0.09, 0, 'dark', 'station-foundation-deck');

  // Two hyperbolic cooling-tower silhouettes: 12-sided lathe geometry, only
  // seven profile rings per tower. One has a shortened, stained upper section.
  function coolingTower(x, z, height, damaged, tag) {
    box(11, 0.8, 11, x, 0.4, z, 'dark', tag + '-foundation');
    const profile = [
      [4.85, 0], [4.55, 2.5], [3.50, height * 0.44],
      [3.22, height * 0.70], [3.70, height * 0.91], [4.04, height]
    ].map(([radius, y]) => new THREE.Vector2(radius, y));
    place(new THREE.LatheGeometry(profile, 14), damaged ? 'stainedConcrete' : 'concrete',
      x, 0.8, z, 4.85, tag + '-shell');
    cylinder(3.9, 3.9, 0.12, x, 0.8 + height - 0.05, z, 'dark', tag + '-empty-throat', 14);
    cylinder(4.2, 4.2, 0.3, x, 0.8 + height, z, 'stainedConcrete', tag + '-rim', 14);
    // Stained service bands and a tiny distant warning light. No point lights.
    box(3.9, 0.45, 0.12, x - 0.15, 0.8 + height * 0.42, z + 3.24, 'rust', tag + '-water-stain');
    box(0.55, 0.55, 0.55, x + 3, 0.8 + height + 0.44, z, 'beacon', tag + '-beacon');
  }
  coolingTower(-11, -13, 30, false, 'cooling-east');
  coolingTower(-5, 15, 22, true, 'cooling-west');

  // Tall rectangular reactor-block silhouette and split roof; these are past
  // the map boundary and deliberately cannot be entered or destroyed.
  box(13, 13, 16, 11, 6.5, 0, 'reactor', 'reactor-hall');
  box(13.8, 0.9, 17, 11, 13.1, 0, 'stainedConcrete', 'reactor-roof');
  box(4.1, 1.5, 5, 8, 14.1, -3.5, 'dark', 'collapsed-roof-panel');
  box(3.0, 0.4, 7.5, 14.8, 13.9, 2, 'rust', 'reactor-exposed-beam');
  for (const z of [-5, 0, 5]) {
    box(0.14, 1.6, 2.4, 17.6, 8.6, z, 'window', 'reactor-broken-window-' + z);
  }
  box(7, 0.45, 0.3, 11, 7.5, -8.16, 'hazard', 'reactor-warning-band');

  // Elevated turbine/service modules, rooftop pipes and ventilation. No new
  // ground-level blockers are introduced within the playable district.
  box(8, 4.5, 9, 1.4, 2.25, -2, 'steel', 'turbine-module');
  box(9, 0.55, 9.8, 1.4, 4.7, -2, 'rust', 'turbine-roof');
  box(16.0, 0.7, 0.7, 3.2, 9.7, -10, 'rust', 'steam-header');
  box(10.0, 0.5, 0.7, 4, 5.4, 7.5, 'steel', 'feed-pipe');
  box(11.5, 0.45, 2.6, 7, 11.1, -7, 'dark', 'maintenance-gantry');
  box(0.25, 2.2, 0.25, 1.7, 9.9, -7, 'steel', 'gantry-support-a');
  box(0.25, 2.2, 0.25, 12, 9.9, -7, 'steel', 'gantry-support-b');

  // Two silent smokestacks and red aviation beacons; deliberately static so
  // adding this backdrop does not require animation loops or shadows.
  for (const [i, x, z, h] of [[0, 4, -20, 33], [1, 10, -20, 26]]) {
    cylinder(0.9, 1.45, h, x, h / 2, z, 'rust', 'smokestack-' + i);
    cylinder(1.07, 1.07, 0.45, x, h - 0.6, z, 'dark', 'stack-cap-' + i);
    cylinder(1.45, 1.45, 0.55, x, h * 0.62, z, 'hazard', 'stack-safety-band-' + i);
    box(0.55, 0.6, 0.55, x, h + 0.32, z, 'beacon', 'stack-warning-' + i);
  }

  // Skybridges and broken upper windows tie the silhouette together. The
  // station is a distant visual goal, not an actionable point of interest.
  box(8.7, 0.4, 1.15, 6.0, 16.9, 10.5, 'steel', 'overhead-walkway');
  box(8.7, 0.25, 0.15, 6.0, 17.5, 11.0, 'hazard', 'walkway-guardrail');
  box(0.65, 2.4, 0.65, 10.0, 15.5, 10.5, 'rust', 'walkway-gantry-support');
  return root;
}
