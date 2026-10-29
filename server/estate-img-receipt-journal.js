'use strict';
// Durable receipt quarantine. No receipt is automatically treated as AMM earnings.
const HASH = /^[A-Fa-f0-9]{64}$/;
function createImgReceiptJournal(db) {
  db.exec("CREATE TABLE IF NOT EXISTS estate_img_receipts (tx_hash TEXT PRIMARY KEY, ledger_index INTEGER NOT NULL CHECK(ledger_index > 0), treasury TEXT NOT NULL, img_issuer TEXT NOT NULL, sender TEXT NOT NULL, delivered_img TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification = 'unclassified_receipt'), distributable INTEGER NOT NULL DEFAULT 0 CHECK(distributable = 0), recorded_at INTEGER NOT NULL)");
  const insert = db.prepare("INSERT OR IGNORE INTO estate_img_receipts (tx_hash,ledger_index,treasury,img_issuer,sender,delivered_img,classification,distributable,recorded_at) VALUES (?,?,?,?,?,?,'unclassified_receipt',0,?)");
  const get = hash => db.prepare('SELECT * FROM estate_img_receipts WHERE tx_hash=?').get(String(hash).toUpperCase()) || null;
  function record(verified) {
    if (!verified || !HASH.test(verified.hash || '') || !Number.isSafeInteger(verified.ledgerIndex) || verified.ledgerIndex < 1 ||
      verified.classification !== 'unclassified_receipt' || verified.distributable !== false ||
      typeof verified.treasury !== 'string' || !verified.treasury || typeof verified.imgIssuer !== 'string' || !verified.imgIssuer ||
      typeof verified.sender !== 'string' || !verified.sender ||
      typeof verified.deliveredImg !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,15})?$/.test(verified.deliveredImg) || Number(verified.deliveredImg) <= 0)
      throw new TypeError('validated_unclassified_img_receipt_required');
    const hash = verified.hash.toUpperCase();
    const result = insert.run(hash, verified.ledgerIndex, verified.treasury, verified.imgIssuer, verified.sender, verified.deliveredImg, Date.now());
    const saved = get(hash);
    if (result.changes === 0 && (saved.ledger_index !== verified.ledgerIndex || saved.treasury !== verified.treasury ||
      saved.img_issuer !== verified.imgIssuer || saved.sender !== verified.sender || saved.delivered_img !== verified.deliveredImg))
      throw new Error('receipt_hash_conflict');
    return { inserted: result.changes === 1, receipt: saved };
  }
  return { record, get };
}
module.exports = { createImgReceiptJournal };
