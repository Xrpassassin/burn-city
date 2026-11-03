'use strict';
const assert=require('node:assert/strict');
const {previewRlusdRealization:preview,microFromIssued}=require('./estate-rlusd-profit-basis-preview');
const pool='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const proof={txHash:'D'.repeat(64),ledgerIndex:100,poolAccount:pool,
 state:'basis_review_required',networkFeeDrops:'12',lpBurned:'125',
 imgCredited:'120',rlusdCredited:'60'};
const lots=[
 {sourceTxHash:'A'.repeat(64),sourceLedgerIndex:10,poolAccount:pool,
  remainingLpUnits:'100',remainingCostMicroRlusd:'100000000'},
 {sourceTxHash:'B'.repeat(64),sourceLedgerIndex:30,poolAccount:pool,
  remainingLpUnits:'50',remainingCostMicroRlusd:'60000000'},
 {sourceTxHash:'C'.repeat(64),sourceLedgerIndex:90,poolAccount:pool,
  remainingLpUnits:'100',remainingCostMicroRlusd:'100000000'}
];
const basic={withdrawalProof:proof,capitalLots:lots,
 imgSaleNetMicroRlusd:'90000000',verifiedFeeMicroRlusd:'5000000',
 priorRealizedLossCarryMicroRlusd:'10000000'};
const r=preview(basic);
assert.equal(r.realizedProceedsComplete,true);
assert.equal(r.lpCapitalBasisConsumedMicroRlusd,'130000000');
assert.equal(r.verifiedRlusdLegReceivedMicroRlusd,'60000000');
assert.equal(r.imgDisposalNetMicroRlusd,'90000000');
assert.equal(r.tentativeProfitMicroRlusd,'5000000');
assert.equal(r.tentativeNextLossCarryMicroRlusd,'0');
assert.equal(r.lotsConsumed.length,2);
assert.equal(r.lotsConsumed[0].remainingLpUnits,'0');
assert.equal(r.lotsConsumed[0].remainingCostMicroRlusd,'0');
assert.equal(r.lotsConsumed[1].lpUnitsUsed,'25');
assert.equal(r.lotsConsumed[1].remainingLpUnits,'25');
assert.equal(r.lotsConsumed[1].remainingCostMicroRlusd,'30000000');
assert.equal(r.availableForOwnerDistributionMicroRlusd,'0');
assert.equal(r.profitApproved,false);
assert.equal(r.executionEnabled,false);
const pending=preview({...basic,imgSaleNetMicroRlusd:null});
assert.equal(pending.realizedProceedsComplete,false);
assert.equal(pending.tentativeProfitMicroRlusd,'0');
assert.equal(pending.tentativeNextLossCarryMicroRlusd,'10000000');
assert.equal(pending.imgDisposalStillUnverified,true);
const unknownFees=preview({...basic,verifiedFeeMicroRlusd:null});
assert.equal(unknownFees.tentativeProfitMicroRlusd,'0');
const loss=preview({...basic,imgSaleNetMicroRlusd:'50000000'});
assert.equal(loss.tentativeProfitMicroRlusd,'0');
assert.equal(loss.tentativeNextLossCarryMicroRlusd,'35000000');
const zeroNewDeposits=preview({...basic,capitalLots:lots.slice(0,2)});
assert.equal(zeroNewDeposits.tentativeProfitMicroRlusd,'5000000');
assert.equal(microFromIssued('1.1234567').toString(),'1123456');
assert.equal(microFromIssued('0.0000009').toString(),'0');
assert.throws(()=>preview({...basic,withdrawalProof:{...proof,lpBurned:'251'}}),/withdrawal_exceeds_verified_remaining_lp_lots/);
assert.throws(()=>preview({...basic,capitalLots:[lots[0],lots[0],lots[1]]}),/duplicate_capital_lot/);
assert.throws(()=>preview({...basic,capitalLots:[{...lots[0],sourceLedgerIndex:101},...lots.slice(1)]}),/lot_ledger_identity_missing/);
assert.throws(()=>preview({...basic,capitalLots:[{...lots[0],poolAccount:'rOther'},...lots.slice(1)]}),/lot_ledger_identity_missing/);
assert.throws(()=>preview({...basic,capitalLots:[{...lots[0],remainingCostMicroRlusd:'0'},...lots.slice(1)]}),/unfunded_lp_lot_basis/);
assert.throws(()=>preview({...basic,imgSaleNetMicroRlusd:'-1'}),/img_sale_net_invalid_integer_micro_rlusd/);
assert.throws(()=>preview({...basic,verifiedFeeMicroRlusd:'1.3'}),/transaction_costs_invalid_integer_micro_rlusd/);
assert.throws(()=>preview({...basic,priorRealizedLossCarryMicroRlusd:'-1'}),/loss_carry_invalid_integer_micro_rlusd/);
assert.throws(()=>preview({...basic,withdrawalProof:{...proof,state:'paid'}}),/validated_withdrawal_proof_and_capital_lots_required/);
assert.throws(()=>microFromIssued('-1'),/negative_issued_asset_receipt/);
// Decimal LP positions: never allocate less cost than the proportional share;
// ceiling protects principal against fixed-point truncation.
const fractional=preview({...basic,
 withdrawalProof:{...proof,lpBurned:'0.0000001',rlusdCredited:'0.000001'},
 capitalLots:[{...lots[0],remainingLpUnits:'1',remainingCostMicroRlusd:'1'}],
 imgSaleNetMicroRlusd:'0',verifiedFeeMicroRlusd:'0',
 priorRealizedLossCarryMicroRlusd:'0'});
assert.equal(fractional.lpCapitalBasisConsumedMicroRlusd,'1');
assert.equal(fractional.tentativeProfitMicroRlusd,'0');
console.log('IMG/RLUSD profit preview: multiple LP capital lots, conservation, fees, losses, conversions, future buys not revenue and nonpaying gates passed');
