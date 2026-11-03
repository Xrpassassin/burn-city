'use strict';
// Per-swap XRP acquisition cap, NOT a cap on proportional AMM deposits.
// All amounts are integer drops. Nothing here creates/signs a transaction.
const UINT=/^(0|[1-9][0-9]*)$/;
function parse(s,label){
 if(typeof s!=='string'||!UINT.test(s))throw Error(label+'_integer_drops_required');
 return BigInt(s);
}
function planEstateNextAcquisitionStage({
 plannedBudgetDrops,committedBudgetDrops='0',poolXrpReserveDrops,
 maxImpactBps=100,completedStages=0,maxStages=128
}={}){
 const planned=parse(plannedBudgetDrops,'planned_budget');
 const committed=parse(committedBudgetDrops,'committed_budget');
 const reserve=parse(poolXrpReserveDrops,'pool_xrp_reserve');
 if(committed>planned)throw Error('acquisition_budget_overcommitted');
 if(!Number.isSafeInteger(maxImpactBps)||maxImpactBps<1||maxImpactBps>1000)
  throw Error('invalid_acquisition_impact_limit');
 if(!Number.isSafeInteger(maxStages)||maxStages<1||maxStages>512||
    !Number.isSafeInteger(completedStages)||completedStages<0||completedStages>maxStages)
  throw Error('invalid_acquisition_stage_limit');
 const remaining=planned-committed;
 const cap=reserve*BigInt(maxImpactBps)/(10000n-BigInt(maxImpactBps));
 const stage=remaining<cap?remaining:cap;
 const done=remaining===0n;
 return Object.freeze({
  readOnly:true,
  stageNumber:completedStages,
  ready:!done&&completedStages<maxStages&&stage>0n,
  blocker:done?null:completedStages>=maxStages?'acquisition_stage_limit_review_required':
   stage===0n?'acquisition_pool_depth_below_one_drop':null,
  plannedBudgetDrops:planned.toString(),
  alreadyCommittedBudgetDrops:committed.toString(),
  remainingUncommittedBudgetDrops:remaining.toString(),
  currentMarketImpactCeilingDrops:cap.toString(),
  nextStageSendMaxDrops:!done&&completedStages<maxStages?stage.toString():'0',
  nextStageCommittedTotalDrops:!done&&completedStages<maxStages?(committed+stage).toString():committed.toString(),
  isFinalPlannedStage:stage===remaining&&stage>0n,
  nextStageRequiresNewValidatedPoolQuote:true,
  fullSizeTwoSidedDepositMayBePossibleAfterAcquisitions:true,
  unspentCashAndAcquiredTokensRemainCustomerPurchasePrincipal:true,
  activeFinancialTransactionsAuthorized:false
 });
}
module.exports={planEstateNextAcquisitionStage};
