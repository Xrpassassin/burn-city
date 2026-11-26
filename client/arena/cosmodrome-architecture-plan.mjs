// Pure layout planner for Cosmodrome wall cladding, frames, ceilings and floors.
// Visual only: does not change the server grid, collision, doors, windows, pads, buys or spawns.
export const INDOOR_ZONES = [0, 2, 3, 4];   // Ember Well, Telemetry Hall, Motor Pool, Power Core
export const OUTDOOR_ZONES = [1, 5, 6, 7];  // Ash Walk, Blast Court, Fuel Farm, Launch Pad

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function hashSeed(L) {
  const n = String(L.name || 'cosmo');
  let h = 2166136261;
  for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619);
  return (h ^ ((L.gw || 0) * 33) ^ ((L.gh || 0) * 97)) >>> 0;
}

const isIndoor = z => INDOOR_ZONES.includes(z);

export function planCosmodromeArchitecture(L, { low = false } = {}) {
  const G = L.grid, CELL = L.cell, GW = L.gw, GH = L.gh;
  const WX = c => (c - GW / 2) * CELL + 1, WZ = r => (r - GH / 2) * CELL + 1;
  const H = 3.4;
  const rnd = rng(hashSeed(L));
  const atrium = L.up?.atrium || null;
  const inAtrium = (c, r) => atrium && c >= atrium[0] && c <= atrium[1] && r >= atrium[2] && r <= atrium[3];

  const obst = new Set();
  for (const [c0, c1, r0, r1] of L.obst || []) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) obst.add(r * GW + c);
  }
  const winSet = new Set((L.windows || []).map(w => w.r * GW + w.c));
  const isWall = (r, c) => r >= 0 && r < GH && c >= 0 && c < GW && G[r][c] === -1 && !obst.has(r * GW + c);
  const isFloor = (r, c) => r >= 0 && r < GH && c >= 0 && c < GW && G[r][c] >= 0 && G[r][c] < 100;
  const zoneAt = (r, c) => (isFloor(r, c) ? G[r][c] : -1);

  const keep = [];
  for (const p of L.perks || []) keep.push({ x: p.x, z: p.z });
  for (const w of L.wallbuys || []) keep.push({ x: w.x, z: w.z });
  for (const b of L.box || []) keep.push({ x: b[0], z: b[1] });
  if (L.forge) keep.push({ x: L.forge.x ?? L.forge[0], z: L.forge.z ?? L.forge[1] });
  if (L.power) keep.push({ x: L.power.x ?? L.power[0], z: L.power.z ?? L.power[1] });
  for (const s of L.landers || []) keep.push({ x: s.x, z: s.z });
  const blocked = (x, z, rad = 2.2) => keep.some(k => Math.hypot((k.x ?? 0) - x, (k.z ?? 0) - z) < rad);

  const walls = [], corners = [], gates = [], cables = [], floors = [], greebles = [];
  const frames = [], hazards = [], windows = [], beams = [], fixtures = [];
  const strips = [], pools = [], antennae = [], curbs = [], treads = [], caps = [], ceilings = [];

  // Room-facing wall edges: [faceX, faceZ, nx, nz, floorR, floorC, zone]
  const edges = [];
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (!isFloor(r, c)) continue;
    const zid = G[r][c];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const wr = r + dr, wc = c + dc;
      if (!isWall(wr, wc) || winSet.has(wr * GW + wc)) continue;
      edges.push({ x: WX(c) + dc, z: WZ(r) + dr, nx: -dc, nz: -dr, r, c, wr, wc, zone: zid, yaw: Math.atan2(-dc, -dr) });
    }
  }

  for (const e of edges) {
    const detailed = !low && rnd() < 0.16;
    walls.push({
      kind: detailed ? 'wallDetail' : 'wall',
      x: e.x, y: 0, z: e.z, yaw: e.yaw, zone: e.zone,
      outdoor: !isIndoor(e.zone)
    });
    if (!low && isIndoor(e.zone) && rnd() < 0.18) {
      cables.push({ x: e.x + e.nx * 0.35, y: 0.02, z: e.z + e.nz * 0.35, yaw: e.yaw, zone: e.zone });
    }
    if (!low && rnd() < (isIndoor(e.zone) ? 0.12 : 0.08) && !blocked(e.x + e.nx * 0.8, e.z + e.nz * 0.8, 2.4)) {
      greebles.push({
        x: e.x + e.nx * 0.45, y: 0, z: e.z + e.nz * 0.45,
        yaw: e.yaw, zone: e.zone
      });
    }
    if (!isIndoor(e.zone)) {
      caps.push({ x: e.x, y: H, z: e.z, yaw: e.yaw, zone: e.zone, h: 0.45 + (rnd() * 0.7) });
    }
    strips.push({
      x: e.x + e.nx * 0.04, y: 2.92, z: e.z + e.nz * 0.04,
      yaw: e.yaw, zone: e.zone, cool: isIndoor(e.zone) && e.zone !== 0
    });
    if ((e.c + e.r) % 3 === 0) {
      curbs.push({ x: e.x + e.nx * 0.22, y: 0.07, z: e.z + e.nz * 0.22, yaw: e.yaw, zone: e.zone });
    }
  }

  // Corner pillars where a floor cell meets two perpendicular walls.
  const seenC = new Set();
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
    if (!isFloor(r, c)) continue;
    const zid = G[r][c];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => isWall(r + dr, c + dc));
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
      const [dr1, dc1] = dirs[i], [dr2, dc2] = dirs[j];
      if (dr1 * dr2 + dc1 * dc2 !== 0) continue; // not perpendicular
      const x = WX(c) + dc1 + dc2, z = WZ(r) + dr1 + dr2;
      const key = `${x.toFixed(2)},${z.toFixed(2)}`;
      if (seenC.has(key)) continue;
      seenC.add(key);
      const yaw = Math.atan2(-(dc1 + dc2), -(dr1 + dr2));
      corners.push({ x, y: 0, z, yaw, zone: zid });
    }
  }

  // Door frames + Kenney gates + hazard stripes. Never change door cells themselves.
  for (const d of L.doors || []) {
    const yaw = d.ax === 'x' ? 0 : Math.PI / 2;
    const zone = d.a;
    gates.push({ x: d.x, y: 0, z: d.z, yaw, zone, cost: d.cost, name: L.zones[d.b]?.n || 'Sector' });
    frames.push({ x: d.x, y: 0, z: d.z, yaw, zone, ax: d.ax, cost: d.cost, name: L.zones[d.b]?.n || 'Sector' });
    hazards.push({ x: d.x, y: 3.15, z: d.z, yaw, zone, ax: d.ax });
  }

  // Window frames around the existing 0.6–2.5 m opening.
  for (const w of L.windows || []) {
    if (w.lv) continue;
    windows.push({
      x: w.x, y: 0, z: w.z, yaw: w.ax === 'x' ? 0 : Math.PI / 2,
      ax: w.ax, zone: w.zone ?? 0
    });
  }

  // Indoor ceilings / beams / fixtures; skip the Ember Well atrium void so the well stays open to the sky.
  for (const zi of INDOOR_ZONES) {
    const z = L.zones[zi]; if (!z) continue;
    const [c0, c1, r0, r1] = z.r;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!isFloor(r, c) || inAtrium(c, r)) continue;
      if (zi === 2 || zi === 3) ceilings.push({ x: WX(c), y: H - 0.02, z: WZ(r), zone: zi });
      if (c % 2 === 0) beams.push({ x: WX(c), y: H - 0.14, z: WZ(r), yaw: 0, len: CELL + 0.08, axis: 'z', zone: zi });
      if (r % 2 === 0) beams.push({ x: WX(c), y: H - 0.14, z: WZ(r), yaw: Math.PI / 2, len: CELL + 0.08, axis: 'x', zone: zi });
    }
    const step = low ? 6 : 4;
    for (let r = r0 + 2; r <= r1 - 1; r += step) {
      for (let c = c0 + 2; c <= c1 - 1; c += step) {
        if (!isFloor(r, c) || inAtrium(c, r)) continue;
        const x = WX(c), zpos = WZ(r);
        fixtures.push({ x, y: H - 0.28, z: zpos, zone: zi, cool: zi !== 0 });
        pools.push({ x, y: 0.03, z: zpos, zone: zi, cool: zi !== 0 });
      }
    }
  }

  // Floor plates (Power Core, Motor Pool, Telemetry) — skip buys and atrium.
  const floorZones = low ? [4] : [2, 3, 4];
  for (const zi of floorZones) {
    const z = L.zones[zi]; if (!z) continue;
    const [c0, c1, r0, r1] = z.r;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!isFloor(r, c) || obst.has(r * GW + c) || inAtrium(c, r)) continue;
      if ((c + r * 3) % (low ? 7 : 4) !== 0) continue;
      const x = WX(c), zpos = WZ(r);
      if (blocked(x, zpos, 2.0)) continue;
      floors.push({ x, y: 0.04, z: zpos, yaw: ((c + r) % 2) * Math.PI / 2, zone: zi });
    }
  }

  // Outdoor antennae on wall tops for a broken silhouette.
  if (!low) {
    let n = 0;
    for (const e of edges) {
      if (isIndoor(e.zone) || n > 18) continue;
      if ((e.c * 7 + e.r * 13) % 11 !== 0) continue;
      antennae.push({ x: e.x, y: H, z: e.z, zone: e.zone });
      n++;
    }
  }

  // Visual treads on the authored spawn ramp (collision already exists).
  const ramps = L.up?.ramps || [];
  for (const rp of ramps) {
    const c0 = rp.c[0], c1 = rp.c[1], r0 = rp.r[0], r1 = rp.r[1];
    const uh = L.up.h || 3.6;
    if (rp.ax === 'z' || rp.up === 'n' || rp.up === 's') {
      const lo = Math.min(r0, r1), hi = Math.max(r0, r1);
      for (let r = lo; r <= hi; r++) {
        const t = (r - lo) / Math.max(1, hi - lo);
        const y = rp.up === 'n' ? (1 - t) * uh : t * uh;
        treads.push({ x: (WX(c0) + WX(c1)) / 2, y: y + 0.03, z: WZ(r), yaw: 0, w: (c1 - c0 + 1) * CELL });
      }
    } else {
      const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
      for (let c = lo; c <= hi; c++) {
        const t = (c - lo) / Math.max(1, hi - lo);
        const y = rp.up === 'w' ? (1 - t) * uh : t * uh;
        treads.push({ x: WX(c), y: y + 0.03, z: (WZ(r0) + WZ(r1)) / 2, yaw: Math.PI / 2, w: (r1 - r0 + 1) * CELL });
      }
    }
  }

  if (low) {
    // Keep structure, drop garnish.
    walls.forEach((w, i) => { if (i % 2 && w.kind === 'wallDetail') w.kind = 'wall'; });
    return {
      walls: walls.filter((_, i) => i % 2 === 0),
      corners, gates, frames, hazards, windows,
      cables: [], floors: floors.slice(0, Math.ceil(floors.length / 3)),
      greebles: [], beams, fixtures: fixtures.filter((_, i) => i % 2 === 0),
      strips: strips.filter((_, i) => i % 2 === 0), pools: [],
      antennae: [], curbs: curbs.filter((_, i) => i % 3 === 0),
      treads, caps: caps.filter((_, i) => i % 2 === 0), ceilings
    };
  }

  return { walls, corners, gates, frames, hazards, windows, cables, floors, greebles, beams, fixtures, strips, pools, antennae, curbs, treads, caps, ceilings };
}

export function planCounts(plan) {
  const out = {};
  for (const [k, v] of Object.entries(plan)) out[k] = Array.isArray(v) ? v.length : 0;
  return out;
}
