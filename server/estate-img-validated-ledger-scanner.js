'use strict';
// Read-only, explicit one-ledger scanner. Do not schedule until configured with
// real validated IMG issuer/source IDs and independently reviewed completeness.
const {createImgRewardVerifier}=require('./estate-img-xrpl-receipt-verifier');
const {createImgHourlyRewardLedger}=require('./estate-img-hourly-rewards');
const {createImgScanCheckpointStore}=require('./estate-img-scan-checkpoints');
const HASH=/^[A-Fa-f0-9]{64}$/;
function createImgValidatedLedgerScanner({client,db,treasury,imgIssuer,allowedSources}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 const config={treasury,imgIssuer,allowedSources};
 const verify=createImgRewardVerifier(client,config);
 const receipts=createImgHourlyRewardLedger(db,config);
 const checkpoints=createImgScanCheckpointStore(db);
 const sources=new Set(allowedSources);
 async function scan(ledgerIndex,{verifiedAtMs=Date.now()}={}){
  if(!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1)throw new TypeError('invalid_ledger_index');
  const previous=checkpoints.current();
  if(previous&&ledgerIndex!==previous.ledger_index+1)throw new Error('noncontiguous_ledger');
  const response=await client.request({command:'ledger',ledger_index:ledgerIndex,transactions:true,expand:true});
  const ledger=response?.result?.ledger;
  if(response?.result?.validated!==true||!ledger||Number(ledger.ledger_index)!==ledgerIndex||!Array.isArray(ledger.transactions)||!Number.isSafeInteger(ledger.close_time))throw new Error('unvalidated_or_incomplete_ledger');
  const hashes=[];
  for(const entry of ledger.transactions){
   if(!entry||typeof entry!=='object'||typeof entry.TransactionType!=='string'||!HASH.test(entry.hash||''))throw new Error('unexpected_ledger_transaction_shape');
   if(entry.TransactionType==='Payment'&&sources.has(entry.Account)&&entry.Destination===treasury)hashes.push(entry.hash);
  }
  const closeTimeMs=(ledger.close_time+946684800)*1000;
  if(!Number.isSafeInteger(closeTimeMs))throw new Error('invalid_ledger_close_time');
  // Verify every candidate independently before committing anything.
  const verified=await Promise.all(hashes.map(verify));
  if(verified.some(r=>r.ledgerIndex!==ledgerIndex))throw new Error('receipt_ledger_mismatch');
  db.exec('BEGIN IMMEDIATE');
  try{
   let inserted=0;
   for(const receipt of verified)if(receipts.record(receipt).inserted)inserted++;
   // Checkpoint store owns its own transaction: avoid nested transactions by
   // updating checkpoint directly under the enclosing transaction.
   const current=checkpoints.current();
   if(current&&ledgerIndex!==current.ledger_index+1)throw new Error('noncontiguous_ledger');
   if(current&&closeTimeMs<current.scanned_through_ms)throw new Error('ledger_time_regression');
   db.prepare('INSERT INTO estate_img_scan_watermarks(id,scanned_through_ms,ledger_index,verified_at_ms) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET scanned_through_ms=excluded.scanned_through_ms,ledger_index=excluded.ledger_index,verified_at_ms=excluded.verified_at_ms').run(closeTimeMs,ledgerIndex,verifiedAtMs);
   db.exec('COMMIT');
   return Object.freeze({ledgerIndex,closeTimeMs,eligiblePayments:verified.length,newReceipts:inserted});
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return Object.freeze({scan,current:checkpoints.current});
}
module.exports={createImgValidatedLedgerScanner};
