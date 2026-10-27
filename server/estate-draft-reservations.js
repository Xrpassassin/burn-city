'use strict';
// Draft reservation engine. Uses SQLite BEGIN IMMEDIATE to serialize competing writers.
// Does not authorize payments or grant ownership.
const {CATALOG}=require('./estate-economy');
const tiers=new Map(CATALOG.tiers.map(t=>[t.id,t]));
const properties=new Map(CATALOG.properties.map(p=>[p.id,p]));
function createEstateReservations(db,{now=()=>Date.now()}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_draft_reservations (
 id TEXT PRIMARY KEY, property_id TEXT NOT NULL, wallet TEXT NOT NULL,
 tier TEXT NOT NULL, price_drops INTEGER NOT NULL CHECK(price_drops>0),
 expires_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('reserved','expired','cancelled')),
 created_at INTEGER NOT NULL
 ); CREATE INDEX IF NOT EXISTS idx_estate_draft_wallet_tier ON estate_draft_reservations(wallet,tier,status,expires_at);
 CREATE INDEX IF NOT EXISTS idx_estate_draft_property ON estate_draft_reservations(property_id,status,expires_at);`);
 const cap=5;
 function reserve({wallet,propertyId,intentId,ttlMs=300000}){
  if(!wallet||typeof wallet!=='string'||!propertyId||typeof propertyId!=='string'||!intentId||typeof intentId!=='string'||intentId.length>128)throw new TypeError('invalid_reservation_input');
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>600000)throw new TypeError('invalid_ttl');
  const p=properties.get(propertyId);if(!p)return {ok:false,reason:'unknown_property'};
  const tier=tiers.get(p.tier);if(!tier||!Number.isSafeInteger(tier.price)||tier.price<=0)throw new Error('invalid_tier_price');
  const timestamp=now();if(!Number.isSafeInteger(timestamp))throw new TypeError('invalid_clock');
  db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare("UPDATE estate_draft_reservations SET status='expired' WHERE status='reserved' AND expires_at<=?").run(timestamp);
   const existing=db.prepare('SELECT id FROM estate_draft_reservations WHERE property_id=? AND status=? AND expires_at>?').get(propertyId,'reserved',timestamp);
   const owned=db.prepare('SELECT owner_acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
   if(existing||owned){db.exec('COMMIT');return {ok:false,reason:'unavailable'};}
   const ownedTier=db.prepare('SELECT COUNT(*) AS n FROM estate_property_ownership WHERE owner_acct=? AND property_id IN ('+CATALOG.properties.filter(x=>x.tier===p.tier).map(()=>'?').join(',')+')').get(wallet,...CATALOG.properties.filter(x=>x.tier===p.tier).map(x=>x.id)).n;
   const reserved=db.prepare("SELECT COUNT(*) AS n FROM estate_draft_reservations WHERE wallet=? AND tier=? AND status='reserved' AND expires_at>?").get(wallet,p.tier,timestamp).n;
   if(ownedTier+reserved>=cap){db.exec('COMMIT');return {ok:false,reason:'tier_cap'};}
   const priceDrops=tier.price*1000000;
   db.prepare('INSERT INTO estate_draft_reservations(id,property_id,wallet,tier,price_drops,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(intentId,propertyId,wallet,p.tier,priceDrops,timestamp+ttlMs,'reserved',timestamp);
   db.exec('COMMIT');
   return {ok:true,intentId,propertyId,tier:p.tier,priceDrops,expiresAt:timestamp+ttlMs,status:'draft_unpaid'};
  }catch(err){db.exec('ROLLBACK');throw err;}
 }
 function cancel({wallet,intentId}){
  if(!wallet||!intentId)throw new TypeError('invalid_cancel_input');
  return db.prepare("UPDATE estate_draft_reservations SET status='cancelled' WHERE id=? AND wallet=? AND status='reserved'").run(intentId,wallet).changes===1;
 }
 return {reserve,cancel};
}
module.exports={createEstateReservations};
