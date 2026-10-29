'use strict';
// Fail-closed scanner checkpoints. Caller must supply sequential, fully processed
// validated ledger headers; never advance based on wall-clock time alone.
function createImgScanCheckpointStore(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_img_scan_watermarks(
 id INTEGER PRIMARY KEY CHECK(id=1), scanned_through_ms INTEGER NOT NULL,
 ledger_index INTEGER NOT NULL, verified_at_ms INTEGER NOT NULL
 );`);
 const get=db.prepare('SELECT scanned_through_ms,ledger_index,verified_at_ms FROM estate_img_scan_watermarks WHERE id=1');
 const save=db.prepare('INSERT INTO estate_img_scan_watermarks(id,scanned_through_ms,ledger_index,verified_at_ms) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET scanned_through_ms=excluded.scanned_through_ms,ledger_index=excluded.ledger_index,verified_at_ms=excluded.verified_at_ms');
 function current(){return get.get()||null;}
 function advance({ledgerIndex,ledgerCloseTimeMs,verifiedAtMs,fullyProcessed,validated}={}){
  if(validated!==true||fullyProcessed!==true)throw new Error('ledger_not_verified_and_fully_processed');
  if(!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1||!Number.isSafeInteger(ledgerCloseTimeMs)||ledgerCloseTimeMs<1||!Number.isSafeInteger(verifiedAtMs)||verifiedAtMs<ledgerCloseTimeMs)throw new TypeError('invalid_checkpoint');
  db.exec('BEGIN IMMEDIATE');
  try{
   const prior=current();
   if(prior&&ledgerIndex!==prior.ledger_index+1)throw new Error('noncontiguous_ledger');
   if(prior&&ledgerCloseTimeMs<prior.scanned_through_ms)throw new Error('ledger_time_regression');
   save.run(ledgerCloseTimeMs,ledgerIndex,verifiedAtMs);
   db.exec('COMMIT');
   return current();
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return Object.freeze({current,advance});
}
module.exports={createImgScanCheckpointStore};
