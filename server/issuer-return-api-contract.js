'use strict';
// Bridges independently audited issuer-return history into AMM API token records.
// No percentage is published until the externally documented launch baseline is verified.
function attachIssuerReturnHistory(tokens, audits, now = Date.now()) {
  const out = {};
  for (const [name, token] of Object.entries(tokens || {})) {
    const issuer = token?.issuer, currency = token?.currency;
    const key = issuer && currency ? issuer + '-' + currency : null;
    const audit = key && audits instanceof Map ? audits.get(key) : null;
    const coverage = audit?.coverage, evidence = audit?.evidence;
    const approved = audit?.status === 'verified' &&
      audit?.launchSupplyVerified === true &&
      evidence?.issuer_verified === true && evidence?.rejected_records === 0 &&
      coverage?.complete === true && Number.isSafeInteger(coverage.from_ledger) &&
      Number.isSafeInteger(coverage.to_ledger) &&
      coverage.to_ledger >= coverage.from_ledger &&
      audit.issuer === issuer && audit.currency === currency &&
      typeof audit.burned_pct === 'number' &&
      Number.isFinite(audit.burned_pct) &&
      audit.burned_pct >= 0 && audit.burned_pct <= 100 &&
      Number.isFinite(audit.checkedAtMs) && audit.checkedAtMs > 0 && audit.checkedAtMs <= now &&
      now - audit.checkedAtMs <= 6 * 3600e3;
    out[name] = { ...token };
    // Only the current audit may authorize historical burn data. Cached token
    // fields must not survive an expired, missing, or rejected audit.
    delete out[name].issuer_return_history;
    if (approved) {
      out[name].issuer_return_history = {
        status: 'verified', method: 'issuer_returns_v1', token_key: key,
        burned_pct: audit.burned_pct, burned: audit.burned,
        t_ms: audit.checkedAtMs, coverage,
        evidence: { issuer_verified: true, launch_supply_verified: true, rejected_records: 0 }
      };
    }
  }
  return out;
}
module.exports = { attachIssuerReturnHistory };
