'use strict';
// Read-only manual audit tool. Does not sign transactions, modify data.js, or deploy.
// Usage: node scripts/audit-issuer-returns.js --from-ledger=123 --to-ledger=456 [--pages=10]
// A scan is informative but NEVER authorizes a certified burn percentage without separately
// established launch supply, launch-ledger provenance, and complete archival coverage.
const { scanIssuerReturns } = require('../server/issuer-return-scanner');
const { BURN_ISSUER, BURN_CURRENCY, BURN_LAUNCH_SUPPLY } = require('../server/issuer-return-history');
const G = require('../client/js/goldlock');
const URLS = [
  'https://s2.ripple.com:51234/',
  'https://s1.ripple.com:51234/'
];
function integerArg(flag, fallback) {
  const arg = process.argv.slice(2).find(a => a.startsWith('--' + flag + '='));
  if (!arg) return fallback;
  const value = arg.slice(flag.length + 3);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw Error('invalid --' + flag);
  return Number(value);
}
async function rpc(method, params, endpoint = URLS[0]) {
  const abort = AbortSignal.timeout(25000);
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params: [params] }), signal: abort
  });
  if (!response.ok) throw Error('XRPL HTTP ' + response.status);
  const data = await response.json();
  if (data?.result?.error || !data?.result) throw Error('XRPL ' + (data?.result?.error || 'empty result'));
  return data.result;
}
async function audit({ fromLedger, toLedger, maxPages = 10, request = rpc }) {
  const issuerInfo = await request('account_info', {
    account: BURN_ISSUER, ledger_index: 'validated', signer_lists: true
  });
  const issuerVerified = G.isBlackholedInfo(issuerInfo);
  // Do not assume the issuer's first transaction identifies the token issuance.
  // Launch supply provenance is NOT independently established by this utility.
  const result = await scanIssuerReturns({
    rpc: request, issuer: BURN_ISSUER, currency: BURN_CURRENCY,
    launchSupply: BURN_LAUNCH_SUPPLY, fromLedger, toLedger, maxPages,
    issuerVerified, launchLedgerVerified: false
  });
  return { ...result, issuer_key_status: issuerVerified ? 'blackholed' : 'unverified',
    launch_supply_source: 'project-reported; independent on-ledger verification pending',
    notice: 'Read-only partial evidence; NOT a verified historical burned percentage.' };
}
if (require.main === module) {
  (async () => {
    const fromLedger = integerArg('from-ledger', null);
    const toLedger = integerArg('to-ledger', null);
    const maxPages = integerArg('pages', 10);
    if (fromLedger === null || toLedger === null) {
      throw Error('usage: node scripts/audit-issuer-returns.js --from-ledger=N --to-ledger=N [--pages=10]');
    }
    const out = await audit({ fromLedger, toLedger, maxPages });
    console.log(JSON.stringify(out, null, 2));
  })().catch(e => { console.error('issuer-return audit:', e.message); process.exitCode = 1; });
}
module.exports = { audit, rpc };
