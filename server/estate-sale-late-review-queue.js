'use strict';
// Read-only administrative review queue for verified late XRP payments.
// No ownership, settlement, refunds, or status transitions are performed here.
function createEstateLatePaymentReviewQueue(db){
 if(!db||typeof db.prepare!=='function')throw new TypeError('sqlite_db_required');
 const pending=db.prepare("SELECT reservation_id,buyer,tx_hash,observed_at,status FROM estate_late_payment_reviews WHERE status='needs_review' ORDER BY observed_at ASC,reservation_id ASC LIMIT ?");
 const single=db.prepare("SELECT reservation_id,buyer,tx_hash,observed_at,status FROM estate_late_payment_reviews WHERE reservation_id=?");
 const reservation=db.prepare("SELECT property_id,price_drops,status,created_at,expires_at,payment_tx FROM estate_sale_reservations WHERE reservation_id=?");
 const ownership=db.prepare("SELECT acct,purchase_tx FROM estate_property_ownership WHERE property_id=?");
 function detail(reservationId){
  if(typeof reservationId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(reservationId))return null;
  const record=single.get(reservationId);
  if(!record)return null;
  const r=reservation.get(reservationId);
  const owned=r?ownership.get(r.property_id):null;
  return Object.freeze({ ...record, propertyId:r?.property_id||null, priceDrops:r?.price_drops||null, reservationStatus:r?.status||null, reservationExpiresAt:r?.expires_at||null, existingOwner:owned?.acct||null, existingOwnershipTx:owned?.purchase_tx||null, manualReviewRequired:true, refundIssued:false, ownershipAssignedByReview:false });
 }
 function list({limit=25}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_review_limit');
  return pending.all(limit).map(x=>detail(x.reservation_id));
 }
 return {detail,list};
}
module.exports={createEstateLatePaymentReviewQueue};
