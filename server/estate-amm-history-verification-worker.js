'use strict';
const {verifyStoredAmmHistoryEntry}=require('./estate-amm-history-tx-verification');
const {createAmmHistoryVerificationJournal}=require('./estate-amm-history-verification-journal');
// Deliberately bounded read-only worker; does not infer profit from transactions.
async function verifyAmmHistoryBatch(client,db,{scanId,treasury,imgIssuer,plxIssuer,limit=20}={}){
 if(typeof scanId!=='string'||!scanId||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_verification_batch');
 if(!db||typeof db.prepare!=='function')throw new TypeError('sqlite_db_required');
 const journal=createAmmHistoryVerificationJournal(db);
 const rows=db.prepare(`SELECT t.tx_hash AS hash,t.ledger_index AS ledgerIndex,t.validated AS validated
 FROM estate_amm_scan_transactions t
 LEFT JOIN estate_amm_history_verifications v ON v.scan_id=t.scan_id AND v.tx_hash=t.tx_hash
 WHERE t.scan_id=? AND v.tx_hash IS NULL AND t.transaction_type IN ('AMMDeposit','AMMWithdraw')
 ORDER BY t.ledger_index,t.tx_hash LIMIT ?`).all(scanId,limit);
 let verified=0,rejected=0;
 for(const row of rows){
  try{
   const evidence=await verifyStoredAmmHistoryEntry(client,{hash:row.hash,ledgerIndex:row.ledgerIndex,validated:row.validated===1},{treasury,imgIssuer,plxIssuer});
   journal.record({scanId,hash:row.hash,ledgerIndex:row.ledgerIndex,status:'verified_structure',evidence});
   verified++;
  }catch(err){
   // Network and XRPL service errors are transient: preserve pending records
   // instead of incorrectly classifying them as permanently rejected.
   if(!['stored_entry_not_validated','stored_history_transaction_mismatch','unsafe_accounting_classification'].includes(err?.message))throw err;
   journal.record({scanId,hash:row.hash,ledgerIndex:row.ledgerIndex,status:'rejected',failureCode:err.message});
   rejected++;
  }
 }
 return Object.freeze({scanId,attempted:rows.length,verified,rejected,accountingReady:false,distributable:false});
}
module.exports={verifyAmmHistoryBatch};
