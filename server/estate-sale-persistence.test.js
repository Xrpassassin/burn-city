'use strict';
// Simulate a process restart by closing and reopening the SQLite file.
// No network, Xaman signing, or real XRP payments.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateSaleSettlementStore}=require('./estate-sale-settlement');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'estate-persistence-'));
const filename=path.join(dir,'estates.sqlite');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const now=1700000000000,hash='C'.repeat(64);
let db;
try {
 db=new DatabaseSync(filename);
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 const reservation=createEstateSaleReservations(db).reserve({reservationId:'persistent-estate-0001',propertyId:'trailer-01',buyer,now});
 const verification={reservationId:reservation.reservation_id,propertyId:reservation.property_id,buyer,amountDrops:reservation.price_drops,txHash:hash,ledgerIndex:101,validated:true,settlementVerified:true,ownershipAssigned:false,distributable:false};
 const owned=createEstateSaleSettlementStore(db).settle({reservationId:reservation.reservation_id,verification,now:now+10000});
 assert.equal(owned.acct,buyer);
 db.close();db=null;
 db=new DatabaseSync(filename);
 const saved=db.prepare('SELECT * FROM estate_property_ownership WHERE property_id=?').get('trailer-01');
 assert.equal(saved.acct,buyer);
 assert.equal(saved.purchase_tx,hash);
 assert.equal(saved.purchase_amount_drops,3000000);
 assert.equal(db.prepare('SELECT status FROM estate_sale_reservations WHERE reservation_id=?').get(reservation.reservation_id).status,'settled');
 assert.equal(createEstateSaleReservations(db).get(reservation.reservation_id).payment_tx,hash);
 assert.throws(()=>createEstateSaleReservations(db).reserve({reservationId:'persistent-estate-0002',propertyId:'trailer-01',buyer,now:now+20000}),/property_already_owned/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);
 console.log('Estates ownership persists across database restart; duplicate sale blocked');
} finally {
 if(db)db.close();
 fs.rmSync(dir,{recursive:true,force:true});
}
