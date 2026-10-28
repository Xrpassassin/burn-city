import { verifiedSupplyFraction } from './verified-supply-visual.mjs';
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

export function supplyReconciliationCard({record,tokenKey,tokenName,now=Date.now()}) {
 const f=verifiedSupplyFraction(record,tokenKey,now);if(f===null)return null;
 return `<div class="amml" role="group" aria-label="Verified net supply reduction"><h3>🕳 Black-hole supply</h3><p><b>${(f*100).toFixed(4)}% net supply reduction</b> since the original 1 quadrillion ${esc(tokenName)} issuance.</p><p>Approximately ${esc(record.outstanding)} ${esc(tokenName)} remains outstanding, including pool holdings, frozen balances and escrow.</p><p>Issuer keys disabled · validated ledger ${esc(record.ledger_index)} · checked ${esc(new Date(record.t_ms).toISOString())}.</p><p class="dim">Includes transfer-fee reductions. This measures supply reduction; individual burn transactions have not been fully enumerated.</p></div>`;
}
