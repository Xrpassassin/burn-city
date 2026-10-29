'use strict';
const { verifyImgReceipt } = require('./estate-img-receipt');
const { createImgReceiptJournal } = require('./estate-img-receipt-journal');
// Server-side only: caller supplies trusted config and an XRPL client.
// No unverified request payload may create a receipt; no profit attribution here.
function createImgReceiptIngestor({ db, client, treasury, imgIssuer, imgCurrency = 'IMG' } = {}) {
  if (!db || !client || typeof client.request !== 'function') throw new TypeError('db_and_xrpl_client_required');
  const journal = createImgReceiptJournal(db);
  async function ingest(txHash) {
    const verified = await verifyImgReceipt(client, txHash, { treasury, imgIssuer, imgCurrency });
    return journal.record(verified);
  }
  return { ingest, get: journal.get };
}
module.exports = { createImgReceiptIngestor };
