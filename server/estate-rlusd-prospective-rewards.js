'use strict';
// Prospective IMG/RLUSD reward accounting only. No transfers, signatures,
// transaction submission, or change to legacy Pollux reward obligations.
const {inspectImgRlusdRewardCapacity}=require('./estate-rlusd-reward-capacity');
const HOUR=3600000;
const HASH=/^[A-Fa-f0-9]{64}$/;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const units=s=>{
 if(typeof s!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(s))throw Error('nonnegative_integer_reporting_units_required');
 return BigInt(s);
};
const validTime=t=>Number.isSafeInteger(t)&&t>0;
function planProspectiveRlusdStart({ledgerIndex,ledgerHash,ledgerCloseTimeMs,poolAccount,
  historicalPrincipalUnits,openingLiquidationUnits,ledgerValidated=false,
  fundingSourcesReconciled=false,liabilitiesReviewed=false}={}){
 if(!ledgerValidated||!fundingSourcesReconciled||!liabilitiesReviewed)
  throw Error('opening_financial_evidence_required');
 if(!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1||!HASH.test(ledgerHash||'')||
    !validTime(ledgerCloseTimeMs)||!ACCOUNT.test(poolAccount||''))
  throw Error('validated_start_ledger_required');
 const original=units(historicalPrincipalUnits),opening=units(openingLiquidationUnits);
 if(!original||!opening)throw Error('opening_capital_required');
 const firstFullHourMs=(Math.floor(ledgerCloseTimeMs/HOUR)+1)*HOUR;
 if(!Number.isSafeInteger(firstFullHourMs))throw Error('invalid_start_epoch');
 const protectedBaseline=original>opening?original:opening;
 return Object.freeze({policyVersion:1,poolAccount,ledgerIndex,
  ledgerHash:ledgerHash.toUpperCase(),ledgerCloseTimeMs,firstFullHourMs,
  historicPrincipalUnits:original.toString(),openingLiquidationUnits:opening.toString(),
  protectedBaselineUnits:protectedBaseline.toString(),distributionsEnabled:false});
}
// Even if a later sale produces proceeds, pre-start appreciation and principal
// are not rewards. No positive result unless independent, current, deduplicated
// realized-profit evidence is provided by the caller.
function inspectProspectiveRlusdReward({start,receiptLedgerIndex,receiptTimeMs,
  receiptHash,poolAccount,realizedNetProfitUnits='0',realizedLossCarryUnits='0',
  verifiedLiquidSurplusUnits='0',currentLiquidationUnits='0',
  capitalAddedSinceStartUnits='0',outstandingLiabilitiesUnits='0',
  operatingReserveUnits='0',receiptValidated=false,realizationVerified=false,
  evidenceDeduplicated=false,valuationFresh=false,ownershipReconciled=false}={}){
 if(!start||start.policyVersion!==1||!Number.isSafeInteger(start.ledgerIndex)||
  !validTime(start.firstFullHourMs)||!ACCOUNT.test(start.poolAccount||''))
  throw Error('locked_start_required');
 const applicable=receiptValidated&&realizationVerified&&evidenceDeduplicated&&
  Number.isSafeInteger(receiptLedgerIndex)&&receiptLedgerIndex>start.ledgerIndex&&
  validTime(receiptTimeMs)&&receiptTimeMs>=start.firstFullHourMs&&
  HASH.test(receiptHash||'')&&poolAccount===start.poolAccount;
 const protectedCapital=units(start.protectedBaselineUnits)+units(capitalAddedSinceStartUnits);
 const result=inspectImgRlusdRewardCapacity({
  realizedNetProfit:realizedNetProfitUnits,
  realizedLossCarry:realizedLossCarryUnits,
  independentlyVerifiedLiquidSurplus:verifiedLiquidSurplusUnits,
  principalBaseline:protectedCapital.toString(),
  currentLiquidationValue:currentLiquidationUnits,
  outstandingLiabilities:outstandingLiabilitiesUnits,
  operatingReserve:operatingReserveUnits,
  verified:applicable,valuationFresh,ownershipReconciled
 });
 return Object.freeze({...result,prospectiveOnly:true,
  firstEligibleHourMs:start.firstFullHourMs,
  receiptEligible:!!applicable,immutableHistoricRewardsUnaffected:true});
}
module.exports={planProspectiveRlusdStart,inspectProspectiveRlusdReward};
