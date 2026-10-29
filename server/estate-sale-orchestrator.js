'use strict';
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateSaleSettlementStore}=require('./estate-sale-settlement');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
// Server-only orchestration. Buyer authentication, route authorization and
// Xaman signing remain outside this module. Never accept a client verification object.
function createEstateSaleOrchestrator(db,{treasury,client}={}){
 if(typeof treasury!=='string'||!treasury||!client||typeof client.request!=='function')throw new TypeError('trusted_xrpl_configuration_required');
 const reservations=createEstateSaleReservations(db);
 const settlement=createEstateSaleSettlementStore(db);
 async function settle({reservationId,txHash,now=Date.now()}={}){
  if(typeof reservationId!=='string'||!reservationId)throw new TypeError('reservation_id_required');
  const reservation=reservations.get(reservationId);
  if(!reservation)throw new Error('reservation_not_found');
  // Repeated successful settlement is safe only if its transaction hash matches.
  if(reservation.status==='settled'){
   if(reservation.payment_tx!==txHash?.toUpperCase())throw new Error('reservation_already_settled');
   return {status:'already_settled',reservationId,propertyId:reservation.property_id,txHash:reservation.payment_tx};
  }
  const evidence=await verifyEstateSalePayment(client,reservation,{txHash,treasury,now});
  const ownership=settlement.settle({reservationId,verification:evidence,now});
  return Object.freeze({status:'settled',reservationId,propertyId:ownership.property_id,buyer:ownership.acct,txHash:ownership.purchase_tx,ownershipAssigned:true,distributable:false});
 }
 return {reserve:reservations.reserve, getReservation:reservations.get,settle};
}
module.exports={createEstateSaleOrchestrator};
