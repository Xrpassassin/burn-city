// Pedestrian locomotion for the City citizens (DOM/three-free, tested in citizens-motion.test.mjs).
// The crowd simulations (app.js peds, citylife shoppers) only say where someone is headed. This layer turns that
// into a body that moves like a person, borrowing the usual open-world pedestrian tricks:
//   * speed eases in and out (no instant starts/stops), and the walk cycle is driven by distance actually covered,
//     so feet stay planted at any speed;
//   * heading turns at a limited rate; big direction changes become a slow pivot on the spot instead of a snap;
//   * a slight lean into turns, scaled by speed;
//   * each person has their own pace and step phase, so nobody marches in lockstep;
//   * people sidestep each other and the player instead of walking through them.
const TAU = Math.PI * 2;
export const wrap = a => { a = (a + Math.PI) % TAU; return (a < 0 ? a + TAU : a) - Math.PI; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export const MOTION = {
  accel: 1.5,          // m/s² speeding up (about 0.9 s from standing to a normal walk)
  decel: 2.4,          // m/s² slowing down
  turnWalk: 2.4,       // rad/s heading change while walking
  turnPivot: 3.4,      // rad/s turning on the spot
  pivotAngle: 1.75,    // rad: larger heading errors stop and pivot first
  catchUp: 1.1,        // extra m/s per metre behind the crowd target
  maxSpeed: 2.0,       // m/s
  snap: 3.5,           // m: further than this from the target is a teleport (shop exit, route reset)
  personal: .85,       // m: comfort radius around other people
  playerRadius: 1.25,  // m
  lean: .06, maxLean: .11,
};

// Per-person variety: pace multiplier for the crowd target, starting phase, idle habit, curiosity.
export function initMotion(a, r1, r2, r3) {
  a.v = 0; a.lean = 0; a.yawRate = 0; a.pace = .92 + r1 * .16; a.ph = r2; a.habit = (r3 * 4) | 0; a.curious = .3 + r3 * .7;
  a.ox = 0; a.oz = 0; a.init = false;
  return a;
}

// Advance one person toward the crowd target (tx,tz). `push` is an optional avoidance vector {x,z} in metres.
// Returns the distance covered this frame (0 on a teleport) for the distance-driven walk cycle.
export function stepMotion(a, tx, tz, tyaw, dt, push = null, M = MOTION) {
  if (!a.init || Math.hypot(tx - a.x, tz - a.z) > M.snap) { a.x = tx; a.z = tz; a.yaw = tyaw; a.v = 0; a.lean = 0; a.yawRate = 0; a.init = true; return 0; }
  let dx = tx - a.x, dz = tz - a.z;
  const lag = Math.hypot(dx, dz);
  // how fast the target itself is moving (smoothed), so we do not stop dead between frames
  const tv = a.ptx === undefined ? 0 : Math.hypot(tx - a.ptx, tz - a.ptz) / Math.max(dt, 1e-3);
  a.ptx = tx; a.ptz = tz; a.tv = a.tv === undefined ? tv : a.tv + (Math.min(tv, 3) - a.tv) * (1 - Math.exp(-6 * dt));
  if (push) { dx += push.x; dz += push.z; }
  const arrive = lag < .12 && a.tv < .2;
  let want = arrive ? 0 : clamp(a.tv * a.pace + M.catchUp * Math.max(0, lag - .25), 0, M.maxSpeed);
  // heading: toward the target while travelling, the crowd's facing once arrived
  const goal = (Math.hypot(dx, dz) > .08 && !arrive) ? Math.atan2(dx, dz) : tyaw;
  const err = wrap(goal - a.yaw);
  if (Math.abs(err) > M.pivotAngle && (lag > .3 || a.v > .2)) want = 0;           // stop, then pivot
  else want *= clamp(Math.cos(err) * 1.25, 0, 1);                                  // slow through sharp turns
  const rate = a.v < .35 ? M.turnPivot : M.turnWalk;
  const prevYaw = a.yaw;
  a.yaw = wrap(a.yaw + clamp(err, -rate * dt, rate * dt));
  a.yawRate += (wrap(a.yaw - prevYaw) / Math.max(dt, 1e-3) - a.yawRate) * (1 - Math.exp(-8 * dt));
  a.v = want > a.v ? Math.min(want, a.v + M.accel * dt) : Math.max(want, a.v - M.decel * dt);
  const step = a.v * dt;
  a.x += Math.sin(a.yaw) * step; a.z += Math.cos(a.yaw) * step;
  a.lean += (clamp(-a.yawRate * a.v * M.lean, -M.maxLean, M.maxLean) - a.lean) * (1 - Math.exp(-6 * dt));
  return step;
}

// Simple spatial hash for neighbour avoidance. Cell size ~2 m.
export function makeGrid(cell = 2) {
  const map = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
  return {
    clear() { map.clear(); },
    add(a) { const k = key(Math.floor(a.x / cell), Math.floor(a.z / cell)); let b = map.get(k); if (!b) map.set(k, b = []); b.push(a); },
    near(x, z, f) { const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const b = map.get(key(i, j)); if (b) for (const o of b) f(o); } }
  };
}

// Avoidance push for person a: sidestep (to the right, like traffic) around people ahead and around the player.
export function avoidPush(a, grid, player, out, M = MOTION) {
  let px = 0, pz = 0;
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  const consider = (ox, oz, r, strength) => {
    const dx = ox - a.x, dz = oz - a.z, d = Math.hypot(dx, dz);
    if (d < 1e-3 || d > r * 2.2) return;
    const ahead = (dx * fx + dz * fz) / d;                 // only people in front matter (rear ones avoid us)
    if (ahead < -.2) return;
    const side = dx * fz - dz * fx;                        // >0: obstacle on our left
    const w = strength * (1 - d / (r * 2.2)) * (.4 + .6 * Math.max(0, ahead));
    const dir = side < -.05 ? -1 : 1;                      // step right, unless they are already on our right
    px += -fz * dir * w; pz += fx * dir * w;               // (-fz, fx) is our right-hand side
    if (d < r) { px -= dx / d * (r - d); pz -= dz / d * (r - d); }  // never overlap
  };
  if (grid) grid.near(a.x, a.z, o => { if (o !== a && !o.hidden) consider(o.x, o.z, M.personal, .6); });
  if (player) consider(player.x, player.z, M.playerRadius, 1.0);
  out.x = px; out.z = pz;
  return out;
}
