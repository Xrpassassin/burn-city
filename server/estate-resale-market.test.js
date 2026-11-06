'use strict';
const assert=require('assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateResaleMarket,MEMO_TYPE,RESERVATION_MS,CONFIRM_GRACE_MS}=require('./estate-resale-market');
const A='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',B='rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',C='rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const H=n=>String(n).repeat(64).slice(0,64).toUpperCase();
function setup({enabled=true}={}){
 const db=new DatabaseSync(':memory:');let t=1_700_000_000_000;let on=enabled;
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',A,H('a'),3000000,1,t-1000);
 const m=createEstateResaleMarket(db,{isEnabled:()=>on,now:()=>t});
 return {db,m,adv:ms=>{t+=ms},set:v=>{on=v},owner:()=>db.prepare('SELECT acct,purchase_tx FROM estate_property_ownership WHERE property_id=?').get('trailer-01')};
}
const ver=(r,extra={})=>({reservationId:r.reservationId,propertyId:r.propertyId,buyer:extra.buyer||B,destination:r.destination,amountDrops:Number(r.amountDrops),txHash:extra.tx||H('b'),ledgerIndex:99,validated:true,settlementVerified:true,...extra.over});
// disabled by default: no listing, no reservation, no settlement
{const {m}=setup({enabled:false});assert.equal(m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).error,'estate_resale_disabled');assert.equal(m.status().resaleEnabled,false);assert.equal(m.status().marketplaceFeeDrops,'0');}
// history backfills preserved primary purchase record
{const {m}=setup();const h=m.history('trailer-01');assert.equal(h.length,1);assert.equal(h[0].kind,'primary');assert.equal(h[0].toAcct,A);}
// only owner can list; explicit seller authorization required; one open listing per property
{const {m}=setup();
 assert.equal(m.list({seller:B,propertyId:'trailer-01',askDrops:5e6,approved:true}).error,'not_property_owner');
 assert.equal(m.list({seller:A,propertyId:'trailer-01',askDrops:5e6}).error,'seller_transfer_authorization_required');
 assert.equal(m.list({seller:A,propertyId:'trailer-01',askDrops:10,approved:true}).error,'invalid_ask');
 const l=m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true});assert.ok(l.ok);
 assert.equal(m.list({seller:A,propertyId:'trailer-01',askDrops:6e6,approved:true}).error,'already_listed');
 const r2=m.reprice({seller:A,listingId:l.listing.listingId,askDrops:7e6,approved:true});assert.equal(r2.listing.version,2);assert.equal(r2.listing.askDrops,'7000000');
 assert.equal(m.reprice({seller:B,listingId:l.listing.listingId,askDrops:8e6,approved:true}).error,'listing_not_found');
 assert.equal(m.listings().length,1);
 assert.ok(m.cancel({seller:A,listingId:l.listing.listingId}).ok);assert.equal(m.listings().length,0);
}
// full resale + replay + double-sell
{const {m,owner,db}=setup();
 const l=m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).listing;
 assert.equal(m.reserve({buyer:A,listingId:l.listingId}).error,'cannot_buy_own_listing');
 const r=m.reserve({buyer:B,listingId:l.listingId}).reservation;assert.equal(r.destination,A);assert.equal(r.memoType,MEMO_TYPE);
 assert.equal(m.reserve({buyer:C,listingId:l.listingId}).error,'listing_reserved','simultaneous buyer blocked');
 assert.equal(m.reprice({seller:A,listingId:l.listingId,askDrops:9e6,approved:true}).error,'listing_reserved','seller cannot change price under a buyer');
 assert.equal(m.settle({reservationId:r.reservationId,verification:{...ver(r),validated:false}}).error,'trusted_payment_verification_required');
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r,{over:{amountDrops:1}})}).error,'payment_reservation_mismatch');
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r,{over:{destination:C}})}).error,'payment_reservation_mismatch');
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r,{tx:H('a')})}).error,'payment_already_used','primary purchase tx cannot be replayed');
 const s=m.settle({reservationId:r.reservationId,verification:ver(r)});assert.ok(s.ok);assert.equal(owner().acct,B);assert.equal(owner().purchase_tx,H('a'),'original purchase record preserved');
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r)}).replayed,true,'idempotent retry');
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r,{tx:H('c')})}).error,'payment_already_used');
 assert.equal(m.reserve({buyer:C,listingId:l.listingId}).error,'listing_closed','sold listing cannot be sold twice');
 assert.equal(m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).error,'not_property_owner','previous owner cannot relist');
 // new owner relists; old tx hash cannot settle a new reservation
 const l2=m.list({seller:B,propertyId:'trailer-01',askDrops:6e6,approved:true}).listing;const r2=m.reserve({buyer:C,listingId:l2.listingId}).reservation;
 assert.equal(m.settle({reservationId:r2.reservationId,verification:ver(r2,{buyer:C,tx:H('b')})}).error,'payment_already_used','resale payment replay blocked');
 assert.ok(m.settle({reservationId:r2.reservationId,verification:ver(r2,{buyer:C,tx:H('d')})}).ok);
 assert.deepEqual(m.history('trailer-01').map(h=>[h.kind,h.toAcct]),[['primary',A],['resale',B],['resale',C]]);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='estate_capital_allocations'").get().n,0,'resale never touches treasury capital');
}
// stale listing after owner change is voided; expired reservation frees listing
{const {m,db,adv}=setup();
 const l=m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).listing;
 const r=m.reserve({buyer:B,listingId:l.listingId}).reservation;
 adv(RESERVATION_MS+CONFIRM_GRACE_MS+1);
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r)}).error,'reservation_expired');
 assert.equal(m.listings()[0].status,'active');
 db.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=?').run(C,'trailer-01');
 assert.equal(m.reserve({buyer:B,listingId:l.listingId}).error,'listing_void_owner_changed');
}
// settle refuses if the seller lost ownership between reserve and settle
{const {m,db}=setup();
 const l=m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).listing;const r=m.reserve({buyer:B,listingId:l.listingId}).reservation;
 db.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=?').run(C,'trailer-01');
 assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r)}).error,'seller_no_longer_owner');
 assert.equal(db.prepare('SELECT acct FROM estate_property_ownership').get().acct,C);
}
// disabling mid-flight blocks settlement but seller can still cancel
{const {m,set}=setup();const l=m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).listing;const r=m.reserve({buyer:B,listingId:l.listingId}).reservation;
 set(false);assert.equal(m.settle({reservationId:r.reservationId,verification:ver(r)}).error,'estate_resale_disabled');assert.ok(m.cancel({seller:A,listingId:l.listingId}).ok);}
console.log('estate resale market tests passed');
// Xaman flow: server-bound payload, verifier on ledger, no client-supplied hash
(async()=>{
 const db=new DatabaseSync(':memory:');let t=Date.parse('2026-11-06T10:00:00Z');
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',A,H('a'),3000000,1,t-1000);
 let created;const sdk={payload:{create:async p=>{created=p;return {uuid:'u-1',refs:{qr_png:'q'},next:{always:'x'}}},get:async()=>({meta:{signed:true},response:{account:B,txid:H('e')}})}};
 const memo=s=>Buffer.from(s).toString('hex').toUpperCase();
 const client={request:async()=>({result:{validated:true,hash:H('e'),ledger_index:5,date:Math.floor((t+1000)/1000)-946684800,meta:{TransactionResult:'tesSUCCESS',delivered_amount:'5000000'},tx_json:{TransactionType:'Payment',hash:H('e'),Account:B,Destination:A,Amount:'5000000',Memos:[{Memo:{MemoType:memo(MEMO_TYPE),MemoData:memo(rid)}}]}}})};
 const m=createEstateResaleMarket(db,{isEnabled:()=>true,now:()=>t,xrplClient:client,xamanSdk:sdk});
 const l=m.list({seller:A,propertyId:'trailer-01',askDrops:5e6,approved:true}).listing;
 const rid=m.reserve({buyer:B,listingId:l.listingId}).reservation.reservationId;
 assert.equal((await m.confirm({buyer:B,reservationId:rid})).error,'payment_not_started');
 assert.ok((await m.startPayment({buyer:B,reservationId:rid})).ok);
 assert.equal(created.txjson.Destination,A);assert.equal(created.txjson.Amount,'5000000');
 assert.equal((await m.startPayment({buyer:B,reservationId:rid})).error,'payment_already_started');
 const c=await m.confirm({buyer:B,reservationId:rid});assert.ok(c.ok,JSON.stringify(c));
 assert.equal(db.prepare('SELECT acct FROM estate_property_ownership').get().acct,B);
 console.log('estate resale xaman flow tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
