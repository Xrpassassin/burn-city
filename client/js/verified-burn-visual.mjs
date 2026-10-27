// Historical burn visuals are allowed only for independently verified launch denominators.
export function verifiedBurnFraction(record, tokenKey, now = Date.now()) {
  if (!record || record.status !== 'verified' || record.method !== 'issuer_returns_v1' ||
      record.token_key !== tokenKey || record.coverage?.complete !== true ||
      record.evidence?.issuer_verified !== true ||
      record.evidence?.launch_supply_verified !== true ||
      record.evidence?.rejected_records !== 0 ||
      !Number.isSafeInteger(record.coverage?.from_ledger) ||
      !Number.isSafeInteger(record.coverage?.to_ledger) ||
      record.coverage.to_ledger < record.coverage.from_ledger ||
      !Number.isFinite(record.t_ms) || record.t_ms > now ||
      now - record.t_ms > 6 * 3600e3) return null;
  const pct = record.burned_pct;
  return typeof pct === 'number' && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct / 100 : null;
}
