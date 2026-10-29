'use strict';
// Durable Xaman payload identity binding for an existing trusted reservation.
// No payment or ownership mutation; never treat payload signature as settlement.
function createEstateXamanPayloadStore(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_xaman_payment_payloads(
 reservation_id TEXT PRIMARY KEY,
 payload_uuid TEXT NOT NULL UNIQUE,
 buyer TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 FOREIGN KEY(reservation_id) REFERENCES estate_sale_reservations(reservation_id)
 );`);
 const reservation=db.prepare('SELECT * FROM estate_sale_reservations WHERE reservation_id=?');
 const existing=db.prepare('SELECT * FROM estate_xaman_payment_payloads WHERE reservation_id=?');
 const insert=db.prepare('INSERT INTO estate_xaman_payment_payloads(reservation_id,payload_uuid,buyer,created_at) VALUES(?,?,?,?)');
 function bind({reservationId,uuid,buyer,now=Date.now()}={}){
  if(typeof reservationId!=='string'||!reservationId||typeof uuid!=='string'||!uuid||uuid.length>128||typeof buyer!=='string'||!buyer||!Number.isSafeInteger(now)||now<1)throw new TypeError('invalid_payload_binding');
  db.exec('BEGIN IMMEDIATE');
  try{
   const r=reservation.get(reservationId);
   if(!r||r.buyer!==buyer||r.status!=='reserved'||now>r.expires_at)throw new Error('reservation_not_eligible_for_payload');
   const prior=existing.get(reservationId);
   if(prior){
    if(prior.payload_uuid!==uuid||prior.buyer!==buyer)throw new Error('payload_binding_conflict');
    db.exec('COMMIT');return prior;
   }
   insert.run(reservationId,uuid,buyer,now);
   const result=existing.get(reservationId);
   db.exec('COMMIT');return result;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {bind,get:reservationId=>existing.get(reservationId)};
}
module.exports={createEstateXamanPayloadStore};
