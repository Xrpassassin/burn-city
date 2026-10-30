'use strict';
const assert=require('node:assert/strict');
const {verifyEstateSalePayment:verify}=require('./estate-sale-payment-verifier');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',treasury='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',txHash='A'.repeat(64);
const createdAt=1700000000000,expiresAt=1700000600000;
const reservation={reservation_id:'reservation-00000001',property_id:'trailer-01',buyer,price_drops:3000000,status:'reserved',created_at:createdAt,expires_at:expiresAt};
const tx={validated:true,ledger_index:9000,tx_json:{hash:txHash,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:'3000000',Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:Buffer.from('reservation-00000001').toString('hex').toUpperCase()}}],date:Math.floor(createdAt/1000)-946684800+10},meta:{TransactionResult:'tesSUCCESS',delivered_amount:'3000000'}};
async function check(t,expected){
 const client={request:async()=>({result:t})};
 if(expected)await assert.rejects(verify(client,reservation,{txHash,treasury,now:createdAt+10000}),new RegExp(expected));
 else {const result=await verify(client,reservation,{txHash,treasury,now:createdAt+10000});assert.equal(result.settlementVerified,true);assert.equal(result.ownershipAssigned,false);}
}
async function main(){
 await check(tx);
 await check({...tx,tx_json:{...tx.tx_json,Amount:undefined,DeliverMax:'3000000'}});
 await check({...tx,tx_json:{...tx.tx_json,DeliverMax:'1'}},'payment_amount_mismatch');
 await check({...tx,close_time_iso:new Date((tx.tx_json.date+946684800)*1000).toISOString(),tx_json:{...tx.tx_json,date:undefined}});
 await check({...tx,close_time_iso:new Date((tx.tx_json.date+946684801)*1000).toISOString()},'payment_timestamp_conflict');
 await check({...tx,hash:'B'.repeat(64)},'payment_hash_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,Flags:'0'}},'partial_payment_not_allowed');
 await check({...tx,tx_json:{...tx.tx_json,Flags:-1}},'partial_payment_not_allowed');
 await check({...tx,tx_json:{...tx.tx_json,Flags:0x00020000}},'partial_payment_not_allowed');
 await check({...tx,tx_json:{...tx.tx_json,hash:undefined}},'payment_hash_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,hash:'B'.repeat(64)}},'payment_hash_mismatch');
 await check({...tx,hash:'B'.repeat(64),tx_json:{...tx.tx_json,hash:undefined}},'payment_hash_mismatch');
 await check({...tx,hash:txHash,tx_json:{...tx.tx_json,hash:undefined}});
 const review=await verify({request:async()=>({result:tx})},{...reservation,status:'expired'},{txHash,treasury,now:expiresAt+1000,reviewExpired:true});
 assert.equal(review.reviewOnly,true);assert.equal(review.settlementVerified,false);
 await assert.rejects(verify({request:async()=>({result:tx})},{...reservation,status:'expired'},{txHash,treasury,now:expiresAt+1000}),/invalid_or_inactive_reservation/);
 await assert.rejects(verify({request:async()=>({result:tx})},reservation,{txHash,treasury,now:expiresAt+1000}),/reservation_expired/);
 await assert.rejects(verify({request:async()=>({result:{...tx,tx_json:{...tx.tx_json,date:Math.floor(expiresAt/1000)-946684800+100}}})},{...reservation,status:'expired'},{txHash,treasury,now:expiresAt+100000,reviewExpired:true}),/payment_outside_reservation_window/);
 await check({...tx,meta:{...tx.meta,delivered_amount:'2000000'}},'payment_delivered_amount_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,Memos:[]}},'payment_reservation_memo_mismatch');
 await check({...tx,validated:false},'payment_not_validated_success');
 await check({...tx,tx_json:{...tx.tx_json,Amount:'2000000'}},'payment_amount_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,Destination:buyer}},'payment_sender_or_destination_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,TransactionType:'TrustSet'}},'payment_not_validated_success');
 await check({...tx,tx_json:{...tx.tx_json,date:tx.tx_json.date-100}},'payment_outside_reservation_window');
 console.log('Estate sale payment verifier tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
