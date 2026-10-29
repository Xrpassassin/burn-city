'use strict';
const assert=require('node:assert/strict');
const {reconcileAmmWithVerifiedIdentity:reconcile}=require('./estate-amm-verified-reconciliation');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',plxIssuer='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',ammAccount='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',lpCurrency='03'+'A'.repeat(38),hash='A'.repeat(64);
const config={treasury,imgIssuer,plxIssuer};
const node=(currency,issuer,before,after)=>({ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency,value:after}},PreviousFields:{Balance:{currency,value:before}}}});
const identity={validated:true,ledger_index:200,amm:{account:ammAccount,amount:{currency:'IMG',issuer:imgIssuer,value:'100'},amount2:{currency:'PLX',issuer:plxIssuer,value:'100'},lp_token:{currency:lpCurrency,issuer:ammAccount,value:'50'}}};
const tx={validated:true,ledger_index:100,hash,tx_json:{TransactionType:'AMMDeposit',Account:treasury,Asset:{currency:'IMG',issuer:imgIssuer},Asset2:{currency:'PLX',issuer:plxIssuer}},meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[node('IMG',imgIssuer,'100','90'),node('PLX',plxIssuer,'100','80'),node(lpCurrency,ammAccount,'0','5')]}};
async function main(){
 const commands=[];
 const client={request:async req=>{commands.push(req.command);return {result:req.command==='amm_info'?identity:tx}}};
 const r=await reconcile(client,hash,config);
 assert.deepEqual(commands,['amm_info','tx']);
 assert.equal(r.imgDelta,'-10');assert.equal(r.plxDelta,'-20');assert.equal(r.lpTokenDelta,'5');
 assert.equal(r.ammIdentitySource,'validated_amm_info');assert.equal(r.historicalAmmIdentityVerified,false);assert.equal(r.distributable,false);
 await assert.rejects(()=>reconcile({request:async req=>({result:req.command==='amm_info'?{...identity,ledger_index:50}:tx})},hash,config),/identity_ledger_precedes/);
 console.log('Verified AMM identity reconciliation tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
