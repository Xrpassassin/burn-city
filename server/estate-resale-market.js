'use strict';
// Owner-to-buyer resale for DB-backed Estates ownership (estate_property_ownership stays the source of truth;
// properties are NOT treated as transferable NFTs). Resale payments go buyer -> seller directly on XRPL, so no
// treasury custody, no capital allocation, and no purchase principal is recorded as treasury capital or profit.
// No marketplace fee is charged: none is disclosed in the published Estates terms.
// Every money-moving step is behind isEnabled() (off by default) so activation stays a separate, reviewed decision.
const crypto=require('crypto');
const {PROPERTY_BY_ID}=require('./estate-economy');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
const WALLET=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH=/^[A-Fa-f0-9]{64}$/;
const MEMO_TYPE='burncity/estates-resale';
const MIN_ASK_DROPS=1000000, MAX_ASK_DROPS=100000000*1000000, RESERVATION_MS=15*60*1000, CONFIRM_GRACE_MS=10*60*1000;
function ensureSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_resale_listings(
  listing_id TEXT PRIMARY KEY, property_id TEXT NOT NULL, seller TEXT NOT NULL,
  ask_drops INTEGER NOT NULL CHECK(ask_drops>0), version INTEGER NOT NULL CHECK(version>0),
  transfer_authorization TEXT NOT NULL, authorized_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','reserved','sold','cancelled','void')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, closed_at INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS estate_resale_one_open_listing ON estate_resale_listings(property_id) WHERE status IN ('active','reserved');
 CREATE TABLE IF NOT EXISTS estate_resale_reservations(
  reservation_id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, listing_version INTEGER NOT NULL, property_id TEXT NOT NULL,
  seller TEXT NOT NULL, buyer TEXT NOT NULL, price_drops INTEGER NOT NULL CHECK(price_drops>0),
  status TEXT NOT NULL CHECK(status IN ('reserved','settled','expired','cancelled')),
  payment_tx TEXT UNIQUE, xaman_uuid TEXT UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS estate_resale_one_live_reservation ON estate_resale_reservations(listing_id) WHERE status='reserved';
 CREATE TABLE IF NOT EXISTS estate_ownership_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, property_id TEXT NOT NULL, from_acct TEXT, to_acct TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('primary','resale')), price_drops INTEGER NOT NULL CHECK(price_drops>=0),
  tx_hash TEXT NOT NULL UNIQUE, listing_id TEXT, at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS estate_ownership_history_property ON estate_ownership_history(property_id, at);`);
}
// The transfer authorization binds seller, property, listing, version and price. The seller produces it by
// approving the listing in their authenticated Xaman session; any change to price bumps the version and requires
// a fresh authorization, so a buyer can never settle against terms the seller did not approve.
function authorizationDigest({listingId,propertyId,seller,askDrops,version}){
 return crypto.createHash('sha256').update(['burncity-estate-resale-v1',listingId,propertyId,seller,String(askDrops),String(version)].join('|')).digest('hex');
}
function createEstateResaleMarket(db,{isEnabled=()=>false,now:clock=Date.now,xrplClient=null,xamanSdk=null}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 ensureSchema(db);
 const q={
  owner:db.prepare('SELECT * FROM estate_property_ownership WHERE property_id=?'),
  listing:db.prepare('SELECT * FROM estate_resale_listings WHERE listing_id=?'),
  openFor:db.prepare("SELECT * FROM estate_resale_listings WHERE property_id=? AND status IN ('active','reserved')"),
  insertListing:db.prepare("INSERT INTO estate_resale_listings(listing_id,property_id,seller,ask_drops,version,transfer_authorization,authorized_at,status,created_at,updated_at) VALUES(?,?,?,?,1,?,?,'active',?,?)"),
  reprice:db.prepare("UPDATE estate_resale_listings SET ask_drops=?,version=version+1,transfer_authorization=?,authorized_at=?,updated_at=? WHERE listing_id=? AND status='active' AND version=?"),
  close:db.prepare("UPDATE estate_resale_listings SET status=?,updated_at=?,closed_at=? WHERE listing_id=? AND status IN ('active','reserved')"),
  setStatus:db.prepare('UPDATE estate_resale_listings SET status=?,updated_at=? WHERE listing_id=? AND status=?'),
  active:db.prepare("SELECT listing_id AS listingId,property_id AS propertyId,seller,ask_drops AS askDrops,version,status,created_at AS createdAt,updated_at AS updatedAt FROM estate_resale_listings WHERE status IN ('active','reserved') ORDER BY ask_drops,property_id"),
  res:db.prepare('SELECT * FROM estate_resale_reservations WHERE reservation_id=?'),
  liveRes:db.prepare("SELECT * FROM estate_resale_reservations WHERE listing_id=? AND status='reserved'"),
  insertRes:db.prepare("INSERT INTO estate_resale_reservations(reservation_id,listing_id,listing_version,property_id,seller,buyer,price_drops,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'reserved',?,?)"),
  expireRes:db.prepare("UPDATE estate_resale_reservations SET status='expired' WHERE reservation_id=? AND status='reserved'"),
  cancelRes:db.prepare("UPDATE estate_resale_reservations SET status='cancelled' WHERE listing_id=? AND status='reserved'"),
  settleRes:db.prepare("UPDATE estate_resale_reservations SET status='settled',payment_tx=? WHERE reservation_id=? AND status='reserved'"),
  transfer:db.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=? AND acct=?'),
  primaryTx:db.prepare('SELECT 1 FROM estate_property_ownership WHERE purchase_tx=?'),
  resaleTx:db.prepare('SELECT 1 FROM estate_resale_reservations WHERE payment_tx=?'),
  histTx:db.prepare('SELECT 1 FROM estate_ownership_history WHERE tx_hash=?'),
  addHist:db.prepare('INSERT INTO estate_ownership_history(property_id,from_acct,to_acct,kind,price_drops,tx_hash,listing_id,at) VALUES(?,?,?,?,?,?,?,?)'),
  hist:db.prepare('SELECT property_id AS propertyId,from_acct AS fromAcct,to_acct AS toAcct,kind,price_drops AS priceDrops,tx_hash AS txHash,at FROM estate_ownership_history WHERE property_id=? ORDER BY at,id'),
  ownerRows:db.prepare('SELECT property_id,acct,purchase_tx,purchase_amount_drops,purchased_at FROM estate_property_ownership ORDER BY property_id')
 };
 const fail=error=>({ok:false,error});
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec(r&&r.ok===false?'ROLLBACK':'COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const validAsk=v=>Number.isSafeInteger(v)&&v>=MIN_ASK_DROPS&&v<=MAX_ASK_DROPS;
 const gate=()=>isEnabled()===true?null:fail('estate_resale_disabled');
 // Primary purchases already recorded before this module existed still form the first history entry.
 function backfillPrimary(){
  for(const r of q.ownerRows.all()) if(!q.histTx.get(r.purchase_tx)) q.addHist.run(r.property_id,null,r.acct,'primary',r.purchase_amount_drops,r.purchase_tx,null,r.purchased_at);
 }
 function expireStale(t){
  for(const l of db.prepare("SELECT listing_id FROM estate_resale_listings WHERE status='reserved'").all()){
   const r=q.liveRes.get(l.listing_id);
   if(!r||t>r.expires_at+CONFIRM_GRACE_MS){ if(r)q.expireRes.run(r.reservation_id); q.setStatus.run('active',t,l.listing_id,'reserved'); }
  }
 }
 function list({seller,propertyId,askDrops,approved}={}){
  const g=gate();if(g)return g;
  if(!WALLET.test(seller||''))return fail('sign_in_with_xaman');
  if(approved!==true)return fail('seller_transfer_authorization_required');
  if(!PROPERTY_BY_ID.has(propertyId))return fail('unknown_property');
  if(!validAsk(askDrops))return fail('invalid_ask');
  const t=clock();
  return tx(()=>{
   const o=q.owner.get(propertyId);
   if(!o||o.acct!==seller)return fail('not_property_owner');
   expireStale(t);
   if(q.openFor.get(propertyId))return fail('already_listed');
   const listingId='rl_'+crypto.randomUUID();
   const auth=authorizationDigest({listingId,propertyId,seller,askDrops,version:1});
   q.insertListing.run(listingId,propertyId,seller,askDrops,auth,t,t,t);
   return {ok:true,listing:view(q.listing.get(listingId))};
  });
 }
 function reprice({seller,listingId,askDrops,approved}={}){
  const g=gate();if(g)return g;
  if(approved!==true)return fail('seller_transfer_authorization_required');
  if(!validAsk(askDrops))return fail('invalid_ask');
  const t=clock();
  return tx(()=>{
   expireStale(t);
   const l=q.listing.get(listingId);
   if(!l||l.seller!==seller)return fail('listing_not_found');
   if(l.status!=='active')return fail(l.status==='reserved'?'listing_reserved':'listing_closed');
   const o=q.owner.get(l.property_id);if(!o||o.acct!==seller){q.close.run('void',t,t,listingId);return fail('not_property_owner');}
   const auth=authorizationDigest({listingId,propertyId:l.property_id,seller,askDrops,version:l.version+1});
   if(q.reprice.run(askDrops,auth,t,t,listingId,l.version).changes!==1)return fail('listing_changed');
   return {ok:true,listing:view(q.listing.get(listingId))};
  });
 }
 // Cancelling is always allowed for the seller, even while resale is disabled, and frees any pending reservation.
 function cancel({seller,listingId}={}){
  const t=clock();
  return tx(()=>{
   const l=q.listing.get(listingId);
   if(!l||l.seller!==seller)return fail('listing_not_found');
   if(l.status!=='active'&&l.status!=='reserved')return fail('listing_closed');
   q.cancelRes.run(listingId);q.close.run('cancelled',t,t,listingId);
   return {ok:true,listing:view(q.listing.get(listingId))};
  });
 }
 function reserve({buyer,listingId}={}){
  const g=gate();if(g)return g;
  if(!WALLET.test(buyer||''))return fail('sign_in_with_xaman');
  const t=clock();
  return tx(()=>{
   expireStale(t);
   const l=q.listing.get(listingId);
   if(!l)return fail('listing_not_found');
   if(l.seller===buyer)return fail('cannot_buy_own_listing');
   if(l.status==='reserved')return fail('listing_reserved');
   if(l.status!=='active')return fail('listing_closed');
   const o=q.owner.get(l.property_id);if(!o||o.acct!==l.seller){q.close.run('void',t,t,listingId);return fail('listing_void_owner_changed');}
   if(l.transfer_authorization!==authorizationDigest({listingId,propertyId:l.property_id,seller:l.seller,askDrops:l.ask_drops,version:l.version}))return fail('seller_transfer_authorization_invalid');
   const reservationId='rr_'+crypto.randomUUID();
   q.insertRes.run(reservationId,listingId,l.version,l.property_id,l.seller,buyer,l.ask_drops,t,t+RESERVATION_MS);
   if(q.setStatus.run('reserved',t,listingId,'active').changes!==1)throw new Error('listing_reservation_conflict');
   return {ok:true,reservation:{reservationId,listingId,propertyId:l.property_id,destination:l.seller,amountDrops:String(l.ask_drops),memoType:MEMO_TYPE,memoData:reservationId,expiresAt:t+RESERVATION_MS}};
  });
 }
 // verification must come from the trusted server-side XRPL verifier (verifyPayment below), never the client.
 function settle({reservationId,verification}={}){
  const g=gate();if(g)return g;
  if(!verification||verification.validated!==true||verification.settlementVerified!==true||!HASH.test(verification.txHash||''))return fail('trusted_payment_verification_required');
  if(!Number.isSafeInteger(verification.ledgerIndex)||verification.ledgerIndex<1)return fail('verified_ledger_required');
  const t=clock(),hash=verification.txHash.toUpperCase();
  return tx(()=>{
   const r=q.res.get(reservationId);
   if(!r)return fail('reservation_not_found');
   if(r.status==='settled'){ // idempotent retry of the same validated payment
    const o=q.owner.get(r.property_id);
    return r.payment_tx===hash&&o?.acct===r.buyer?{ok:true,replayed:true,propertyId:r.property_id,owner:r.buyer}:fail('payment_already_used');
   }
   if(r.status!=='reserved')return fail('reservation_not_active');
   if(t>r.expires_at+CONFIRM_GRACE_MS)return fail('reservation_expired');
   if(verification.reservationId!==r.reservation_id||verification.buyer!==r.buyer||verification.propertyId!==r.property_id||verification.amountDrops!==r.price_drops||verification.destination!==r.seller)return fail('payment_reservation_mismatch');
   if(q.primaryTx.get(hash)||q.resaleTx.get(hash)||q.histTx.get(hash))return fail('payment_already_used');
   const l=q.listing.get(r.listing_id);
   if(!l||l.status!=='reserved'||l.version!==r.listing_version||l.ask_drops!==r.price_drops)return fail('listing_changed');
   if(l.transfer_authorization!==authorizationDigest({listingId:l.listing_id,propertyId:l.property_id,seller:l.seller,askDrops:l.ask_drops,version:l.version}))return fail('seller_transfer_authorization_invalid');
   // atomic transfer: only moves if the seller still owns it (prevents double-sell / stale listings)
   if(q.transfer.run(r.buyer,r.property_id,r.seller).changes!==1)return fail('seller_no_longer_owner');
   if(q.settleRes.run(hash,reservationId).changes!==1)throw new Error('reservation_settlement_conflict');
   q.close.run('sold',t,t,l.listing_id);
   q.addHist.run(r.property_id,r.seller,r.buyer,'resale',r.price_drops,hash,l.listing_id,t);
   return {ok:true,propertyId:r.property_id,owner:r.buyer,previousOwner:r.seller,txHash:hash};
  });
 }
 async function verifyPayment({reservationId,txHash}={}){
  if(!xrplClient)throw new Error('xrpl_client_unavailable');
  const r=q.res.get(reservationId);if(!r)throw new Error('reservation_not_found');
  const v=await verifyEstateSalePayment(xrplClient,r,{txHash,treasury:r.seller,memoType:MEMO_TYPE,now:Math.min(clock(),r.expires_at)});   // payment time itself must fall inside the window (checked by the verifier)
  return {...v,destination:r.seller};
 }
 // Xaman request is created server-side and bound to the reservation; the browser never supplies a tx hash.
 async function startPayment({buyer,reservationId}={}){
  const g=gate();if(g)return g;
  if(!xamanSdk?.payload?.create)return fail('xaman_unavailable');
  const r=q.res.get(reservationId);if(!r||r.buyer!==buyer)return fail('reservation_not_found');
  if(r.status!=='reserved'||clock()>r.expires_at)return fail('reservation_not_active');
  const payload=await xamanSdk.payload.create({txjson:{TransactionType:'Payment',Account:r.buyer,Destination:r.seller,Amount:String(r.price_drops),
   Memos:[{Memo:{MemoType:Buffer.from(MEMO_TYPE,'utf8').toString('hex').toUpperCase(),MemoData:Buffer.from(r.reservation_id,'utf8').toString('hex').toUpperCase()}}]},
   options:{submit:true,expire:10},custom_meta:{identifier:r.reservation_id,instruction:'BURN City Estates resale: you pay the current owner directly. Confirm the XRP amount and destination in Xaman.'}});
  if(!payload?.uuid||!payload?.next?.always)return fail('xaman_payload_incomplete');
  if(db.prepare("UPDATE estate_resale_reservations SET xaman_uuid=? WHERE reservation_id=? AND status='reserved' AND xaman_uuid IS NULL").run(payload.uuid,reservationId).changes!==1)return fail('payment_already_started');
  return {ok:true,uuid:payload.uuid,qr:payload.refs?.qr_png||null,deeplink:payload.next.always,reservationId};
 }
 async function confirm({buyer,reservationId}={}){
  const g=gate();if(g)return g;
  const r=q.res.get(reservationId);if(!r||r.buyer!==buyer)return fail('reservation_not_found');
  if(!r.xaman_uuid||!xamanSdk?.payload?.get)return fail('payment_not_started');
  const p=await xamanSdk.payload.get(r.xaman_uuid);
  if(p?.meta?.signed!==true||p?.response?.account!==buyer||!HASH.test(p?.response?.txid||''))return {ok:false,pending:true,error:'awaiting_xaman_signature'};
  const txHash=p.response.txid.toUpperCase();
  let verification;try{verification=await verifyPayment({reservationId,txHash});}catch(e){return {ok:false,pending:/not_validated/.test(e.message),error:e.message};}
  return settle({reservationId,verification});
 }
 function view(l){return l&&{listingId:l.listing_id,propertyId:l.property_id,seller:l.seller,askDrops:String(l.ask_drops),version:l.version,status:l.status,createdAt:l.created_at,updatedAt:l.updated_at};}
 function listings(){expireStaleSafe();return q.active.all().map(l=>({...l,askDrops:String(l.askDrops)}));}
 function expireStaleSafe(){try{tx(()=>{expireStale(clock());return {ok:true};});}catch{}}
 function history(propertyId){try{tx(()=>{backfillPrimary();return {ok:true};});}catch{}return q.hist.all(String(propertyId||'')).map(h=>({...h,priceDrops:String(h.priceDrops)}));}
 function status(){return {resaleEnabled:isEnabled()===true,marketplaceFeeDrops:'0',feeDisclosure:'No marketplace fee. XRPL network fees apply.',settlement:'buyer_pays_seller_directly'};}
 tx(()=>{backfillPrimary();return {ok:true};});
 return {list,reprice,cancel,reserve,startPayment,settle,confirm,verifyPayment,listings,history,status,recordPrimary:(row)=>{if(!q.histTx.get(row.purchase_tx))q.addHist.run(row.property_id,null,row.acct,'primary',row.purchase_amount_drops,row.purchase_tx,null,row.purchased_at);}};
}
module.exports={createEstateResaleMarket,authorizationDigest,MEMO_TYPE,RESERVATION_MS,CONFIRM_GRACE_MS};
