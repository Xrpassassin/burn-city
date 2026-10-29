'use strict';
// Read-only audit of transaction records. Caller must supply an independently
// collected, exhaustive XRPL account_tx history; this function cannot prove it.
function auditAmmHistory(records,{fromLedger,toLedger,historyComplete=false}={}){
 if(!Array.isArray(records)||!Number.isSafeInteger(fromLedger)||!Number.isSafeInteger(toLedger)||fromLedger<1||toLedger<fromLedger)throw new TypeError('valid_history_range_required');
 const seen=new Set(),issues=[],ordered=[];
 for(const record of records){
  if(!record||typeof record.hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(record.hash)||!Number.isSafeInteger(record.ledgerIndex)||record.ledgerIndex<fromLedger||record.ledgerIndex>toLedger){
   issues.push('invalid_or_out_of_range_record');continue;
  }
  const hash=record.hash.toUpperCase();
  if(seen.has(hash)){issues.push('duplicate_transaction_hash');continue;}
  seen.add(hash);
  if(record.distributable!==false||record.realizedProfitVerified!==false||record.principalBasisVerified!==false)issues.push('untrusted_profit_or_distribution_claim');
  if(!['liquidity_deposit','liquidity_withdrawal'].includes(record.eventKind))issues.push('unexpected_event_kind');
  ordered.push({hash,ledgerIndex:record.ledgerIndex,eventKind:record.eventKind});
 }
 for(let i=1;i<ordered.length;i++)if(ordered[i].ledgerIndex<ordered[i-1].ledgerIndex)issues.push('out_of_order_ledger');
 const distinct=[...new Set(issues)];
 return Object.freeze({fromLedger,toLedger,recordCount:ordered.length,hashes:ordered.map(x=>x.hash),issues:distinct,historyComplete:historyComplete===true&&distinct.length===0,accountingReady:false,principalBasisVerified:false,distributable:false});
}
module.exports={auditAmmHistory};
