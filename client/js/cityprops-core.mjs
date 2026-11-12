// Burn City street props (CC BY Sketchfab models, see city-credits.html): pure placement + behaviour logic.
// Rendering lives in cityprops.mjs; this file has no three.js dependency so it can be unit-tested in node.

// Per-tier counts and cull distances (metres from the camera). Phones get fewer pigeons/ducks and shorter cull ranges.
export const PROP_BUDGET = {
  low: { pigeonsPerShop: 2, plazaFlocks: 1, flock: 4, ducks: 3, cullShops: 110, cullBirds: 55, cullLake: 150 },
  medium: { pigeonsPerShop: 3, plazaFlocks: 2, flock: 4, ducks: 4, cullShops: 150, cullBirds: 75, cullLake: 200 },
  high: { pigeonsPerShop: 3, plazaFlocks: 3, flock: 5, ducks: 6, cullShops: 200, cullBirds: 90, cullLake: 260 },
};
export function propBudget(tier, mobile) {
  if (mobile) return PROP_BUDGET.low;
  return PROP_BUDGET[tier] || PROP_BUDGET.medium;
}

// Shop-local frame (citylife.js): origin = facade centre at the street side, +z goes into the shop, the street is at -z.
// local (lx, lz) -> world, same convention as citylife's station `at()`.
export function shopLocal(shop, lx, lz) {
  const c = Math.cos(shop.yaw), s = Math.sin(shop.yaw);
  return { x: shop.x + lx * c + lz * s, z: shop.z - lx * s + lz * c };
}

// Where each prop goes, relative to a shop front. yawOff = extra rotation on top of the shop yaw
// (models face their own +z, so PI turns them to face the street).
export const DOOR_SPOT = { lx: 2.6, lz: -0.2, sx: 0.55, sy: 1.1, sz: 1 };
export const VENDING_SHOPS = ['mart', 'smoke', 'coffee'];
export const VENDING_SPOT = { lx: -4.35, lz: -0.75 };
export const ARCADE_SPOTS = [{ lx: -4.4, lz: -0.62 }, { lx: -3.5, lz: -0.62 }, { lx: 4.62, lz: -0.62 }];

export function layoutShops(shops) {
  const doors = [], vending = [], arcade = [];
  for (const sh of shops || []) {
    const d = shopLocal(sh, DOOR_SPOT.lx, DOOR_SPOT.lz);
    doors.push({ shop: sh.id, x: d.x, z: d.z, yaw: sh.yaw, open: 0 });
    if (VENDING_SHOPS.includes(sh.id)) { const p = shopLocal(sh, VENDING_SPOT.lx, VENDING_SPOT.lz); vending.push({ shop: sh.id, x: p.x, z: p.z, yaw: sh.yaw + Math.PI }); }
    if (sh.id === 'arcade') for (const a of ARCADE_SPOTS) { const p = shopLocal(sh, a.lx, a.lz); arcade.push({ shop: sh.id, x: p.x, z: p.z, yaw: sh.yaw + Math.PI }); }
  }
  return { doors, vending, arcade };
}

// Sliding door: open while anyone is within `radius`, ease toward the target.
export const DOOR_RADIUS = 4.5;
export function doorStep(open, nearest, dt, radius = DOOR_RADIUS) {
  const target = nearest < radius ? 1 : 0, k = Math.min(1, dt * (target ? 3.2 : 1.8));
  const v = open + (target - open) * k;
  return Math.abs(v - target) < 0.01 ? target : v;
}

// deterministic hash in [0,1)
export const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// Pigeon homes: a few on the sidewalk in front of every shop, plus flocks on the central plaza ring.
export function pigeonHomes(shops, budget, plaza = []) {
  const out = []; let i = 0;
  for (const sh of shops || []) for (let k = 0; k < budget.pigeonsPerShop; k++, i++) {
    const p = shopLocal(sh, -3 + hash(i, 1) * 3.6, -2.3 - hash(i, 2) * 1.1); out.push({ x: p.x, z: p.z, yaw: hash(i, 3) * 6.283 });
  }
  for (const c of plaza.slice(0, budget.plazaFlocks)) for (let k = 0; k < budget.flock; k++, i++) {
    const a = hash(i, 4) * 6.283, r = .5 + hash(i, 5) * 1.6; out.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, yaw: hash(i, 6) * 6.283 });
  }
  return out;
}

// Pigeon state machine: perch -> fly (spooked) -> gone -> perch (after a rest, once nobody is near the home spot).
export const SPOOK = 4.5, FLY_TIME = 3.2, REST = 22, RETURN_CLEAR = 14;
export function pigeonStep(b, dt, nearest, flockSpooked) {
  b.t = (b.t || 0) + dt;
  if (b.state === 'perch') {
    if (nearest < SPOOK || flockSpooked) { b.state = 'fly'; b.t = 0; b.dir = b.dir ?? b.yaw; return 'spooked'; }
  } else if (b.state === 'fly') {
    if (b.t > FLY_TIME) { b.state = 'gone'; b.t = 0; }
  } else if (b.state === 'gone') {
    if (b.t > REST && nearest > RETURN_CLEAR) { b.state = 'perch'; b.t = 0; b.dir = null; }
  }
  return null;
}
// position while flying: climb and leave along `dir` (radians, model yaw convention: +z forward)
export function flyPos(b) {
  const u = Math.min(1, b.t / FLY_TIME), d = 2 + 26 * u * u + 3 * u;
  return { x: b.x + Math.sin(b.dir) * d, y: .1 + 1.6 * u + 12 * u * u, z: b.z + Math.cos(b.dir) * d };
}

// Ducks paddle slow circles around a home point on the lake.
export function duckPos(d, t) {
  const a = d.ph + t * d.w;
  return { x: d.x + Math.cos(a) * d.r, z: d.z + Math.sin(a) * d.r, yaw: -a + (d.w > 0 ? 0 : Math.PI), bob: Math.sin(t * 2.1 + d.ph * 3) * .025 };
}
