'use strict';
const assert=require('node:assert/strict');
const {matchedPayment,summarize,discover}=require('../scripts/discover-ecosystem-launch');
const {TOKENS}=require('../server/ecosystem-supply-reconciliation');
const t=TOKENS.IMM,hash='A'.repeat(64);
const item={validated:true,hash,ledger_index:900,tx_json:{TransactionType:'Payment',Account:t.issuer,Destination:'rDestination'},
 meta:{TransactionResult:'tesSUCCESS',delivered_amount:{issuer:t.issuer,currency:t.currency,value:'1000'}}};
assert.equal(matchedPayment(item,t).amount,'1000');
assert.equal(matchedPayment({...item,validated:false},t),null);
assert.equal(matchedPayment({...item,meta:{...item.meta,TransactionResult:'tecFAILED_PROCESSING'}},t),null);
const result=summarize([item,item],t,{complete:true});
assert.equal(result.candidate_total_issued,'1000');
assert.equal(result.candidate_issuances.length,1);
assert.equal(result.launch_supply_verified,false);
(async()=>{
 const calls=[];
 const request=async(method,p)=>{calls.push(method);if(method==='server_info')return {info:{complete_ledgers:'100-200000'}};
 return {transactions:[item]};};
 const x=await discover('IMM',{request,maxPages:2});
 assert.equal(x.scan_pages,1);assert.equal(x.launch_supply_verified,false);
 assert.deepEqual(calls,['server_info','account_tx']);
 const missing=await discover('XRPyro',{request:async()=>({info:{complete_ledgers:'unknown'}})});
 assert.equal(missing.scan_pages,0);
 console.log('Read-only IMM/XRPyro candidate discovery checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
