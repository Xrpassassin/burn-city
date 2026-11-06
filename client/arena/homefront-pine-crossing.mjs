// Pine Crossing occupies the northwest approach to the existing North Gate.
// World-space coordinates are shared by scenery, collision, and interaction catalogs.
export const PINE_CROSSING_BOUNDS = Object.freeze({ minX: -57, maxX: -11, minZ: -88, maxZ: -29 });
export const PINE_CROSSING_ROUTES = Object.freeze([
  { id: 'logging-road', width: 4.2, surface: 'gravel', points: [[-8,-82],[-20,-81],[-29,-75],[-35,-68],[-43,-62],[-47,-54],[-46,-43]] },
  { id: 'main-street', width: 5.2, surface: 'asphalt', points: [[-49,-43],[-43,-43],[-35,-43],[-26,-43],[-19,-43],[-16,-42]] },
  { id: 'creek-trail', width: 2.4, surface: 'dirt', points: [[-19,-43],[-20,-51],[-24,-59],[-23,-68],[-18,-75],[-15,-81]] },
  { id: 'store-walk', width: 1.8, surface: 'gravel', points: [[-42,-43],[-42,-45.7]] },
  { id: 'clinic-walk', width: 1.8, surface: 'gravel', points: [[-29,-43],[-29,-45.7]] }
]);
export const PINE_CROSSING_BUILDINGS = Object.freeze([
  { id: 'pine_general_store', title: 'Pine Crossing General Store', sign: 'GENERAL STORE', x: -42, z: -49, finish: 'store' },
  { id: 'pine_clinic', title: 'Pine Crossing Clinic', sign: 'CLINIC', x: -29, z: -49, finish: 'clinic' }
]);
export const pineCrossingBuilding = id => PINE_CROSSING_BUILDINGS.find(building => building.id === id);

export function inPineCrossing(x, z, padding = 0) {
  const { minX, maxX, minZ, maxZ } = PINE_CROSSING_BOUNDS;
  return x >= minX - padding && x <= maxX + padding && z >= minZ - padding && z <= maxZ + padding;
}

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function pineRouteDistance(x, z) {
  let distance = Infinity;
  for (const { width, points } of PINE_CROSSING_ROUTES) {
    for (let i = 1; i < points.length; i++) {
      distance = Math.min(distance, segmentDistance(x, z, points[i - 1], points[i]) - width / 2);
    }
  }
  return distance;
}

function jitter(x, z, salt) {
  const hash = Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(salt, 83492791);
  const mixed = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

export const PINE_CROSSING_TREES = Object.freeze((() => {
  const trees = [];
  for (let gx = -19; gx <= -6; gx++) for (let gz = -29; gz <= -10; gz++) {
    const x = gx * 3 + jitter(gx, gz, 1) * 2.3;
    const z = gz * 3 + jitter(gx, gz, 2) * 2.3;
    const inParcel = PINE_CROSSING_BUILDINGS.some(building =>
      x > building.x - 3.6 && x < building.x + 8.4 && Math.abs(z - building.z) < 3.6);
    const inTownClearing = z >= -46 && z <= -37;
    if (inParcel || inTownClearing || pineRouteDistance(x, z) < 1.6 || jitter(gx, gz, 3) < 0.22) continue;
    const height = 4.1 + jitter(gx, gz, 4) * 4.5;
    trees.push({ id: 'pine:' + gx + ',' + gz, x, z, height, radius: 0.24 + height * 0.023,
      variation: jitter(gx, gz, 5) });
  }
  return trees;
})());
