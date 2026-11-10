'use strict';
const {createEstateXamanPaymentSession}=require('./estate-sale-xaman-session');
const {createEstateSaleOrchestrator}=require('./estate-sale-orchestrator');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
// Trusted server-only completion bridge. Never accept a client-provided tx hash.
// Xaman's signed hash is only a lookup hint; XRPL validation determines ownership.
const LATE_REFUSALS=new Set(['payment_outside_reservation_window','payment_sender_or_destination_mismatch','payment_amount_mismatch','payment_delivered_amount_mismatch','payment_reservation_memo_mismatch','partial_payment_not_allowed','unexpected_payment_routing','payment_hash_mismatch','property_already_owned','payment_already_used','late_review_payment_mismatch','reservation_not_active','payment_reservation_mismatch','catalog_changed_since_reservation','reservation_already_settled']);
function createEstateSaleFinalization(db,{sdk,client,treasury,enabled=false}={}){
 const reservations=createEstateSaleReservations(db);
 const session=createEstateXamanPaymentSession(db,{sdk,treasury,enabled});
 const settlement=enabled?createEstateSaleOrchestrator(db,{client,treasury}):null;
 async function finalize({reservationId,buyer,now=Date.now()}={}){
  if(!enabled)return {ok:false,error:'estate_sales_disabled'};
  const r=reservations.get(reservationId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
  if(r.status==='settled')return {ok:true,status:'already_settled',reservationId,propertyId:r.property_id,txHash:r.payment_tx};
  if(r.status!=='reserved'&&r.status!=='expired')return {ok:false,error:'reservation_not_active'};
  // After the deadline, settle only when the validated payment closed inside the
  // reservation window (enforced by the verifier and the settlement store).
  const late=r.status==='expired'||now>r.expires_at;
  const signed=await session.signedHash({reservationId,buyer});
  if(!signed.ok)return late&&signed.error==='payment_not_signed_or_submitted'?{ok:false,error:'reservation_not_active'}:signed;
  try{
   const result=await settlement.settle({reservationId,txHash:signed.txHash,now,lateConfirm:late});
   return {ok:true,...result,...(late?{lateConfirmed:true}:{})};
  }catch(e){
   if(late&&LATE_REFUSALS.has(e.message))return {ok:false,error:e.message};
   throw e;
  }
 }
 return {finalize};
}
module.exports={createEstateSaleFinalization};
