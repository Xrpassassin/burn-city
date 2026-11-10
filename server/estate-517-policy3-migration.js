'use strict';
// #517 reconciliation: re-book the single historical sale (trailer-01) from the retired
// IMG/PLX policy v1 to policy v3 (no PLX) as IMG/RLUSD principal awaiting a two-sided deposit.
// Idempotent. Mutates ONLY local bookkeeping rows; never signs, submits or moves funds.
// The prior rows are archived verbatim in estate_mp_migrations for audit.
const P=require('./estate-monthly-plan');
const {createEstateCapitalAllocation}=require('./estate-capital-allocation');
const SALE=Object.freeze({propertyId:'trailer-01',buyer:'rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',drops:'3000000',
 purchaseTx:'9AE6CD4985F0AEA8D2107BDEC726EF5153BB8E7216903DA961983FBE2EE7288B'});
const ID='517-policy3-rebook-trailer-01';
function rebook517(db,{env=process.env,apply=false,sale=SALE,now=Date.now()}={}){
 createEstateCapitalAllocation(db); // ensures the v3 CHECK upgrade has run
 const L=P.createEstateMonthlyLedger(db);
 const done=db.prepare('SELECT data_json FROM estate_mp_migrations WHERE id=?').get(ID);
 if(done)return {ok:true,alreadyApplied:true,...JSON.parse(done.data_json).after};
 const own=db.prepare('SELECT property_id,acct,purchase_tx,purchase_amount_drops FROM estate_property_ownership WHERE purchase_tx=?').get(sale.purchaseTx);
 if(!own||own.property_id!==sale.propertyId||own.acct!==sale.buyer||String(own.purchase_amount_drops)!==sale.drops)throw Error('ownership_does_not_match_517_sale');
 const cap=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?').get(sale.purchaseTx);
 if(!cap||cap.property_id!==sale.propertyId||cap.buyer!==sale.buyer||cap.purchase_drops!==sale.drops)throw Error('allocation_does_not_match_517_sale');
 if(cap.policy_version===3)throw Error('allocation_already_policy3_without_audit');
 const hasJobs=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_liquidity_jobs'").get();
 const jobs=hasJobs?db.prepare('SELECT * FROM estate_liquidity_jobs WHERE purchase_tx=?').all(sale.purchaseTx):[];
 const split=P.splitPurchase(sale.drops,P.monthlyConfig(env));
 const after={propertyId:sale.propertyId,purchaseTx:sale.purchaseTx,policyVersion:3,pair:'IMG/RLUSD',imgPlxDrops:'0',imgXrpDrops:'0',
  imgRlusdDrops:split.imgRlusdDrops,operatingReserveDrops:split.operatingReserveDrops,depositState:'queued',supersededJobs:jobs.map(j=>j.id)};
 if(!apply)return {ok:true,dryRun:true,before:{allocation:cap,jobs:jobs.map(({id,pair,state})=>({id,pair,state}))},after};
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare("UPDATE estate_capital_allocations SET policy_version=3,img_plx_drops='0',img_xrp_drops='0',img_rlusd_drops=?,operating_reserve_drops=? WHERE purchase_tx=?")
   .run(split.imgRlusdDrops,split.operatingReserveDrops,sale.purchaseTx);
  for(const j of jobs)db.prepare("UPDATE estate_liquidity_jobs SET state='superseded_policy3',note='rebooked_517_policy3' WHERE id=?").run(j.id);
  L.enqueuePurchase({purchaseTx:sale.purchaseTx,investDrops:split.imgRlusdDrops});
  db.prepare('INSERT INTO estate_mp_migrations(id,data_json,at) VALUES(?,?,?)').run(ID,JSON.stringify({issue:517,decision:'operator_2026-11-09_no_plx_policy3',before:{allocation:cap,jobs},after}),now);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 return {ok:true,applied:true,...after};
}
module.exports={rebook517,SALE,MIGRATION_ID:ID};
