// UI-only view models; no wallet signing or purchases.
export const ESTATES_MENU = Object.freeze({
  id:'estates',title:'Estates',entryPoints:Object.freeze(['main-menu','pause-menu']),
  tabs:Object.freeze(['marketplace','my-properties','rewards']),
  features:Object.freeze({purchasesEnabled:false,payoutsEnabled:false})
});
export function normalizeEstateListing(listing) {
  if (!listing || typeof listing.propertyId !== 'string' || !listing.propertyId) throw new TypeError('propertyId required');
  const status = ['available','reserved','sold'].includes(listing.status) ? listing.status : 'unavailable';
  const priceDrops = typeof listing.priceDrops === 'string' && /^(0|[1-9][0-9]*)$/.test(listing.priceDrops) ? listing.priceDrops : null;
  return Object.freeze({propertyId:listing.propertyId,title:String(listing.title||'Estate'),tier:String(listing.tier||'unclassified'),status,priceDrops,shareWeight:Number.isSafeInteger(listing.shareWeight)&&listing.shareWeight>0?listing.shareWeight:null});
}
