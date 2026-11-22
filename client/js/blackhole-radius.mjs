// Deterministic visual sizing: audited net reduction, partial issuer-return
// preview and fixed issuer-only markers must never be conflated.
// BURN is the city's signature landmark: any positive reduction (verified, or the
// labeled historical snapshot) renders as a skyline-dominating core of ~36–48 units.
// IMM and XRPyro (and every other token) keep the status-based sizing below.
export const BURN_CORE_MIN = 36, BURN_CORE_SPAN = 12;
export function blackHoleRadius({ fraction = 0, status = 'unverified', token = '' } = {}) {
  const f = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  if (token === 'BURN' && f > 0) return BURN_CORE_MIN + BURN_CORE_SPAN * Math.sqrt(f);
  if (status === 'verified') return 2 + 13 * Math.sqrt(f);
  if (status === 'partial' || status === 'estimated') return 3.4 + 7 * Math.sqrt(f);
  return 2.2;
}
