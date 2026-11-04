'use strict';
// Single source of truth for every Estates switch that can move funds or open checkout.
// Preflight reports, the booking guard and operator workflows must all use this list.
const ESTATE_FINANCIAL_SWITCHES = Object.freeze(['ESTATE_SALES_ENABLED', 'ESTATE_LIQUIDITY_ENABLED',
  'ESTATE_XRP_PROFIT_HARVEST_ENABLED', 'ESTATE_DISTRIBUTIONS_ENABLED', 'ESTATE_IMG_RLUSD_FUNDING_ENABLED']);
const AUTOMATION_SWITCHES = Object.freeze(ESTATE_FINANCIAL_SWITCHES.filter(k => k !== 'ESTATE_SALES_ENABLED'));
function switchReport(env = process.env) {
  const switches = Object.fromEntries(ESTATE_FINANCIAL_SWITCHES.map(k => [k, env[k] === '1']));
  return { switches, anyFinancialSwitchOn: Object.values(switches).some(Boolean),
    automatedFundingOrPayoutSwitchOn: AUTOMATION_SWITCHES.some(k => switches[k]) };
}
// Checkout is ready only when sales are on, every automation switch is off,
// treasury is not paused, the historical earmark is booked and terms are verified.
function checkoutReadiness(state) {
  const blockers = [];
  if (state.treasuryPaused !== false) blockers.push('treasury_paused');
  if (state.purchaseSwitchOn !== true) blockers.push('purchase_switch_off');
  if (state.automatedFundingOrPayoutSwitchOn !== false) blockers.push('automation_switch_on');
  if (state.historicalEarmarkBooked !== true) blockers.push('earmark_not_booked');
  if (state.publishedTermsVerified !== true) blockers.push('terms_not_verified');
  return { ready: blockers.length === 0, blockers };
}
module.exports = { ESTATE_FINANCIAL_SWITCHES, AUTOMATION_SWITCHES, switchReport, checkoutReadiness };
