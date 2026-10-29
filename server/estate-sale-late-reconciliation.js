'use strict';
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateXamanPayloadStore}=require('./estate-sale-xaman-payload-store');
const {createEstateXamanPaymentAdapter}=require('./estate-sale-xaman');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
// Exception registry only: never settle ownership, distribute funds or issue refunds.
// Records a validated XRP payment that could not safely settle after the reservation deadline.
function createEstateLatePaymentReconciliation(db,{sdk,client,treasury,enabled=false}={}){
 const reservations=createEstateSaleReservations(db);
 const payloads=createEstateXamanPayloadStore(db);
 db.exec(`CREATE TABLE IF NOT EXISTS estate_late_payment_reviews (
  reservation_id TEXT PRIMARY KEY,
  buyer TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  observed_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_review' CHECK(status='needs_review')
 )`);
 const adapter=enabled?createEstateXamanPaymentAdapter({sdk,treasury}):null;
 const find=db.prepare('SELECT * FROM estate_late_payment_reviews WHERE reservation_id=?');
 const insert=db.prepare("INSERT OR IGNORE INTO estate_late_payment_reviews(reservation_id,buyer,tx_hash,observed_at) VALUES(?,?,?,?)");
 async function inspect({reservationId,buyer,now=Date.now()}={}){
  if(!enabled)return {ok:false,error:'estate_sales_disabled'};
  const r=reservations.get(reservationId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'reservation_not_found'};
  if(r.status==='settled')return {ok:true,status:'already_settled',txHash:r.payment_tx};
  if(now<=r.expires_at)return {ok:false,error:'reservation_not_expired'};
  const existing=find.get(reservationId);
  if(existing)return {ok:true,status:'needs_review',txHash:existing.tx_hash,ownershipAssigned:false};
  const binding=payloads.get(reservationId);
  if(!binding||binding.buyer!==buyer)return {ok:false,error:'payment_payload_not_found'};
  const hash=await adapter.signedTransactionHash(binding.payload_uuid,buyer);
  if(!hash)return {ok:false,error:'no_submitted_payment'};
  // Validate full transaction evidence against the original reservation, including
  // the XRPL close timestamp, even though processing occurs after expiry.
  const evidence=await verifyEstateSalePayment(client,r,{txHash:hash,treasury,now:r.expires_at});
  if(!evidence.validated)return {ok:false,error:'payment_unverified'};
  insert.run(reservationId,buyer,hash,now);
  const saved=find.get(reservationId);
  if(!saved||saved.tx_hash!==hash||saved.buyer!==buyer)throw new Error('late_payment_review_conflict');
  return {ok:true,status:'needs_review',txHash:hash,ownershipAssigned:false,refundIssued:false};
 }
 return {inspect,get:reservationId=>find.get(reservationId)};
}
module.exports={createEstateLatePaymentReconciliation};
