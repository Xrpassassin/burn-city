// Pure placement rules for a tower's singularity. Radius and altitude use the
// same verified burn fraction. Pending issuer markers retain legacy placement.
export function blackHoleAltitude({ rooftop, radius, fraction, verified }) {
  const top = Number.isFinite(rooftop) ? rooftop : 0;
  const R = Number.isFinite(radius) && radius >= 0 ? radius : 0;
  const f = verified && Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  // 12 units minimum clearance; at 100% the centre climbs another 50 units.
  return top + R + 12 + 50 * Math.pow(f, 0.8);
}
