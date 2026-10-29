'use strict';
const { inspectValidatedAmmTx } = require('./estate-amm-tx-inspector');
const { extractTreasuryTrustlineDeltas } = require('./estate-amm-balance-deltas');
const { extractTreasuryLpDelta } = require('./estate-amm-lp-deltas');
// Read-only aggregation. The LP issuer/currency must be independently verified
// against XRPL amm_info before use. Deltas are observations, not cost basis.
function reconcileValidatedAmmTx(result, { treasury, imgIssuer, plxIssuer, ammAccount, lpCurrency } = {}) {
 const structure=inspectValidatedAmmTx(result,{treasury,imgIssuer,plxIssuer});
 const tokens=extractTreasuryTrustlineDeltas(result,{treasury,imgIssuer,plxIssuer});
 const lp=extractTreasuryLpDelta(result,{treasury,ammAccount,lpCurrency});
 return Object.freeze({
  hash:structure.hash,ledgerIndex:structure.ledgerIndex,eventKind:structure.eventKind,
  treasury,ammAccount,lpCurrency,imgDelta:tokens.imgDelta,plxDelta:tokens.plxDelta,
  lpTokenDelta:lp.lpTokenDelta,lpTrustlinesMatched:lp.matchedTrustlines,
  verification:'validated_amm_transaction_and_observed_deltas',
  principalBasisVerified:false,realizedProfitVerified:false,distributable:false,executionEnabled:false
 });
}
async function fetchAndReconcileAmmTx(client,txHash,config) {
 if(typeof txHash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(txHash))throw new TypeError('invalid_transaction_hash');
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 const response=await client.request({command:'tx',transaction:txHash.toUpperCase()});
 return reconcileValidatedAmmTx(response.result,config);
}
module.exports={reconcileValidatedAmmTx,fetchAndReconcileAmmTx};
