'use strict';
const { fetchAmmIdentity } = require('./estate-amm-identity');
const { fetchAndReconcileAmmTx } = require('./estate-amm-tx-reconciliation');
// Server-side read-only reconciliation. Never accept caller-provided AMM/LP
// identity. Current validated identity may not establish historical identity.
async function reconcileAmmWithVerifiedIdentity(client,txHash,{treasury,imgIssuer,plxIssuer}={}) {
 if(!treasury||!imgIssuer||!plxIssuer)throw new TypeError('trusted_treasury_and_issuers_required');
 const identity=await fetchAmmIdentity(client,{imgIssuer,plxIssuer});
 const record=await fetchAndReconcileAmmTx(client,txHash,{
  treasury,imgIssuer,plxIssuer,ammAccount:identity.ammAccount,lpCurrency:identity.lpCurrency
 });
 if(record.ledgerIndex>identity.ledgerIndex)throw new Error('amm_identity_ledger_precedes_transaction');
 return Object.freeze({
  ...record,
  ammIdentityLedgerIndex:identity.ledgerIndex,
  ammIdentitySource:identity.verifiedFrom,
  historicalAmmIdentityVerified:false,
  principalBasisVerified:false,
  realizedProfitVerified:false,
  distributable:false,
  executionEnabled:false
 });
}
module.exports={reconcileAmmWithVerifiedIdentity};
