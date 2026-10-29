'use strict';
// Read-only XRPL account_lines check for the treasury's PLX and IMG trustlines.
// The caller supplies an already-connected XRPL client. No signing or submission.
const C = require('./config');
async function inspectEstateTokenLines(client, config = C) {
  if (!client || typeof client.request !== 'function') throw new TypeError('xrpl_client_required');
  const account = config.ESTATE_TREASURY;
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(account)) throw new Error('invalid_treasury_account');
  const targets = [
    { symbol: 'IMG', currency: config.IMG_CURRENCY, issuer: config.IMG_ISSUER },
    { symbol: 'PLX', currency: config.PLX_CURRENCY, issuer: config.PLX_ISSUER }
  ];
  const lines = [];
  let marker, pages = 0;
  const seen = new Set();
  do {
    if (pages++ >= 50) throw new Error('account_lines_page_limit');
    const args = {command:'account_lines',account,ledger_index:'validated',limit:400};
    if (marker !== undefined) args.marker = marker;
    const response = await client.request(args);
    const result = response?.result;
    if (!result || result.account !== account || !Array.isArray(result.lines)) throw new Error('invalid_account_lines_response');
    lines.push(...result.lines);
    const next = result.marker;
    if (next !== undefined && next !== null) {
      const key = JSON.stringify(next);
      if (seen.has(key)) throw new Error('repeated_account_lines_marker');
      seen.add(key);
    }
    marker = next;
  } while (marker !== undefined && marker !== null);
  return Object.freeze({
    account,
    assets: targets.map(({symbol,currency,issuer}) => {
      const match = lines.find(line => line.account === issuer && line.currency === currency);
      return Object.freeze({symbol,currency,issuer,exists:!!match,limit:match?.limit ?? null,balance:match?.balance ?? null});
    })
  });
}
module.exports = { inspectEstateTokenLines };
