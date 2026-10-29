'use strict';
// Immutable evidence staging for future independent AMM earnings reconciliation.
// Neither evidence insertion nor review constitutes authorization to distribute.
const HASH=/^[A-Fa-f0-9]{64}$/;
function createImgEarningsEvidenceLedger(db) {
  db.exec("CREATE TABLE IF NOT EXISTS estate_img_earnings_evidence (evidence_id TEXT PRIMARY KEY, receipt_hash TEXT NOT NULL, source_kind TEXT NOT NULL CHECK(source_kind IN ('amm_fee_claim','amm_liquidity_withdrawal','external_reconciliation')), source_reference TEXT NOT NULL, proposed_img_units TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status = 'pending_review'), distributable INTEGER NOT NULL DEFAULT 0 CHECK(distributable = 0), created_at INTEGER NOT NULL, UNIQUE(receipt_hash), UNIQUE(source_kind,source_reference))");
  const insert=db.prepare("INSERT INTO estate_img_earnings_evidence (evidence_id,receipt_hash,source_kind,source_reference,proposed_img_units,created_at) VALUES (?,?,?,?,?,?)");
  const get=db.prepare("SELECT * FROM estate_img_earnings_evidence WHERE evidence_id=?");
  const receipt=db.prepare("SELECT tx_hash FROM estate_img_receipts WHERE tx_hash=?");
  function stage({ evidenceId, receiptHash, sourceKind, sourceReference, proposedImgUnits }={}) {
    if(typeof evidenceId!=='string'||!HASH.test(receiptHash||'')||!['amm_fee_claim','amm_liquidity_withdrawal','external_reconciliation'].includes(sourceKind)||
       typeof sourceReference!=='string'||!sourceReference.trim()||sourceReference.length>256||
       typeof proposedImgUnits!=='string'||!/^[1-9]\d*$/.test(proposedImgUnits))throw new TypeError('invalid_earnings_evidence');
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(evidenceId))throw new TypeError('invalid_evidence_id');
    const hash=receiptHash.toUpperCase();
    if(!receipt.get(hash))throw new Error('verified_receipt_required');
    insert.run(evidenceId,hash,sourceKind,sourceReference,proposedImgUnits,Date.now());
    return get.get(evidenceId);
  }
  return {stage,get:id=>get.get(id)||null};
}
module.exports={createImgEarningsEvidenceLedger};
