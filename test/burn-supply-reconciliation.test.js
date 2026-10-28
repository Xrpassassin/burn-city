'use strict';
const assert=require('node:assert/strict');
const {reconcileBurnSupply}=require('../server/burn-supply-reconciliation');
const {auditBurnSupply}=require('../scripts/audit-burn-supply');
const launchEvidence=require('../server/burn-launch-baseline.json');
const {BURN_ISSUER:issuer,BURN_CURRENCY:currency}=require('../server/issuer-return-history');
const pin=107955066,hash='A'.repeat(64);
const anchor={validated:true,ledger_index:pin,ledger_hash:hash};
const current={...structuredClone(launchEvidence.locked.result||launchEvidence.locked),...anchor};
const gateway={...anchor,account:issuer,obligations:{[currency]:'30'},frozen_balances:{holder:[{currency,value:'2'}]},locked:{[currency]:'3'}};
const escrowPages=[{...anchor,account:issuer,account_objects:[],marker:'next'},{...anchor,account:issuer,account_objects:[{LedgerEntryType:'Escrow',index:'e1',Amount:{issuer,currency,value:'3'}}]}];
const base={launchEvidence,current,gateway,escrowPages,pinnedLedger:{index:pin,hash},now:1000};
const result=reconcileBurnSupply(base);
assert.equal(result.status,'verified');assert.equal(result.outstanding,'35');assert.equal(result.burned,'999999999999965');assert.equal(result.burned_pct,99.9999);
for(const mutate of [
 x=>x.current.account_data.Sequence++,x=>x.gateway.validated=false,x=>x.gateway.ledger_index++,x=>x.gateway.ledger_hash='B'.repeat(64),
 x=>x.gateway.balances={excluded:[]},x=>x.gateway.assets={holder:[]},x=>x.gateway.locked[currency]='4',
 x=>x.gateway.obligations[currency]='1000000000000001',x=>x.gateway.obligations[currency]='-1',
 x=>x.escrowPages.pop(),x=>x.escrowPages[0].marker=null,x=>x.escrowPages[1].account_objects.push(x.escrowPages[1].account_objects[0]),
 x=>x.escrowPages[1].ledger_hash='C'.repeat(64),x=>x.now=NaN]){
 const copy=structuredClone(base);mutate(copy);assert.equal(reconcileBurnSupply(copy).status,'unverified');
}
(async()=>{
 const calls=[];
 const report=await auditBurnSupply({now:1000,rpc:async(method,params)=>{
  calls.push({method,params});
  if(method==='server_info')return {info:{network_id:0,validated_ledger:{seq:pin,hash}}};
  assert.equal(params.ledger_hash,hash);assert.equal(params.account,issuer);
  if(method==='account_info')return current;
  if(method==='gateway_balances'){assert.equal(params.hotwallet,undefined);return gateway;}
  assert.equal(method,'account_objects');return params.marker?escrowPages[1]:escrowPages[0];
 }});
 assert.equal(report.status,'verified');
 const gatewayNoHash={...gateway};delete gatewayNoHash.ledger_hash;
 const gatewayNoLedger={...gateway};delete gatewayNoLedger.ledger_hash;delete gatewayNoLedger.ledger_index;
 assert.equal(reconcileBurnSupply({...base,gateway:gatewayNoLedger,pinnedLedger:{index:pin,hash}}).status,'verified');
 assert.equal(reconcileBurnSupply({...base,pinnedLedger:null,gateway:gatewayNoLedger}).status,'unverified');
 assert.equal(reconcileBurnSupply({...base,gateway:{...gateway,validated:false},pinnedLedger:{index:pin,hash}}).status,'unverified');
 assert.equal(reconcileBurnSupply({...base,gateway:{...gateway,ledger_index:pin+1},pinnedLedger:{index:pin,hash}}).status,'unverified');
 const anchored=reconcileBurnSupply({...base,gateway:gatewayNoHash,pinnedLedger:{index:pin,hash}});
 assert.equal(anchored.status,'verified');
 assert.equal(reconcileBurnSupply({...base,pinnedLedger:null,gateway:gatewayNoHash}).status,'unverified');
 assert.equal(reconcileBurnSupply({...base,gateway:{...gateway,ledger_hash:'C'.repeat(64)},pinnedLedger:{index:pin,hash}}).status,'unverified');
assert.equal(calls.length,5);assert.ok(calls.every(c=>c.method!=='account_tx'));
 const capped=await auditBurnSupply({maxEscrowPages:1,rpc:async m=>m==='server_info'?{info:{network_id:0,validated_ledger:{seq:pin,hash}}}:m==='account_info'?current:m==='gateway_balances'?gateway:escrowPages[0]});
 assert.equal(capped.status,'unverified');
 console.log('BURN supply reconciliation: frozen/escrow accounting, ledger pinning, fail-closed pagination and no transaction scan passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
