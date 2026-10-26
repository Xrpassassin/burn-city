'use strict';
// Safe, read-only HTTP handler for future integration into the authenticated Estates router.
// Caller MUST authenticate first and pass the server-derived wallet; never accept client wallet.
const {quoteEstate,validateTierCapacity}=require('./estate-purchase-contract');
function handleEstateQuote({wallet,propertyId,ownedPropertyIds=[],reservedPropertyIds=[]}){
 if(typeof wallet!=='string'||!wallet) return {status:401,body:{error:'sign_in_with_xaman'}};
 const quote=quoteEstate(propertyId);
 if(!quote)return {status:404,body:{error:'unknown_property'}};
 const capacity=validateTierCapacity({wallet,tierId:quote.tier,ownedPropertyIds,reservedPropertyIds});
 return {status:200,body:{...quote,capacity,canPurchase:false,reason:'sales_not_configured'}};
}
module.exports={handleEstateQuote};
