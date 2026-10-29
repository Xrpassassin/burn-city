'use strict';
const assert=require('node:assert/strict');
const {collectTreasuryAccountTx:collect}=require('./estate-amm-account-tx-history');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const opts={treasury,ledgerMin:100,ledgerMax:200,maxPages:2};
const entry=(hash,index)=>({validated:true,ledger_index:index,tx:{hash,ledger_index:index,TransactionType:'AMMDeposit'}});
async function main(){
 const requests=[];const pages=[
 {account:treasury,ledger_index_min:100,ledger_index_max:200,transactions:[entry('A'.repeat(64),101)],marker:{ledger:101,seq:1}},
 {account:treasury,ledger_index_min:100,ledger_index_max:200,transactions:[entry('B'.repeat(64),102)]}
 ];
 const result=await collect({request:async r=>{requests.push(r);return {result:pages[requests.length-1]}}},opts);
 assert.equal(result.transactions.length,2);assert.equal(result.exhaustedPagination,true);assert.equal(result.historyComplete,false);
 assert.deepEqual(requests[1].marker,{ledger:101,seq:1});
 const bounded=await collect({request:async()=>({result:pages[0]})},{...opts,maxPages:1});
 assert.equal(bounded.exhaustedPagination,false);
 await assert.rejects(()=>collect({request:async()=>({result:{...pages[0],transactions:[entry('A'.repeat(64),101),entry('A'.repeat(64),102)]}})},opts),/duplicate_account_tx_hash/);
 console.log('Treasury account_tx pagination tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
