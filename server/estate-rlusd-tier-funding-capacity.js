'use strict';
// Pure, read-only launch capacity classification. A pool's indicative single
// purchase capacity is NOT a commitment to fill, approved sale, or APY.
// Future customer deposits are property purchase principal, never AMM yield.
const {splitEstateCapital,POLICY}=require('./estate-capital-allocation');
const {previewEstateStagedFunding}=require('./estate-rlusd-staged-funding-preview');
function inspectEstateTierFundingCapacity({tiers,indicativeMaxPurchaseDrops}={}){
 if(!Array.isArray(tiers)||tiers.length===0||![2,3].includes(POLICY.version)||
    POLICY.imgRlusdBps+POLICY.operatingReserveBps!==10000||POLICY.imgPlxBps!==0)
  throw Error('known_current_capital_policy_required');
 if(typeof indicativeMaxPurchaseDrops!=='string'||
    !/^(0|[1-9][0-9]*)$/.test(indicativeMaxPurchaseDrops))
  throw Error('indicative_pool_capacity_required');
 const max=BigInt(indicativeMaxPurchaseDrops),seen=new Set();
 const rows=tiers.map(t=>{
  if(!t||typeof t.id!=='string'||!/^[a-z][a-z0-9_-]{1,40}$/.test(t.id)||
     seen.has(t.id)||!Number.isSafeInteger(t.price)||t.price<1||
     t.price>Number.MAX_SAFE_INTEGER/1000000)
   throw Error('invalid_property_sale_tier');
  seen.add(t.id);
  const price=BigInt(t.price)*1000000n,capital=splitEstateCapital(price.toString());
  const stagedFundingPreview=previewEstateStagedFunding({
   earmarkedCapitalDrops:capital.imgRlusdDrops,
   indicativeMaxPurchaseDrops});
  return Object.freeze({tier:t.id,priceXrp:t.price,
   purchaseDrops:price.toString(),
   plannedImgRlusdCapitalDrops:capital.imgRlusdDrops,
   plannedOperatingReserveDrops:capital.operatingReserveDrops,
   indicativeSinglePurchaseWithinMaxImpact:price<=max,
   indicativeSingleStepAssetAcquisitionWithinMaxImpact:price<=max,
   proportionalTwoAssetAmmDepositSizeCappedByTradeImpact:false,
   acquisitionOfImgAndRlusdStillRequiresIndependentQuotes:true,
   immediateFullSinglePurchaseFundingVerified:false,
   stagedFundingPreview,
   newPurchasePrincipalIsNotIncome:true});
 });
 return Object.freeze({
  readOnly:true,poolCapacityIsIndicative:true,
  capacityPurchaseDrops:max.toString(),
  capitalAllocationPolicy:POLICY.pair,
  tiers:rows,
  tiersExceedingIndicativeSinglePurchaseCapacity:
   rows.filter(x=>!x.indicativeSinglePurchaseWithinMaxImpact).map(x=>x.tier),
  simultaneousPurchaseAndSlippageProtectionNotVerified:true,
  stagingOrDeeperLiquidityReviewNeeded:rows.some(x=>!x.indicativeSinglePurchaseWithinMaxImpact),
  stagedFundingAvailableOnlyAsReadOnlyPreview:true,
  acquiredBothSidesCanBeDepositedProportionatelyWithoutSwapImpact:true,
  quotedSingleTradeCapacityIsNotAnAmmDepositSizeLimit:true,
  automaticFundingAuthorized:false,propertySalesAuthorized:false
 });
}
module.exports={inspectEstateTierFundingCapacity};
