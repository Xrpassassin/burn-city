'use strict';
// Read-only operational inventory of expired and overdue reservation payment holds.
// Never resolves a hold, signs transactions, or changes ownership.
function createEstatePaymentHoldInspection(db){
 if(!db||typeof db.prepare!=='function')throw new TypeError('sqlite_db_required');
 const list=db.prepare(`SELECT r.reservation_id,r.property_id,r.buyer,r.status,
 r.created_at,r.expires_at,p.payload_uuid,p.created_at AS payload_created_at,
 l.tx_hash AS reviewed_tx_hash,l.observed_at AS reviewed_at
 FROM estate_sale_reservations r
 JOIN estate_xaman_payment_payloads p ON p.reservation_id=r.reservation_id
 LEFT JOIN estate_late_payment_reviews l ON l.reservation_id=r.reservation_id
 WHERE (r.status='expired' OR (r.status='reserved' AND r.expires_at<?))
 ORDER BY r.expires_at ASC,r.reservation_id ASC LIMIT ?`);
 const byProperty=db.prepare(`SELECT r.reservation_id,r.property_id,r.buyer,r.status,
 r.created_at,r.expires_at,p.payload_uuid,p.created_at AS payload_created_at,
 l.tx_hash AS reviewed_tx_hash,l.observed_at AS reviewed_at
 FROM estate_sale_reservations r
 JOIN estate_xaman_payment_payloads p ON p.reservation_id=r.reservation_id
 LEFT JOIN estate_late_payment_reviews l ON l.reservation_id=r.reservation_id
 WHERE r.property_id=? AND (r.status='expired' OR (r.status='reserved' AND r.expires_at<?))
 ORDER BY r.expires_at ASC`);
 return Object.freeze({
  list({limit=100,now=Date.now()}={}){if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new TypeError('invalid_hold_limit');if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid_hold_time');return list.all(now,limit).map(r=>Object.freeze({...r,needsManualReview:true,canAutoRelease:false}));},
  forProperty(propertyId,{now=Date.now()}={}){if(typeof propertyId!=='string'||!propertyId)throw new TypeError('property_id_required');if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid_hold_time');return byProperty.all(propertyId,now).map(r=>Object.freeze({...r,needsManualReview:true,canAutoRelease:false}));}
 });
}
module.exports={createEstatePaymentHoldInspection};
