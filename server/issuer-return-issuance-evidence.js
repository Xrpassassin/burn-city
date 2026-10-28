'use strict';
// Audit outgoing token issuance independently from issuer-return (redemption) totals.
// This is evidence only: gross issuance can span many transactions and days and
// is NOT, by itself, a proof of the supply circulating on launch day.
const { decimalUnits, BURN_LAUNCH_SUPPLY, BURN_CURRENCY, BURN_ISSUER } = require('./issuer-return-history');
const SCALE=10n**15n;
function asString(units) {
 const whole=units/SCALE, rem=(units%SCALE).toString().padStart(15,'0').replace(/0+$/,'');
 return String(whole)+(rem?'.'+rem:'');
}
function summarizeIssuanceEvidence({transactions,issuer=BURN_ISSUER,currency=BURN_CURRENCY,reportedLaunchSupply=BURN_LAUNCH_SUPPLY,coverageComplete=false}) {
 if (!Array.isArray(transactions)) throw Error('transactions required');
 const seen=new Set();let gross=0n,firstLedger=null,lastLedger=null,count=0,rejected=0;
 for(const item of transactions) {
   const tx=item?.tx||item?.tx_json||item?.transaction||item, meta=item?.meta||item?.metaData;
   if(!tx||typeof tx.hash!=='string'||!tx.hash||item?.validated!==true) {rejected++;continue;}
   if(seen.has(tx.hash))continue;
   seen.add(tx.hash);
   if(tx.TransactionType!=='Payment'||tx.Account!==issuer||tx.Destination===issuer||
      meta?.TransactionResult!=='tesSUCCESS')continue;
   const delivered=meta.delivered_amount??meta.DeliveredAmount;
   if(!delivered||typeof delivered!=='object'||delivered.issuer!==issuer||
     String(delivered.currency||'').toUpperCase()!==currency.toUpperCase())continue;
   const value=decimalUnits(delivered.value);
   if(!value||value.units<=0n){rejected++;continue;}
   const ledger=tx.ledger_index??item.ledger_index;
   if(!Number.isSafeInteger(ledger)||ledger<0){rejected++;continue;}
   gross+=value.units;count++;
   firstLedger=firstLedger===null?ledger:Math.min(firstLedger,ledger);
   lastLedger=lastLedger===null?ledger:Math.max(lastLedger,ledger);
 }
 const baseline=decimalUnits(reportedLaunchSupply);
 return {
  status:coverageComplete&&rejected===0?'complete_history_observed':'incomplete',
  gross_issued_observed:asString(gross), first_issuance_ledger:firstLedger,
  last_issuance_ledger:lastLedger, issuance_transactions:count,rejected_records:rejected,
  reported_launch_supply:reportedLaunchSupply,
  gross_issued_matches_reported:coverageComplete&&rejected===0&&baseline!==null?gross===baseline.units:null,
  launch_supply_verified:false,
  note:'Gross lifetime issuance is not necessarily launch circulating supply. Review issuance timing, reissuance, and return history before certifying a burn percentage.'
 };
}
module.exports={summarizeIssuanceEvidence};
