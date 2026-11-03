'use strict';
// Conservative, PURE realized-profit PREVIEW for the future IMG/RLUSD pool.
// New Estate purchases and AMM deposits are protected CAPITAL, never income.
// This accepts already-prepared accounting evidence, not client/user flags,
// and NEVER authorizes payments. Liquidity and legal release are separate.
const {N,value}=require('./estate-liquidity-ledger');
const HASH=/^[A-Fa-f0-9]{64}$/;
const u=(x,field)=>{
 if(typeof x!=='string'||!/^(0|[1-9][0-9]*)$/.test(x))throw Error(field+'_invalid_integer_micro_rlusd');
 return BigInt(x);
};
const lp=x=>{
 const n=value(x);
 if(!n.gt(0))throw Error('positive_lp_amount_required');
 return n;
};
const microFromIssued=valueString=>{
 const n=value(valueString);
 if(n.lt(0))throw Error('negative_issued_asset_receipt');
 return BigInt(n.times('1000000').integerValue(N.ROUND_DOWN).toFixed(0));
};
const ceilRatio=(whole,partial,total)=>{
 if(partial.eq(total))return whole;
 return BigInt(new N(whole.toString()).times(partial).div(total).integerValue(N.ROUND_UP).toFixed(0));
};
// Always returns a *preview*. "Verified" by a caller is insufficient to
// grant authorization; a signer can NEVER consume this result directly.
function previewRlusdRealization({withdrawalProof,capitalLots,
 imgSaleNetMicroRlusd=null,verifiedFeeMicroRlusd=null,
 priorRealizedLossCarryMicroRlusd='0'}={}){
 if(!withdrawalProof||withdrawalProof.state!=='basis_review_required'||
    !HASH.test(withdrawalProof.txHash||'')||
    !/^[0-9]+$/.test(withdrawalProof.networkFeeDrops||'')||
    typeof withdrawalProof.rlusdCredited!=='string'||
    typeof withdrawalProof.imgCredited!=='string'||
    !value(withdrawalProof.rlusdCredited).gt(0)||
    !value(withdrawalProof.imgCredited).gt(0)||
    !Array.isArray(capitalLots))
  throw Error('validated_withdrawal_proof_and_capital_lots_required');
 let toConsume=lp(withdrawalProof.lpBurned);
 const lots=capitalLots.map(x=>{
  if(!x||!HASH.test(x.sourceTxHash||'')||
     !Number.isSafeInteger(x.sourceLedgerIndex)||x.sourceLedgerIndex<1||
     x.sourceLedgerIndex>withdrawalProof.ledgerIndex||
     x.poolAccount!==withdrawalProof.poolAccount)
   throw Error('lot_ledger_identity_missing');
  const amount=lp(x.remainingLpUnits);
  const cost=u(x.remainingCostMicroRlusd,'lot_basis');
  if(cost===0n)throw Error('unfunded_lp_lot_basis');
  return {hash:x.sourceTxHash.toUpperCase(),ledger:x.sourceLedgerIndex,
   available:amount,basis:cost,pool:x.poolAccount};
 }).sort((a,b)=>a.ledger-b.ledger||a.hash.localeCompare(b.hash));
 const seen=new Set(),consumed=[];
 let basisConsumed=0n;
 for(const lot of lots){
  if(seen.has(lot.hash))throw Error('duplicate_capital_lot');
  seen.add(lot.hash);
  if(toConsume.lte(0))break;
  const used=N.minimum(lot.available,toConsume);
  const basis=ceilRatio(lot.basis,used,lot.available);
  basisConsumed+=basis;
  consumed.push(Object.freeze({sourceTxHash:lot.hash,
   lpUnitsUsed:used.toFixed(),costBasisMicroRlusd:basis.toString(),
   remainingLpUnits:lot.available.minus(used).toFixed(),
   remainingCostMicroRlusd:(lot.basis-basis).toString()}));
  toConsume=toConsume.minus(used);
 }
 if(toConsume.gt(0))throw Error('withdrawal_exceeds_verified_remaining_lp_lots');
 const previousLoss=u(priorRealizedLossCarryMicroRlusd,'loss_carry');
 const rlusdReceived=microFromIssued(withdrawalProof.rlusdCredited);
 const complete=imgSaleNetMicroRlusd!==null&&verifiedFeeMicroRlusd!==null;
 const imgNet=complete?u(imgSaleNetMicroRlusd,'img_sale_net'):0n;
 const costs=complete?u(verifiedFeeMicroRlusd,'transaction_costs'):0n;
 // An unsold IMG leg can still contain principal; none of the withdrawal is
 // booked as realized net profit until both proceeds and costs are evidenced.
 const proceeds=complete?rlusdReceived+imgNet:0n;
 const required=basisConsumed+previousLoss+costs;
 const profit=complete&&proceeds>required?proceeds-required:0n;
 const nextLoss=complete&&required>proceeds?required-proceeds:previousLoss;
 return Object.freeze({
  withdrawalHash:withdrawalProof.txHash.toUpperCase(),
  sourcePool:withdrawalProof.poolAccount,
  accountingUnit:'micro_RLUSD',
  realizedProceedsComplete:complete,
  imgDisposalStillUnverified:!complete,
  lpCapitalBasisConsumedMicroRlusd:basisConsumed.toString(),
  verifiedRlusdLegReceivedMicroRlusd:rlusdReceived.toString(),
  imgDisposalNetMicroRlusd:complete?imgNet.toString():null,
  costsMicroRlusd:complete?costs.toString():null,
  previousLossCarryMicroRlusd:previousLoss.toString(),
  tentativeProfitMicroRlusd:profit.toString(),
  tentativeNextLossCarryMicroRlusd:nextLoss.toString(),
  lotsConsumed:consumed,
  futureEstatePurchaseDepositsAreNotRevenue:true,
  capitalBasisIsOperatorReviewedNotIndependentlyReconciled:true,
  sourceProofNotConnectedToVerifiedLotAndDisposalStore:true,
  availableForOwnerDistributionMicroRlusd:'0',
  profitApproved:false,canSettle:false,executionEnabled:false
 });
}
module.exports={previewRlusdRealization,microFromIssued};
