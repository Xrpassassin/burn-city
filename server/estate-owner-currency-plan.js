'use strict';
// Freeze IMG/XRP owner choices when an IMG-funded reward epoch is planned.
// No transaction construction, trading or submission is performed here.
const { planPayouts } = require('./estate-payout-ledger');
function planOwnerCurrencyPayouts({ epochId, distributableImgUnits, holdings, fundingRef, sourceLedgerIndex, preferences } = {}) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) throw new TypeError('preferences_required');
  const plan = planPayouts({ epochId, currency: 'IMG', distributableUnits: distributableImgUnits, holdings, fundingRef, sourceLedgerIndex });
  const payouts = plan.payouts.map(row => {
    const choice = Object.prototype.hasOwnProperty.call(preferences, row.wallet) ? preferences[row.wallet] : null;
    if (choice !== null && choice !== 'IMG' && choice !== 'XRP') throw new TypeError('invalid_owner_payout_preference');
    return Object.freeze({
      ...row, // units are always IMG-denominated before any optional conversion
      sourceCurrency: 'IMG',
      settlementCurrency: choice,
      settlementMode: choice === 'XRP' ? 'swap_img_for_xrp' : choice === 'IMG' ? 'direct_img' : 'await_owner_selection',
      state: 'held', // hold until trustline/swap checks, epoch funding, approval and reconciliation
      holdReason: choice === null ? 'owner_selection_required' : choice === 'IMG' ? 'img_trustline_preflight_required' : 'swap_execution_preflight_required'
    });
  });
  return Object.freeze({ ...plan, payouts: Object.freeze(payouts), executionEnabled: false });
}
module.exports = { planOwnerCurrencyPayouts };
