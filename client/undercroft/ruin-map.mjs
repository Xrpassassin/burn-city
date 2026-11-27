// The ruin of Vael Ithren: a handcrafted tile map (pure data + grid helpers; no three.js).
// 1 tile = TILE metres. x grows east, z grows south. Rooms carve floor out of solid rock.
export const TILE = 2, W = 40, H = 64;
export const ROOMS = [
  // id, kind, rect [x0,z0,x1,z1] inclusive tiles, ceiling height (m), display name
  { id: 'entry', r: [16, 54, 23, 61], h: 7, n: 'Stair of Descent' },
  { id: 'c1', r: [19, 48, 20, 53], h: 4.6, corr: 1 },
  { id: 'hall', r: [12, 36, 27, 47], h: 8, n: 'Hall of Pillars' },
  { id: 'c2', r: [28, 41, 29, 42], h: 4.6, corr: 1 },
  { id: 'vault', r: [30, 38, 35, 45], h: 6, n: 'Sealed Vault' },
  { id: 'c3', r: [10, 41, 11, 42], h: 4.6, corr: 1 },
  { id: 'gallery', r: [6, 25, 9, 44], h: 6, n: 'Gallery of Spikes' },
  { id: 'c4', r: [10, 28, 12, 29], h: 4.6, corr: 1 },
  { id: 'sanctum', r: [13, 24, 26, 33], h: 9, n: 'Lumen Sanctum' },
  { id: 'c5', r: [19, 22, 20, 23], h: 4.6, corr: 1 },
  { id: 'ante', r: [14, 16, 25, 21], h: 7, n: 'Wraith Antechamber' },
  { id: 'c6', r: [19, 14, 20, 15], h: 4.6, corr: 1 },
  { id: 'arena', circle: [19.5, 7.2, 6.6], h: 12, n: 'Throne of the Hollow King' },
];
// entities (tile coordinates; .5 = tile centre)
export const SPAWN = { x: 19.5, z: 57.0, face: Math.PI };            // facing north (-z)
export const EXIT = { x: 19.5, z: 61.4 };                              // stair back up to the Ember Crossroads
export const PILLARS = [[15, 39], [24, 39], [15, 44], [24, 44], [16, 26], [23, 26], [16, 31], [23, 31], [15.5, 4.5], [23.5, 4.5], [14, 9], [25, 9]];
export const PEDESTALS = [[16, 29], [19.5, 27.2], [23, 29]];          // sanctum puzzle (each toggles itself + neighbours)
export const PED_START = [false, true, false];
export const GATE = { tiles: [[19, 23], [20, 23]], x: 20, z: 23.5 };   // sealed lumen gate (north wall of the sanctum)
export const BOSS_DOOR = { tiles: [[19, 15], [20, 15]], x: 20, z: 15.5 };
export const CHESTS = [
  { id: 'hall', x: 26.2, z: 37, rot: Math.PI },
  { id: 'vault', x: 34.8, z: 39, rot: -Math.PI / 2, locked: 3 },
  { id: 'gallery', x: 7.5, z: 25.6, rot: 0 },
  { id: 'ante', x: 24.6, z: 20.4, rot: -Math.PI / 2, locked: 2 },
  { id: 'throne', x: 16.2, z: 4.8, rot: Math.PI / 2, afterBoss: 1 },
];
export const ALTAR = { x: 19.5, z: 4.4 };                              // the Heartstone altar (in front of the throne)
export const THRONE = { x: 19.5, z: 2.5 };
export const TRAPS = [30, 31, 34, 35, 38, 39].map(z => ({ z, x0: 6, x1: 9, phase: (z >> 1) % 2 ? 0 : .5 }));
export const ENEMIES = [
  { k: 'skeleton', x: 17.5, z: 41.5 }, { k: 'skeleton', x: 22, z: 42.5 }, { k: 'skeleton', x: 13.5, z: 46.4, dormant: 1 },
  { k: 'skeleton', x: 32.5, z: 43 },
  { k: 'skeleton', x: 8, z: 27.5 },
  { k: 'skeleton', x: 21.5, z: 31.5 }, { k: 'wraith', x: 17, z: 32.4 },
  { k: 'wraith', x: 15.5, z: 17.2 }, { k: 'wraith', x: 23.8, z: 17.2 }, { k: 'skeleton', x: 19.5, z: 19.5, dormant: 1 },
  { k: 'boss', x: 19.5, z: 6 },
];
// wall-mounted lights: placed procedurally on room walls by the renderer (torches warm, lumen crystals cool)

// ---------------------------------------------------------------- grid
export function buildGrid() {
  const g = { floor: new Uint8Array(W * H), room: new Int16Array(W * H).fill(-1), ceil: new Float32Array(W * H) };
  ROOMS.forEach((R, ri) => {
    if (R.circle) { const [cx, cz, rr] = R.circle; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (Math.hypot(x + .5 - cx, z + .5 - cz) <= rr) set(g, x, z, ri, R.h); }
    else { const [x0, z0, x1, z1] = R.r; for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(g, x, z, ri, R.h); }
  });
  return g;
}
function set(g, x, z, ri, h) { const i = z * W + x; if (g.floor[i] && ROOMS[g.room[i]] && !ROOMS[g.room[i]].corr) return; g.floor[i] = 1; g.room[i] = ri; g.ceil[i] = h; }
export const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
export const tileOf = (wx, wz) => [Math.floor(wx / TILE), Math.floor(wz / TILE)];
export const toWorld = (tx, tz) => [tx * TILE, tz * TILE];
export function roomAt(g, wx, wz) { const [x, z] = tileOf(wx, wz); return inside(x, z) ? ROOMS[g.room[z * W + x]] || null : null; }
// dynamic blockers: pass a Set of "x,z" keys
export function passable(g, x, z, block) { if (!inside(x, z) || !g.floor[z * W + x]) return false; return !(block && block.has(x + ',' + z)); }
export function pillarSet() { const s = new Set(); for (const [x, z] of PILLARS) s.add(Math.floor(x) + ',' + Math.floor(z)); for (const [x, z] of PEDESTALS) s.add(Math.floor(x) + ',' + Math.floor(z)); return s; }

// BFS distance field from a tile (8-neighbour, no corner cutting). Returns Int16Array (−1 = unreachable).
export function flowField(g, sx, sz, block, maxD = 400) {
  const D = new Int16Array(W * H).fill(-1); if (!passable(g, sx, sz, block)) return D;
  const q = new Int32Array(W * H); let h = 0, t = 0; D[sz * W + sx] = 0; q[t++] = sz * W + sx;
  while (h < t) { const i = q[h++], x = i % W, z = (i / W) | 0, d = D[i]; if (d >= maxD) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (!passable(g, nx, nz, block)) continue; if (dx && dz && (!passable(g, x + dx, z, block) || !passable(g, x, z + dz, block))) continue; const j = nz * W + nx; if (D[j] >= 0) continue; D[j] = d + 1; q[t++] = j; } }
  return D;
}
// grid line of sight between world points (true when no solid tile in between)
export function los(g, ax, az, bx, bz, block) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (TILE * .35)); for (let i = 1; i < n; i++) { const t = i / n, [x, z] = tileOf(ax + (bx - ax) * t, az + (bz - az) * t); if (!passable(g, x, z, block)) return false; } return true;
}
// push a circle (world x,z, radius r) out of solid tiles; returns [x,z]
export function collide(g, x, z, r, block) {
  for (let it = 0; it < 2; it++) { const [tx, tz] = tileOf(x, z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const cx = tx + dx, cz = tz + dz; if (passable(g, cx, cz, block)) continue;
      const x0 = cx * TILE, z0 = cz * TILE, px = Math.max(x0, Math.min(x0 + TILE, x)), pz = Math.max(z0, Math.min(z0 + TILE, z)), ddx = x - px, ddz = z - pz, d = Math.hypot(ddx, ddz);
      if (d < r) { if (d > 1e-5) { x = px + ddx / d * r; z = pz + ddz / d * r; } else { x += (x - (x0 + 1)) > 0 ? r : -r; } } } }
  return [x, z];
}
// puzzle: pressing pedestal i toggles i and its neighbours
export function pressPedestal(state, i) { const s = state.slice(); for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < s.length) s[j] = !s[j]; return s; }
export const solved = s => s.every(Boolean);
// spike traps: up for 40% of a 2.4 s cycle
export const TRAP_CYCLE = 2.4;
export function trapUp(trap, t) { const p = ((t / TRAP_CYCLE + trap.phase) % 1 + 1) % 1; return p > .55 && p < .95; }
export function trapRise(trap, t) { const p = ((t / TRAP_CYCLE + trap.phase) % 1 + 1) % 1; return p > .42 && p <= .55; }   // warning wobble
