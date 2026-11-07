'use strict';
// Never accept inconsistent XRPL ledger evidence; a fresh, independent pinned
// retry may recover from a transient gateway mismatch at server startup.
const assert=require('node:assert/strict');
const {create}=require('../server/amm-lock');
const baseline=require('../server/burn-launch-baseline.json');
const {BURN_ISSUER:issuer,BURN_CURRENCY:currency}=require('../server/issuer-return-history');
const data=()=>({nodes:[{name:'BURN',key:issuer+'-'+currency}],pools:[]});
const pin=107955066,hash='A'.repeat(64),anchor={validated:true,ledger_index:pin,ledger_hash:hash};
async function run({recoverOn=3}={}){
 let attempts=0, gateways=0;
 const rpc=async(method,params)=>{
   if(method==='server_info'){
     attempts++;
     return {info:{network_id:0,validated_ledger:{seq:pin,hash}}};
   }
   assert.equal(params.ledger_hash,hash,'never use an unpinned ledger read');
   if(method==='account_info')return {...(baseline.locked.result||baseline.locked),...anchor};
   if(method==='gateway_balances'){
     gateways++;
     return {...anchor,
       validated:attempts>=recoverOn, // first snapshots fail the strict pin check
       account:issuer,obligations:{[currency]:'34843983811577.57'}};
   }
   assert.equal(method,'account_objects');
   return {...anchor,account:issuer,account_objects:[]};
 };
 const svc=create({rpc,gap:0});
 await svc.refresh(data);
 return {t:svc.snapshot().tokens.BURN,attempts,gateways};
}
(async()=>{
 const recovered=await run({recoverOn:3});
 assert.equal(recovered.attempts,3);
 assert.equal(recovered.gateways,3);
 assert.equal(recovered.t.status,'verified');
 assert.equal(recovered.t.supply_reconciliation.burned_pct,96.5156);
 assert.equal(recovered.t.issuer_keys_disabled,true);
 const immediate=await run({recoverOn:1});
 assert.equal(immediate.attempts,1,'healthy ledger should not pay retry overhead');
 assert.equal(immediate.t.status,'verified');
 const failed=await run({recoverOn:99});
 assert.equal(failed.attempts,3,'failed pin attempts must be bounded');
 assert.equal(failed.t.status,'unverified');
 assert.equal(failed.t.issuer_keys_disabled,null);
 assert.equal(failed.t.supply_reconciliation.burned_pct,null);
 console.log('BURN issuer audit retries independently pinned ledgers, remains bounded and fail closed');
})().catch(e=>{console.error(e);process.exitCode=1;});
