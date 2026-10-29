'use strict';
const assert=require('node:assert/strict');
const {reconcileValidatedAmmTx,fetchAndReconcileAmmTx}=require('./estate-amm-tx-reconciliation');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',plxIssuer='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',ammAccount='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',lpCurrency='03ABCDEF0123456789ABCDEF0123456789ABCDEF';
const config={treasury,imgIssuer,plxIssuer,ammAccount,lpCurrency};
const node=(currency,issuer,before,after)=>({ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency,value:after}},PreviousFields:{Balance:{currency,value:before}}}});
const hash='A'.repeat(64);
const tx={validated:true,ledger_index:100,hash,tx_json:{TransactionType:'AMMDeposit',Account:treasury,Asset:{currency:'IMG',issuer:imgIssuer},Asset2:{currency:'PLX',issuer:plxIssuer}},meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[node('IMG',imgIssuer,'100','90'),node('PLX',plxIssuer,'200','180'),node(lpCurrency,ammAccount,'0','5')]}};
async function main(){
 const r=reconcileValidatedAmmTx(tx,config);
 assert.equal(r.imgDelta,'-10');assert.equal(r.plxDelta,'-20');assert.equal(r.lpTokenDelta,'5');
 assert.equal(r.distributable,false);assert.equal(r.principalBasisVerified,false);
 let calls=0;const fetched=await fetchAndReconcileAmmTx({request:async()=>{calls++;return {result:tx}}},hash,config);
 assert.equal(calls,1);assert.deepEqual(fetched,r);
 assert.throws(()=>reconcileValidatedAmmTx({...tx,validated:false},config),/unvalidated/);
 console.log('Combined AMM transaction reconciliation tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
