// Gas Mask Guy locomotion: one source of truth for the authored gait clips and how the runtime
// blends them. Shared by scripts/player-avatar/author_gait.mjs (writes the clips) and
// default-player-avatar.mjs (plays them). Pure, allocation-light, no three.js.
//
// Units are the model's own (it is ~1.8 tall). `stride` = distance the body travels in one full
// cycle (two steps); `duration` = authored cycle length at the clip's natural speed. Every clip
// starts at left-foot contact (normalized time 0) and right-foot contact is at 0.5, so the runtime
// can carry one shared phase across Walk, Run and Sprint and blend them without a pop.
export const GAIT_MODEL_HEIGHT = 1.8;
export const GAIT_CLIPS = Object.freeze({
  Walk: Object.freeze({ stride: 1.42, duration: 1.04 }),   // ~1.37 m/s, 115 steps/min
  Run: Object.freeze({ stride: 2.9, duration: 0.78 }),     // ~3.7 m/s jog with flight phase
  Sprint: Object.freeze({ stride: 4.6, duration: 0.6 })    // ~7.7 m/s, long flight, big arm drive
});
export const LOCOMOTION = Object.freeze(['Walk', 'Run', 'Sprint']);

// Speed bands (model units/s) where one clip hands over to the next. Human walk->run switches
// near 2 m/s; below `idle[0]` the avatar stands still even if the stick is held (walls).
export const GAIT_BANDS = Object.freeze({ idle: [0.12, 0.55], run: [1.9, 2.7], sprint: [5.2, 7.2] });

const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// Target blend weights for a ground speed `v` (model units/s). Sums to 1.
export function gaitWeights(v, out = {}) {
  const s = Number.isFinite(v) && v > 0 ? v : 0;
  const move = smooth(GAIT_BANDS.idle[0], GAIT_BANDS.idle[1], s);
  const run = smooth(GAIT_BANDS.run[0], GAIT_BANDS.run[1], s);
  const sprint = smooth(GAIT_BANDS.sprint[0], GAIT_BANDS.sprint[1], s);
  out.Idle = 1 - move;
  out.Walk = move * (1 - run);
  out.Run = move * run * (1 - sprint);
  out.Sprint = move * run * sprint;
  return out;
}

// Stride (model units per cycle) of the blended gait at weights `w` (Idle ignored).
export function blendedStride(w) {
  let sum = 0, stride = 0;
  for (const name of LOCOMOTION) { const k = w[name] || 0; sum += k; stride += k * GAIT_CLIPS[name].stride; }
  return sum > 1e-6 ? stride / sum : GAIT_CLIPS.Walk.stride;
}

// Advance the shared normalized phase (0..1) by distance travelled / stride.
export function advancePhase(phase, speed, dt, strideWorld) {
  if (!(strideWorld > 0) || !(dt > 0) || !(speed > 0)) return phase;
  const next = phase + speed * dt / strideWorld;
  return next - Math.floor(next);
}
