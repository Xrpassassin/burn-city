'use strict';
// Reconcile completed hourly IMG allocations into immutable, nonpaying owner entitlements.
// No signing, payouts or external API calls.
const crypto=require('node:crypto');
function createImgHourlyBatchReconciler(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_img_retained_receipts(tx_hash TEXT PRIMARY KEY,reason TEXT NOT NULL CHECK(reason='no_eligible_owners'),FOREIGN KEY(tx_hash) REFERENCES estate_img_reward_receipts(tx_hash));
 CREATE TABLE IF NOT EXISTS estate_img_hourly_batches(
 epoch_start_ms INTEGER PRIMARY KEY, total_units TEXT NOT NULL,
 receipt_count INTEGER NOT NULL, allocation_count INTEGER NOT NULL,
 digest TEXT NOT NULL, created_at_ms INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS estate_img_hourly_entitlements(
 epoch_start_ms INTEGER NOT NULL, owner TEXT NOT NULL,
 amount_units TEXT NOT NULL, PRIMARY KEY(epoch_start_ms,owner)
 );
 CREATE TABLE IF NOT EXISTS estate_img_scan_watermarks(
 id INTEGER PRIMARY KEY CHECK(id=1), scanned_through_ms INTEGER NOT NULL,
 ledger_index INTEGER NOT NULL, verified_at_ms INTEGER NOT NULL
 );
 CREATE TRIGGER IF NOT EXISTS estate_img_no_late_receipt BEFORE INSERT ON estate_img_reward_receipts
 WHEN EXISTS(SELECT 1 FROM estate_img_hourly_batches WHERE epoch_start_ms=NEW.epoch_start_ms)
 BEGIN SELECT RAISE(ABORT,'closed_hour_receipt'); END;
 CREATE TRIGGER IF NOT EXISTS estate_img_no_late_allocation BEFORE INSERT ON estate_img_hourly_allocations
 WHEN EXISTS(SELECT 1 FROM estate_img_hourly_batches WHERE epoch_start_ms=NEW.epoch_start_ms)
 BEGIN SELECT RAISE(ABORT,'closed_hour_allocation'); END;`);
 const receipts=db.prepare('SELECT tx_hash,amount_units FROM estate_img_reward_receipts WHERE epoch_start_ms=? ORDER BY tx_hash');
 const allocations=db.prepare('SELECT tx_hash,property_id,owner,amount_units FROM estate_img_hourly_allocations WHERE epoch_start_ms=? ORDER BY tx_hash,property_id');
 const batch=db.prepare('SELECT * FROM estate_img_hourly_batches WHERE epoch_start_ms=?');
 const insertBatch=db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?,?,?,?,?)');
 const insertOwner=db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)');
 function close(epochStartMs,now=Date.now()){
  if(!Number.isSafeInteger(epochStartMs)||epochStartMs<0||epochStartMs%3600000!==0)throw new TypeError('invalid_epoch');
  if(!Number.isSafeInteger(now)||now<epochStartMs+3600000)throw new Error('hour_not_complete');
  db.exec('BEGIN IMMEDIATE');
  try{
   if(batch.get(epochStartMs))throw new Error('hour_already_closed');
   const watermark=db.prepare('SELECT scanned_through_ms,ledger_index FROM estate_img_scan_watermarks WHERE id=1').get();
   if(!watermark||watermark.scanned_through_ms<epochStartMs+3600000||!Number.isSafeInteger(watermark.ledger_index)||watermark.ledger_index<1)throw new Error('verified_ledger_scan_watermark_required');
   const rs=receipts.all(epochStartMs),as=allocations.all(epochStartMs);
   if(!rs.length)throw new Error('no_verified_receipts');
   const retained=new Set(db.prepare('SELECT tx_hash FROM estate_img_retained_receipts').all().map(r=>r.tx_hash));
   const receiptTotal=rs.filter(r=>!retained.has(r.tx_hash)).reduce((s,r)=>s+BigInt(r.amount_units),0n);
   if(as.some(a=>retained.has(a.tx_hash)))throw new Error('retained_receipt_allocated');
   const allocationTotal=as.reduce((s,r)=>s+BigInt(r.amount_units),0n);
   if(receiptTotal!==allocationTotal)throw new Error('unallocated_or_inconsistent_receipts');
   const receiptSet=new Set(rs.map(r=>r.tx_hash));
   if(as.some(a=>!receiptSet.has(a.tx_hash)))throw new Error('unknown_receipt_allocation');
   const owners=new Map();
   for(const a of as)owners.set(a.owner,(owners.get(a.owner)||0n)+BigInt(a.amount_units));
   const digest=crypto.createHash('sha256').update(JSON.stringify({epochStartMs,rs,as,retained:rs.filter(r=>retained.has(r.tx_hash)).map(r=>r.tx_hash)})).digest('hex');
   for(const [owner,amount] of [...owners].sort((a,b)=>a[0].localeCompare(b[0])))insertOwner.run(epochStartMs,owner,String(amount));
   insertBatch.run(epochStartMs,String(receiptTotal),rs.length,as.length,digest,now);
   db.exec('COMMIT');
   return Object.freeze({epochStartMs,totalUnits:String(receiptTotal),receiptCount:rs.length,allocationCount:as.length,ownerCount:owners.size,digest});
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return Object.freeze({close});
}
module.exports={createImgHourlyBatchReconciler};
