'use strict';
const {PROPERTY_BY_ID,TIER_BY_ID}=require('./estate-economy');
// Safe authenticated preflight: quotes are informational only, never payment requests.
function estatePurchaseQuote(db,{propertyId,buyer}={}){
 if(typeof buyer!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(buyer))throw new TypeError('authenticated_buyer_required');
 const property=PROPERTY_BY_ID.get(propertyId);
 if(!property)return {ok:false,error:'unknown_property'};
 const tier=TIER_BY_ID.get(property.tier);
 if(!tier||!Number.isSafeInteger(tier.price)||tier.price<=0)return {ok:false,error:'property_not_for_sale'};
 const owned=db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
 if(owned)return {ok:false,error:'property_already_owned'};
 const active=db.prepare("SELECT expires_at FROM estate_sale_reservations WHERE property_id=? AND status='reserved' AND expires_at>?").get(propertyId,Date.now());
 if(active)return {ok:false,error:'property_reserved',expiresAt:active.expires_at};
 return {ok:true,propertyId,priceDrops:tier.price*1000000,currency:'XRP',shareUnits:tier.shareUnits,salesEnabled:false,requiresXamanApproval:true};
}
module.exports={estatePurchaseQuote};
