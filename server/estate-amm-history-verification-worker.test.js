'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createAmmHistoryCheckpointStore}=require('./estate-amm-history-checkpoints');
const {createAmmHistoryVerificationJournal}=require('./estate-amm-history-verification-journal');
const {verifyAmmHistoryBatch}=require('./estate-amm-history-verification-worker');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',plxIssuer='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',lpCurrency='03'+'A'.repeat(38);
const db=new DatabaseSync(':memory:');const store=createAmmHistoryCheckpointStore(db);
store.begin({scanId:'s',treasury,ledgerMin:100,ledgerMax:200});
const hash='A'.repeat(64);
store.recordPage({scanId:'s',expectedPageCount:0,transactions:[{hash,ledgerIndex:101,validated:false,transactionType:'AMMDeposit'}],nextMarker:null});
async function main(){
 const r=await verifyAmmHistoryBatch({request:async()=>{throw new Error('should_not_fetch')}},db,{scanId:'s',treasury,imgIssuer,plxIssuer});
 assert.equal(r.rejected,1);assert.equal(r.verified,0);assert.equal(r.distributable,false);
 assert.equal(createAmmHistoryVerificationJournal(db).get('s',hash).failure_code,'stored_entry_not_validated');
 const again=await verifyAmmHistoryBatch({request:async()=>{throw new Error('should_not_fetch')}},db,{scanId:'s',treasury,imgIssuer,plxIssuer});
 assert.equal(again.attempted,0);
 console.log('AMM history verification worker tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
