'use strict';
const assert=require('node:assert/strict');
const {inspectAmmIdentity,fetchAmmIdentity}=require('./estate-amm-identity');
const imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',plxIssuer='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',ammAccount='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',lpCurrency='03'+'A'.repeat(38);
const config={imgIssuer,plxIssuer};
const result={validated:true,ledger_index:123,amm:{account:ammAccount,amount:{currency:'IMG',issuer:imgIssuer,value:'10'},amount2:{currency:'PLX',issuer:plxIssuer,value:'20'},lp_token:{currency:lpCurrency,issuer:ammAccount,value:'5'}}};
async function main(){
 const id=inspectAmmIdentity(result,config);
 assert.equal(id.ammAccount,ammAccount);assert.equal(id.lpCurrency,lpCurrency);assert.equal(id.distributable,false);
 assert.equal(inspectAmmIdentity({...result,amm:{...result.amm,amount:result.amm.amount2,amount2:result.amm.amount}},config).ammAccount,ammAccount);
 assert.throws(()=>inspectAmmIdentity({...result,validated:false},config),/validated_amm_info_required/);
 assert.throws(()=>inspectAmmIdentity({...result,amm:{...result.amm,lp_token:{...result.amm.lp_token,issuer:imgIssuer}}},config),/invalid_amm_lp_token/);
 assert.throws(()=>inspectAmmIdentity({...result,amm:{...result.amm,amount2:{currency:'XRP'}}},config),/amm_asset_pair_mismatch/);
 let calls=0;
 const fetched=await fetchAmmIdentity({request:async req=>{calls++;assert.equal(req.command,'amm_info');assert.equal(req.ledger_index,'validated');return {result}}},config);
 assert.deepEqual(fetched,id);assert.equal(calls,1);
 console.log('Validated AMM identity tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
