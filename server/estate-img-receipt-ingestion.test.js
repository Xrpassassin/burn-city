'use strict';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createImgReceiptIngestor } = require('./estate-img-receipt-ingestion');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',hash='A'.repeat(64);
const tx={validated:true,ledger_index:123,hash,tx_json:{TransactionType:'Payment',Account:imgIssuer,Destination:treasury},meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:'IMG',issuer:imgIssuer,value:'25'}}};
async function main(){
 const db=new DatabaseSync(':memory:');
 let requests=0;
 const client={request:async request=>{assert.equal(request.command,'tx');requests++;return {result:tx}}};
 const ingestion=createImgReceiptIngestor({db,client,treasury,imgIssuer});
 assert.equal((await ingestion.ingest(hash)).inserted,true);
 assert.equal((await ingestion.ingest(hash)).inserted,false);
 assert.equal(ingestion.get(hash).distributable,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estate_img_receipts').get().n,1);
 assert.equal(requests,2);
 const invalid=createImgReceiptIngestor({db,client:{request:async()=>({result:{...tx,validated:false,hash:'B'.repeat(64)}})},treasury,imgIssuer});
 await assert.rejects(()=>invalid.ingest('B'.repeat(64)),/unvalidated/);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estate_img_receipts').get().n,1);
 console.log('IMG validated receipt ingestion tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
