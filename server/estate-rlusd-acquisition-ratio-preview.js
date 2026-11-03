'use strict';
// PURE / READ-ONLY: Reference-price allocation for *acquiring* the two assets
// needed for an IMG/RLUSD tfTwoAsset deposit. This is NOT an executable quote,
// a treasury instruction, a liquidity position, or authorization to purchase.
// Input capital is the existing 99% IMG/RLUSD earmark, AFTER XRP reserve.
const SCALE=10n**18n;
const INTEGER=/^(0|[1-9][0-9]{0,23})$/;
const DECIMAL=/^(0|[1-9][0-9]{0,29})(?:\.([0-9]{1,18}))?$/;
function integer(s,name){
 if(typeof s!=='string'||!INTEGER.test(s))throw Error(name+'_integer_drops_required');
 return BigInt(s);
}
function fixed(s,name){
 if(typeof s!=='string')throw Error(name+'_positive_decimal_required');
 const m=DECIMAL.exec(s);
 if(!m)throw Error(name+'_positive_decimal_required');
 const n=BigInt(m[1])*SCALE+BigInt((m[2]||'').padEnd(18,'0'));
 if(n<=0n)throw Error(name+'_positive_decimal_required');
 return n;
}
function planEstateRlusdAcquisitionSplit({
 earmarkedCapitalDrops,poolImg,poolRlusd,
 referenceXrpPerImg,referenceXrpPerRlusd
}={}){
 const total=integer(earmarkedCapitalDrops,'earmarked_capital');
 const img=fixed(poolImg,'pool_img');
 const rlusd=fixed(poolRlusd,'pool_rlusd');
 const imgPrice=fixed(referenceXrpPerImg,'reference_xrp_per_img');
 const rlusdPrice=fixed(referenceXrpPerRlusd,'reference_xrp_per_rlusd');
 // One unit of the pool's current ratio costs these amounts of XRP on the
 // reference external market. Each price is XRP per *one* issued token.
 // The 1e18 scales cancel, leaving exact integer arithmetic throughout.
 const imgSideValue=img*imgPrice;
 const rlusdSideValue=rlusd*rlusdPrice;
 const imgBudget=total*imgSideValue/(imgSideValue+rlusdSideValue);
 const rlusdBudget=total-imgBudget;
 const sideDifference=imgSideValue>=rlusdSideValue?
   imgSideValue-rlusdSideValue:rlusdSideValue-imgSideValue;
 return Object.freeze({
  readOnly:true,pair:'IMG/RLUSD',
  budgetIsPurchasePrincipalNotRewards:true,
  earmarkedCapitalDrops:total.toString(),
  indicativeImgAcquisitionBudgetDrops:imgBudget.toString(),
  indicativeRlusdAcquisitionBudgetDrops:rlusdBudget.toString(),
  budgetConserved:imgBudget+rlusdBudget===total,
  bothAcquisitionBudgetsNonzero:imgBudget>0n&&rlusdBudget>0n,
  indicativeImgSpendingBps:total>0n?(imgBudget*10000n/total).toString():null,
  referencePoolValueSidesExactlyEqual:sideDifference===0n,
  referencePriceMismatchBps:((sideDifference*20000n)/(imgSideValue+rlusdSideValue)).toString(),
  splitTargetsCurrentPoolQuantityRatioNotEqualTokenCounts:true,
  equalValueAtPoolSpotNotNecessarilyExternalReferenceMarket:true,
  existingInventoryNotVerified:true,
  acquisitionExecutionPricesSlippageAndFeesNotVerified:true,
  independentExecutableQuotesAndDepthChecksRequired:true,
  checkLivePoolRatioAgainBeforeAnyDeposit:true,
  ownerCapitalNeverRecognizedAsRealizedProfit:true,
  actualTokensBoughtAndLpMintedRequireValidatedLedgerProof:true,
  purchaseAuthorized:false,
  tradingAuthorized:false,
  ammDepositAuthorized:false,
  rewardsAuthorized:false
 });
}
module.exports={planEstateRlusdAcquisitionSplit};
