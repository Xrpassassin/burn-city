'use strict';
const assert=require('node:assert/strict');
const {create}=require('../server/amm-lock');
const baseline=require('../server/burn-launch-baseline.json');
const {BURN_ISSUER:issuer,BURN_CURRENCY:currency}=require('../server/issuer-return-history');
let now=Date.now(),fail=false;const calls=[],pin=107955066,ledger_hash='A'.repeat(64);
const anchor={validated:true,ledger_index:pin,ledger_hash};
const rpc=async(method,params)=>{
 calls.push(method);if(fail)throw Error('offline');
 if(method==='server_info')return {info:{network_id:0,validated_ledger:{seq:pin,hash:ledger_hash}}};
 assert.equal(params.ledger_hash,ledger_hash);
 if(method==='account_info')return {...(baseline.locked.result||baseline.locked),...anchor};
 if(method==='gateway_balances')return {...anchor,account:issuer,obligations:{[currency]:'34843983811577.57'}};
 assert.equal(method,'account_objects');return {...anchor,account:issuer,account_objects:[]};
};
(async()=>{
 const app=create({rpc,gap:0,now:()=>now});const data=()=>({nodes:[{name:'BURN',key:issuer+'-'+currency}],pools:[]});
 await app.refresh(data);
 let token=app.snapshot().tokens.BURN;assert.equal(token.supply_reconciliation.status,'verified');assert.equal(token.supply_reconciliation.burned_pct,96.5156);
 assert.equal(token.issuer_keys_disabled,true);assert.equal(token.issuer_return_history,undefined);assert.equal(calls.length,4);
 assert.ok(!calls.includes('account_tx')&&!calls.includes('account_lines'));
 now+=7*3600e3;token=app.snapshot().tokens.BURN;assert.equal(token.status,'unverified');
 fail=true;await app.refresh(data);token=app.snapshot().tokens.BURN;
 assert.equal(token.supply_reconciliation.status,'unverified');assert.equal(token.issuer_keys_disabled,null);
 console.log('BURN live supply: efficient refresh, dedicated contract, stale and offline behavior passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
