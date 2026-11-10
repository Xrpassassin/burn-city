'use strict';
// Late confirmation: a payment validated inside the reservation window settles even
// when the buyer's confirm call arrives after expiry. Everything else still refuses.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateXamanPayloadStore}=require('./estate-sale-xaman-payload-store');
const {createEstateSaleFinalization}=require('./estate-sale-finalization');
const {createEstateLatePaymentReconciliation}=require('./estate-sale-late-reconciliation');
const {createEstateLatePaymentReviewQueue}=require('./estate-sale-late-review-queue');
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
const buyer='rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST',stranger='rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const T0=1794296220910,TTL=600000,hex=s=>Buffer.from(s).toString('hex').toUpperCase();
const reservations=createEstateSaleReservations(db),payloads=createEstateXamanPayloadStore(db);
const txs=new Map(),signedBy=new Map();
const sdk={payload:{create:async()=>{throw Error('should_not_create')},get:async uuid=>({meta:{signed:signedBy.has(uuid)},response:{account:buyer,txid:signedBy.get(uuid)}})}};
const client={request:async({transaction})=>{const t=txs.get(transaction.toUpperCase());if(!t){const e=Error('txnNotFound');e.data={error:'txnNotFound'};throw e;}return {result:structuredClone(t)};}};
let n=0;
function setup(propertyId,{at=T0,payAt=at+40000,override={},hash}={}){
 n++;const reservationId='estate_late_test_'+String(n).padStart(8,'0');
 const r=reservations.reserve({reservationId,propertyId,buyer,now:at,ttlMs:TTL});
 const uuid='uuid-'+n;payloads.bind({reservationId,uuid,buyer,now:at+1000});
 const h=hash||String(n).padStart(2,'0').repeat(32);
 const body={hash:h,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:String(r.price_drops),Memos:[{Memo:{MemoType:hex('burncity/estates'),MemoData:hex(reservationId)}}],date:Math.floor(payAt/1000)-946684800,...override};
 txs.set(h,{validated:true,ledger_index:100+n,tx_json:body,meta:{TransactionResult:'tesSUCCESS',delivered_amount:override.Amount||String(r.price_drops)}});
 signedBy.set(uuid,h);
 return {reservationId,hash:h,r};
}
const finalizer=createEstateSaleFinalization(db,{sdk,client,treasury,enabled:true});
const late=createEstateLatePaymentReconciliation(db,{sdk,client,treasury,enabled:true});
const queue=createEstateLatePaymentReviewQueue(db);
const owner=p=>db.prepare('SELECT * FROM estate_property_ownership WHERE property_id=?').get(p);
const status=id=>db.prepare('SELECT status,payment_tx FROM estate_sale_reservations WHERE reservation_id=?').get(id);
(async()=>{
 // 1. In-window payment confirmed after expiry (row still 'reserved') settles.
 const a=setup('starter-01');
 const afterExpiry=T0+TTL+60000;
 const settled=await finalizer.finalize({reservationId:a.reservationId,buyer,now:afterExpiry});
 assert.equal(settled.ok,true);assert.equal(settled.status,'settled');assert.equal(settled.lateConfirmed,true);assert.equal(settled.ownershipAssigned,true);
 assert.equal(owner('starter-01').acct,buyer);assert.equal(owner('starter-01').purchase_tx,a.hash);assert.equal(owner('starter-01').share_units,25);
 assert.deepEqual({...status(a.reservationId)},{status:'settled',payment_tx:a.hash});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_capital_allocations WHERE property_id=?').get('starter-01').n,1);
 // 5. Double confirm is idempotent.
 const again=await finalizer.finalize({reservationId:a.reservationId,buyer,now:afterExpiry+5000});
 assert.equal(again.ok,true);assert.equal(again.status,'already_settled');assert.equal(again.txHash,a.hash);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_capital_allocations').get().n,1);

 // 1b. Row already marked 'expired' (another reservation swept it) with a late review recorded for the same payment.
 const b=setup('trailer-01',{at:T0+1000000});
 reservations.reserve({reservationId:'estate_late_sweeper_0001',propertyId:'trailer-02',buyer:stranger,now:T0+1000000+TTL+1});
 assert.equal(status(b.reservationId).status,'expired');
 const review=await late.inspect({reservationId:b.reservationId,buyer,now:T0+1000000+TTL+2000});
 assert.equal(review.status,'needs_review');assert.equal(review.txHash,b.hash);
 assert.equal(queue.list().length,1);
 // Another buyer cannot reserve the property while the payment is unresolved.
 assert.throws(()=>reservations.reserve({reservationId:'estate_late_other_0001',propertyId:'trailer-01',buyer:stranger,now:T0+1000000+TTL+3000}),/property_pending_payment_review/);
 const bs=await finalizer.finalize({reservationId:b.reservationId,buyer,now:T0+1000000+TTL+4000});
 assert.equal(bs.ok,true);assert.equal(bs.lateConfirmed,true);assert.equal(owner('trailer-01').acct,buyer);
 assert.equal(queue.list().length,0,'late review resolved by settlement');
 const d=queue.detail(b.reservationId);assert.equal(d.resolvedBySettlement,true);assert.equal(d.manualReviewRequired,false);
 assert.equal((await late.inspect({reservationId:b.reservationId,buyer,now:T0+1000000+TTL+5000})).status,'already_settled');

 // 2. Payment closed outside the reservation window is refused.
 const c=setup('trailer-03',{at:T0+2000000,payAt:T0+2000000+TTL+30000});
 assert.deepEqual(await finalizer.finalize({reservationId:c.reservationId,buyer,now:T0+2000000+TTL+60000}),{ok:false,error:'payment_outside_reservation_window'});
 assert.equal(owner('trailer-03'),undefined);
 // Early (pre-reservation) payment is refused too.
 const c2=setup('trailer-04',{at:T0+2100000,payAt:T0+2100000-60000});
 assert.equal((await finalizer.finalize({reservationId:c2.reservationId,buyer,now:T0+2100000+TTL+60000})).error,'payment_outside_reservation_window');

 // 3. Wrong sender / destination / amount / memo / partial payment / routing are refused.
 const cases=[
  ['apartment-01',{Account:stranger},'payment_sender_or_destination_mismatch'],
  ['apartment-02',{Destination:stranger},'payment_sender_or_destination_mismatch'],
  ['family-01',{Amount:'1'},'payment_amount_mismatch'],
  ['family-02',{Memos:[{Memo:{MemoType:hex('burncity/estates'),MemoData:hex('estate_someone_else_000001')}}]},'payment_reservation_memo_mismatch'],
  ['mansion-01',{Flags:0x00020000},'partial_payment_not_allowed'],
  ['mansion-02',{DestinationTag:7},'unexpected_payment_routing'],
 ];
 let at=T0+3000000;
 for(const [pid,override,error] of cases){
  at+=1000000;const x=setup(pid,{at,override});
  assert.deepEqual(await finalizer.finalize({reservationId:x.reservationId,buyer,now:at+TTL+60000}),{ok:false,error},pid);
  assert.equal(owner(pid),undefined,pid);
 }
 // Unvalidated / failed ledger results stay pending-or-refused, never settle.
 at+=1000000;const u=setup('starter-02',{at});txs.get(u.hash).meta.TransactionResult='tecUNFUNDED_PAYMENT';
 await assert.rejects(finalizer.finalize({reservationId:u.reservationId,buyer,now:at+TTL+60000}),/payment_not_validated_success/);
 assert.equal(owner('starter-02'),undefined);

 // 4. Property already owned is refused.
 at+=1000000;const o=setup('apartment-03',{at});
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('apartment-03',stranger,'F'.repeat(64),3000000,1,at+1);
 assert.deepEqual(await finalizer.finalize({reservationId:o.reservationId,buyer,now:at+TTL+60000}),{ok:false,error:'property_already_owned'});
 assert.equal(owner('apartment-03').acct,stranger);

 // Tx hash already used for another ownership is refused.
 at+=1000000;const reuse=setup('starter-03',{at,hash:'D'.repeat(64)});
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-07',stranger,reuse.hash,3000000,1,at+1);
 assert.deepEqual(await finalizer.finalize({reservationId:reuse.reservationId,buyer,now:at+TTL+60000}),{ok:false,error:'payment_already_used'});
 assert.equal(owner('starter-03'),undefined);

 // A late review recorded for a different payment blocks settlement.
 at+=1000000;const mm=setup('family-03',{at});
 db.prepare("INSERT INTO estate_late_payment_reviews(reservation_id,buyer,tx_hash,observed_at) VALUES(?,?,?,?)").run(mm.reservationId,buyer,'E'.repeat(64),at+TTL+1);
 assert.deepEqual(await finalizer.finalize({reservationId:mm.reservationId,buyer,now:at+TTL+60000}),{ok:false,error:'late_review_payment_mismatch'});
 assert.equal(owner('family-03'),undefined);

 // Cancelled reservations and other buyers are refused; unsigned late payloads report inactive.
 at+=1000000;const k=setup('family-04',{at});db.prepare("UPDATE estate_sale_reservations SET status='cancelled' WHERE reservation_id=?").run(k.reservationId);
 assert.deepEqual(await finalizer.finalize({reservationId:k.reservationId,buyer,now:at+TTL+60000}),{ok:false,error:'reservation_not_active'});
 at+=1000000;const s=setup('mansion-03',{at});signedBy.delete('uuid-'+n);
 assert.deepEqual(await finalizer.finalize({reservationId:s.reservationId,buyer,now:at+TTL+60000}),{ok:false,error:'reservation_not_active'});
 assert.deepEqual(await finalizer.finalize({reservationId:s.reservationId,buyer:stranger,now:at+TTL+60000}),{ok:false,error:'reservation_not_found'});

 // In-window confirmation is unchanged (no lateConfirmed flag).
 at+=1000000;const w=setup('cabin-01',{at});
 const ws=await finalizer.finalize({reservationId:w.reservationId,buyer,now:at+50000});
 assert.equal(ws.status,'settled');assert.equal(ws.lateConfirmed,undefined);
 console.log('Estate late-confirm settlement tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
