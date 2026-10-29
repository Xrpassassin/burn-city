'use strict';
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateXamanPayloadStore}=require('./estate-sale-xaman-payload-store');
const {createEstateXamanPaymentAdapter}=require('./estate-sale-xaman');
// Server-only bridge: no HTTP route, no sale activation, no XRPL signing keys.
// A UUID must be durably associated with the authenticated reservation before it is returned.
function createEstateXamanPaymentSession(db,{sdk,treasury,enabled=false}={}){
 const reservations=createEstateSaleReservations(db);
 const payloads=createEstateXamanPayloadStore(db);
 const adapter=enabled?createEstateXamanPaymentAdapter({sdk,treasury}):null;
 async function start({reservationId,buyer,now=Date.now()}={}){
  if(!enabled)return {ok:false,error:'estate_sales_disabled'};
  const r=reservations.get(reservationId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
  if(r.status!=='reserved'||now>=r.expires_at)return {ok:false,error:'reservation_not_active'};
  // Do not issue a 10-minute Xaman request when the reservation is about to expire.
  // The remote request cannot extend the server's original price/ownership hold.
  if(r.expires_at-now<60000)return {ok:false,error:'reservation_near_expiry'};
  const prior=payloads.get(reservationId);
  if(prior){
   if(prior.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
   const payload=await sdk.payload.get(prior.payload_uuid);
   return {ok:true,reservationId,payloadUuid:prior.payload_uuid,qr:payload?.refs?.qr_png,deeplink:payload?.next?.always,reused:true};
  }
  // Concurrent callers can race to create a remote payload. Only one can be bound
  // and returned; the other must recover the already-bound UUID.
  const created=await adapter.create(r);
  if(Date.now()>=r.expires_at)return {ok:false,error:'reservation_expired_during_payload_creation'};
  try{
   const bound=payloads.bind({reservationId,uuid:created.uuid,buyer,now:Date.now()});
   return {ok:true,reservationId,payloadUuid:bound.payload_uuid,qr:created.qr,deeplink:created.deeplink,reused:false};
  }catch(e){
   if(e.message!=='payload_binding_conflict')throw e;
   const bound=payloads.get(reservationId);
   if(!bound||bound.buyer!==buyer)throw e;
   return {ok:true,reservationId,payloadUuid:bound.payload_uuid,reused:true};
  }
 }
 async function signedHash({reservationId,buyer}={}){
  if(!enabled)return {ok:false,error:'estate_sales_disabled'};
  const r=reservations.get(reservationId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
  const bound=payloads.get(reservationId);
  if(!bound||bound.buyer!==buyer)return {ok:false,error:'payment_payload_not_found'};
  const txHash=await adapter.signedTransactionHash(bound.payload_uuid,buyer);
  return txHash?{ok:true,txHash}:{ok:false,error:'payment_not_signed_or_submitted'};
 }
 return {start,signedHash};
}
module.exports={createEstateXamanPaymentSession};
