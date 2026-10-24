// Shared player movement physics for Burn City (city explore) and Homefront (refuge yard + shared world).
// Pure and allocation-free: no THREE, no DOM. The city (client/js/app.js) and Homefront
// (client/arena/homefront.html, homefront-graveyard-3d.js) both import these numbers and steps,
// so walk/run/jump feel the same everywhere. `scale` converts the city's metres into a space's
// own units (Homefront's refuge yard is drawn at ~0.68 of city scale).
export const MOTION = Object.freeze({
  walk: 5,          // m/s on foot
  run: 11,          // m/s with Shift / the Run button
  jump: 7.5,        // take-off speed, m/s
  gravity: 20,      // m/s²
  turn: 12,         // avatar yaw blend rate (1/s)
  walkCadence: 9,   // walk-cycle phase rate per unit of stick
  runCadence: 14,
  airGait: 0.25     // stride amplitude while airborne
});

export const speedFor = (run, scale = 1) => (run ? MOTION.run : MOTION.walk) * scale;

// Vertical step: jump when grounded and pressed, apply gravity, land on `floor`.
// `m` = { y, vy, onGround }; mutated in place and returned. `scale` shortens jumps in small spaces.
export function stepVertical(m, dt, floor = 0, jumpPressed = false, scale = 1) {
  if (jumpPressed && m.onGround) { m.vy = MOTION.jump * Math.sqrt(scale); m.onGround = false; }
  m.vy -= MOTION.gravity * dt;
  m.y += m.vy * dt;
  if (m.y <= floor) { m.y = floor; m.vy = 0; m.onGround = true; }
  else m.onGround = m.y - floor < 0.05;
  return m;
}

// Stride phase + amplitude for poseWalker(). `stick` is 0..1 input magnitude.
export function stepGait(m, dt, stick, run) {
  const ml = Math.min(1, Math.max(0, stick || 0));
  m.phase = (m.phase || 0) + dt * ml * (run ? MOTION.runCadence : MOTION.walkCadence);
  m.amp = ml * (m.onGround === false ? MOTION.airGait : 1);
  return m;
}

// Shortest-arc yaw blend toward `target` (radians).
export function turnToward(current, target, dt) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return current + d * Math.min(1, dt * MOTION.turn);
}

export const createMotion = (y = 0) => ({ y, vy: 0, onGround: true, phase: 0, amp: 0 });

// Jetpack flight (the city jetpack's numbers; Homefront's yard jetpack uses them at a smaller `scale`).
// Horizontal: steer toward the stick at cruise/boost speed, quick stop when released.
// Vertical: hover by default, climb/dive while held. Callers add their own gravity after jetVertical
// (the city adds MOTION.gravity·dt back, so hovering cancels gravity exactly as before).
export const JETPACK = Object.freeze({
  cruise: 16, boost: 26,       // m/s horizontal (Shift / Run = boost)
  steer: 4.5, brake: 2.5,      // horizontal blend rates (1/s) with / without stick input
  climb: 10, dive: -9,         // m/s vertical target while up / down is held (0 = hover)
  lift: 5,                     // vertical blend rate (1/s)
  ceiling: 180,                // city flight ceiling (m)
  fuelSeconds: 6,              // Homefront jetpack: seconds of thrust on a full tank (the city jetpack is infinite)
  refuel: 0.5                  // Homefront jetpack: tank fraction regained per second on the ground
});
// v = {x, z} horizontal velocity, mutated. mx/mz = desired move (any length; ≥ 5 counts as full stick, as in the city).
export function jetHorizontal(v, dt, mx, mz, boost, scale = 1, fullStick = 5) {
  const top = (boost ? JETPACK.boost : JETPACK.cruise) * scale, ml = Math.hypot(mx, mz);
  const tx = ml > .05 ? mx / ml * top * Math.min(1, ml / fullStick) : 0, tz = ml > .05 ? mz / ml * top * Math.min(1, ml / fullStick) : 0;
  const k = 1 - Math.exp(-dt * (ml > .05 ? JETPACK.steer : JETPACK.brake));
  v.x += (tx - v.x) * k; v.z += (tz - v.z) * k; return v;
}
// Returns the new vertical velocity before gravity (hover = blend toward 0).
export function jetVertical(vy, dt, up, down, scale = 1) {
  const target = (up ? JETPACK.climb : down ? JETPACK.dive : 0) * scale;
  return vy + (target - vy) * (1 - Math.exp(-dt * JETPACK.lift));
}
// Homefront fuel: tank 0..1. Thrusting drains 1/fuelSeconds per second; grounded refuels.
export function stepFuel(fuel, dt, thrusting, onGround) {
  if (thrusting) return Math.max(0, fuel - dt / JETPACK.fuelSeconds);
  return onGround ? Math.min(1, fuel + dt * JETPACK.refuel) : fuel;
}
