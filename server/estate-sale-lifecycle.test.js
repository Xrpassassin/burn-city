'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateReservationApi}=require('./estate-sale-reservation-api');
const {createEstateXamanPaymentSession}=require('./estate-sale-xaman-session');
const {createEstateSaleFinalization}=require('./estate-sale-finalization');
const {createEstateSaleSessionRecovery}=require('./estate-sale-session-recovery');

const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const stranger='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const treasury=stranger;
const txHash='B'.repeat(64);
const now=Date.now();
let signed=false,validated=false,memoCorrect=true,created=0;
let submitted=null;
const sdk={payload:{
 create:async request=>{
  created++;
  submitted=request.txjson;
  return {uuid:'mock-payload-uuid',refs:{qr_png:'https://example.invalid/qr'},next:{always:'https://example.invalid/xaman'}};
 },
 get:async()=>({meta:{signed},response:{account:buyer,txid:txHash}})
}};
const client={request:async()=>{
 const memoData=Buffer.from(memoCorrect?reservation.reservationId:'reservation-elsewhere').toString('hex').toUpperCase();
 return {result:{validated,ledger_index:100,tx_json:{
  hash:txHash,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:String(reservation.priceDrops),
  Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:memoData}}],
  date:Math.floor(now/1000)-946684800+3
 },meta:{TransactionResult:'tesSUCCESS',delivered_amount:String(reservation.priceDrops)}}};
}};
const reservationApi=createEstateReservationApi(db,{enabled:true});
const reservation=reservationApi.create({buyer,propertyId:'trailer-01',now});
const payment=createEstateXamanPaymentSession(db,{sdk,treasury,enabled:true});
const finalize=createEstateSaleFinalization(db,{sdk,client,treasury,enabled:true});
const recovery=createEstateSaleSessionRecovery(db);
async function run(){
 assert.equal(reservation.ok,true);
 assert.equal(reservation.priceDrops,3000000);
 assert.equal(reservationApi.create({buyer: stranger,propertyId:'trailer-01',now}).error,'property_reserved');
 assert.equal((await payment.start({reservationId:reservation.reservationId,buyer:stranger})).error,'reservation_not_found');
 const started=await payment.start({reservationId:reservation.reservationId,buyer,now});
 assert.equal(started.ok,true);
 assert.equal(submitted.Amount,'3000000');
 assert.equal(submitted.Destination,treasury);
 assert.equal((await payment.start({reservationId:reservation.reservationId,buyer,now})).reused,true);
 assert.equal(created,1);
 assert.equal(recovery.get({reservationId:reservation.reservationId,buyer,now}).payloadUuid,'mock-payload-uuid');
 assert.equal(recovery.get({reservationId:reservation.reservationId,buyer:stranger,now}).error,'reservation_not_found');
 assert.equal((await finalize.finalize({reservationId:reservation.reservationId,buyer,now:now+4000})).error,'payment_not_signed_or_submitted');
 signed=true;
 await assert.rejects(finalize.finalize({reservationId:reservation.reservationId,buyer,now:now+4000}),/payment_not_validated_success/);
 validated=true;memoCorrect=false;
 await assert.rejects(finalize.finalize({reservationId:reservation.reservationId,buyer,now:now+4000}),/payment_reservation_memo_mismatch/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,0);
 memoCorrect=true;
 const settled=await finalize.finalize({reservationId:reservation.reservationId,buyer,now:now+4000});
 assert.equal(settled.ownershipAssigned,true);
 assert.equal((await finalize.finalize({reservationId:reservation.reservationId,buyer,now:now+5000})).status,'already_settled');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);
 assert.equal(recovery.get({reservationId:reservation.reservationId,buyer,now:now+5000}).status,'settled');
 console.log('Estate full purchase lifecycle integration tests passed');
}
run().catch(e=>{console.error(e);process.exitCode=1});
