'use strict';
const assert=require('node:assert/strict');
const {verifyEstateSalePayment:verify}=require('./estate-sale-payment-verifier');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',treasury='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',txHash='A'.repeat(64);
const createdAt=1700000000000,expiresAt=1700000600000;
const reservation={reservation_id:'reservation-00000001',property_id:'trailer-01',buyer,price_drops:3000000,status:'reserved',created_at:createdAt,expires_at:expiresAt};
const tx={validated:true,ledger_index:9000,tx_json:{hash:txHash,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:'3000000',date:Math.floor(createdAt/1000)-946684800+10},meta:{TransactionResult:'tesSUCCESS'}};
async function check(t,expected){
 const client={request:async()=>({result:t})};
 if(expected)await assert.rejects(verify(client,reservation,{txHash,treasury,now:createdAt+10000}),new RegExp(expected));
 else {const result=await verify(client,reservation,{txHash,treasury,now:createdAt+10000});assert.equal(result.settlementVerified,true);assert.equal(result.ownershipAssigned,false);}
}
async function main(){
 await check(tx);
 await check({...tx,validated:false},'payment_not_validated_success');
 await check({...tx,tx_json:{...tx.tx_json,Amount:'2000000'}},'payment_amount_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,Destination:buyer}},'payment_sender_or_destination_mismatch');
 await check({...tx,tx_json:{...tx.tx_json,TransactionType:'TrustSet'}},'payment_not_validated_success');
 await check({...tx,tx_json:{...tx.tx_json,date:tx.tx_json.date-100}},'payment_outside_reservation_window');
 console.log('Estate sale payment verifier tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
