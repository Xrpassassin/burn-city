'use strict';
const assert = require('node:assert/strict');
const { BURN_ISSUER: issuer, BURN_CURRENCY: currency, BURN_LAUNCH_SUPPLY: launchSupply, summarizeIssuerReturns } = require('../server/issuer-return-history');
const coverage = { complete: true, launchLedgerVerified: true, noGaps: true, fromLedger: 1, toLedger: 999 };
const tx = (hash, value, overrides = {}) => ({
 validated: true, tx: { hash, TransactionType: 'Payment', Account: 'rSender', Destination: issuer, ...overrides },
 meta: { TransactionResult: 'tesSUCCESS', delivered_amount: { issuer, currency, value } }
});
const calc = (transactions, more = {}) => summarizeIssuerReturns({ issuer, currency, launchSupply, transactions, coverage, issuerVerified: true, ...more });
let r = calc([tx('a', '100000000000000'), tx('a', '100000000000000'), tx('b', '50000000000000')]);
assert.equal(r.status, 'verified');
assert.equal(r.burned, '150000000000000');
assert.equal(r.burned_pct, 15);
assert.equal(r.returned_transactions, 2);
assert.equal(calc([tx('a', '1')], { coverage: { ...coverage, noGaps: false } }).burned_pct, null);
assert.equal(calc([tx('a', '1')], { issuerVerified: false }).burned_pct, null);
assert.equal(calc([tx('a', '1', { Destination: 'rOther' })]).burned, '0');
assert.equal(calc([tx('a', '1', { Account: issuer })]).burned, '0');
assert.equal(calc([{ ...tx('a', '1'), validated: false }]).status, 'unverified');
assert.equal(calc([{ ...tx('a', '1'), meta: { TransactionResult: 'tecPATH_DRY' } }]).burned, '0');
assert.equal(calc([tx('a', '1000000000000001')]).status, 'unverified');
assert.equal(calc([tx('a', '0.000000000000001')]).burned, '0.000000000000001');
assert.equal(calc([{ ...tx('missing', '1'), tx: { ...tx('missing', '1').tx, Amount: { issuer, currency, value: '1' } }, meta: { TransactionResult: 'tesSUCCESS' } }]).status, 'unverified');
console.log('issuer-return-history: all tests passed');
