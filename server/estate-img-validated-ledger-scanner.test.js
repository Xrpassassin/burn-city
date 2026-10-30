'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createImgValidatedLedgerScanner}=require('./estate-img-validated-ledger-scanner');
const {createImgHistoricalBootstrap}=require('./estate-img-historical-bootstrap');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',source='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',hash='A'.repeat(64);
const ledgerIndex=101,close_time=900000000;
function configure(db){createImgHistoricalBootstrap(db).configure({startLedgerIndex:ledgerIndex,startLedgerHash:'B'.repeat(64),treasury,imgIssuer:source,allowedSources:[source],confirmedOnChain:true});}
function makeClient({valid=true,delivered='1.000001'}={}){
 return {request:async request=>{
  if(request.command==='ledger')return {result:{validated:valid,ledger:{ledger_index:ledgerIndex,ledger_hash:'B'.repeat(64),parent_hash:'C'.repeat(64),transaction_hash:'D'.repeat(64),close_time,transactions:[hash]}}};
  if(request.command==='account_tx')return {result:{validated:valid,account:treasury,ledger_index_min:ledgerIndex,ledger_index_max:ledgerIndex,transactions:[{validated:true,ledger_index:ledgerIndex,hash,tx_json:{TransactionType:'Payment',Account:source,Destination:treasury}}]}};
  if(request.command==='tx')return {result:{validated:true,hash,ledger_index:ledgerIndex,date:close_time,TransactionType:'Payment',Account:source,Destination:treasury,meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:'IMG',issuer:source,value:delivered}}}};
  throw new Error('unexpected_command');
 }};
}
(async()=>{
 const db=new DatabaseSync(':memory:');
 configure(db);
 const scanner=createImgValidatedLedgerScanner({db,client:makeClient(),treasury,imgIssuer:source,allowedSources:[source]});
 const result=await scanner.scan(ledgerIndex,{verifiedAtMs:1900000000000});
 assert.equal(result.newReceipts,1);assert.equal(result.ledgerHash,'B'.repeat(64));assert.equal(scanner.current().ledger_index,ledgerIndex);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts').get().n,1);
 await assert.rejects(()=>scanner.scan(ledgerIndex),/noncontiguous_ledger/);
 const invalidDb=new DatabaseSync(':memory:');
 configure(invalidDb);
 const invalid=createImgValidatedLedgerScanner({db:invalidDb,client:makeClient({valid:false}),treasury,imgIssuer:source,allowedSources:[source]});
 await assert.rejects(()=>invalid.scan(ledgerIndex),/unvalidated_or_incomplete_ledger/);
 assert.equal(invalid.current(),null);
 const badDb=new DatabaseSync(':memory:');
 configure(badDb);
 const bad=createImgValidatedLedgerScanner({db:badDb,client:makeClient({delivered:'0'}),treasury,imgIssuer:source,allowedSources:[source]});
 await assert.rejects(()=>bad.scan(ledgerIndex),/zero_img_delivery/);
 assert.equal(bad.current(),null);
 assert.equal(badDb.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts').get().n,0);
 // A later page can contain the only reward. No checkpoint until all pages
 // and independent receipt proofs pass, including after a provider error.
 const pagedDb=new DatabaseSync(':memory:');configure(pagedDb);const pagedBase=makeClient();let pages=0;
 const pagedClient={request:async q=>{
  if(q.command==='ledger'){assert.equal(q.expand,false);assert.equal(q.transactions,false);return pagedBase.request(q);}
  if(q.command==='account_tx'){assert.equal(q.ledger_index_min,ledgerIndex);assert.equal(q.ledger_index_max,ledgerIndex);assert.equal(q.limit,10);pages++;if(!q.marker)return {result:{validated:true,account:treasury,ledger_index_min:ledgerIndex,ledger_index_max:ledgerIndex,transactions:[],marker:{page:2}}};assert.deepEqual(q.marker,{page:2});}
  return pagedBase.request(q);
 }};
 const paged=createImgValidatedLedgerScanner({db:pagedDb,client:pagedClient,treasury,imgIssuer:source,allowedSources:[source]});
 assert.equal((await paged.scan(ledgerIndex)).newReceipts,1);assert.equal(pages,2);
 for(const fault of ['range','unvalidated','missing_hash','foreign_hash','wrong_ledger_hash','duplicate','repeated_marker','provider_error']){
  const d=new DatabaseSync(':memory:');configure(d);const base=makeClient();let page=0;
  const client={request:async q=>{
   const r=await base.request(q);if(q.command!=='account_tx')return r;page++;
   if(fault==='range')r.result.ledger_index_max=ledgerIndex-1;
   if(fault==='unvalidated')r.result.validated=false;
   if(fault==='missing_hash')delete r.result.transactions[0].hash;
   if(fault==='foreign_hash')r.result.transactions[0].hash='F'.repeat(64);
   if(fault==='wrong_ledger_hash')r.result.transactions[0].ledger_hash='F'.repeat(64);
   if(fault==='duplicate')r.result.transactions.push({...r.result.transactions[0]});
   if(fault==='repeated_marker'){r.result.transactions=[];r.result.marker={page:2};}
   if(fault==='provider_error'){if(page===2)throw Error('rate_limit_fixture');r.result.marker={page:2};}
   return r;
  }};
  const scanner=createImgValidatedLedgerScanner({db:d,client,treasury,imgIssuer:source,allowedSources:[source]});
  await assert.rejects(()=>scanner.scan(ledgerIndex),undefined,fault);
  assert.equal(scanner.current(),null,fault);assert.equal(d.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts').get().n,0,fault);d.close();
 }
 console.log('Validated ledger IMG scan, atomic checkpoint and rejection tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
