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
