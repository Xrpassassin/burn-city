// Pure lot finder for THE EMBER BAR building (no three.js, testable in node). The City layout depends on live data (district
// ring radii follow liquidity), so the lot is computed at load: just outside BURN's outer ring road on the side facing away from
// the hub, front door facing the road and the tower, stepping around the ring until nothing (building, prop, tree, lamp, other
// street, tower podium) is inside the footprint.
export const LOT = { W: 14, D: 10, H: 6.7, ROAD_HW: 4.8, GAP: 1.8, FRONT: 3.5 };
export const STEPS = [0, .14, -.14, .28, -.28, .42, -.42, .56, -.56, .7, -.7, Math.PI / 2, -Math.PI / 2];

const segD = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l)); return Math.hypot(a.x + u * dx - x, a.z + u * dz - z); };

// Is the oriented footprint (centre x,z; yaw maps local +z to the front) clear of everything in the city description?
export function lotClear(city, x, z, yaw, burnPos, avoid = []) {
  const { W, D, ROAD_HW, FRONT } = LOT, s = Math.sin(yaw), c = Math.cos(yaw), rad = Math.hypot(W / 2, D / 2 + FRONT / 2);
  const local = (px, pz) => { const dx = px - x, dz = pz - z; return [dx * c - dz * s, dx * s + dz * c]; };   // world -> (side, front)
  for (const o of city.colliders || []) {
    if (!(o.r > 0) || o.h <= 0) continue;
    const [lx, lz] = local(o.x, o.z);
    if (Math.abs(lx) < W / 2 + o.r + .5 && lz > -D / 2 - o.r - .5 && lz < D / 2 + FRONT + o.r) return false;
  }
  for (const st of city.streets || []) {
    if (st.type === 'ring') {
      const same = burnPos && Math.hypot(st.c.x - burnPos.x, st.c.z - burnPos.z) < 1;
      const d = Math.abs(Math.hypot(x - st.c.x, z - st.c.z) - st.r);
      if (same) { if (Math.hypot(x - st.c.x, z - st.c.z) - D / 2 < st.r + ROAD_HW + .5 && Math.hypot(x - st.c.x, z - st.c.z) + D / 2 > st.r - ROAD_HW) return false; }
      else if (d < rad + ROAD_HW + 1) return false;
    } else if (st.type === 'line' && segD(x, z, st.a, st.b) < rad + ROAD_HW + 1) return false;
  }
  for (const n of city.nodes || []) if (n.pos && Math.hypot(n.pos.x - x, n.pos.z - z) < (n.w || 3) * 2.05 + rad + 3) return false;
  for (const a of avoid) if (Math.hypot(a.x - x, a.z - z) < a.r + rad) return false;
  return true;
}

// city: { N (name -> node with pos, distR), nodes?, streets, colliders }. Returns { x, z, yaw, angle, ring } or null.
export function emberLot(city, avoid = []) {
  const burn = city.N && city.N.BURN; if (!burn || !burn.pos) return null;
  const bp = burn.pos, rings = (city.streets || []).filter(s => s.type === 'ring' && Math.hypot(s.c.x - bp.x, s.c.z - bp.z) < 1);
  const ring = rings.length ? Math.max(...rings.map(r => r.r)) : (burn.distR || 40);
  const l = Math.hypot(bp.x, bp.z), base = l > 1 ? Math.atan2(bp.z, bp.x) : -Math.PI / 2;
  const nodes = (city.nodes || Object.values(city.N)).filter(n => n !== burn);
  const dist = ring + LOT.ROAD_HW + LOT.GAP + LOT.D / 2;
  for (const da of STEPS) {
    const a = base + da, dx = Math.cos(a), dz = Math.sin(a), x = bp.x + dx * dist, z = bp.z + dz * dist, yaw = Math.atan2(-dx, -dz);
    if (lotClear({ ...city, nodes }, x, z, yaw, bp, avoid)) return { x, z, yaw, angle: a, ring };
  }
  return null;
}
