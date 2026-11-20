'use strict';
// Upgrade payouts (t439u/t440u): flag OFF by default; 1 share per 3 XRP exactly; shares add to the
// property's base weight in holder allocations from the program start (never retroactive); a
// non-multiple-of-3 order is rejected, not rounded; routes are idempotent.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const UP=require('./estate-upgrade-payouts');
const {ITEMS,createEstateTycoonStore}=require('./estate-tycoon');
const {holdingWeight,allocateProfit}=require('./estate-economy');
const {allocateOwnerProfit}=require('./estate-owner-rewards');
const {createEstateImgOwnershipSnapshots}=require('./estate-img-ownership-snapshots');
const A='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',B='rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST';
const ON={ESTATE_UPGRADE_PAYOUTS_ENABLED:'1'};
// Prices: every item a whole multiple of 3 XRP, shares = price/3.
for(const i of ITEMS){assert.equal(i.priceXrp%3,0,i.id);assert.equal(i.shareUnitsDelta,i.priceXrp/3);assert.equal(UP.sharesFor(i.priceDrops),i.priceXrp/3);}
assert.deepEqual(ITEMS.map(i=>i.priceXrp),[3,3,3,6,6,6,9,9,9,9,12,15,18,18,21,30,36,60],'audited price list unchanged');
assert.throws(()=>UP.sharesFor(5000000),/multiple_of_3/);assert.throws(()=>UP.sharesFor(0),/multiple_of_3/);
assert.equal(UP.enabled({}),false);assert.equal(UP.enabled(ON),true);
// Weight helper never goes below the catalog weight.
assert.equal(holdingWeight({propertyId:'trailer-01'}),1);
assert.equal(holdingWeight({propertyId:'trailer-01',weight:3}),3);
assert.throws(()=>holdingWeight({propertyId:'starter-04',weight:3}),/invalid_holding_weight/);
// DB fixture: two properties, one settled 6 XRP upgrade on trailer-01.
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',A,'B'.repeat(64),3000000,1,1000);
db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('starter-04',B,'C'.repeat(64),75000000,25,1000);
createEstateTycoonStore(db);
const order=(id,prop,item,price,share,tx,at)=>db.prepare("INSERT INTO estate_tycoon_orders(order_id,property_id,buyer,item_id,price_drops,share_delta,before_upgrade_drops,created_at,expires_at,status,payment_tx,ledger_index,settled_at) VALUES(?,?,?,?,?,?,0,?,?,'settled',?,1,?)").run(id,prop,prop==='trailer-01'?A:B,item,price,share,at,at+1,tx,at);
order('tycoon_'+'1'.repeat(40),'trailer-01','fire-pit',6000000,2,'D'.repeat(64),5000);
// OFF: nothing changes anywhere.
assert.equal(UP.upgradeUnitsAt(db,1e9,{}).size,0);
// ON but program not started: still nothing (the executor starts it only with policy v4 live).
assert.equal(UP.upgradeUnitsAt(db,1e9,ON).size,0);
UP.start(db,10000);UP.start(db,99999);assert.equal(UP.program(db).started_ms,10000,'start is set once');
// Backfill rule: an upgrade settled before the program earns only from the start, never retroactively.
assert.equal(UP.upgradeUnitsAt(db,9999,ON).size,0);
assert.equal(UP.upgradeUnitsAt(db,10000,ON).get('trailer-01'),2);
// A later upgrade earns only from its own settlement.
order('tycoon_'+'2'.repeat(40),'trailer-01','porch-lights',3000000,1,'E'.repeat(64),20000);
assert.equal(UP.upgradeUnitsAt(db,19999,ON).get('trailer-01'),2);assert.equal(UP.upgradeUnitsAt(db,20000,ON).get('trailer-01'),3);
// Defensive guard: a corrupted non-multiple / mismatched row is skipped, never rounded.
const warn=console.warn;let warned=0;console.warn=()=>warned++;
order('tycoon_'+'3'.repeat(40),'starter-04','custom-sign',5000000,1,'F'.repeat(64),20000);
assert.equal(UP.upgradeUnitsAt(db,30000,ON).get('starter-04'),undefined);assert(warned>=1);console.warn=warn;
db.prepare("DELETE FROM estate_tycoon_orders WHERE order_id=?").run('tycoon_'+'3'.repeat(40));
// Snapshots carry the combined weight; allocators honour it (trailer 1+3=4 vs starter 25).
const prev=process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED;process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED='1';
const snap=createEstateImgOwnershipSnapshots(db).at(30000);
assert.deepEqual(snap.map(h=>[h.propertyId,h.weight]),[['starter-04',25],['trailer-01',4]]);
const x=allocateOwnerProfit(2900,snap);assert.equal(x.find(r=>r.acct===A).amountDrops,400);assert.equal(x.find(r=>r.acct===B).amountDrops,2500);
const y=allocateProfit(2900,snap);assert.equal(y.reduce((n,r)=>n+r.amountDrops,0),2900);assert.equal(y.find(r=>r.propertyId==='trailer-01').amountDrops,400);
// Tycoon state reports live payout weight including upgrades when on.
const st=createEstateTycoonStore(db).state('trailer-01');assert.equal(st.sharePolicy,'active_for_distributions');assert.equal(st.liveRewardShareUnits,4);
process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED='';
const st0=createEstateTycoonStore(db).state('trailer-01');assert.equal(st0.sharePolicy,'recorded_only_not_active_for_distributions');assert.equal(st0.liveRewardShareUnits,1);
assert.deepEqual(createEstateImgOwnershipSnapshots(db).at(30000).map(h=>h.weight),[25,1],'flag off: base weights only');
process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED=prev||'';
// Routes: idempotent, exact split sum, conflict detection, principal counted as estate cash.
const o=UP.unrouted(db)[0];assert.equal(o.payment_tx,'D'.repeat(64));
const split={imgRlusdDrops:'5940000',operatingReserveDrops:'60000'};
UP.recordRoute(db,o,split,1);UP.recordRoute(db,o,split,2);
assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_upgrade_payout_routes').get().n,1);
assert.equal(UP.routedPrincipalDrops(db),5940000n);
assert.throws(()=>UP.recordRoute(db,{...o,payment_tx:'E'.repeat(64)},{imgRlusdDrops:'1',operatingReserveDrops:'1'},3),/split_mismatch/);
assert.equal(UP.unrouted(db).length,1,'only the second upgrade is left');
console.log('Estates upgrade payouts: flag off by default, 1 share per 3 XRP exactly, non-retroactive weights, allocator weights, idempotent routes passed');
