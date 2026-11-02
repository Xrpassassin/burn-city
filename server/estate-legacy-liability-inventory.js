'use strict';
// Read-only per-table liability inventory. Credits, entitlements, queued
// payouts and carryover records can overlap; do NOT sum them indiscriminately.
const integer=x=>{
 if(typeof x!=='string'||!/^(0|[1-9][0-9]*)$/.test(x))throw Error('invalid_stored_liability_units');
 return BigInt(x);
};
const TABLES=Object.freeze([
 {name:'estate_img_hourly_entitlements',value:'amount_units',group:null,unit:'IMG micro-units'},
 {name:'estate_hourly_payouts',value:'img_units',group:'state',unit:'IMG micro-units'},
 {name:'estate_payout_credits',value:'units',group:null,unit:'IMG micro-units'},
 {name:'estate_reward_carryovers',value:'units',group:null,unit:'IMG micro-units'},
 {name:'estate_reward_xrp_credits',value:'drops',group:null,unit:'XRP drops'},
 {name:'estate_xrp_profit_payouts',value:'amount_drops',group:'state',unit:'XRP drops'},
 {name:'estate_xrp_profit_credits',value:'amount_drops',group:null,unit:'XRP drops'}
]);
function inspectEstateLiabilityRows(db){
 if(!db||typeof db.prepare!=='function')throw Error('readable_database_required');
 const existing=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const out={};
 for(const spec of TABLES){
  if(!existing.has(spec.name)){
   out[spec.name]={present:false,reportingUnit:spec.unit,rows:null,totalsByState:null};
   continue;
  }
  const cols=new Set(db.prepare('PRAGMA table_info('+spec.name+')').all().map(c=>c.name));
  if(!cols.has(spec.value)||(spec.group&&!cols.has(spec.group)))
   throw Error('unexpected_liability_schema_'+spec.name);
  let total=0n,rows=0;const groups={};
  const selection=spec.value+(spec.group?','+spec.group:'');
  for(const row of db.prepare('SELECT '+selection+' FROM '+spec.name).all()){
   const number=integer(row[spec.value]);
   total+=number;rows++;
   if(spec.group){
    if(typeof row[spec.group]!=='string'||!row[spec.group])throw Error('invalid_liability_state');
    const previous=groups[row[spec.group]]||{rows:0,total:0n};
    groups[row[spec.group]]={rows:previous.rows+1,total:previous.total+number};
   }
  }
  out[spec.name]={present:true,reportingUnit:spec.unit,rows,
   totalRecordedUnits:total.toString(),
   totalsByState:spec.group?Object.fromEntries(Object.entries(groups).map(([key,v])=>[
    key,{rows:v.rows,recordedUnits:v.total.toString()}])):null};
 }
 return Object.freeze({readOnly:true,byTable:out,
  amountsMustNotBeAggregatedAcrossTables:true,
  carryoverAndCreditsMayRepresentSameObligation:true,
  confirmedPayoutsMayAlreadyBePaid:true,
  pendingStateRequiresLedgerSettlementCheck:true,
  allPriorLiabilitiesEconomicallyReconciled:false,
  legacyCapitalReallocationAuthorized:false,purchaseActivationAuthorized:false});
}
module.exports={inspectEstateLiabilityRows};
