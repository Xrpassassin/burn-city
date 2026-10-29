'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createImgValidatedLedgerScanner}=require('./estate-img-validated-ledger-scanner');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',source='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',hash='A'.repeat(64);
const ledgerIndex=101,close_time=900000000;
function makeClient({valid=true,delivered='1.000001'}={}){
 return {request:async request=>{
  if(request.command==='ledger')return {result:{validated:valid,ledger:{ledger_index:ledgerIndex,ledger_hash:'B'.repeat(64),parent_hash:'C'.repeat(64),transaction_hash:'D'.repeat(64),close_time,transactions:[{hash,TransactionType:'Payment',Account:source,Destination:treasury}]}}};
  if(request.command==='tx')return {result:{validated:true,hash,ledger_index:ledgerIndex,date:close_time,TransactionType:'Payment',Account:source,Destination:treasury,meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:'IMG',issuer:source,value:delivered}}}};
  throw new Error('unexpected_command');
 }};
}
(async()=>{
 const db=new DatabaseSync(':memory:');
 const scanner=createImgValidatedLedgerScanner({db,client:makeClient(),treasury,imgIssuer:source,allowedSources:[source]});
 const result=await scanner.scan(ledgerIndex,{verifiedAtMs:1900000000000});
 assert.equal(result.newReceipts,1);assert.equal(result.ledgerHash,'B'.repeat(64));assert.equal(scanner.current().ledger_index,ledgerIndex);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts').get().n,1);
 await assert.rejects(()=>scanner.scan(ledgerIndex),/noncontiguous_ledger/);
 const invalidDb=new DatabaseSync(':memory:');
 const invalid=createImgValidatedLedgerScanner({db:invalidDb,client:makeClient({valid:false}),treasury,imgIssuer:source,allowedSources:[source]});
 await assert.rejects(()=>invalid.scan(ledgerIndex),/unvalidated_or_incomplete_ledger/);
 assert.equal(invalid.current(),null);
 const duplicateDb=new DatabaseSync(':memory:');
 const duplicateClient=makeClient();
 const originalRequest=duplicateClient.request;
 duplicateClient.request=async request=>{const response=await originalRequest(request);if(request.command==='ledger')response.result.ledger.transactions.push({...response.result.ledger.transactions[0]});return response;};
 const duplicate=createImgValidatedLedgerScanner({db:duplicateDb,client:duplicateClient,treasury,imgIssuer:source,allowedSources:[source]});
 await assert.rejects(()=>duplicate.scan(ledgerIndex),/duplicate_ledger_transaction/);
 assert.equal(duplicate.current(),null);
 const badDb=new DatabaseSync(':memory:');
 const bad=createImgValidatedLedgerScanner({db:badDb,client:makeClient({delivered:'0'}),treasury,imgIssuer:source,allowedSources:[source]});
 await assert.rejects(()=>bad.scan(ledgerIndex),/zero_img_delivery/);
 assert.equal(bad.current(),null);
 assert.equal(badDb.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts').get().n,0);
 console.log('Validated ledger IMG scan, atomic checkpoint and rejection tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
