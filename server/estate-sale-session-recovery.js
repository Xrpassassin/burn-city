'use strict';
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateXamanPayloadStore}=require('./estate-sale-xaman-payload-store');
// Read-only recovery: never reveal another buyer's Xaman payload UUID.
function createEstateSaleSessionRecovery(db){
 const reservations=createEstateSaleReservations(db);
 const payloads=createEstateXamanPayloadStore(db);
 function get({reservationId,buyer,now=Date.now()}={}){
  if(typeof reservationId!=='string'||!reservationId||typeof buyer!=='string'||!buyer)return {ok:false,error:'invalid_session_request'};
  const reservation=reservations.get(reservationId);
  if(!reservation||reservation.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
  const status=reservation.status==='reserved'&&reservation.expires_at<=now?'expired':reservation.status;
  const payload=payloads.get(reservationId);
  return Object.freeze({ok:true,reservationId,propertyId:reservation.property_id,status,priceDrops:reservation.price_drops,expiresAt:reservation.expires_at,payloadUuid:status==='reserved'?payload?.payload_uuid||null:null,paymentTx:status==='settled'?reservation.payment_tx:null,salesEnabled:false});
 }
 return {get};
}
module.exports={createEstateSaleSessionRecovery};
