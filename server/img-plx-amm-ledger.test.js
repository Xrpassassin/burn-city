'use strict';
const assert=require('node:assert/strict');
const {POOL}=require('./img-plx-amm-deposit-draft');
const {parseValidatedImgPlxPool,inspectImgPlxPool}=require('./img-plx-amm-ledger');
const issuerA='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',issuerB='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const fixture={result:{validated:true,ledger_index:101,amm:{account:POOL,amount:{currency:'PLX',issuer:issuerB,value:'200'},amount2:{currency:'IMG',issuer:issuerA,value:'500'},lp_token:{currency:'03'+'A'.repeat(38),issuer:POOL,value:'300'},trading_fee:100}}};
const info=parseValidatedImgPlxPool(fixture);
assert.equal(info.img.value,'500');assert.equal(info.plx.value,'200');assert.equal(info.ledgerIndex,101);
for(const changed of [
 {result:{...fixture.result,validated:false}},
 {result:{...fixture.result,ledger_index:undefined}},
 {result:{...fixture.result,amm:{...fixture.result.amm,account:issuerA}}},
 {result:{...fixture.result,amm:{...fixture.result.amm,amount:{currency:'USD',issuer:issuerB,value:'200'}}}},
 {result:{...fixture.result,amm:{...fixture.result.amm,lp_token:{...fixture.result.amm.lp_token,issuer:issuerB}}}}
])assert.throws(()=>parseValidatedImgPlxPool(changed));
(async()=>{
 let requested;
 const result=await inspectImgPlxPool({request:async x=>(requested=x,fixture)});
 assert.equal(requested.command,'amm_info');assert.equal(requested.amm_account,POOL);assert.equal(requested.ledger_index,'validated');assert.equal(result.poolAddress,POOL);
 console.log('Validated IMG/PLX AMM ledger inspection tests passed; no transactions submitted');
})().catch(e=>{console.error(e);process.exitCode=1});
