'use strict';
// Read-only status for the NEW prospective IMG/RLUSD rewards program.
// Deliberately separate from the existing legacy IMG/Pollux payout worker.
// Existing forward reward drafts are NONPAYING and do not imply that a
// settlement executor, scanner or funding authorization has been installed.
const HASH=/^[A-Fa-f0-9]{64}$/;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const units=s=>{
 if(typeof s!=='string'||!/^(0|[1-9][0-9]*)$/.test(s))
  throw Error('invalid_forward_reward_reporting_units');
 return BigInt(s);
};
function inspectEstateForwardRewardReadiness(db,{owner}={}){
 if(!db||typeof db.prepare!=='function')throw Error('sqlite_database_required');
 if(owner!==undefined&&!ACCOUNT.test(owner||''))throw Error('valid_owner_required');
 const has=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const startPresent=has('estate_rlusd_forward_reward_start');
 const draftsPresent=has('estate_rlusd_forward_allocation_drafts');
 const ownersPresent=has('estate_rlusd_forward_owner_drafts');
 let startStaged=false,count=0,held=0n,ownerHeld=0n;
 if(startPresent){
  const row=db.prepare('SELECT status FROM estate_rlusd_forward_reward_start WHERE id=1').get();
  if(row&&row.status!=='staged')throw Error('unexpected_forward_start_status');
  startStaged=!!row;
 }
 if(draftsPresent){
  if(!startStaged||!ownersPresent)throw Error('incomplete_forward_reward_journal');
  for(const row of db.prepare('SELECT receipt_hash,drafted_units,state FROM estate_rlusd_forward_allocation_drafts').all()){
   if(!HASH.test(row.receipt_hash||'')||row.state!=='held')
    throw Error('unexpected_forward_draft_state');
   held+=units(row.drafted_units);count++;
  }
  let assigned=0n;
  for(const row of db.prepare('SELECT owner,amount_units,state FROM estate_rlusd_forward_owner_drafts').all()){
   if(!ACCOUNT.test(row.owner||'')||row.state!=='held')
    throw Error('unexpected_forward_owner_draft_state');
   const n=units(row.amount_units);
   assigned+=n;
   if(row.owner===owner)ownerHeld+=n;
  }
  if(held!==assigned)throw Error('forward_draft_ownership_unbalanced');
 }else if(ownersPresent){
  throw Error('incomplete_forward_reward_journal');
 }
 return Object.freeze({
  pool:'IMG/RLUSD',reportingUnit:'micro_RLUSD',
  evaluationSchedule:'hourly',
  payoutTiming:'only_after_realized_profit_and_cost_checks',
  forwardStartStaged:startStaged,
  heldRealizationDraftCount:count,
  heldRealizationDraftUnits:held.toString(),
  ...(owner?{ownerHeldDraftUnits:ownerHeld.toString()}:{ }),
  settlementEngineConnected:false,
  verifiedRealizationIngestionConnected:false,
  livePaymentsEnabled:false,
  noGuaranteedHourlyPayment:true,
  status:startStaged?'drafts_nonpaying':'forward_start_not_staged'
 });
}
module.exports={inspectEstateForwardRewardReadiness};
