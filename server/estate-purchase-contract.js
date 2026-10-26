'use strict';
// Read-only quotes for Grok's future payment integration. Never creates an intent or a sale.
const {CATALOG}=require('./estate-economy');
const tiers=new Map(CATALOG.tiers.map(t=>[t.id,t]));
const properties=new Map(CATALOG.properties.map(p=>[p.id,p]));
const MAX_PER_TIER=5;
function quoteEstate(propertyId){
 if(typeof propertyId!=='string')throw new TypeError('invalid_property_id');
 const property=properties.get(propertyId);
 if(!property)return null;
 const tier=tiers.get(property.tier);
 if(!tier||!Number.isSafeInteger(tier.price)||tier.price<=0||!Number.isSafeInteger(tier.shareUnits)||tier.shareUnits<=0)throw new Error('invalid_estate_catalog');
 return Object.freeze({
  propertyId:property.id,tier:tier.id,priceXrp:tier.price,priceDrops:tier.price*1000000,
  currency:'XRP',allocationUnits:tier.shareUnits,maxPerTierPerWallet:MAX_PER_TIER,
  quoteType:'informational_only',paymentEnabled:false,distributionsEnabled:false
 });
}
function validateTierCapacity({wallet,tierId,ownedPropertyIds=[],reservedPropertyIds=[]}){
 if(typeof wallet!=='string'||!wallet||!tiers.has(tierId))throw new TypeError('invalid_wallet_or_tier');
 if(!Array.isArray(ownedPropertyIds)||!Array.isArray(reservedPropertyIds))throw new TypeError('invalid_holdings');
 const ids=[...ownedPropertyIds,...reservedPropertyIds];
 if(new Set(ids).size!==ids.length)throw new TypeError('duplicate_property_id');
 for(const id of ids)if(!properties.has(id))throw new TypeError('unknown_property_id');
 const used=ids.filter(id=>properties.get(id).tier===tierId).length;
 return Object.freeze({wallet,tierId,used,remaining:Math.max(0,MAX_PER_TIER-used),eligible:used<MAX_PER_TIER});
}
module.exports={quoteEstate,validateTierCapacity,MAX_PER_TIER};
