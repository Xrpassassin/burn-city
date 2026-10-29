'use strict';
const crypto=require('node:crypto');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
// Server-owned IDs, server catalog prices, authenticated buyer only.
// Explicitly disabled by default. Never issue Xaman payments from this endpoint.
function createEstateReservationApi(db,{enabled=false,randomBytes=crypto.randomBytes}={}){
 const store=createEstateSaleReservations(db);
 function create({buyer,propertyId,now=Date.now()}={}){
  if(!enabled)return {ok:false,error:'estate_sales_disabled'};
  if(typeof buyer!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(buyer))return {ok:false,error:'authentication_required'};
  if(typeof propertyId!=='string'||propertyId.length>100)return {ok:false,error:'invalid_property'};
  const reservationId='estate_'+randomBytes(16).toString('hex');
  try{
   const r=store.reserve({reservationId,propertyId,buyer,now});
   return {ok:true,reservationId:r.reservation_id,propertyId:r.property_id,priceDrops:r.price_drops,expiresAt:r.expires_at,status:r.status};
  }catch(e){
   if(e.message==='property_not_for_sale')return {ok:false,error:'property_not_for_sale'};
   if(e.message==='property_already_owned')return {ok:false,error:'property_already_owned'};
   if(e.code==='SQLITE_CONSTRAINT_UNIQUE'||(e.code==='ERR_SQLITE_ERROR'&&e.errcode===2067&&/estate_sale_reservations\.property_id/.test(e.message)))return {ok:false,error:'property_reserved'};
   throw e;
  }
 }
 return {create};
}
module.exports={createEstateReservationApi};
