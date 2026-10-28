'use strict';
const assert = require('node:assert/strict');
const { attachIssuerReturnHistory } = require('../server/issuer-return-api-contract');
const now=100000000, token={issuer:'rIssuer',currency:'4255524E'};
const verified={status:'verified',issuer:token.issuer,currency:token.currency,
 burned:'965000000000000',burned_pct:96.5,launchSupplyVerified:true,checkedAtMs:now,
 coverage:{complete:true,from_ledger:1,to_ledger:20},
 evidence:{issuer_verified:true,rejected_records:0}};
const key='rIssuer-4255524E', tokens={BURN:token};
function get(a) { return attachIssuerReturnHistory(tokens,new Map([[key,a]]),now).BURN; }
assert.equal(get(verified).issuer_return_history.burned_pct,96.5);
assert.equal(get({...verified,launchSupplyVerified:false}).issuer_return_history,undefined);
assert.equal(get({...verified,checkedAtMs:1}).issuer_return_history,undefined);
assert.equal(get({...verified,coverage:{...verified.coverage,complete:false}}).issuer_return_history,undefined);
assert.equal(get({...verified,burned_pct:101}).issuer_return_history,undefined);
assert.equal(get({...verified,issuer:'rWrong'}).issuer_return_history,undefined);
assert.equal(tokens.BURN.issuer_return_history,undefined);
const cachedHistory = get(verified).issuer_return_history;
const cachedTokens = { BURN: { ...token, issuer_return_history: cachedHistory } };
for (const audits of [undefined, new Map(), new Map([[key, {...verified,launchSupplyVerified:false}]]),
  new Map([[key, {...verified,checkedAtMs:now-21600001}]])]) {
  const result = attachIssuerReturnHistory(cachedTokens,audits,now);
  assert.equal(result.BURN.issuer_return_history,undefined);
  assert.equal(result.BURN.issuer,token.issuer);
  assert.equal(cachedTokens.BURN.issuer_return_history,cachedHistory);
}
assert.equal(attachIssuerReturnHistory(cachedTokens,new Map([[key,verified]]),now)
  .BURN.issuer_return_history.burned_pct,96.5);
console.log('issuer-return-api-contract: all tests passed');
