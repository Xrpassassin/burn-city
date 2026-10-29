'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateSaleOrchestrator}=require('./estate-sale-orchestrator');
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',treasury='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',txHash='A'.repeat(64),now=1700000000000;
let requests=0;
const client={request:async()=>{requests++;return {result:{validated:true,ledger_index:101,tx_json:{hash:txHash,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:'3000000',Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:Buffer.from('reservation-00000001').toString('hex').toUpperCase()}}],date:Math.floor(now/1000)-946684800+10},meta:{TransactionResult:'tesSUCCESS',delivered_amount:'3000000'}}}}};
const sale=createEstateSaleOrchestrator(db,{client,treasury});
async function main(){
 const r=sale.reserve({reservationId:'reservation-00000001',propertyId:'trailer-01',buyer,now});
 assert.equal(r.price_drops,3000000);
 const result=await sale.settle({reservationId:r.reservation_id,txHash,now:now+20000});
 assert.equal(result.ownershipAssigned,true);assert.equal(requests,1);
 assert.equal((await sale.settle({reservationId:r.reservation_id,txHash,now:now+30000})).status,'already_settled');
 assert.equal(requests,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estate_property_ownership').get().n,1);
 await assert.rejects(sale.settle({reservationId:r.reservation_id,txHash:'B'.repeat(64),now:now+30000}),/reservation_already_settled/);
 console.log('Estate sale orchestration tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
