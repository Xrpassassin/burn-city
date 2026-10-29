'use strict';
// Reuse the existing Xaman SDK integration, without introducing a second
// wallet identity or exposing server-side Xaman credentials to the browser.
function createEstateXamanPaymentAdapter({sdk,treasury}={}){
 if(!sdk?.payload||typeof sdk.payload.create!=='function'||typeof sdk.payload.get!=='function')throw new TypeError('xaman_sdk_required');
 if(typeof treasury!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(treasury))throw new TypeError('estate_treasury_required');
 function validate(reservation){
  if(!reservation||reservation.status!=='reserved'||typeof reservation.reservation_id!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(reservation.reservation_id)||typeof reservation.buyer!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(reservation.buyer)||!Number.isSafeInteger(reservation.price_drops)||reservation.price_drops<=0)throw new Error('active_server_reservation_required');
 }
 async function create(reservation){
  validate(reservation);
  const payload=await sdk.payload.create({txjson:{
   TransactionType:'Payment',Account:reservation.buyer,Destination:treasury,Amount:String(reservation.price_drops),
   Memos:[{Memo:{MemoType:Buffer.from('burncity/estates','utf8').toString('hex').toUpperCase(),MemoData:Buffer.from(reservation.reservation_id,'utf8').toString('hex').toUpperCase()}}]
  },options:{submit:true,expire:10},custom_meta:{identifier:reservation.reservation_id,instruction:'BURN City Estates property purchase. Confirm the XRP amount and destination in Xaman.'}});
  if(!payload?.uuid||!payload?.refs?.qr_png||!payload?.next?.always)throw new Error('xaman_payload_incomplete');
  return Object.freeze({uuid:payload.uuid,qr:payload.refs.qr_png,deeplink:payload.next.always,reservationId:reservation.reservation_id});
 }
 async function signedTransactionHash(uuid,expectedBuyer){
  if(typeof uuid!=='string'||!uuid||typeof expectedBuyer!=='string'||!expectedBuyer)throw new TypeError('payload_identity_required');
  const payload=await sdk.payload.get(uuid);
  if(payload?.meta?.signed!==true||payload?.response?.account!==expectedBuyer)return null;
  const hash=payload?.response?.txid;
  return typeof hash==='string'&&/^[A-Fa-f0-9]{64}$/.test(hash)?hash.toUpperCase():null;
 }
 return {create,signedTransactionHash};
}
module.exports={createEstateXamanPaymentAdapter};
