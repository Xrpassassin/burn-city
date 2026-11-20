'use strict';
// Estates upgrade payouts (operator decision t439u, Nov 19 2026). OFF unless ESTATE_UPGRADE_PAYOUTS_ENABLED=1.
// "The XRP does the same thing as if it were a property itself": while on,
//  1. every validated, settled tycoon upgrade's XRP is routed exactly like a new estate purchase:
//     the same 1% XRP operating reserve, then the policy-v4 90/5/5 split (IMG/PLX, IMG/XRP, IMG/RLUSD)
//     through the existing deposit queues (estate_v4_deposits / estate_mp_deposits), keyed by the
//     upgrade's validated payment tx hash (never re-split, never double-allocated);
//  2. each property gains 1 payout share per 3 XRP of upgrades. All upgrade prices are multiples of
//     3 XRP (invariant in estate-tycoon.js), so shares = price / 3 exactly; there is no remainder.
//     A non-multiple is rejected defensively and logged, never rounded.
//  Upgrade shares add to the property's base tier weight in every holder allocation (Pollux hourly
//  IMG, Pollux XRP, realized-profit payouts), using ownership at the receipt time like base shares.
// Backfill: upgrades settled before the program start earn only from the start (never retroactive
// to rewards already allocated); their XRP is routed on the first pass. Prod had none at writing.
// estate_property_ownership.share_units is never modified (it must equal the catalog tier weight).
const {propertyWeight}=require('./estate-economy');
const XRP3=3000000;
const enabled=(env=process.env)=>env.ESTATE_UPGRADE_PAYOUTS_ENABLED==='1';
const has=(db,name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
function ensure(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_upgrade_payout_program(id INTEGER PRIMARY KEY CHECK(id=1),started_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_upgrade_payout_routes(payment_tx TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,property_id TEXT NOT NULL,
  price_drops TEXT NOT NULL,principal_drops TEXT NOT NULL,reserve_drops TEXT NOT NULL,share_units INTEGER NOT NULL CHECK(share_units>0),created INTEGER NOT NULL);`);
}
function sharesFor(priceDrops){
 const p=Number(priceDrops);
 if(!Number.isSafeInteger(p)||p<=0||p%XRP3!==0)throw Error('upgrade_price_not_multiple_of_3_xrp');
 return p/XRP3;
}
function program(db){return has(db,'estate_upgrade_payout_program')?db.prepare('SELECT * FROM estate_upgrade_payout_program WHERE id=1').get()||null:null;}
function start(db,ms){ensure(db);db.prepare('INSERT OR IGNORE INTO estate_upgrade_payout_program VALUES(1,?)').run(ms);return program(db);}
const warned=new Set();
function warnOnce(key,msg){if(warned.has(key))return;warned.add(key);console.warn('[estate-upgrade-payouts]',msg);}
// Upgrade payout shares per property that were earning at atMs (settled and program started by then).
function upgradeUnitsAt(db,atMs,env=process.env){
 const out=new Map();
 if(!enabled(env)||!has(db,'estate_tycoon_orders'))return out;
 const prog=program(db);if(!prog)return out;
 const rows=db.prepare("SELECT order_id,property_id,price_drops,share_delta FROM estate_tycoon_orders WHERE status='settled' AND payment_tx IS NOT NULL AND MAX(settled_at,?)<=? ORDER BY order_id").all(prog.started_ms,atMs);
 for(const r of rows){
  let s;try{s=sharesFor(r.price_drops);}catch{warnOnce(r.order_id,'skipping non-multiple-of-3 upgrade '+r.order_id);continue;}
  if(s!==Number(r.share_delta)){warnOnce(r.order_id,'skipping upgrade with share mismatch '+r.order_id);continue;}
  out.set(r.property_id,(out.get(r.property_id)||0)+s);
 }
 return out;
}
// Base tier weight + upgrade shares. The value carried on a holding for the allocators.
function weightAt(db,propertyId,atMs,env=process.env,cache=null){
 const m=cache||upgradeUnitsAt(db,atMs,env);
 return propertyWeight(propertyId)+(m.get(propertyId)||0);
}
// Settled upgrades whose XRP has not been routed yet (oldest first).
function unrouted(db){
 if(!has(db,'estate_tycoon_orders'))return [];
 ensure(db);
 return db.prepare("SELECT o.order_id,o.property_id,o.price_drops,o.share_delta,o.payment_tx,o.settled_at FROM estate_tycoon_orders o WHERE o.status='settled' AND o.payment_tx IS NOT NULL AND NOT EXISTS(SELECT 1 FROM estate_upgrade_payout_routes r WHERE r.payment_tx=o.payment_tx) ORDER BY o.settled_at,o.order_id").all();
}
// Record the route for one upgrade (idempotent). principal/reserve come from the same purchase split.
function recordRoute(db,o,split,now){
 const s=sharesFor(o.price_drops);
 if(s!==Number(o.share_delta))throw Error('upgrade_share_mismatch');
 if(!/^[A-F0-9]{64}$/.test(o.payment_tx||''))throw Error('upgrade_payment_tx_required');
 if(BigInt(split.imgRlusdDrops)+BigInt(split.operatingReserveDrops)!==BigInt(o.price_drops))throw Error('upgrade_split_mismatch');
 db.prepare('INSERT OR IGNORE INTO estate_upgrade_payout_routes VALUES(?,?,?,?,?,?,?,?)').run(o.payment_tx,o.order_id,o.property_id,String(o.price_drops),split.imgRlusdDrops,split.operatingReserveDrops,s,now);
 const r=db.prepare('SELECT * FROM estate_upgrade_payout_routes WHERE payment_tx=?').get(o.payment_tx);
 if(r.order_id!==o.order_id||r.price_drops!==String(o.price_drops))throw Error('upgrade_route_conflict');
 return r;
}
// Upgrade principal is estate cash until it is deposited (same as purchase principal).
function routedPrincipalDrops(db){
 if(!has(db,'estate_upgrade_payout_routes'))return 0n;
 return db.prepare('SELECT principal_drops FROM estate_upgrade_payout_routes').all().reduce((n,r)=>n+BigInt(r.principal_drops),0n);
}
module.exports={enabled,ensure,sharesFor,program,start,upgradeUnitsAt,weightAt,unrouted,recordRoute,routedPrincipalDrops,XRP3};
