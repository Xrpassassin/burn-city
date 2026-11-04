'use strict';
const assert = require('node:assert');
const { ESTATE_FINANCIAL_SWITCHES, switchReport, checkoutReadiness } = require('./estate-financial-switches');
assert.ok(ESTATE_FINANCIAL_SWITCHES.includes('ESTATE_IMG_RLUSD_FUNDING_ENABLED'));
assert.equal(switchReport({}).anyFinancialSwitchOn, false);
for (const k of ESTATE_FINANCIAL_SWITCHES) {
  const r = switchReport({ [k]: '1' });
  assert.equal(r.switches[k], true, k);
  assert.equal(r.anyFinancialSwitchOn, true, k + ' alone must be reported');
  assert.equal(Object.values(r.switches).filter(Boolean).length, 1, k);
  assert.equal(r.automatedFundingOrPayoutSwitchOn, k !== 'ESTATE_SALES_ENABLED', k);
}
// The booking guard must refuse every switch the shared list knows about.
const guard = require('node:fs').readFileSync(__dirname + '/../scripts/estate-replacement-custody-evidence.cjs', 'utf8');
for (const k of ESTATE_FINANCIAL_SWITCHES) assert.ok(guard.includes(k), 'booking guard covers ' + k);
const ok = { treasuryPaused: false, purchaseSwitchOn: true, automatedFundingOrPayoutSwitchOn: false,
  historicalEarmarkBooked: true, publishedTermsVerified: true };
assert.deepEqual(checkoutReadiness(ok), { ready: true, blockers: [] });
for (const [k, bad] of [['treasuryPaused', true], ['purchaseSwitchOn', false], ['automatedFundingOrPayoutSwitchOn', true],
  ['historicalEarmarkBooked', false], ['publishedTermsVerified', false]])
  assert.equal(checkoutReadiness({ ...ok, [k]: bad }).ready, false, k);
assert.equal(checkoutReadiness({}).ready, false, 'missing state is never ready');
console.log('estate financial switches: ok');
