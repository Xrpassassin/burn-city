// Indicative lower bound from the checked-in (incomplete) issuer-return scan.
// These are user-provided launch baselines, NOT independently verified issuance evidence.
// Never label these as verified, or use them in economic/accounting APIs.
const BASELINES = Object.freeze({
  IMM: { key: 'rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM', supply: 888888888888888 },
  XRPyro: { key: 'rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000', supply: 1 }
});

export function observedBurnPreview({ name, tokenKey, observedReturns, transactionCount, scanComplete } = {}) {
  const baseline = BASELINES[name];
  if (!baseline || tokenKey !== baseline.key || scanComplete !== false ||
      !Number.isFinite(observedReturns) || observedReturns <= 0 ||
      !Number.isSafeInteger(transactionCount) || transactionCount < 1 ||
      observedReturns > baseline.supply) return null;
  const fraction = observedReturns / baseline.supply;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return null;
  return Object.freeze({
    status: 'indicative_partial_scan',
    fraction, observedReturns, baseline: baseline.supply,
    provenance: 'client/data.js incomplete issuer-return history; launch baseline provided by project owner',
    note: 'Only observed issuer returns; not a verified cumulative burn percentage or current outstanding-supply reconciliation.'
  });
}
