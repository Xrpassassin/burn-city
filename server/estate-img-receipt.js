'use strict';
// Verify an XRPL Payment delivered IMG to treasury. This proves receipt, NOT profit:
// earnings classification requires separate AMM/accounting reconciliation.
const ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH = /^[A-Fa-f0-9]{64}$/;
function inspectImgReceipt(result, { treasury, imgIssuer, imgCurrency = 'IMG' } = {}) {
  if (!ADDRESS.test(treasury || '') || !ADDRESS.test(imgIssuer || '')) throw new TypeError('invalid_treasury_or_img_issuer');
  if (!result || result.validated !== true || !Number.isSafeInteger(result.ledger_index) || result.ledger_index < 1) throw new Error('unvalidated_transaction');
  const tx = result.tx_json || result;
  if (tx.TransactionType !== 'Payment' || tx.Destination !== treasury) throw new Error('not_treasury_payment');
  if (result.meta?.TransactionResult !== 'tesSUCCESS') throw new Error('transaction_not_successful');
  const amount = result.meta.delivered_amount;
  if (!amount || typeof amount !== 'object' || Array.isArray(amount) || amount.issuer !== imgIssuer || amount.currency !== imgCurrency) throw new Error('not_delivered_img');
  if (typeof amount.value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,15})?$/.test(amount.value) || Number(amount.value) <= 0) throw new Error('invalid_delivered_img_amount');
  const hash = tx.hash || result.hash;
  if (!HASH.test(hash || '')) throw new Error('missing_transaction_hash');
  return Object.freeze({ hash: hash.toUpperCase(), ledgerIndex: result.ledger_index, sender: tx.Account, treasury, imgIssuer, currency: imgCurrency, deliveredImg: amount.value, classification: 'unclassified_receipt', distributable: false });
}
async function verifyImgReceipt(client, txHash, config) {
  if (!HASH.test(txHash || '')) throw new TypeError('invalid_transaction_hash');
  if (!client || typeof client.request !== 'function') throw new TypeError('xrpl_client_required');
  const response = await client.request({ command: 'tx', transaction: txHash.toUpperCase() });
  return inspectImgReceipt(response.result, config);
}
module.exports = { inspectImgReceipt, verifyImgReceipt };
