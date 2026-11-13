// Pure helpers for the in-City ISS orbit and the CB1 ascent/return path (no three.js, testable in node).
export const ISS_ORBIT = { cx: 0, cz: -120, r: 760, y: 780, wobble: 50, period: 480 };   // stays inside the mountain backdrop ring (r 1500+)   // game-scale sky orbit (metres, seconds)
export const PAD = { x: 205, z: -622, r: 14 };   // CB1 launch pad on the airport apron, east of the ATC tower
export const ASCENT_S = 11, RETURN_S = 9;
const clamp01 = v => Math.max(0, Math.min(1, v));
export const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

// ISS position on its slow, slightly inclined circular orbit, and the unit tangent it flies along.
export function issOrbit(t, o = ISS_ORBIT) {
  const a = (t / o.period) * Math.PI * 2;
  const pos = { x: o.cx + Math.cos(a) * o.r, y: o.y + Math.sin(a) * o.wobble, z: o.cz + Math.sin(a) * o.r };
  const tx = -Math.sin(a), tz = Math.cos(a), ty = Math.cos(a) * o.wobble / o.r, n = Math.hypot(tx, ty, tz);
  return { pos, dir: { x: tx / n, y: ty / n, z: tz / n } };
}

// Quadratic Bezier from the pad, straight up first, then arcing over to the rendezvous point.
export function ascentPoint(pad, target, u) {
  const k = smooth(u), lift = { x: pad.x, y: pad.y + Math.max(220, (target.y - pad.y) * .75), z: pad.z };
  const m = 1 - k;
  return {
    x: m * m * pad.x + 2 * m * k * lift.x + k * k * target.x,
    y: m * m * pad.y + 2 * m * k * lift.y + k * k * target.y,
    z: m * m * pad.z + 2 * m * k * lift.z + k * k * target.z
  };
}

// Sun-lit tint for the far ISS: white in daylight, warm near sunrise/sunset, still faintly lit just after dusk
// (the real ISS stays in sunlight after the ground goes dark), dim at deep night. sunY = elevation of U.sunD.
export function issSunTint(sunY) {
  const lit = clamp01((sunY + .3) / .4), warm = 1 - clamp01((sunY - .02) / .3);
  const b = .18 + .82 * lit;
  return { r: b, g: b * (1 - .28 * warm), b: b * (1 - .55 * warm), glint: clamp01(1 - Math.abs(sunY + .12) / .25) * .9 + (sunY < -.2 ? .25 : 0) };
}

// Level of detail for an ISS view distance in metres.
export function issLevel(dist) { return dist < 110 ? 'near' : dist < 420 ? 'lod' : 'far'; }
export function shipLevel(dist, flying) { return flying || dist < 140 ? 'near' : dist < 750 ? 'lod' : 'none'; }
