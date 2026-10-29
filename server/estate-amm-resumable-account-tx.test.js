'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {resumeTreasuryAccountTx:resume}=require('./estate-amm-resumable-account-tx');
const {createAmmHistoryCheckpointStore}=require('./estate-amm-history-checkpoints');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const opts={scanId:'scan-1',treasury,ledgerMin:100,ledgerMax:200,maxPages:1};
const entry=(hash,index)=>({validated:true,ledger_index:index,tx:{hash,ledger_index:index,TransactionType:'AMMDeposit'}});
async function main(){
 const db=new DatabaseSync(':memory:');const requests=[];
 const client={request:async req=>{requests.push(req);return {result:req.marker?{account:treasury,transactions:[entry('B'.repeat(64),102)]}:{account:treasury,transactions:[entry('A'.repeat(64),101)],marker:{ledger:101}}}}};
 const first=await resume(client,db,opts);assert.equal(first.pagesProcessed,1);assert.equal(first.exhaustedPagination,false);
 const second=await resume(client,db,opts);assert.equal(second.pagesProcessed,1);assert.equal(second.exhaustedPagination,true);
 assert.deepEqual(requests[1].marker,{ledger:101});
 const third=await resume(client,db,opts);assert.equal(third.pagesProcessed,0);
 const store=createAmmHistoryCheckpointStore(db);assert.equal(store.get('scan-1').page_count,2);
 const failedDb=new DatabaseSync(':memory:');let attempts=0;
 await assert.rejects(()=>resume({request:async()=>{attempts++;throw new Error('network_down')}},failedDb,opts),/network_down/);
 assert.equal(createAmmHistoryCheckpointStore(failedDb).get('scan-1').page_count,0);
 console.log('Resumable treasury account_tx tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
