'use strict';
// Evidence-only review of retired Estates customer capital. The durable
// record is an immutable PROPOSAL, never a booked migration or authorization.
const crypto=require('node:crypto');
const {splitEstateCapital}=require('./estate-capital-allocation');
const TX=/^[A-Fa-f0-9]{64}$/;
const units=s=>{
 if(typeof s!=='string'||!/^(0|[1-9][0-9]*)$/.test(s))throw Error('invalid_historical_drops');
 return BigInt(s);
};
function inspectLegacyEstateCapital(db,purchaseTx){
 if(!TX.test(purchaseTx||''))throw Error('purchase_tx_hash_required');
 const hash=purchaseTx.toUpperCase();
 const sale=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?').get(hash);
 const owner=db.prepare('SELECT * FROM estate_property_ownership WHERE purchase_tx=?').get(hash);
 if(!sale||!owner||sale.policy_version!==1||
    owner.property_id!==sale.property_id||owner.acct!==sale.buyer||
    BigInt(owner.purchase_amount_drops)!==units(sale.purchase_drops))
  throw Error('verified_legacy_purchase_record_required');
 const oldBudget=units(sale.img_plx_drops)+units(sale.img_xrp_drops);
 if(oldBudget!==units(sale.purchase_drops)||units(sale.img_rlusd_drops||'0')!==0n)
  throw Error('legacy_policy_budget_disagrees_with_purchase');
 const jobs=db.prepare('SELECT * FROM estate_liquidity_jobs WHERE purchase_tx=? ORDER BY pair,id').all(hash);
 if(jobs.length!==2||jobs[0].pair!=='img-plx'||jobs[1].pair!=='img-xrp')
  throw Error('complete_legacy_job_inventory_required');
 const positions=jobs.map(row=>{
  const d=JSON.parse(row.data_json);
  if(row.state!=='invested'||row.initial_budget_drops!==
    (row.pair==='img-plx'?sale.img_plx_drops:sale.img_xrp_drops))
   throw Error('historical_position_state_or_budget_mismatch');
  const basis=units(d.basis),cash=units(d.cash);
  if(!/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(d.lp||'')||
     !basis||cash>units(row.initial_budget_drops))throw Error('invalid_position_evidence');
  return Object.freeze({id:row.id,pair:row.pair,state:row.state,
   budgetDrops:row.initial_budget_drops,recordedBasisDrops:d.basis,
   recordedCashDrops:d.cash,recordedLpUnits:d.lp,
   poolAccount:d.lpAccount||null,lpCurrency:d.lpCurrency||null,
   rawPositionDigest:crypto.createHash('sha256').update(row.data_json).digest('hex')});
 });
 const future=splitEstateCapital(sale.purchase_drops,2);
 return Object.freeze({purchaseTx:hash,propertyId:sale.property_id,
  ownerWallet:sale.buyer,sourcePolicyVersion:1,targetPolicyVersion:2,
  purchaseDrops:sale.purchase_drops,oldPlxBudgetDrops:sale.img_plx_drops,
  oldImgXrpBudgetDrops:sale.img_xrp_drops,
  proposedImgRlusdDrops:future.imgRlusdDrops,
  proposedXrpReserveDrops:future.operatingReserveDrops,
  positions,actualReplacementAssetsVerified:false,
  assetsTransferred:false,customerLiabilitiesDischarged:false,
  salePolicyUpdated:false,treasuryPauseClearanceAuthorized:false});
}
function createLegacyEstateReviewJournal(db){
 if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function')throw Error('sqlite_db_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_legacy_v2_review_proposals(
  purchase_tx TEXT PRIMARY KEY,
  proposal_sha256 TEXT NOT NULL UNIQUE,
  purchase_drops TEXT NOT NULL,
  proposed_img_rlusd_drops TEXT NOT NULL,
  proposed_xrp_reserve_drops TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  reviewer_note TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state='unverified_proposal')
 );
 CREATE TRIGGER IF NOT EXISTS estate_legacy_v2_review_no_update
 BEFORE UPDATE ON estate_legacy_v2_review_proposals
 BEGIN SELECT RAISE(ABORT,'immutable_legacy_review'); END;
 CREATE TRIGGER IF NOT EXISTS estate_legacy_v2_review_no_delete
 BEFORE DELETE ON estate_legacy_v2_review_proposals
 BEGIN SELECT RAISE(ABORT,'immutable_legacy_review'); END;`);
 const select=db.prepare('SELECT * FROM estate_legacy_v2_review_proposals WHERE purchase_tx=?');
 const insert=db.prepare(`INSERT INTO estate_legacy_v2_review_proposals(
  purchase_tx,proposal_sha256,purchase_drops,proposed_img_rlusd_drops,
  proposed_xrp_reserve_drops,snapshot_json,reviewer_note,created_at_ms,state)
 VALUES(?,?,?,?,?,?,?,?,'unverified_proposal')`);
 function preview(purchaseTx){return inspectLegacyEstateCapital(db,purchaseTx);}
 function stageUnverifiedReview({purchaseTx,reviewerNote,nowMs=Date.now()}={}){
  if(typeof reviewerNote!=='string'||reviewerNote.length<12||reviewerNote.length>500||
     !Number.isSafeInteger(nowMs)||nowMs<1)throw Error('operator_review_note_required');
  db.exec('BEGIN IMMEDIATE');
  try{
   const p=preview(purchaseTx);
   if(select.get(p.purchaseTx))throw Error('duplicate_legacy_review');
   const snapshot=JSON.stringify(p);
   const digest=crypto.createHash('sha256').update(snapshot).digest('hex');
   insert.run(p.purchaseTx,digest,p.purchaseDrops,p.proposedImgRlusdDrops,
    p.proposedXrpReserveDrops,snapshot,reviewerNote,nowMs);
   db.exec('COMMIT');
   return Object.freeze({purchaseTx:p.purchaseTx,proposalDigest:digest,
    state:'unverified_proposal',noFundsMoved:true,
    oldCapitalAccountingUnaffected:true,financialActivationAuthorized:false});
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function read(purchaseTx){
  if(!TX.test(purchaseTx||''))throw Error('purchase_tx_hash_required');
  return select.get(purchaseTx.toUpperCase())||null;
 }
 return Object.freeze({preview,stageUnverifiedReview,read});
}
module.exports={inspectLegacyEstateCapital,createLegacyEstateReviewJournal};
