'use strict';
// Persist page-level checkpoints in the existing SQLite database. All data is
// quarantined from reward accounting until independently reconciled.
function createAmmHistoryCheckpointStore(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_amm_scan_checkpoints (
 scan_id TEXT PRIMARY KEY, treasury TEXT NOT NULL, ledger_min INTEGER NOT NULL,
 ledger_max INTEGER NOT NULL, marker_json TEXT, page_count INTEGER NOT NULL DEFAULT 0,
 exhausted INTEGER NOT NULL DEFAULT 0 CHECK(exhausted IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE IF NOT EXISTS estate_amm_scan_transactions (
 scan_id TEXT NOT NULL, tx_hash TEXT NOT NULL, ledger_index INTEGER NOT NULL,
 validated INTEGER NOT NULL CHECK(validated IN (0,1)),
 transaction_type TEXT, PRIMARY KEY(scan_id,tx_hash),
 FOREIGN KEY(scan_id) REFERENCES estate_amm_scan_checkpoints(scan_id)
 );`);
 const get=db.prepare('SELECT * FROM estate_amm_scan_checkpoints WHERE scan_id=?');
 const start=db.prepare('INSERT INTO estate_amm_scan_checkpoints(scan_id,treasury,ledger_min,ledger_max) VALUES(?,?,?,?)');
 const insert=db.prepare('INSERT INTO estate_amm_scan_transactions(scan_id,tx_hash,ledger_index,validated,transaction_type) VALUES(?,?,?,?,?)');
 const update=db.prepare('UPDATE estate_amm_scan_checkpoints SET marker_json=?,page_count=page_count+1,exhausted=?,updated_at=CURRENT_TIMESTAMP WHERE scan_id=?');
 function begin({scanId,treasury,ledgerMin,ledgerMax}){
  if(typeof scanId!=='string'||!scanId||typeof treasury!=='string'||!treasury||!Number.isSafeInteger(ledgerMin)||!Number.isSafeInteger(ledgerMax)||ledgerMin<1||ledgerMax<ledgerMin)throw new TypeError('invalid_scan_parameters');
  const existing=get.get(scanId);
  if(existing){
   if(existing.treasury!==treasury||existing.ledger_min!==ledgerMin||existing.ledger_max!==ledgerMax)throw new Error('scan_identity_conflict');
   return existing;
  }
  start.run(scanId,treasury,ledgerMin,ledgerMax);return get.get(scanId);
 }
 function recordPage({scanId,expectedPageCount,transactions,nextMarker}){
  const current=get.get(scanId);
  if(!current)throw new Error('scan_not_found');
  if(current.exhausted)throw new Error('scan_already_exhausted');
  if(current.page_count!==expectedPageCount)throw new Error('stale_scan_checkpoint');
  if(!Array.isArray(transactions))throw new TypeError('transactions_required');
  const seen=new Set();
  for(const item of transactions){
   if(typeof item?.hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(item.hash)||!Number.isSafeInteger(item.ledgerIndex)||item.ledgerIndex<current.ledger_min||item.ledgerIndex>current.ledger_max||typeof item.validated!=='boolean')throw new Error('invalid_scan_transaction');
   const hash=item.hash.toUpperCase();if(seen.has(hash))throw new Error('duplicate_page_hash');seen.add(hash);
  }
  const markerJson=nextMarker===undefined||nextMarker===null?null:JSON.stringify(nextMarker);
  if(markerJson!==null&&(markerJson===current.marker_json||markerJson.length>8192))throw new Error('invalid_or_repeated_marker');
  const commit=db.transaction(()=>{
   for(const item of transactions)insert.run(scanId,item.hash.toUpperCase(),item.ledgerIndex,item.validated?1:0,item.transactionType||null);
   update.run(markerJson,markerJson===null?1:0,scanId);
  });
  commit();return get.get(scanId);
 }
 return {begin,recordPage,get:(scanId)=>get.get(scanId)};
}
module.exports={createAmmHistoryCheckpointStore};
