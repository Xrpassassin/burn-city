'use strict';
// Pure, fail-closed IMG/RLUSD reward capacity calculation. No signing or payouts.
// Amounts are integer micro-units of the SAME reporting currency (e.g. RLUSD).
const units=x=>{
 if(typeof x!=='string'||!/^(0|[1-9][0-9]*)$/.test(x))throw Error('nonnegative_integer_units_required');
 return BigInt(x);
};
function inspectImgRlusdRewardCapacity({realizedNetProfit,realizedLossCarry='0',
  independentlyVerifiedLiquidSurplus='0',principalBaseline,currentLiquidationValue,
  outstandingLiabilities='0',operatingReserve='0',verified=false,
  valuationFresh=false,ownershipReconciled=false}={}){
 const profit=units(realizedNetProfit),loss=units(realizedLossCarry);
 const surplus=units(independentlyVerifiedLiquidSurplus);
 const principal=units(principalBaseline),value=units(currentLiquidationValue);
 const liabilities=units(outstandingLiabilities),reserve=units(operatingReserve);
 const required=principal+liabilities+reserve;
 const above=value>required?value-required:0n;
 const lossAdjusted=profit>loss?profit-loss:0n;
 const distributable=verified&&valuationFresh&&ownershipReconciled
  ?[lossAdjusted,surplus,above].reduce((a,b)=>a<b?a:b):0n;
 return Object.freeze({distributableUnits:distributable.toString(),
  capitalShortfallUnits:value<required?(required-value).toString():'0',
  allPoolPrincipalProtected:true,canDistribute:distributable>0n,
  approval:'calculation_only_never_authorizes_signing'});
}
module.exports={inspectImgRlusdRewardCapacity};
