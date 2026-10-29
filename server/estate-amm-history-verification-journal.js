'use strict';
// Historical AMM verification results are evidence, not earnings or payout authority.
function createAmmHistoryVerificationJournal(db){
 if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function')throw new TypeError('sqlite_db_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_amm_history_verifications (
  scan_id TEXT NOT NULL, tx_hash TEXT NOT NULL, ledger_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified_structure','rejected')),
  evidence_json TEXT, failure_code TEXT,
  distributable INTEGER NOT NULL DEFAULT 0 CHECK(distributable=0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(scan_id,tx_hash),
  FOREIGN KEY(scan_id,tx_hash) REFERENCES estate_amm_scan_transactions(scan_id,tx_hash),
  CHECK((status='verified_structure' AND evidence_json IS NOT NULL AND failure_code IS NULL)
     OR (status='rejected' AND evidence_json IS NULL AND failure_code IS NOT NULL))
 );`);
 const source=db.prepare('SELECT ledger_index,validated FROM estate_amm_scan_transactions WHERE scan_id=? AND tx_hash=?');
 const get=db.prepare('SELECT * FROM estate_amm_history_verifications WHERE scan_id=? AND tx_hash=?');
 const insert=db.prepare('INSERT INTO estate_amm_history_verifications(scan_id,tx_hash,ledger_index,status,evidence_json,failure_code) VALUES(?,?,?,?,?,?)');
 function record({scanId,hash,ledgerIndex,status,evidence,failureCode}){
  if(typeof scanId!=='string'||!scanId||typeof hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1)throw new TypeError('invalid_verification_identity');
  const key=hash.toUpperCase();
  if(!['verified_structure','rejected'].includes(status))throw new TypeError('invalid_verification_status');
  const original=source.get(scanId,key);
  if(!original||original.ledger_index!==ledgerIndex)throw new Error('stored_transaction_mismatch');
  if(status==='verified_structure'&&original.validated!==1)throw new Error('unvalidated_transaction');
  if(status==='verified_structure'&&(evidence?.storedHashVerified!==true||evidence?.storedLedgerVerified!==true||evidence?.distributable!==false))throw new Error('unsafe_or_incomplete_verification_evidence');
  if(status==='rejected'&&(typeof failureCode!=='string'||!/^[a-z_]{3,80}$/.test(failureCode)))throw new TypeError('safe_failure_code_required');
  const json=status==='verified_structure'?JSON.stringify(evidence):null;
  if(json&&json.length>65536)throw new Error('verification_evidence_too_large');
  const prior=get.get(scanId,key);
  if(prior){
   if(prior.ledger_index!==ledgerIndex||prior.status!==status||prior.evidence_json!==json||prior.failure_code!==(status==='rejected'?failureCode:null))throw new Error('verification_conflict');
   return prior;
  }
  insert.run(scanId,key,ledgerIndex,status,json,status==='rejected'?failureCode:null);
  return get.get(scanId,key);
 }
 return {record,get:(scanId,hash)=>get.get(scanId,hash.toUpperCase())};
}
module.exports={createAmmHistoryVerificationJournal};
