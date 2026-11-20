'use strict';
// Multi-upgrade cart (t442u): several upgrades for one property, ONE order, ONE Xaman Payment of the
// exact server-priced sum (memo burncity/estates/tycoon + 40-char identifier). Only a validated
// tesSUCCESS with the exact delivered_amount awards — every item at once, shares = total/3 — and
// replays, short payments, stale carts and races award nothing. The single-item flow is unchanged.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {cartKey,orderItems,ITEM_BY_ID}=require('./estate-tycoon');
const {createEstateTycoonRuntime}=require('./estate-tycoon-runtime');
const {createEstateHangarLogbook}=require('./estate-hangar-logbook');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',other='rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST',treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const config={DRY_RUN:false,NETWORK:'mainnet',XUMM_KEY:'t',XUMM_SECRET:'t',ESTATE_TREASURY:treasury};
const UUID='1289e9ae-7d5d-4d5f-b89c-18633112ce09';
// Canonical keys: catalogue order, de-duplicated input rejected, unknown ids rejected.
assert.equal(cartKey(['fire-pit']),'fire-pit');
assert.equal(cartKey(['garden-pond','porch-lights','flower-garden']),'cart:porch-lights+flower-garden+garden-pond');
assert.throws(()=>cartKey(['porch-lights','porch-lights']),/invalid_upgrade_cart/);
assert.throws(()=>cartKey([]),/invalid_upgrade_cart/);
assert.throws(()=>cartKey(['porch-lights','nope']),/unknown_upgrade_item/);
assert.throws(()=>orderItems('cart:flower-garden+porch-lights'),/invalid_upgrade_cart/,'non-canonical key');
assert.throws(()=>orderItems('cart:porch-lights'),/invalid_upgrade_cart/,'a cart has 2+ items');
function db0(){const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,1);
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('family-01',buyer,'C'.repeat(64),150000000,50,1);
 return db;}
(async()=>{
 const db=db0();let now=1800000000000,tx,body,createdAt=now,signed=false,hash='A'.repeat(64),validated=true,creates=0,mutate=()=>{};
 const sdk={payload:{create:async p=>{creates++;body=p;tx=p.txjson;createdAt=now;const u=UUID.slice(0,-2)+String(creates).padStart(2,'0');return {uuid:u,next:{always:'https://xumm.app/sign/'+u}};},
  get:async()=>({meta:{signed},response:{account:buyer,txid:hash},next:{always:'https://xumm.app/sign/'+UUID}})}};
 const pay={sdk:()=>sdk,ledger:async()=>({request:async()=>{const result={validated,hash,ledger_index:200,
  tx_json:{...tx,hash,date:Math.floor(createdAt/1000)-946684800},meta:{TransactionResult:'tesSUCCESS',delivered_amount:tx.Amount}};mutate(result);return {result};}})};
 const kicks=[];const tick=()=>new Promise(r=>setImmediate(r));
 const rt=createEstateTycoonRuntime({db,pay,config,env:{ESTATE_TYCOON_UPGRADES_ENABLED:'1'},paused:()=>false,clock:()=>now,onSettled:x=>kicks.push(x)});
 // Quote: prerequisites may come from the same cart; total and shares are exact sums.
 const cart=['garden-pond','flower-garden','fire-pit'];
 const q=rt.quote({propertyId:'trailer-01',itemIds:cart,buyer});
 assert(q.ok&&q.canPurchase&&q.cart,JSON.stringify(q));
 assert.equal(q.itemId,'cart:flower-garden+fire-pit+garden-pond');assert.equal(q.item.priceDrops,18000000);assert.equal(q.item.shareUnitsDelta,6);
 assert.equal(q.projectedShareUnits,1+6);
 assert.equal(rt.quote({propertyId:'trailer-01',itemIds:['garden-pond','fire-pit'],buyer}).canPurchase,false,'missing prerequisite outside the cart');
 assert.deepEqual(rt.quote({propertyId:'trailer-01',itemIds:['garden-pond','fire-pit'],buyer}).missingPrerequisites,['flower-garden']);
 assert.equal(rt.quote({propertyId:'trailer-01',itemIds:['porch-lights','estate-helicopter'],buyer}).canPurchase,false,'tier rule applies per item');
 assert.equal(rt.quote({propertyId:'trailer-01',itemIds:['porch-lights','porch-lights'],buyer}).error,'invalid_upgrade_cart');
 assert.equal((await rt.start({propertyId:'trailer-01',itemIds:['porch-lights','x'],buyer})).error,'unknown_upgrade_item');
 assert.equal((await rt.start({propertyId:'trailer-01',itemIds:['garden-pond','fire-pit'],buyer})).error,'upgrade_prerequisites_missing');
 assert.equal((await rt.start({propertyId:'trailer-01',itemIds:cart,buyer:other})).error,'property_owner_required');
 // Start: ONE order, ONE Payment for the exact total, memo + 40-char identifier.
 const s1=await rt.start({propertyId:'trailer-01',itemIds:cart,buyer,priceDrops:1,amount:'1'});
 assert(s1.ok,JSON.stringify(s1));assert.equal(creates,1);
 assert.equal(tx.TransactionType,'Payment');assert.equal(tx.Amount,'18000000');assert.equal(tx.Destination,treasury);
 assert.equal(Buffer.from(tx.Memos[0].Memo.MemoType,'hex').toString(),'burncity/estates/tycoon');
 assert.equal(Buffer.from(tx.Memos[0].Memo.MemoData,'hex').toString(),s1.orderId);
 assert.equal(body.custom_meta.identifier.length,40);assert.match(body.custom_meta.instruction,/3 upgrades in one payment/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_tycoon_orders').get().n,1);
 // Same cart in another order resumes the same request; a different cart or single item is blocked.
 assert.equal((await rt.start({propertyId:'trailer-01',itemIds:['fire-pit','flower-garden','garden-pond'],buyer})).reused,true);
 assert.equal((await rt.start({propertyId:'trailer-01',itemIds:['fire-pit','flower-garden'],buyer})).error,'another_upgrade_pending');
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer})).error,'another_upgrade_pending');
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'cart:flower-garden+fire-pit+garden-pond',buyer})).reused,true,'resume by pending key');
 assert.equal(creates,1);
 // Unsigned / not validated / short delivered / wrong memo: nothing is awarded.
 assert.equal((await rt.confirm({orderId:s1.orderId,buyer})).pending,true);
 signed=true;validated=false;assert.equal((await rt.confirm({orderId:s1.orderId,buyer})).pending,true);
 validated=true;mutate=r=>{r.meta.delivered_amount='17999999';};
 await assert.rejects(rt.confirm({orderId:s1.orderId,buyer}),/payment_delivered_amount_mismatch/);
 mutate=r=>{r.tx_json.Amount='15000000';r.meta.delivered_amount='15000000';};
 await assert.rejects(rt.confirm({orderId:s1.orderId,buyer}),/payment_amount_mismatch/);
 mutate=r=>{r.meta.TransactionResult='tecUNFUNDED_PAYMENT';};
 assert.equal((await rt.confirm({orderId:s1.orderId,buyer})).pending,true);
 assert.deepEqual(rt.store.state('trailer-01').unlockedItemIds,[],'no partial award');
 await tick();assert.equal(kicks.length,0,'no allocation kick without a settled payment');
 // Exact validated payment: every item awarded atomically; shares = total/3.
 mutate=()=>{};
 const ok=await rt.confirm({orderId:s1.orderId,buyer});assert(ok.ok,JSON.stringify(ok));
 const st=rt.store.state('trailer-01');
 assert.deepEqual(st.unlockedItemIds,['flower-garden','fire-pit','garden-pond']);
 assert.equal(st.upgradeValueDrops,18000000);assert.equal(st.upgradeShareUnits,6);assert.equal(st.recordedShareUnits,7);
 const row=db.prepare('SELECT * FROM estate_tycoon_orders WHERE order_id=?').get(s1.orderId);
 assert.equal(row.price_drops,18000000);assert.equal(row.share_delta,6);assert.equal(row.payment_tx,hash);
 // A fresh settle kicks the upgrade-payout allocation once (instant 90/5/5 route, not the 15-min wake).
 await tick();assert.deepEqual(kicks,[{orderId:s1.orderId,txHash:hash}]);
 // Replay: confirming again is idempotent; the same tx can't settle another order.
 assert.equal((await rt.confirm({orderId:s1.orderId,buyer})).alreadySettled,true);
 await tick();assert.equal(kicks.length,1,'a replayed confirm does not re-kick');
 assert.throws(()=>rt.store.settle({orderId:s1.orderId,buyer,txHash:'E'.repeat(64),ledgerIndex:9,now}),/payment_hash_conflict/);
 // Owned items can't be re-bought singly or in a cart; dependants of cart items now unlock singly.
 assert.equal(rt.quote({propertyId:'trailer-01',itemId:'fire-pit',buyer}).alreadyUnlocked,true);
 assert.equal(rt.quote({propertyId:'trailer-01',itemIds:['porch-lights','fire-pit'],buyer}).canPurchase,false);
 assert.equal(rt.quote({propertyId:'trailer-01',itemId:'roof-garden',buyer}).canPurchase,true);
 const s2=await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer});assert(s2.ok);assert.equal(tx.Amount,'3000000','single-item flow unchanged');
 hash='F'.repeat(64);assert.equal((await rt.confirm({orderId:s2.orderId,buyer})).ok,true);
 assert.equal(rt.store.state('trailer-01').upgradeShareUnits,7);
 const reuse=db.prepare('SELECT COUNT(*) n FROM estate_tycoon_orders WHERE payment_tx=?').get('A'.repeat(64)).n;assert.equal(reuse,1);
 // Stale cart: an item settled elsewhere while a cart was pending makes the cart unsettleable.
 const orderId='tycoon_'+'c'.repeat(40);
 db.prepare("INSERT INTO estate_tycoon_orders(order_id,property_id,buyer,item_id,price_drops,share_delta,before_upgrade_drops,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)")
  .run(orderId,'trailer-01',buyer,'cart:porch-lights+custom-sign',6000000,2,21000000,now,now+600000);
 assert.throws(()=>rt.store.settle({orderId,buyer,txHash:'9'.repeat(64),ledgerIndex:9,now}),/upgrade_state_changed/);
 db.prepare('UPDATE estate_tycoon_orders SET item_id=?,price_drops=3000000,share_delta=1 WHERE order_id=?').run('cart:custom-sign+cozy-awning',orderId);
 assert.throws(()=>rt.store.settle({orderId,buyer,txHash:'9'.repeat(64),ledgerIndex:9,now}),/upgrade_state_changed/,'tampered total');
 assert.deepEqual([...rt.store.state('trailer-01').unlockedItemIds].sort(),['fire-pit','flower-garden','garden-pond','porch-lights']);
 db.prepare('DELETE FROM estate_tycoon_orders WHERE order_id=?').run(orderId);
 // A helicopter bought inside a cart is a verified helicopter for the hangar.
 hash='8'.repeat(64);
 const h=await rt.start({propertyId:'family-01',itemIds:['estate-helicopter','porch-lights'],buyer});assert(h.ok,JSON.stringify(h));assert.equal(tx.Amount,'63000000');
 assert.equal((await rt.confirm({orderId:h.orderId,buyer})).ok,true);
 assert(rt.store.state('family-01').unlockedItemIds.includes('estate-helicopter'));
 const hangar=createEstateHangarLogbook({db,tycoonStore:rt.store,accessFor:()=>({ok:true}),clock:()=>now});
 db.prepare("INSERT INTO estate_hangar_style(property_id,paint,trim,updated_at) VALUES('family-01','obsidian','brass',?)").run(now);
 assert.deepEqual(hangar.publicStyles().map(x=>x.propertyId),['family-01'],'cart helicopter shows in public hangar styles');
 assert.equal(ITEM_BY_ID.get('estate-helicopter').priceXrp+ITEM_BY_ID.get('porch-lights').priceXrp,63);
 console.log('Estates tycoon cart: canonical keys, one order + one exact Payment, in-cart prerequisites, atomic all-items award with shares=total/3, replay/short/stale rejection, single-item flow and cart helicopter passed');
})().catch(e=>{console.error(e);process.exit(1);});
