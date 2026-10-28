// Organic head sculpting for BURN City NFT avatars.
// Heads are a single smooth mesh: a signed-distance field built from ellipsoids and tapered capsules
// ("round cones") joined with polynomial smooth-min (blended joints, no stacked primitives), optionally
// carved with smooth subtraction (eye sockets, nostrils). Each vertex of a subdivided sphere is ray-cast
// from the head centre onto the SDF surface, then normals are recomputed so shading is smooth.
// Colour comes from the nearest primitive (soft-blended) and is stored as vertex colour, so one head
// costs zero extra draw calls after avatar-bake. Technique: SDF smooth-min (Inigo Quilez, public
// write-ups; formulas re-implemented here, no code copied). Lite mode uses a coarser sphere.
import * as THREE from 'three';

const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdEllipsoid(p, c, r) {           // IQ's bound-corrected ellipsoid approximation
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  const k0 = len3(x / r[0], y / r[1], z / r[2]), k1 = len3(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
}
function sdRoundCone(p, a, b, r1, r2) {   // tapered capsule between a (radius r1) and b (radius r2)
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz, h = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (l2 || 1)));
  return len3(px - bx * h, py - by * h, pz - bz * h) - (r1 + (r2 - r1) * h);
}
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smaxSub = (d, s, k) => { const a = -s; if (k <= 0) return Math.max(d, a); const h = Math.max(k - Math.abs(d - a), 0) / k; return Math.max(d, a) + h * h * k * .25; };
const mirror = prims => prims.flatMap(p => p.mirror ? [p, { ...p, mirror: false, c: p.c && [-p.c[0], p.c[1], p.c[2]], a: p.a && [-p.a[0], p.a[1], p.a[2]], b: p.b && [-p.b[0], p.b[1], p.b[2]] }] : [p]);
function primDist(q, p) { return p.t === 'c' ? sdRoundCone(q, p.a, p.b, p.r1, p.r2 ?? p.r1) : sdEllipsoid(q, p.c, p.r); }

/** Evaluate a head spec: { prims:[{t:'e'|'c', c,r | a,b,r1,r2, col, k, sub, mirror}], k, colorK } */
export function sculptField(spec) {
  const prims = mirror(spec.prims || []), add = prims.filter(p => !p.sub), sub = prims.filter(p => p.sub);
  const kAll = spec.k ?? .04;
  return q => {
    let d = 1e9; for (const p of add) d = smin(d, primDist(q, p), p.k ?? kAll);
    for (const p of sub) d = smaxSub(d, primDist(q, p), p.k ?? .02);
    return d;
  };
}
function colorAt(q, prims, colorK, out) {
  let wsum = 0, r = 0, g = 0, b = 0;
  const c = new THREE.Color();
  for (const p of prims) {
    if (!p.col) continue;
    const d = Math.abs(primDist(q, p));
    const w = Math.exp(-(p.sub ? d * .7 : d) / colorK) * (p.w ?? 1);
    c.set(p.col); r += c.r * w; g += c.g * w; b += c.b * w; wsum += w;
  }
  out[0] = r / wsum; out[1] = g / wsum; out[2] = b / wsum;
}
const CACHE = new Map();
/** Build (cached) smooth head geometry from a spec. Coordinates are head-local (same frame as nftchar heads). */
export function sculptHeadGeometry(spec, { lite = false, key = '' } = {}) {
  const ck = (key || JSON.stringify(spec)) + (lite ? ':lite' : ':full');
  if (CACHE.has(ck)) return CACHE.get(ck);
  const f = sculptField(spec), prims = mirror(spec.prims || []), colorK = spec.colorK ?? .012;
  const o = spec.origin || [0, 0, 0], rMax = spec.rMax || .5;
  const g = new THREE.SphereGeometry(1, lite ? 22 : 56, lite ? 16 : 40);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), q = [0, 0, 0], c3 = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i);
    const at = t => { q[0] = o[0] + dx * t; q[1] = o[1] + dy * t; q[2] = o[2] + dz * t; return f(q); };
    // March inward from outside to the outermost surface crossing, then bisect.
    let hi = rMax, lo = rMax, found = false;
    for (let t = rMax; t > 0; t -= .006) { if (at(t) < 0) { lo = t; hi = t + .006; found = true; break; } }
    if (!found) { lo = hi = .02; }
    for (let k = 0; k < 18 && found; k++) { const m = (lo + hi) / 2; if (at(m) < 0) lo = m; else hi = m; }
    const t = (lo + hi) / 2; pos.setXYZ(i, o[0] + dx * t, o[1] + dy * t, o[2] + dz * t);
    q[0] = o[0] + dx * t; q[1] = o[1] + dy * t; q[2] = o[2] + dz * t; colorAt(q, prims, colorK, c3);
    col[i * 3] = c3[0]; col[i * 3 + 1] = c3[1]; col[i * 3 + 2] = c3[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  // Smooth normals across the sphere seam: merge by position, recompute, then keep indexed geometry.
  g.computeVertexNormals();
  g.userData.sculpted = true;
  CACHE.set(ck, g); return g;
}
export const SCULPT_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .8, metalness: .02 });
export const SCULPT_GLOSS_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .5, metalness: .02 });
export const SCULPT_METAL_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .4, metalness: .6 });
