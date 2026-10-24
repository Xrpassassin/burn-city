'use strict';
// Server-authoritative RAVAGER spin and heat envelope. dt is clamped by the simulation loop.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function advance(state, dt, trigger, fuelAvailable = true) {
  const s = { spin: clamp(Number(state.spin) || 0, 0, 1), heat: clamp(Number(state.heat) || 0, 0, 100), lock: Math.max(0, Number(state.lock) || 0), tracer: Math.max(0, Number(state.tracer) || 0) };
  dt = clamp(Number(dt) || 0, 0, 0.1);
  s.lock = Math.max(0, s.lock - dt);
  const firing = !!trigger && !!fuelAvailable && s.lock <= 0 && s.heat < 100;
  if (firing) { s.spin = Math.min(1, s.spin + dt * 1.55); s.heat = Math.min(100, s.heat + dt * 25); }
  else { s.spin = Math.max(0, s.spin - dt * (s.lock > 0 ? 1.8 : 1.1)); s.heat = Math.max(0, s.heat - dt * (s.lock > 0 ? 34 : 19)); }
  if (s.heat >= 100) { s.lock = Math.max(s.lock, 2.1); s.spin = 0; }
  s.tracer = Math.max(0, s.tracer - dt);
  return { ...s, firing: firing && s.spin >= 0.18, damageScale: clamp(s.spin, 0, 1) };
}
module.exports = { advance };
