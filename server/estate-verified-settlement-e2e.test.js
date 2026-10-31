'use strict';
// In-memory checkout -> validated XRPL proof -> atomic ownership + capital accounting.
// No Xaman API, mainnet, signing, transfers, or bonus issuance.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateSaleSettlementStore}=require('./estate-sale-settlement');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
const {quoteEstate}=require('./estate-purchase-contract');
(async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 const reservations=createEstateSaleReservations(db),settlement=createEstateSaleSettlementStore(db);
 const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',treasury='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
 const reservation=reservations.reserve({reservationId:'checkout-settlement-00001',propertyId:'trailer-01',buyer,now:1700000000000});
 const quote=quoteEstate('trailer-01');
 assert.equal(reservation.price_drops,quote.priceDrops);
 const hash='E'.repeat(64),date=Math.floor((1700000000000+30000)/1000)-946684800;
 const tx={validated:true,hash,ledger_index:12345,date,tx_json:{hash,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:String(quote.priceDrops),date,
 Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:Buffer.from(reservation.reservation_id).toString('hex').toUpperCase()}}]},
 meta:{TransactionResult:'tesSUCCESS',delivered_amount:String(quote.priceDrops)}};
 let response=structuredClone(tx);
 const client={request:async q=>{assert.equal(q.command,'tx');assert.equal(q.transaction,hash);return {result:response}}};
 const verify=()=>verifyEstateSalePayment(client,reservation,{txHash:hash,treasury,now:1700000000000+40000});
 response={...tx,meta:{...tx.meta,delivered_amount:'1'}};
 await assert.rejects(verify(),/payment_delivered_amount_mismatch/);
 response={...tx,tx_json:{...tx.tx_json,Account:treasury}};
 await assert.rejects(verify(),/payment_sender_or_destination_mismatch/);
 response={...tx,tx_json:{...tx.tx_json,Memos:[]}};
 await assert.rejects(verify(),/payment_reservation_memo_mismatch/);
 response={...tx,validated:false};
 await assert.rejects(verify(),/payment_not_validated_success/);
 response=tx;
 const proof=await verify();
 assert.equal(proof.distributable,false);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,0,'verification cannot grant ownership');
 const owned=settlement.settle({reservationId:reservation.reservation_id,verification:proof,now:1700000000000+50000});
 assert.equal(owned.acct,buyer);
 assert.equal(owned.purchase_tx,hash);
 assert.equal(owned.share_units,quote.allocationUnits);
 const capital=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?').get(hash);
 assert.equal(capital.img_rlusd_drops,'2970000');
 assert.equal(capital.operating_reserve_drops,'30000');
 assert.equal(capital.state,'awaiting_liquidity_execution');
 assert.equal(settlement.settle({reservationId:reservation.reservation_id,verification:proof,now:1700000000000+60000}).purchase_tx,hash,'idempotent settlement');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_capital_allocations').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);
 console.log('Verified Estates settlement: invalid proof rejected; ownership atomic/idempotent; IMG/RLUSD capital reserved, no rewards');
})().catch(err=>{console.error(err);process.exitCode=1;});
