'use strict';
const assert = require('node:assert/strict');
const { audit } = require('../scripts/audit-issuer-returns');
const { BURN_ISSUER: issuer, BURN_CURRENCY: currency } = require('../server/issuer-return-history');
const request = async (method) => {
 if (method === 'account_info') return { account_data: { Flags: 0x00100000 }, signer_lists: [] };
 if (method === 'account_tx') return { validated: true, ledger_index_min: 10, ledger_index_max: 20,
   transactions: [{ validated: true, ledger_index: 11,
     tx: { hash: 'audit1', TransactionType: 'Payment', Account: 'rOther', Destination: issuer },
     meta: { TransactionResult: 'tesSUCCESS', delivered_amount: { currency, issuer, value: '100000000000000' } } }] };
 throw Error('unexpected RPC');
};
audit({ fromLedger: 10, toLedger: 20, request }).then(r => {
 assert.equal(r.issuer_key_status, 'blackholed');
 assert.equal(r.returned_lower_bound, '100000000000000');
 assert.equal(r.burned_pct, null);
 assert.equal(r.status, 'unverified');
 assert.equal(r.scan.pages, 1);
 console.log('audit-issuer-returns: all tests passed');
}).catch(e => { console.error(e); process.exitCode = 1; });
