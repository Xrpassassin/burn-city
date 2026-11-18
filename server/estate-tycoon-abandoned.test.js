'use strict';
// Expired unpaid upgrade requests must release the property's pending slot, but only with
// proof that nothing can still be paid. Signed or ambiguous requests stay held for review.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateTycoonRuntime}=require('./estate-tycoon-runtime');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const config={DRY_RUN:false,NETWORK:'mainnet',XUMM_KEY:'t',XUMM_SECRET:'t',ESTATE_TREASURY:treasury};
(async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,1);
 let now=1800000000000,meta={signed:false},creates=0;
 const sdk={payload:{create:async()=>{creates++;return {uuid:'p'+creates,next:{always:'https://example.com/x'+creates}};},
  get:async()=>({meta,response:{},next:{always:'https://example.com/x'+creates}})}};
 const rt=createEstateTycoonRuntime({db,pay:{sdk:()=>sdk},config,env:{ESTATE_TYCOON_UPGRADES_ENABLED:'1'},paused:()=>false,clock:()=>now});
 const a=await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer});assert(a.ok);
 // Inside the window or grace: never released, never duplicated.
 now+=11*60000;
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'flower-garden',buyer})).error,'another_upgrade_pending');
 assert.equal((await rt.confirm({orderId:a.orderId,buyer})).pending,true);
 // Past grace but Xaman has not reported expiry: still held.
 now+=10*60000;
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'flower-garden',buyer})).error,'another_upgrade_pending');
 // Signed (even if expired) is never released.
 meta={signed:true,expired:true};
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'flower-garden',buyer})).error,'another_upgrade_pending');
 // Expired unsigned: confirm releases and archives it; a fresh request can start.
 meta={signed:false,expired:true};
 assert.deepEqual(await rt.confirm({orderId:a.orderId,buyer}),{ok:false,error:'tycoon_order_expired',released:true});
 assert.equal(db.prepare('SELECT reason FROM estate_tycoon_voided_orders WHERE order_id=?').get(a.orderId).reason,'payload_unsigned_expired');
 const b=await rt.start({propertyId:'trailer-01',itemId:'flower-garden',buyer});assert(b.ok);assert.equal(creates,2);
 // Ambiguous remote creation ('creating') is never released.
 now+=30*60000;
 db.prepare("UPDATE estate_tycoon_orders SET payload_state='creating',payload_uuid=NULL WHERE order_id=?").run(b.orderId);
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'custom-sign',buyer})).error,'another_upgrade_pending');
 // Never-created payload ('none') past grace is released by start, without touching ownership.
 db.prepare("UPDATE estate_tycoon_orders SET payload_state='none' WHERE order_id=?").run(b.orderId);
 const c=await rt.start({propertyId:'trailer-01',itemId:'custom-sign',buyer});assert(c.ok);assert.equal(creates,3);
 assert.equal(db.prepare('SELECT acct,share_units FROM estate_property_ownership').get().share_units,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM estate_tycoon_orders WHERE status='settled'").get().n,0);
 console.log('estate tycoon abandoned-order release ok');
})().catch(e=>{console.error(e);process.exit(1);});
