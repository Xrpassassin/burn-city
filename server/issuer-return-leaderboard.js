'use strict';
// Direct sender leaderboard: who submitted validated issuer-return Payments.
// Does not identify original funders behind AMMs, exchanges or intermediary wallets.
const { decimalUnits, isIssuerReturn } = require('./issuer-return-history');
const SCALE = 10n ** 15n;
function unitsToString(n) {
  const w = n / SCALE, f = (n % SCALE).toString().padStart(15, '0').replace(/0+$/, '');
  return w.toString() + (f ? '.' + f : '');
}
function rankBurnSenders({ transactions, issuer, currency, complete = false, limit = 100 }) {
  if (!Array.isArray(transactions) || !issuer || !currency) throw Error('transaction list and token identity required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw Error('invalid leaderboard limit');
  const byWallet = new Map(), seen = new Set();
  let rejected = 0, matching = 0, total = 0n;
  for (const item of transactions) {
    const tx = item?.tx || item?.tx_json || item?.transaction || item;
    const meta = item?.meta || item?.metaData;
    if (!tx || typeof tx.hash !== 'string' || !tx.hash || item?.validated !== true) {
      rejected++;
      continue;
    }
    if (seen.has(tx.hash)) continue;
    seen.add(tx.hash);
    if (!isIssuerReturn(tx, meta, issuer, currency)) continue;
    if (typeof tx.Account !== 'string' || !tx.Account) { rejected++; continue; }
    const amount = decimalUnits((meta.delivered_amount ?? meta.DeliveredAmount).value);
    if (!amount || amount.units <= 0n) { rejected++; continue; }
    const previous = byWallet.get(tx.Account) || { units: 0n, count: 0 };
    previous.units += amount.units;
    previous.count++;
    byWallet.set(tx.Account, previous);
    total += amount.units;
    matching++;
  }
  const sorted = [...byWallet].sort((a, b) =>
    a[1].units === b[1].units ? a[0].localeCompare(b[0]) : (a[1].units > b[1].units ? -1 : 1));
  const safeComplete = complete === true && rejected === 0;
  return {
    status: safeComplete ? 'complete' : 'partial',
    methodology: 'Validated successful direct Payment sender to issuer; delivered token amount, not requested amount or original funder',
    issuer, currency, total_observed: unitsToString(total),
    unique_senders: sorted.length, matched_transactions: matching, rejected_records: rejected,
    ranked: sorted.slice(0, limit).map(([wallet, v], i) => ({
      rank: i + 1, wallet, returned: unitsToString(v.units), transactions: v.count
    })),
    truncated: sorted.length > limit
  };
}
module.exports = { rankBurnSenders };
