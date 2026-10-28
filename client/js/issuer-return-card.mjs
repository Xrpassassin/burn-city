import { verifiedBurnFraction } from './verified-burn-visual.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Shares the renderer's verification gate; no legacy snapshot percentages here.
export function issuerReturnCard({ record, tokenKey, tokenName, issuerVerified, now = Date.now() }) {
  const fraction = verifiedBurnFraction(record, tokenKey, now);
  const detail = fraction === null
    ? `<p>${issuerVerified ? 'Verified inaccessible issuer' : 'Issuer not verified'}. Complete issuer-return history and launch circulating supply have not been verified together.</p><p>A fixed-size issuer marker, when shown, does not represent a percentage.</p>`
    : `<p><b>Verified issuer returns: ${(fraction * 100).toFixed(2)}% of launch circulating supply.</b></p><p>${esc(record.burned)} ${esc(tokenName)} returned to the issuer.</p><p>Validated ledgers ${esc(record.coverage.from_ledger)}–${esc(record.coverage.to_ledger)} · checked ${esc(new Date(record.t_ms).toISOString())}.</p>`;
  return `<div class="amml" role="group" aria-label="Issuer return history"><h3>🕳 Issuer return history</h3>${detail}<p>Tokens in other black-holed wallets and locked pool liquidity are excluded.</p></div>`;
}
