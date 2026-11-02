'use strict';
// Immutable, nonpaying drafts of prospective IMG/RLUSD owner allocations.
// Reporting denomination: micro-RLUSD. NO signature, swap, entitlement
// release, historic reward mutation, or financial activation in this module.
const crypto=require('node:crypto');
const {createEstateRlusdForwardStartStore}=require('./estate-rlusd-forward-start-store');
const {inspectProspectiveRlusdReward}=require('./estate-rlusd-prospective-rewards');
const {createEstateImgOwnershipSnapshots}=require('./estate-img-ownership-snapshots');
const {propertyWeight}=require('./estate-economy');
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH=/^[A-Fa-f0-9]{64}$/;
const units=s=>{
 if(typeof s!=='string'||!/^(0|[1-9][0-9]*)$/.test(s))throw Error('nonnegative_integer_micro_rlusd_required');
 return BigInt(s);
};
function splitBudget(amount,holdings){
 if(!holdings.length)throw Error('no_settled_owners_at_profit_realization');
 const weights=new Map(),ids=new Set();
 for(const p of holdings){
  const weight=propertyWeight(p.propertyId);
  if(!ACCOUNT.test(p.acct||'')||!weight||ids.has(p.propertyId))
   throw Error('invalid_settled_owner_snapshot');
  ids.add(p.propertyId);
  weights.set(p.acct,(weights.get(p.acct)||0n)+BigInt(weight));
 }
 const total=[...weights.values()].reduce((a,b)=>a+b,0n);
 if(!total)throw Error('empty_owner_weight');
 let assigned=0n;
 const rows=[...weights].map(([owner,weight])=>{
  const n=amount*weight,base=n/total;
  assigned+=base;
  return {owner,weight:weight.toString(),amount:base,remainder:n%total};
 });
 rows.sort((a,b)=>a.remainder===b.remainder?a.owner.localeCompare(b.owner):a.remainder>b.remainder?-1:1);
 let left=amount-assigned;
 for(let i=0;left>0n;i++,left--)rows[i].amount+=1n;
 return rows.sort((a,b)=>a.owner.localeCompare(b.owner)).map(x=>({
  owner:x.owner,weight:x.weight,amountUnits:x.amount.toString()
 }));
}
function createEstateRlusdForwardAllocationStore(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw Error('sqlite_database_required');
 const startStore=createEstateRlusdForwardStartStore(db);
 const owners=createEstateImgOwnershipSnapshots(db);
 // Intentionally separate from all executable legacy payout / treasury tables.
 db.exec(`CREATE TABLE IF NOT EXISTS estate_rlusd_forward_allocation_drafts(
  receipt_hash TEXT PRIMARY KEY,
  ledger_index INTEGER NOT NULL CHECK(ledger_index>0),
  received_at_ms INTEGER NOT NULL,
  first_eligible_hour_ms INTEGER NOT NULL,
  pool_account TEXT NOT NULL,
  accounting_unit TEXT NOT NULL CHECK(accounting_unit='micro_RLUSD'),
  cumulative_profit_units TEXT NOT NULL,
  cumulative_loss_units TEXT NOT NULL,
  verified_liquid_surplus_units TEXT NOT NULL,
  already_reserved_units TEXT NOT NULL,
  drafted_units TEXT NOT NULL,
  ownership_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state='held')
 );
 CREATE TABLE IF NOT EXISTS estate_rlusd_forward_owner_drafts(
  receipt_hash TEXT NOT NULL REFERENCES estate_rlusd_forward_allocation_drafts(receipt_hash),
  owner TEXT NOT NULL,
  share_weight TEXT NOT NULL,
  amount_units TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state='held'),
  PRIMARY KEY(receipt_hash,owner)
 );`);
 const receipt=db.prepare('SELECT * FROM estate_rlusd_forward_allocation_drafts WHERE receipt_hash=?');
 const stored=db.prepare('SELECT * FROM estate_rlusd_forward_owner_drafts WHERE receipt_hash=? ORDER BY owner');
 const all=db.prepare('SELECT drafted_units FROM estate_rlusd_forward_allocation_drafts');
 const latest=db.prepare('SELECT ledger_index,received_at_ms FROM estate_rlusd_forward_allocation_drafts ORDER BY ledger_index DESC,received_at_ms DESC LIMIT 1');
 const insert=db.prepare(`INSERT INTO estate_rlusd_forward_allocation_drafts
  (receipt_hash,ledger_index,received_at_ms,first_eligible_hour_ms,pool_account,accounting_unit,
   cumulative_profit_units,cumulative_loss_units,verified_liquid_surplus_units,already_reserved_units,
   drafted_units,ownership_digest,state)
  VALUES(?,?,?,?,?,'micro_RLUSD',?,?,?,?,?,?,'held')`);
 const addOwner=db.prepare(`INSERT INTO estate_rlusd_forward_owner_drafts
  (receipt_hash,owner,share_weight,amount_units,state) VALUES(?,?,?,?,'held')`);
 function totalHeldUnits(){
  return all.all().reduce((sum,r)=>sum+units(r.drafted_units),0n).toString();
 }
 function get(hash){
  if(!HASH.test(hash||''))throw Error('receipt_hash_required');
  const row=receipt.get(hash.toUpperCase());
  return row?Object.freeze({receipt:row,allocations:stored.all(row.receipt_hash),executionEnabled:false}):null;
 }
 function stageVerifiedRealization(input={}){
  if(input.accountingUnit!=='micro_RLUSD')throw Error('reporting_unit_mismatch');
  if(!HASH.test(input.receiptHash||''))throw Error('validated_realization_hash_required');
  const hash=input.receiptHash.toUpperCase();
  db.exec('BEGIN IMMEDIATE');
  try{
   const start=startStore.current();
   if(!start||start.status!=='staged')throw Error('immutable_forward_start_required');
   if(receipt.get(hash))throw Error('duplicate_realization_receipt');
   const last=latest.get();
   if(last&&(input.receiptLedgerIndex<last.ledger_index||
      (input.receiptLedgerIndex===last.ledger_index&&input.receiptTimeMs<last.received_at_ms)))
    throw Error('nonmonotonic_realization_order');
   const previouslyReservedUnits=totalHeldUnits();
   const plan=inspectProspectiveRlusdReward({
    start,receiptLedgerIndex:input.receiptLedgerIndex,receiptTimeMs:input.receiptTimeMs,
    receiptHash:hash,poolAccount:input.poolAccount,
    realizedNetProfitUnits:input.cumulativeRealizedProfitUnits,
    realizedLossCarryUnits:input.cumulativeRealizedLossUnits,
    verifiedLiquidSurplusUnits:input.verifiedLiquidSurplusUnits,
    currentLiquidationUnits:input.currentLiquidationUnits,
    capitalAddedSinceStartUnits:input.capitalAddedSinceStartUnits,
    outstandingLiabilitiesUnits:input.otherOutstandingLiabilitiesUnits,
    operatingReserveUnits:input.operatingReserveUnits,
    previouslyReservedUnits,
    receiptValidated:input.receiptValidated===true,
    realizationVerified:input.realizationVerified===true,
    evidenceDeduplicated:input.evidenceDeduplicated===true,
    valuationFresh:input.valuationFresh===true,
    ownershipReconciled:input.ownershipReconciled===true
   });
   if(!plan.receiptEligible)throw Error('unverified_or_prestart_realization');
   const amount=units(plan.distributableUnits);
   if(!amount)throw Error('no_verified_unreserved_profit');
   const holdings=owners.at(input.receiptTimeMs);
   const allocations=splitBudget(amount,holdings);
   if(allocations.reduce((s,r)=>s+units(r.amountUnits),0n)!==amount)throw Error('owner_allocation_mismatch');
   const digest=crypto.createHash('sha256').update(JSON.stringify(holdings
    .map(p=>({propertyId:p.propertyId,acct:p.acct})).sort((a,b)=>a.propertyId.localeCompare(b.propertyId)))).digest('hex');
   // No IMG/XRP settlement intents are created here. Drafts remain held.
   insert.run(hash,input.receiptLedgerIndex,input.receiptTimeMs,start.firstFullHourMs,
    start.poolAccount,input.cumulativeRealizedProfitUnits,input.cumulativeRealizedLossUnits,
    input.verifiedLiquidSurplusUnits,previouslyReservedUnits,amount.toString(),digest);
   for(const a of allocations)addOwner.run(hash,a.owner,a.weight,a.amountUnits);
   db.exec('COMMIT');
   return get(hash);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return Object.freeze({get,totalHeldUnits,stageVerifiedRealization});
}
module.exports={createEstateRlusdForwardAllocationStore,splitBudget};
