// Deterministic visual sizing: audited net reduction, partial issuer-return
// preview and fixed issuer-only markers must never be conflated.
export function blackHoleRadius({ fraction = 0, status = 'unverified' } = {}) {
  const f = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  if (status === 'verified') return 2 + 13 * Math.sqrt(f);
  if (status === 'partial' || status === 'estimated') return 3.4 + 7 * Math.sqrt(f);
  return 2.2;
}
