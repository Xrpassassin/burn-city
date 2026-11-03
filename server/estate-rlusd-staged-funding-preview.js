'use strict';
// Pure preflight arithmetic, NEVER a funding instruction. Read-only.
// All values are integer XRP drops; unspent purchase principal remains reserved.
const UINT=/^(0|[1-9][0-9]*)$/;
const parse=(x,label)=>{
 if(typeof x!=='string'||!UINT.test(x))throw Error(label+'_required');
 return BigInt(x);
};
const ceil=(x,y)=>(x+y-1n)/y;
function previewEstateStagedFunding({earmarkedCapitalDrops,indicativeMaxPurchaseDrops}={}){
 const capital=parse(earmarkedCapitalDrops,'earmarked_capital_drops');
 const grossCap=parse(indicativeMaxPurchaseDrops,'indicative_pool_capacity_drops');
 // Preflight's max is quoted as GROSS XRP purchase capacity (including the
 // 1% operating reserve), not as a net AMM allocation. Round the reserve up.
 const netCap=grossCap>0n?grossCap-ceil(grossCap*100n,10000n):0n;
 const initial=capital<netCap?capital:netCap;
 const remaining=capital-initial;
 return Object.freeze({
  readOnly:true,
  earmarkedCapitalDrops:capital.toString(),
  indicativeNetStageCeilingDrops:netCap.toString(),
  illustrativeFirstStageDrops:initial.toString(),
  unallocatedPrincipalAfterFirstStageDrops:remaining.toString(),
  illustrativeStageCountAtUnchangedDepth:netCap>0n?ceil(capital,netCap).toString():null,
  eachStageRequiresFreshValidatedDepthAndExecutableQuotes:true,
  simultaneousTransactionsAndPoolPriceDeviationUnverified:true,
  proportionalDepositsDoNotFixPreexistingPriceDeviation:true,
  unallocatedCapitalRemainsReservedPrincipal:true,
  stageOneTransactionAuthorized:false,
  subsequentStageTransactionsAuthorized:false,
  propertyPurchaseAuthorized:false
 });
}
module.exports={previewEstateStagedFunding};
