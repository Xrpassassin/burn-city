'use strict';
// Bounded, read-only account_tx history scanner. Never asserts completeness for capped pages,
// missing metadata, inconsistent pagination, or ledger-range errors.
const { summarizeIssuerReturns } = require('./issuer-return-history');
function isLedger(n) { return Number.isSafeInteger(n) && n >= 0; }
async function scanIssuerReturns({ rpc, issuer, currency, launchSupply, fromLedger, toLedger, issuerVerified = false,
  launchLedgerVerified = false, maxPages = 20, limit = 200 }) {
  if (typeof rpc !== 'function') throw Error('rpc function required');
  if (!isLedger(fromLedger) || !isLedger(toLedger) || toLedger < fromLedger) throw Error('invalid pinned ledger range');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10000) throw Error('invalid page budget');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 400) throw Error('invalid page limit');
  const transactions = [], markers = new Set();
  let marker, pages = 0, complete = false, error = null;
  try {
    while (pages < maxPages) {
      const args = { account: issuer, ledger_index_min: fromLedger,
        ledger_index_max: toLedger, forward: true, limit, ...(marker ? { marker } : {}) };
      const response = await rpc('account_tx', args);
      const r = response?.result || response;
      if (!r || r.error || !Array.isArray(r.transactions)) throw Error('account_tx failed or returned no transaction array');
      if (r.validated !== true) throw Error('ledger range was not confirmed validated');
      if (r.ledger_index_min !== fromLedger || r.ledger_index_max !== toLedger)
        throw Error('server returned a different ledger range');
      for (const item of r.transactions) {
        const tx = item?.tx || item?.tx_json || item?.transaction;
        if (!tx || !isLedger(tx.ledger_index) || tx.ledger_index < fromLedger || tx.ledger_index > toLedger)
          throw Error('transaction missing or outside pinned ledger range');
        transactions.push(item);
      }
      pages++;
      const next = r.marker;
      if (!next) { complete = true; break; }
      const serialized = JSON.stringify(next);
      if (markers.has(serialized)) throw Error('repeated pagination marker');
      markers.add(serialized);
      marker = next;
    }
  } catch (e) { error = e.message || String(e); }
  const summary = summarizeIssuerReturns({
    issuer, currency, launchSupply, transactions, issuerVerified,
    coverage: { fromLedger, toLedger, launchLedgerVerified,
      complete: complete && !error, noGaps: complete && !error }
  });
  return { ...summary, scan: { pages, fetched_transactions: transactions.length,
    page_limit: limit, max_pages: maxPages, next_marker: complete ? null : marker || null,
    error, capped: !complete && !error } };
}
module.exports = { scanIssuerReturns };
