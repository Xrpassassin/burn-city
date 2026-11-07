// Preview-only supply math. Launch baselines were supplied by the project owner,
// not independently reconciled against issuance history. Never expose this
// as audited supply or a verified burn amount in payment/accounting endpoints.
const BASELINES = Object.freeze({
  IMM: { key: 'rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM', supply: 888888888888888 },
  XRPyro: { key: 'rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000', supply: 1 }
});

export function observedBurnPreview({
  name, tokenKey, observedReturns, transactionCount, scanComplete,
  outstandingSupply, outstandingSource
} = {}) {
  const baseline = BASELINES[name];
  if (!baseline || tokenKey !== baseline.key) return null;

  // For IMM and XRPyro, prefer live ledger obligations from the verified issuer's
  // gateway_balances entry. The renderer separately validates the issuer,
  // source identity, server freshness, and issuer-key disablement.
  // This *estimate* is launch minus outstanding, not a proof of historical burns.
  if ((name === 'XRPyro' || name === 'IMM') && outstandingSupply !== undefined) {
    if (outstandingSource !== 'xrpl_gateway_balances' ||
        typeof outstandingSupply !== 'number' ||
        !Number.isFinite(outstandingSupply) ||
        outstandingSupply < 0 || outstandingSupply > baseline.supply) return null;
    const removed = baseline.supply - outstandingSupply;
    if (removed <= 0) return null;
    return Object.freeze({
      status: 'indicative_outstanding_supply', fraction: removed / baseline.supply,
      removed, outstanding: outstandingSupply, baseline: baseline.supply,
      provenance: 'XRPL gateway_balances (issuer obligations)',
      note: 'Launch-minus-outstanding estimate only; launch issuance and complete historical burns are not independently verified.'
    });
  }

  // Fallback for incomplete issuer-return scans; a lower bound only.
  if (scanComplete !== false || !Number.isFinite(observedReturns) ||
      observedReturns <= 0 || !Number.isSafeInteger(transactionCount) ||
      transactionCount < 1 || observedReturns > baseline.supply) return null;
  const fraction = observedReturns / baseline.supply;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return null;
  return Object.freeze({
    status: 'indicative_partial_scan', fraction,
    observedReturns, baseline: baseline.supply,
    provenance: 'client/data.js incomplete issuer-return history; launch baseline provided by project owner',
    note: 'Only observed issuer returns; not verified cumulative burned supply or current outstanding-supply reconciliation.'
  });
}
