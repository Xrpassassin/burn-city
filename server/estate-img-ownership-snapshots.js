'use strict';
// Source eligibility exclusively from persisted, settled ownership.
// A receipt's ledger-derived timestamp is the cutoff: purchases after it cannot earn it.
const {propertyWeight}=require('./estate-economy');
function createEstateImgOwnershipSnapshots(db){
 if(!db||typeof db.prepare!=='function')throw new TypeError('sqlite_db_required');
 const query=db.prepare('SELECT property_id,acct,share_units,purchased_at FROM estate_property_ownership WHERE purchased_at<=? ORDER BY property_id');
 function at(receivedAtMs){
  if(!Number.isSafeInteger(receivedAtMs)||receivedAtMs<0)throw new TypeError('invalid_receipt_timestamp');
  return query.all(receivedAtMs).map(r=>{
   const expected=propertyWeight(r.property_id);
   if(!expected||r.share_units!==expected||typeof r.acct!=='string'||!r.acct)throw new Error('ownership_catalog_mismatch');
   return Object.freeze({propertyId:r.property_id,acct:r.acct});
  });
 }
 return Object.freeze({at});
}
function createOwnedImgRewardAllocator(db,ingestion){
 if(!ingestion||typeof ingestion.allocateVerified!=='function')throw new TypeError('verified_ingestion_required');
 const snapshots=createEstateImgOwnershipSnapshots(db);
 const receipt=db.prepare('SELECT received_at_ms FROM estate_img_reward_receipts WHERE tx_hash=?');
 function allocate(txHash){
  const row=receipt.get(txHash);
  if(!row)throw new Error('verified_receipt_not_found');
  const holdings=snapshots.at(row.received_at_ms);
  if(!holdings.length)throw new Error('no_eligible_owners_at_receipt');
  return ingestion.allocateVerified(txHash,holdings);
 }
 return Object.freeze({allocate});
}
module.exports={createEstateImgOwnershipSnapshots,createOwnedImgRewardAllocator};
