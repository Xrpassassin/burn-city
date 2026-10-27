'use strict';
// Launch-denominated issuer-return burn accounting. No ledger RPC or wallet signing here.
// Only validated, successful, delivered transfers to the exact issuer count.
// Callers must prove scan coverage independently; missing pages never become zero burns.
const BURN_ISSUER = 'rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd';
const BURN_CURRENCY = '4255524E00000000000000000000000000000000';
const BURN_LAUNCH_SUPPLY = '1000000000000000';
function decimalUnits(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return null;
  const [whole, fraction = ''] = s.split('.');
  if (fraction.length > 15) return null;
  return { units: BigInt(whole + fraction.padEnd(15, '0')), scale: 10n ** 15n };
}
function display(units) {
  const q = units / 10n ** 15n, r = units % (10n ** 15n);
  return q.toString() + (r ? '.' + r.toString().padStart(15, '0').replace(/0+$/, '') : '');
}
function currencyMatches(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toUpperCase() === b.toUpperCase(); }
function isIssuerReturn(tx, meta, issuer, currency) {
  if (!tx || tx.TransactionType !== 'Payment' || tx.Destination !== issuer ||
      tx.Account === issuer || !meta || meta.TransactionResult !== 'tesSUCCESS') return false;
  // delivered_amount is authoritative; Amount may be a send-max/requested amount.
  const d = meta.delivered_amount ?? meta.DeliveredAmount;
  return !!d && typeof d === 'object' && d.issuer === issuer &&
    currencyMatches(d.currency, currency) && decimalUnits(d.value) !== null;
}
function summarizeIssuerReturns({ issuer, currency, launchSupply, transactions, coverage, issuerVerified }) {
  const start = decimalUnits(launchSupply);
  if (!issuer || !currency || !start || start.units <= 0n) throw Error('explicit positive launch supply and token identity required');
  if (!Array.isArray(transactions)) throw Error('transactions must be an array');
  const seen = new Set();
  let sum = 0n, count = 0, bad = 0;
  for (const item of transactions) {
    const tx = item?.tx || item?.tx_json || item?.transaction || item;
    const meta = item?.meta || item?.metaData;
    if (!tx || !tx.hash || !item?.validated) { bad++; continue; }
    if (seen.has(tx.hash)) continue;
    seen.add(tx.hash);
    if (tx.TransactionType === 'Payment' && tx.Destination === issuer && tx.Account !== issuer &&
        meta?.TransactionResult === 'tesSUCCESS' &&
        ((tx.Amount && typeof tx.Amount === 'object' && tx.Amount.issuer === issuer &&
          currencyMatches(tx.Amount.currency, currency)) ||
         (tx.DeliverMax && typeof tx.DeliverMax === 'object' && tx.DeliverMax.issuer === issuer &&
          currencyMatches(tx.DeliverMax.currency, currency))) &&
        (meta.delivered_amount == null && meta.DeliveredAmount == null ||
         meta.delivered_amount === 'unavailable')) { bad++; continue; }
    if (!isIssuerReturn(tx, meta, issuer, currency)) continue;
    sum += decimalUnits((meta.delivered_amount ?? meta.DeliveredAmount).value).units;
    count++;
  }
  // A full history requires a caller-verified contiguous scan from token launch through
  // a pinned validated ledger. The module cannot infer this from a result count.
  const complete = coverage?.complete === true &&
    Number.isSafeInteger(coverage.fromLedger) && Number.isSafeInteger(coverage.toLedger) &&
    coverage.fromLedger >= 0 && coverage.toLedger >= coverage.fromLedger &&
    coverage.launchLedgerVerified === true && coverage.noGaps === true;
  const verified = complete && issuerVerified === true && bad === 0 && sum <= start.units;
  const pct = verified ? Number(sum * 1000000n / start.units) / 10000 : null;
  return {
    status: verified ? 'verified' : 'unverified',
    reason: !complete ? 'historical ledger coverage incomplete or unproven' :
      issuerVerified !== true ? 'issuer key restrictions not independently verified' :
      bad ? 'unvalidated or malformed transaction records present' :
      sum > start.units ? 'returns exceed declared launch supply; investigate issue/reissuance or duplicate data' : 'complete validated issuer-return history',
    issuer, currency, launch_supply: display(start.units),
    returned_lower_bound: display(sum), returned_transactions: count,
    burned: verified ? display(sum) : null,
    burned_pct: pct, // null means never present a burn percentage or sized singularity
    coverage: { from_ledger: coverage?.fromLedger ?? null, to_ledger: coverage?.toLedger ?? null, complete },
    evidence: { unique_transactions: seen.size, rejected_records: bad, issuer_verified: issuerVerified === true }
  };
}
module.exports = { BURN_ISSUER, BURN_CURRENCY, BURN_LAUNCH_SUPPLY, decimalUnits, isIssuerReturn, summarizeIssuerReturns };
