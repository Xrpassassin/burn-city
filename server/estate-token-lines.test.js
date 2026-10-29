'use strict';
const assert = require('node:assert/strict');
const C = require('./config');
const {inspectEstateTokenLines}=require('./estate-token-lines');
(async()=>{
  const calls=[];
  const client={request:async args=>{
    calls.push(args);
    return {result:{account:C.ESTATE_TREASURY,lines:calls.length===1?[{account:C.IMG_ISSUER,currency:C.IMG_CURRENCY,limit:'100',balance:'5'}]:[],marker:calls.length===1?'next':undefined}};
  }};
  const result=await inspectEstateTokenLines(client);
  assert.equal(result.account,C.ESTATE_TREASURY);
  assert.equal(result.assets.find(x=>x.symbol==='IMG').exists,true);
  assert.equal(result.assets.find(x=>x.symbol==='PLX').exists,false);
  assert.equal(calls.length,2);
  assert.equal(calls[0].ledger_index,'validated');
  assert.equal(calls[1].marker,'next');
  await assert.rejects(inspectEstateTokenLines({request:async()=>({result:{account:'wrong',lines:[]}})}),/invalid_account_lines_response/);
  console.log('estate token lines tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
