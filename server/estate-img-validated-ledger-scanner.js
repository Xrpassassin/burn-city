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
 const verify=createImgRewardVerifier(client,{...config,skipNonImgPayments:true});
 const receipts=createImgHourlyRewardLedger(db,config);
 const checkpoints=createImgScanCheckpointStore(db);
 const bootstrap=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='estate_img_scan_bootstrap'").get() ? db.prepare('SELECT * FROM estate_img_scan_bootstrap WHERE id=1') : null;
 const sources=new Set(allowedSources);
 async function scan(ledgerIndex,{verifiedAtMs=Date.now()}={}){
  if(!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1)throw new TypeError('invalid_ledger_index');
  const previous=checkpoints.current();
  const cfg=bootstrap?.get();
  if(!cfg)throw new Error('historical_bootstrap_required');
  if(cfg.treasury!==treasury||cfg.img_issuer!==imgIssuer||JSON.stringify(JSON.parse(cfg.source_addresses_json).sort())!==JSON.stringify([...sources].sort()))throw new Error('scanner_configuration_mismatch');
  if(!previous&&ledgerIndex!==cfg.start_ledger_index)throw new Error('unexpected_start_ledger');
  if(previous&&ledgerIndex!==previous.ledger_index+1)throw new Error('noncontiguous_ledger');
  const response=await client.request({command:'ledger',ledger_index:ledgerIndex,transactions:true,expand:true});
  const ledger=response?.result?.ledger;
  if(response?.result?.validated!==true||!ledger||Number(ledger.ledger_index)!==ledgerIndex||!Array.isArray(ledger.transactions)||!Number.isSafeInteger(ledger.close_time))throw new Error('unvalidated_or_incomplete_ledger');
  const ledgerHash=ledger.ledger_hash||response.result.ledger_hash;
  if(!HASH.test(ledgerHash||'')||!HASH.test(ledger.parent_hash||'')||!HASH.test(ledger.transaction_hash||''))throw new Error('missing_ledger_integrity_hashes');
  if(!previous&&ledgerHash.toUpperCase()!==cfg.start_ledger_hash.toUpperCase())throw new Error('start_ledger_hash_mismatch');
  const hashes=[];
  const seenHashes=new Set();
  for(const entry of ledger.transactions){
   const tx=entry?.tx_json||entry;
   if(!tx||typeof tx!=='object'||typeof tx.TransactionType!=='string'||!HASH.test(entry.hash||tx.hash||''))throw new Error('unexpected_ledger_transaction_shape');
   const hash=(entry.hash||tx.hash).toUpperCase();
   if(seenHashes.has(hash))throw new Error('duplicate_ledger_transaction');
   seenHashes.add(hash);
   if(tx.TransactionType==='Payment'&&sources.has(tx.Account)&&tx.Destination===treasury)hashes.push(hash);
  }
  const closeTimeMs=(ledger.close_time+946684800)*1000;
  if(!Number.isSafeInteger(closeTimeMs))throw new Error('invalid_ledger_close_time');
  // Verify every candidate independently before committing anything.
  const checked=await Promise.all(hashes.map(verify));
  const verified=checked.filter(r=>!r.ignored);
  if(checked.some(r=>r.ledgerIndex!==ledgerIndex||r.receivedAtMs!==closeTimeMs))throw new Error('receipt_ledger_or_time_mismatch');
  db.exec('BEGIN IMMEDIATE');
  try{
   db.exec('CREATE TABLE IF NOT EXISTS estate_img_scanned_ledger_hashes(ledger_index INTEGER PRIMARY KEY,ledger_hash TEXT NOT NULL,parent_hash TEXT NOT NULL,transaction_hash TEXT NOT NULL)');
   const priorHash=db.prepare('SELECT ledger_hash FROM estate_img_scanned_ledger_hashes WHERE ledger_index=?').get(ledgerIndex-1);
   if(previous&&!priorHash)throw new Error('missing_previous_ledger_hash');
   if(priorHash&&priorHash.ledger_hash.toUpperCase()!==ledger.parent_hash.toUpperCase())throw new Error('ledger_parent_hash_mismatch');
   let inserted=0;
   for(const receipt of verified)if(receipts.record(receipt).inserted)inserted++;
   // Checkpoint store owns its own transaction: avoid nested transactions by
   // updating checkpoint directly under the enclosing transaction.
   const current=checkpoints.current();
   if(current&&ledgerIndex!==current.ledger_index+1)throw new Error('noncontiguous_ledger');
   if(current&&closeTimeMs<current.scanned_through_ms)throw new Error('ledger_time_regression');
   db.prepare('INSERT INTO estate_img_scan_watermarks(id,scanned_through_ms,ledger_index,verified_at_ms) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET scanned_through_ms=excluded.scanned_through_ms,ledger_index=excluded.ledger_index,verified_at_ms=excluded.verified_at_ms').run(closeTimeMs,ledgerIndex,verifiedAtMs);
   db.prepare('INSERT INTO estate_img_scanned_ledger_hashes VALUES(?,?,?,?)').run(ledgerIndex,ledgerHash.toUpperCase(),ledger.parent_hash.toUpperCase(),ledger.transaction_hash.toUpperCase());
   db.exec('COMMIT');
   return Object.freeze({ledgerIndex,ledgerHash:ledgerHash.toUpperCase(),closeTimeMs,eligiblePayments:verified.length,newReceipts:inserted});
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return Object.freeze({scan,current:checkpoints.current});
}
module.exports={createImgValidatedLedgerScanner};
