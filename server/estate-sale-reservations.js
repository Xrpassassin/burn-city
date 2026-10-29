'use strict';
const {PROPERTY_BY_ID,TIER_BY_ID}=require('./estate-economy');
// Reservation-only preparation. No sale activation, no payment submission.
// The server catalog fixes price; the client cannot select a cheaper amount.
function createEstateSaleReservations(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_sale_reservations (
 reservation_id TEXT PRIMARY KEY,property_id TEXT NOT NULL, buyer TEXT NOT NULL,
 price_drops INTEGER NOT NULL CHECK(price_drops>0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','expired','settled','cancelled')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL CHECK(expires_at>created_at),
 payment_tx TEXT UNIQUE
 );
 CREATE UNIQUE INDEX IF NOT EXISTS estate_one_active_reservation
 ON estate_sale_reservations(property_id) WHERE status='reserved';`);
 const find=db.prepare('SELECT * FROM estate_sale_reservations WHERE reservation_id=?');
 const expire=db.prepare("UPDATE estate_sale_reservations SET status='expired' WHERE status='reserved' AND expires_at<=?");
 const occupied=db.prepare('SELECT 1 FROM estate_property_ownership WHERE property_id=?');
 const add=db.prepare('INSERT INTO estate_sale_reservations(reservation_id,property_id,buyer,price_drops,created_at,expires_at) VALUES(?,?,?,?,?,?)');
 function reserve({reservationId,propertyId,buyer,now=Date.now(),ttlMs=600000}={}){
  if(typeof reservationId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(reservationId))throw new TypeError('invalid_reservation_id');
  if(typeof buyer!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(buyer))throw new TypeError('invalid_buyer');
  if(!Number.isSafeInteger(now)||now<1||!Number.isSafeInteger(ttlMs)||ttlMs<60000||ttlMs>900000)throw new TypeError('invalid_reservation_window');
  const property=PROPERTY_BY_ID.get(propertyId),tier=property&&TIER_BY_ID.get(property.tier);
  if(!tier||!Number.isSafeInteger(tier.price)||tier.price<=0)throw new Error('property_not_for_sale');
  const priceDrops=tier.price*1000000;
  if(!Number.isSafeInteger(priceDrops))throw new Error('invalid_catalog_price');
  db.exec('BEGIN IMMEDIATE');
  try{
   const previous=find.get(reservationId);
   if(previous){
    if(previous.property_id!==propertyId||previous.buyer!==buyer)throw new Error('reservation_id_conflict');
    db.exec('COMMIT');return previous;
   }
   expire.run(now);
   if(occupied.get(propertyId))throw new Error('property_already_owned');
   add.run(reservationId,propertyId,buyer,priceDrops,now,now+ttlMs);
   const result=find.get(reservationId);
   db.exec('COMMIT');return result;
  }catch(err){db.exec('ROLLBACK');throw err;}
 }
 return {reserve,get:id=>find.get(id)};
}
module.exports={createEstateSaleReservations};
