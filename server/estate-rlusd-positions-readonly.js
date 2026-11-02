'use strict';
// Read-only aggregation of independently verified, treasury-owned IMG/RLUSD LP
// positions. Deliberately excludes all other pools and never infers profits
// from LP token balances. No database writes, signatures or payment execution.
const {inspectImgRlusdRewardCapacity}=require('./estate-rlusd-reward-capacity');
function nonnegative(value){
 if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))throw Error('invalid_integer_reporting_units');
 return BigInt(value);
}
function inspectVerifiedImgRlusdPositions({
 positions=[],expectedPositionCount,realizedNetProfit='0',realizedLossCarry='0',
 independentlyVerifiedLiquidSurplus='0',outstandingLiabilities='0',operatingReserve='0',
 evidenceValidated=false,valuationFresh=false
}={}){
 if(!Array.isArray(positions)||!Number.isSafeInteger(expectedPositionCount)||expectedPositionCount<0)
  throw Error('complete_position_inventory_required');
 const ids=new Set();
 let principal=0n,liquidation=0n;
 for(const p of positions){
  if(!p||p.pair!=='img-rlusd'||typeof p.id!=='string'||!p.id||ids.has(p.id))
   throw Error('invalid_or_duplicate_img_rlusd_position');
  ids.add(p.id);
  principal+=nonnegative(p.principalBaseline);
  liquidation+=nonnegative(p.currentLiquidationValue);
 }
 // Missing historical or manual LP ownership is a blocker, not assumed zero.
 const complete=expectedPositionCount===positions.length&&positions.length>0&&
  positions.every(p=>p.treasuryOwned===true&&p.basisVerified===true&&p.valuationVerified===true);
 const capacity=inspectImgRlusdRewardCapacity({
  realizedNetProfit,realizedLossCarry,independentlyVerifiedLiquidSurplus,
  principalBaseline:principal.toString(),currentLiquidationValue:liquidation.toString(),
  outstandingLiabilities,operatingReserve,verified:evidenceValidated,
  valuationFresh,ownershipReconciled:complete
 });
 return Object.freeze({...capacity,positionCount:positions.length,
  completeTreasuryOwnership:complete,principalBaselineUnits:principal.toString(),
  liquidationValueUnits:liquidation.toString(),readOnly:true});
}
module.exports={inspectVerifiedImgRlusdPositions};
