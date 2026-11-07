// Pine Crossing occupies the northwest approach to the existing North Gate.
// World-space coordinates are shared by scenery, collision, and interaction catalogs.
export const PINE_CROSSING_BOUNDS = Object.freeze({ minX: -57, maxX: -11, minZ: -88, maxZ: -29 });
export const PINE_CROSSING_ROUTES = Object.freeze([
  { id: 'logging-road', width: 4.2, surface: 'gravel', points: [[-8,-82],[-20,-81],[-29,-75],[-35,-68],[-43,-62],[-47,-54],[-46,-43]] },
  { id: 'main-street', width: 5.2, surface: 'asphalt', points: [[-49,-43],[-43,-43],[-35,-43],[-26,-43],[-19,-43],[-16,-42]] },
  { id: 'creek-trail', width: 2.4, surface: 'dirt', points: [[-19,-43],[-20,-51],[-24,-59],[-23,-68],[-18,-75],[-15,-81]] },
  { id: 'store-walk', width: 1.8, surface: 'gravel', points: [[-42,-43],[-42,-45.7]] },
  { id: 'clinic-walk', width: 1.8, surface: 'gravel', points: [[-29,-43],[-29,-45.7]] },
  // Branch off Logging Bend into the radio relay clearing. No teleport/auto-travel.
  { id: 'relay-spur', width: 2.5, surface: 'gravel', points: [[-41,-63],[-44,-66],[-47,-69]] }
]);
export const PINE_CROSSING_BUILDINGS = Object.freeze([
  { id: 'pine_general_store', title: 'Pine Crossing General Store', sign: 'GENERAL STORE', x: -42, z: -49, finish: 'store' },
  { id: 'pine_clinic', title: 'Pine Crossing Clinic', sign: 'CLINIC', x: -29, z: -49, finish: 'clinic' }
]);
export const pineCrossingBuilding = id => PINE_CROSSING_BUILDINGS.find(building => building.id === id);

// Solid roadside scenery is shared with server collision. Main Street and
// the woodland trail retain a continuous lane past these shoulder obstacles.
export const PINE_ROADSIDE_SITES = Object.freeze([
  { id: 'pine-deadfall', kind: 'deadfall', x: -40.5, z: -57, halfX: 1.9, halfZ: 0.44 },
  { id: 'pine-abandoned-pickup', kind: 'pickup', x: -36.5, z: -38.7, halfX: 2.2, halfZ: 1 },
  { id: 'pine-evacuation-barrier', kind: 'barrier', x: -21.5, z: -39.1, halfX: 2.05, halfZ: 0.57 },
  // Grounded collision footprint of the derelict signal station; the antenna is visual only.
  { id: 'pine-relay-station', kind: 'relay', x: -51, z: -70, halfX: 1.75, halfZ: 1.35 }
]);

const PINE_SOUND_SOURCES = [
  { id: 'north-pines', kind: 'canopy', x: -25, z: -77, height: 4, radius: 15 },
  { id: 'logging-pines', kind: 'canopy', x: -41, z: -65, height: 4.5, radius: 15 },
  { id: 'creek-pines', kind: 'canopy', x: -20, z: -57, height: 3.5, radius: 11 },
  { id: 'store-awning', kind: 'canvas', x: -41, z: -46.1, height: 2.3, radius: 11 },
  { id: 'relay-aerial', kind: 'metal', x: -51, z: -70, height: 4.4, radius: 9 }
];
const PINE_ROOM_SOUNDS = {
  pine_general_store: { id: 'store-rafters', kind: 'timber', x: -41, z: -49.5, height: 2.4 },
  pine_clinic: { id: 'clinic-duct', kind: 'metal', x: -28.5, z: -49.8, height: 2.1 }
};

export function pineAmbienceAt(x, z, interiorId) {
  if (interiorId) return PINE_ROOM_SOUNDS[interiorId] ?? null;
  let nearest = null, best = Infinity;
  for (const source of PINE_SOUND_SOURCES) {
    const distance = Math.hypot(x - source.x, z - source.z);
    if (distance < source.radius && distance < best) {
      nearest = source;
      best = distance;
    }
  }
  return nearest;
}

// Runs downhill from the logging-road culvert to the woods south of town.
export const PINE_CREEK = Object.freeze([
  [-13.7,-77.5], [-15,-74], [-17.2,-70.5], [-19.3,-67], [-19.6,-62],
  [-20.8,-58.7], [-18.4,-54], [-16.7,-49.5], [-14.3,-46], [-13.2,-41.3],
  [-14.5,-37.5], [-17.4,-34.5]
]);

export function inPineCrossing(x, z, padding = 0) {
  const { minX, maxX, minZ, maxZ } = PINE_CROSSING_BOUNDS;
  return x >= minX - padding && x <= maxX + padding && z >= minZ - padding && z <= maxZ + padding;
}

function segmentProgress(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
}

function segmentDistance(x, z, a, b) {
  const t = segmentProgress(x, z, a, b);
  return Math.hypot(x - a[0] - t * (b[0] - a[0]), z - a[1] - t * (b[1] - a[1]));
}

export function nearestPineCreek(x, z) {
  let nearest = { x: 0, z: 0, distance: Infinity };
  for (let i = 1; i < PINE_CREEK.length; i++) {
    const a = PINE_CREEK[i - 1], b = PINE_CREEK[i];
    const t = segmentProgress(x, z, a, b);
    const cx = a[0] + t * (b[0] - a[0]), cz = a[1] + t * (b[1] - a[1]);
    const distance = Math.hypot(x - cx, z - cz);
    if (distance < nearest.distance) nearest = { x: cx, z: cz, distance };
  }
  return nearest;
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
    const atRoadsideSite = PINE_ROADSIDE_SITES.some(site =>
      Math.abs(x - site.x) < site.halfX + 0.6 && Math.abs(z - site.z) < site.halfZ + 0.6);
    if (inParcel || inTownClearing || atRoadsideSite || pineRouteDistance(x, z) < 1.6 ||
        nearestPineCreek(x, z).distance < 1.35 || jitter(gx, gz, 3) < 0.22) continue;
    const height = 4.1 + jitter(gx, gz, 4) * 4.5;
    trees.push({ id: 'pine:' + gx + ',' + gz, x, z, height, radius: 0.24 + height * 0.023,
      variation: jitter(gx, gz, 5) });
  }
  return trees;
})());

export const PINE_PATROLS = Object.freeze([
  { id: 'logging-approach', points: [[-20,-76],[-24,-73]] },
  { id: 'logging-bend', points: [[-39,-66],[-42,-62],[-44,-58],[-42,-62]] },
  { id: 'main-street', points: [[-39,-42],[-36,-42],[-32,-43],[-36,-42]] },
  { id: 'creek-bank', points: [[-23,-55],[-24,-59],[-23,-64],[-24,-59]] },
  // A distinct route guard; noise at the cache can bring it toward the player.
  { id: 'relay-watch', points: [[-45,-68],[-47,-66],[-44,-65],[-45,-68]] }
]);

export function pineSurfaceAt(x, z) {
  for (const { width, surface, points } of PINE_CROSSING_ROUTES) {
    for (let i = 1; i < points.length; i++) {
      if (segmentDistance(x, z, points[i - 1], points[i]) <= width / 2) return surface;
    }
  }
  return 'forest';
}
