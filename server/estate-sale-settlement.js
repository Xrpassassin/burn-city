'use strict';
const {createEstateCapitalAllocation}=require('./estate-capital-allocation');
const {PROPERTY_BY_ID,TIER_BY_ID}=require('./estate-economy');
// Accept ONLY the output of the trusted server-side XRPL verifier. Caller must
// orchestrate verification; this store never trusts client-supplied payment data.
function createEstateSaleSettlementStore(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 const capital=createEstateCapitalAllocation(db);
 const reservation=db.prepare('SELECT * FROM estate_sale_reservations WHERE reservation_id=?');
 const owned=db.prepare('SELECT * FROM estate_property_ownership WHERE property_id=?');
 const byTx=db.prepare('SELECT * FROM estate_property_ownership WHERE purchase_tx=?');
 const insert=db.prepare('INSERT INTO estate_property_ownership(property_id,acct,purchase_tx,purchase_amount_drops,share_units,purchased_at) VALUES(?,?,?,?,?,?)');
 const mark=db.prepare("UPDATE estate_sale_reservations SET status='settled',payment_tx=? WHERE reservation_id=? AND status='reserved'");
 function settle({reservationId,verification,now=Date.now()}={}){
  if(typeof reservationId!=='string'||!reservationId||!verification||verification.settlementVerified!==true||verification.validated!==true||verification.ownershipAssigned!==false||verification.distributable!==false)throw new Error('trusted_payment_verification_required');
  if(!Number.isSafeInteger(now)||now<1)throw new TypeError('invalid_settlement_timestamp');
  const hash=verification.txHash;
  if(typeof hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(hash))throw new Error('invalid_verified_payment_hash');
  db.exec('BEGIN IMMEDIATE');
  try{
   const row=reservation.get(reservationId);
   if(!row)throw new Error('reservation_not_found');
   if(row.status==='settled'&&row.payment_tx===hash){
    const prior=owned.get(row.property_id);
    if(prior?.purchase_tx!==hash||prior.acct!==row.buyer)throw new Error('settlement_state_conflict');
    db.exec('COMMIT');return prior;
   }
   if(row.status!=='reserved'||now>row.expires_at)throw new Error('reservation_not_active');
   if(verification.reservationId!==row.reservation_id||verification.propertyId!==row.property_id||verification.buyer!==row.buyer||verification.amountDrops!==row.price_drops)throw new Error('payment_reservation_mismatch');
   if(!Number.isSafeInteger(verification.ledgerIndex)||verification.ledgerIndex<1)throw new Error('verified_ledger_required');
   if(owned.get(row.property_id))throw new Error('property_already_owned');
   if(byTx.get(hash))throw new Error('payment_already_used');
   const property=PROPERTY_BY_ID.get(row.property_id),tier=property&&TIER_BY_ID.get(property.tier);
   if(!tier||!Number.isSafeInteger(tier.shareUnits)||tier.shareUnits<1||tier.price*1000000!==row.price_drops)throw new Error('catalog_changed_since_reservation');
   insert.run(row.property_id,row.buyer,hash,row.price_drops,tier.shareUnits,now);
   if(mark.run(hash,reservationId).changes!==1)throw new Error('reservation_settlement_conflict');
   const result=owned.get(row.property_id);
   capital.record(result);
   db.exec('COMMIT');return result;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {settle};
}
module.exports={createEstateSaleSettlementStore};
