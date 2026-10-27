'use strict';
const assert = require('node:assert/strict');
const { rankBurnSenders } = require('../server/issuer-return-leaderboard');
const { BURN_ISSUER: issuer, BURN_CURRENCY: currency } = require('../server/issuer-return-history');
function tx(hash, sender, value, more = {}) {
 return { validated: true, tx: { hash, Account: sender, Destination: issuer, TransactionType: 'Payment' },
   meta: { TransactionResult: 'tesSUCCESS', delivered_amount: { value, issuer, currency } }, ...more };
}
const rows = [
 tx('1','rAlpha','100'), tx('2','rBeta','250'), tx('3','rAlpha','200'),
 tx('3','rAlpha','200'), tx('4','rGamma','50'),
 tx('5','rIgnored','1000', { validated: false }),
 tx('6','rFailed','1000', { meta: { TransactionResult: 'tecPATH_DRY', delivered_amount: { value: '1000', issuer, currency } } })
];
const r = rankBurnSenders({ transactions: rows, issuer, currency, complete: true });
assert.equal(r.status, 'partial');
assert.equal(r.total_observed, '600');
assert.deepEqual(r.ranked.map(x => x.wallet), ['rAlpha','rBeta','rGamma']);
assert.equal(r.ranked[0].returned, '300');
assert.equal(r.ranked[0].transactions, 2);
assert.equal(r.rejected_records, 1);
assert.equal(rankBurnSenders({ transactions: rows.slice(0, 4), issuer, currency, complete: true }).status, 'complete');
assert.equal(rankBurnSenders({ transactions: rows, issuer, currency, limit: 1 }).truncated, true);
console.log('issuer-return-leaderboard: all tests passed');
