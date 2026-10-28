'use strict';
// Deterministic, pure payout planning. Durable storage and XRPL submission
// require atomic claims and ledger reconciliation before enabling transfers.
const crypto = require('node:crypto');
const { allocateEpoch } = require('./estate-reward-epoch');
const CURRENCIES = new Set(['IMG', 'XRP']);
const STATES = Object.freeze(['planned', 'held', 'ready', 'submitting', 'confirmed', 'failed']);
const TRANSITIONS = Object.freeze({
  planned: ['held', 'ready'], held: ['ready'], ready: ['submitting', 'held'],
  submitting: ['confirmed', 'failed'], failed: ['ready', 'held'], confirmed: []
});
function integerString(value, name) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw new TypeError(`${name} must be unsigned integer string`);
  return BigInt(value);
}
function planPayouts({ epochId, currency, distributableUnits, holdings, fundingRef, sourceLedgerIndex } = {}) {
  if (!CURRENCIES.has(currency)) throw new TypeError('unsupported currency');
  if (typeof fundingRef !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(fundingRef)) throw new TypeError('verified funding reference required');
  if (!Number.isSafeInteger(sourceLedgerIndex) || sourceLedgerIndex < 1) throw new TypeError('source ledger index required');
  const allocation = allocateEpoch({ epochId, currency, distributableUnits, holdings });
  const budget = integerString(distributableUnits, 'distributableUnits');
  const payouts = allocation.allocations.filter(a => BigInt(a.units) > 0n).map(a => {
    const key = `${epochId}|${currency}|${a.wallet}`;
    return Object.freeze({
      id: crypto.createHash('sha256').update(key).digest('hex'),
      epochId, currency, wallet: a.wallet, units: a.units, shares: a.shares,
      state: 'planned', txHash: null
    });
  });
  const total = payouts.reduce((sum, row) => sum + BigInt(row.units), 0n);
  if (total + BigInt(allocation.remainderUnits) !== budget) throw new Error('allocation conservation failure');
  return Object.freeze({ epochId, currency, fundingRef, sourceLedgerIndex, budgetUnits: budget.toString(),
    allocatedUnits: total.toString(), remainderUnits: allocation.remainderUnits,
    payouts: Object.freeze(payouts) });
}
function transitionPayout(payout, nextState, { txHash = null } = {}) {
  if (!payout || !STATES.includes(payout.state) || !STATES.includes(nextState)) throw new TypeError('invalid payout state');
  if (!TRANSITIONS[payout.state].includes(nextState)) throw new Error('invalid payout transition');
  if (nextState === 'confirmed' && (typeof txHash !== 'string' || !/^[A-Fa-f0-9]{64}$/.test(txHash))) throw new TypeError('validated transaction hash required');
  return Object.freeze({ ...payout, state: nextState, txHash: nextState === 'confirmed' ? txHash.toUpperCase() : payout.txHash });
}
module.exports = { planPayouts, transitionPayout, STATES };
