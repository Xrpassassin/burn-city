'use strict';
const assert = require('node:assert/strict');
const { ESTATES_TREASURY } = require('./estate-treasury-config');
const { normalizeValidatedTransaction, readTreasuryHistory } = require('./estate-treasury-reader');
const account = ESTATES_TREASURY.address, hash = 'A'.repeat(64);
const entry = { validated:true, hash, ledger_index:123, tx:{Account:account,TransactionType:'Payment',Fee:'12'},meta:{TransactionResult:'tesSUCCESS'} };
assert.equal(normalizeValidatedTransaction(entry).hash,hash);
assert.equal(normalizeValidatedTransaction({...entry,validated:false}),null);
assert.equal(normalizeValidatedTransaction({...entry,hash:'invalid'}),null);
(async()=>{
  let calls=0;
  const result=await readTreasuryHistory({maxPages:3,request:async payload=>{
    calls++;
    assert.equal(payload.account,account);
    if(calls===1)return {result:{account,validated:true,transactions:[entry],marker:'next'}};
    assert.equal(payload.marker,'next');
    return {result:{account,validated:true,transactions:[entry],marker:null}};
  }});
  assert.equal(calls,2);
  assert.equal(result.transactions.length,1);
  assert.equal(result.complete,true);
  await assert.rejects(readTreasuryHistory({request:async()=>({result:{account,validated:false,transactions:[]}})}),/unvalidated/);
  await assert.rejects(readTreasuryHistory({account:'wrong',request:async()=>({})}),/treasury_account_mismatch/);
  const incomplete=await readTreasuryHistory({maxPages:1,request:async()=>({result:{account,validated:true,transactions:[entry],marker:'next'}})});
  assert.equal(incomplete.complete,false);
  assert.equal(incomplete.nextMarker,'next');
  console.log('estate treasury reader tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
