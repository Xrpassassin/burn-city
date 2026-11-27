// The Undercroft (Ember Crossroads): pure layout + city-entrance lot finder. No three.js, testable in node.
// The hub is its own realm off the city map (like Glassroot Grove): the city clamps walkers to ±900 and the server keeps ±2000,
// so players inside send real coordinates around UG, see each other there, and never draw city players (window.__peerRealm).
// Local coordinates: origin = the brazier at the plaza centre, +z = south toward the stair up to the city, -z = north toward the
// Descent Gate, +x = east (Ledger Hall: quest board), -x = west (Ossuary Chapel: the Ember Stair side gate).
export const UG = { x: -1450, z: -1450 };
export const inUndercroft = (x, z) => x < -1150 && z < -1150 && x > -1995 && z > -1995;
export const L = {
  PLAZA_R: 12, STEPS: [12, 13, 14, 15], STEP_H: .45, GALLERY_Y: 1.8, GALLERY_R: 22, DOME_Y: 9.5,
  HALL_HW: 3.6, HALL_IN: 20, HALL_OUT: 47, HALL_SPRING: 4.6, HALL_APEX: 7.6,
  NORTH: { x: 0, z: -60, r: 14, h: 21 },      // Descent Gate chamber
  EAST: { x: 57, z: 0, hw: 10, hd: 8.5, h: 9 }, // Ledger Hall
  WEST: { x: -56, z: 0, r: 11, h: 11 },        // Ossuary Chapel
  SOUTH_END: 50,                              // foot of the stair up to the city
  DAIS_R: 2.7,
};
export const toLocal = (x, z) => [x - UG.x, z - UG.z];
export const toWorld = (lx, lz) => [lx + UG.x, lz + UG.z];
// Named spots (local): where you arrive, where things stand.
export const SPOTS = {
  arrive: { x: 0, z: 44, face: { x: 0, z: 0 } },              // bottom of the stair from the city, facing the plaza
  exitStair: { x: 0, z: 48.6 },
  gate: { x: 0, z: -69.5 },                                   // the Descent Gate (portal plane)
  fromGate: { x: 0, z: -56, face: { x: 0, z: 0 } },           // back from Eternal Grind: in front of the gate, facing the plaza
  sideGate: { x: -64.5, z: 0 },                               // the Ember Stair (west chapel)
  board: { x: 57, z: -7.6 },                                  // Ledger of Deeds (quest board), north wall of the Ledger Hall
  warden: { x: 52, z: 4.5, face: { x: 40, z: 0 } },           // quest-giver 1
  scribe: { x: -52, z: -6, face: { x: -40, z: 0 } },          // quest-giver 2
};
// Is a local point walkable (inside the plaza/gallery, a hall or a chamber)? margin keeps the body off the walls.
export function walkableLocal(x, z, m = .55) {
  const r = Math.hypot(x, z);
  if (r < L.GALLERY_R - m) return r > L.DAIS_R + .2;
  const hw = L.HALL_HW - m;
  if (Math.abs(x) < hw && z > 0 && z < L.SOUTH_END - m) return true;                       // south hall (stair to the city)
  if (Math.abs(x) < hw && z < 0 && z > -L.HALL_OUT - 1.5) return true;                           // north hall
  if (Math.abs(z) < hw && Math.abs(x) < L.HALL_OUT + 1.5) return true;                           // east / west halls
  const N = L.NORTH; if (Math.hypot(x - N.x, z - N.z) < N.r - m && z > N.z - 9.2) return true;   // gate chamber (the gate itself is the back wall)
  const E = L.EAST; if (Math.abs(x - E.x) < E.hw - m && Math.abs(z - E.z) < E.hd - m) return true;
  const W = L.WEST; if (Math.hypot(x - W.x, z - W.z) < W.r - m && x > W.x - 8.2) return true;
  return false;
}
// Floor height (local): the sunken plaza (0) climbs four steps to the gallery and halls (1.8).
export function floorLocal(x, z) {
  const r = Math.hypot(x, z), S = L.STEPS;
  if (r < S[0]) return 0;
  for (let i = 1; i < S.length; i++) if (r < S[i]) return L.STEP_H * i;
  return L.GALLERY_Y;
}
// Slide a move from (px,pz) to (nx,nz) along walls: full move, else x only, else z only, else stay. Returns [x,z].
export function slideLocal(px, pz, nx, nz, m) {
  if (walkableLocal(nx, nz, m)) return [nx, nz];
  if (walkableLocal(nx, pz, m)) return [nx, pz];
  if (walkableLocal(px, nz, m)) return [px, nz];
  if (walkableLocal(px, pz, m)) return [px, pz];
  return null;   // started outside (teleport): caller decides
}
// Pillars + props that block (local circles), shared by the hub colliders and the tests.
export function pillarSpots() {
  const o = [];
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; o.push({ x: Math.cos(a) * 18.6, z: Math.sin(a) * 18.6, r: 1.05 }); }
  return o;
}

// ---------------------------------------------------------------- city entrance lot
// The City layout follows live data (district ring radii follow liquidity), so the entrance is checked at load: start at a fixed
// anchor in the open ground west-north-west of VEGAS, then walk a fixed spiral until nothing (building, prop, tree, lamp, street,
// tower ring) is within the clearance. Same data -> same spot; a nightly refresh can only move it if something new lands on it.
export const LOT = { R: 8.5, ROAD_HW: 4.8 };
export const ANCHOR = { x: -318, z: -92 };
const segD = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l)); return Math.hypot(a.x + u * dx - x, a.z + u * dz - z); };
export function lotClear(city, x, z, R = LOT.R) {
  if (Math.abs(x) > 860 || Math.abs(z) > 860) return false;
  for (const o of city.colliders || []) { if (!(o.r > 0) || o.h <= 0 || o.ug) continue; if (Math.hypot(o.x - x, o.z - z) < o.r + R) return false; }
  for (const st of city.streets || []) {
    if (st.type === 'ring' && st.c) { if (Math.abs(Math.hypot(x - st.c.x, z - st.c.z) - st.r) < R + LOT.ROAD_HW + 1) return false; }
    else if (st.type === 'line' && st.a && st.b && segD(x, z, st.a, st.b) < R + LOT.ROAD_HW + 1) return false;
  }
  for (const n of city.nodes || []) if (n && n.pos && Math.hypot(n.pos.x - x, n.pos.z - z) < Math.max(n.distR || 0, (n.w || 3) * 2.05) + R + 6) return false;
  for (const a of city.avoid || []) if (Math.hypot(a.x - x, a.z - z) < a.r + R) return false;
  return true;
}
export function entranceLot(city, anchor = ANCHOR) {
  for (let ring = 0; ring <= 14; ring++) {
    const n = ring ? ring * 6 : 1;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + ring * .37, x = anchor.x + Math.cos(a) * ring * 7, z = anchor.z + Math.sin(a) * ring * 7;
      if (lotClear(city, x, z)) {
        // face the stair mouth toward the city centre so it greets walkers coming out of town
        const yaw = Math.atan2(-x, -z);
        return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw, ring };
      }
    }
  }
  return null;
}
