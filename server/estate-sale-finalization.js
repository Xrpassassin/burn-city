'use strict';
const {createEstateXamanPaymentSession}=require('./estate-sale-xaman-session');
const {createEstateSaleOrchestrator}=require('./estate-sale-orchestrator');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
// Trusted server-only completion bridge. Never accept a client-provided tx hash.
// Xaman's signed hash is only a lookup hint; XRPL validation determines ownership.
function createEstateSaleFinalization(db,{sdk,client,treasury,enabled=false}={}){
 const reservations=createEstateSaleReservations(db);
 const session=createEstateXamanPaymentSession(db,{sdk,treasury,enabled});
 const settlement=enabled?createEstateSaleOrchestrator(db,{client,treasury}):null;
 async function finalize({reservationId,buyer,now=Date.now()}={}){
  if(!enabled)return {ok:false,error:'estate_sales_disabled'};
  const r=reservations.get(reservationId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
  if(r.status==='settled')return {ok:true,status:'already_settled',reservationId,propertyId:r.property_id,txHash:r.payment_tx};
  if(r.status!=='reserved'||now>r.expires_at)return {ok:false,error:'reservation_not_active'};
  const signed=await session.signedHash({reservationId,buyer});
  if(!signed.ok)return signed;
  const result=await settlement.settle({reservationId,txHash:signed.txHash,now});
  return {ok:true,...result};
 }
 return {finalize};
}
module.exports={createEstateSaleFinalization};
