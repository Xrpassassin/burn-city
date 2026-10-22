// Deterministic, testable ambient encounter placement for Glassroot Grove.
const DEFAULT_KINDS = [
  { sp: 'mirehare', lv: [5, 8], n: 8, r: 13, hostile: false },
  { sp: 'ashfang', lv: [6, 10], n: 6, r: 16, hostile: true },
  { sp: 'veilwing', lv: [7, 11], n: 3, r: 17, hostile: false },
  { sp: 'shardmole', lv: [5, 9], n: 3, r: 15, hostile: true },
];

export function createAmbientWildsSpawns({
  center, dEll, dTrail, dCreek, clearings = [], authoredSpawns = [], seed = 0x51a5f00d,
  kinds = DEFAULT_KINDS, maxRadius = 365, maxAttempts = 180,
} = {}) {
  if (!center || typeof dEll !== 'function' || typeof dTrail !== 'function' || typeof dCreek !== 'function') {
    throw new TypeError('center and distance functions are required');
  }
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const ambient = [];
  const reserved = authoredSpawns.map(s => ({ x: s.x, z: s.z }));
  for (const kind of kinds) for (let n = 0; n < kind.n; n++) {
    let spot = null;
    for (let tries = 0; tries < maxAttempts && !spot; tries++) {
      const a = random() * Math.PI * 2, rad = Math.sqrt(random()) * maxRadius;
      const x = center.x + Math.cos(a) * rad, z = center.z + Math.sin(a) * rad;
      if (dEll(x, z) > .82 || dTrail(x, z) < 10 || dCreek(x, z) < 9) continue;
      if (clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + 8)) continue;
      if (reserved.some(p => Math.hypot(x - p.x, z - p.z) < 28)) continue;
      if (ambient.some(p => Math.hypot(x - p.x, z - p.z) < 30)) continue;
      spot = { x, z };
    }
    if (spot) {
      reserved.push(spot);
      ambient.push({ sp: kind.sp, ...spot, r: kind.r + random() * 7, lv: kind.lv.slice(), ambient: true, hostile: !!kind.hostile });
    }
  }
  return ambient;
}
