'use strict';
const assert=require('node:assert/strict');
const {reconcile,TOKENS}=require('../server/ecosystem-supply-reconciliation');
const HASH='A'.repeat(64),ISSUANCE='B'.repeat(64),PIN=107955066;
for(const name of Object.keys(TOKENS)){
 const {issuer,currency}=TOKENS[name];
 const launch={status:'verified',issuer,currency,initial_supply:'1000',issuance_hash:ISSUANCE,launch_ledger:90000000,
   escrow_evidence:{verified:true,ledger_index:PIN,ledger_hash:HASH,amount:'15'}};
 const issuerInfo={validated:true,ledger_index:PIN,ledger_hash:HASH,account_data:{
  Account:issuer,Flags:0x00100000,RegularKey:'rrrrrrrrrrrrrrrrrrrrBZbvji',signer_lists:[]}};
 const gateway={validated:true,ledger_index:PIN,ledger_hash:HASH,account:issuer,
  obligations:{[currency]:'770'},frozen_balances:{test:[{currency,value:'5'}]},locked:{[currency]:'15'},balances:{},assets:{}};
 const run=(l=launch,a=issuerInfo,g=gateway)=>reconcile({name,launch:l,issuerInfo:a,gateway:g,now:123456});
 const ok=run();assert.equal(ok.status,'verified',name+': valid audited snapshot');
 assert.equal(ok.removed_pct,21);
 assert.equal(BigInt(ok.removed_units)*100n/BigInt(ok.outstanding_units),26n);
 assert.equal(run(null).status,'unverified');
 assert.equal(run({...launch,initial_supply:'bad'}).status,'unverified');
 assert.equal(run({...launch,initial_supply:'0'}).status,'unverified');
 assert.equal(run({...launch,issuer:'wrong'}).status,'unverified');
 assert.equal(run({...launch,issuance_hash:'bad'}).status,'unverified');
 assert.equal(run({...launch,escrow_evidence:null}).status,'unverified');
 assert.equal(run({...launch,escrow_evidence:{...launch.escrow_evidence,amount:'14'}}).status,'unverified');
 assert.equal(run(launch,{...issuerInfo,account_data:{...issuerInfo.account_data,Flags:0}}).status,'unverified');
 assert.equal(run(launch,issuerInfo,{...gateway,ledger_hash:'C'.repeat(64)}).status,'unverified');
 assert.equal(run(launch,issuerInfo,{...gateway,obligations:{[currency]:'1100'}}).status,'unverified');
}
console.log('IMM/XRPyro supply snapshot safety checks passed');
