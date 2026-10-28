'use strict';
// Validated XRPL account history reader. Dependency injection keeps this module
// read-only, testable and independent of credentials or a particular XRPL provider.
const { ESTATES_TREASURY } = require('./estate-treasury-config');
const HEX64 = /^[A-Fa-f0-9]{64}$/;
function positiveLedger(n) { return Number.isSafeInteger(n) && n > 0; }
function normalizeValidatedTransaction(entry, account = ESTATES_TREASURY.address) {
  const tx = entry?.tx_json || entry?.tx;
  const meta = entry?.meta;
  const hash = entry?.hash || tx?.hash;
  const ledgerIndex = entry?.ledger_index ?? tx?.ledger_index;
  if (entry?.validated !== true || !tx || !meta || !HEX64.test(String(hash || '')) || !positiveLedger(ledgerIndex)) return null;
  if (tx.Account !== account && tx.Destination !== account && !Array.isArray(meta.AffectedNodes)) return null;
  return Object.freeze({
    hash: String(hash).toUpperCase(), ledgerIndex, type: String(tx.TransactionType || ''),
    account: String(tx.Account || ''), destination: typeof tx.Destination === 'string' ? tx.Destination : null,
    result: String(meta.TransactionResult || ''), feeDrops: typeof tx.Fee === 'string' && /^\d+$/.test(tx.Fee) ? tx.Fee : null,
    // Raw validated metadata is retained for separate AMM/trustline classification.
    tx, meta
  });
}
async function readTreasuryHistory({ request, account = ESTATES_TREASURY.address, ledgerMin = -1, ledgerMax = -1, marker = undefined, limit = 200, maxPages = 10 } = {}) {
  if (typeof request !== 'function') throw new TypeError('request function required');
  if (account !== ESTATES_TREASURY.address) throw new Error('treasury_account_mismatch');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 400 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new RangeError('invalid pagination limits');
  if (![ledgerMin,ledgerMax].every(n => n === -1 || positiveLedger(n))) throw new RangeError('invalid ledger bounds');
  if (ledgerMin !== -1 && ledgerMax !== -1 && ledgerMin > ledgerMax) throw new RangeError('reversed ledger bounds');
  const rows = [], seen = new Set();
  let cursor = marker, pages = 0;
  while (pages < maxPages) {
    const payload = { command:'account_tx', account, ledger_index_min:ledgerMin, ledger_index_max:ledgerMax, binary:false, forward:true, limit };
    if (cursor !== undefined && cursor !== null) payload.marker = cursor;
    const response = await request(payload);
    const result = response?.result || response;
    if (!result || result.status === 'error' || !Array.isArray(result.transactions) || result.account !== account) throw new Error('invalid account_tx response');
    if (result.validated !== true) throw new Error('unvalidated account_tx response');
    for (const entry of result.transactions) {
      const row = normalizeValidatedTransaction(entry, account);
      if (!row) continue;
      if (ledgerMin !== -1 && row.ledgerIndex < ledgerMin || ledgerMax !== -1 && row.ledgerIndex > ledgerMax) throw new Error('transaction outside requested ledger bounds');
      if (!seen.has(row.hash)) { seen.add(row.hash); rows.push(row); }
    }
    pages++;
    const next = result.marker;
    if (next === undefined || next === null) return Object.freeze({ account, transactions:rows, nextMarker:null, complete:true, pages });
    if (JSON.stringify(next) === JSON.stringify(cursor)) throw new Error('repeated pagination marker');
    cursor = next;
  }
  return Object.freeze({ account, transactions:rows, nextMarker:cursor, complete:false, pages });
}
module.exports = { normalizeValidatedTransaction, readTreasuryHistory };
