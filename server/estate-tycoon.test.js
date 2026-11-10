'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {ITEMS,createEstateTycoonStore}=require('./estate-tycoon');
const {createEstateTycoonRuntime}=require('./estate-tycoon-runtime');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',other='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const config={DRY_RUN:false,NETWORK:'mainnet',XUMM_KEY:'test',XUMM_SECRET:'test',ESTATE_TREASURY:other};
function dbReady(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,1);
 return db;
}
assert(ITEMS.length>=15,'shop should support a substantial upgrade tree');
assert(ITEMS.some(i=>i.id==='underground-bunker'));
assert(ITEMS.some(i=>i.id==='grow-lounge'));
assert(ITEMS.every(i=>i.priceXrp%3===0&&i.priceDrops===i.priceXrp*1000000&&i.shareUnitsDelta===i.priceXrp/3));
assert.deepEqual(ITEMS.filter(i=>i.priceXrp<=9).map(i=>i.priceXrp).slice(0,3),[3,3,3]);
(async()=>{
 const disabled=dbReady();
 let fakeCreates=0;
 const fakePay={sdk:()=>({payload:{create:async()=>{fakeCreates++;throw Error('must_not_sign');}}})};
 const no=createEstateTycoonRuntime({db:disabled,pay:fakePay,config,env:{},paused:()=>false});
 assert.equal(no.quote({propertyId:'trailer-01',itemId:'porch-lights',buyer}).purchasesEnabled,false);
 assert.equal((await no.start({propertyId:'trailer-01',itemId:'porch-lights',buyer})).error,'tycoon_purchases_disabled');
 assert.equal(fakeCreates,0);
 assert.equal(no.portfolio(buyer).recordedShareUnits,1);
 assert.equal(no.portfolio(buyer).recordedValueDrops,3000000);
 assert(!JSON.stringify(no.publicState()).includes(buyer),'public ledger never discloses wallet');
 disabled.close();
 const db=dbReady(),env={ESTATE_TYCOON_UPGRADES_ENABLED:'1'},hashes=['A'.repeat(64),'C'.repeat(64),'D'.repeat(64)],nowStart=1800000000000;
 let now=nowStart,paused=false,signed=false,validated=false,tx,createdAt=now,hash=hashes[0],creates=0,mutate=()=>{};
 const sdk={payload:{create:async p=>{creates++;tx=p.txjson;createdAt=now;return {uuid:'upgrade-payload-'+creates,next:{always:'https://example.com/xaman'}};},
  get:async()=>({meta:{signed},response:{account:buyer,txid:hash},next:{always:'https://example.com/xaman'}})}};
 const pay={sdk:()=>sdk,ledger:async()=>({request:async()=>{const result={
  validated,hash,ledger_index:125,tx_json:{...tx,date:Math.floor(createdAt/1000)-946684800},
  meta:{TransactionResult:'tesSUCCESS',delivered_amount:tx.Amount}};mutate(result);return {result};}})};
 const build=()=>createEstateTycoonRuntime({db,pay,config,env,paused:()=>paused,clock:()=>now});
 let runtime=build();
 const state=runtime.store.state('trailer-01');
 assert.equal(state.recordedValueDrops,3000000);
 assert.equal(state.recordedShareUnits,1);
 assert.equal(state.liveRewardShareUnits,1);
 assert.equal(runtime.quote({propertyId:'trailer-01',itemId:'porch-lights',buyer:other}).canPurchase,false);
 assert.equal((await runtime.start({propertyId:'trailer-01',itemId:'porch-lights',buyer:other})).error,'property_owner_required');
 assert.equal((await runtime.start({propertyId:'trailer-01',itemId:'hidden-hatch',buyer})).error,'upgrade_prerequisites_missing');
 const first=await runtime.start({propertyId:'trailer-01',itemId:'porch-lights',buyer,priceDrops:1});
 assert(first.ok);
 assert.equal(tx.Amount,'3000000','Xaman amount must be server authoritative');
 assert.equal(tx.Memos[0].Memo.MemoType,Buffer.from('burncity/estates/tycoon').toString('hex').toUpperCase());
 assert.equal((await runtime.start({propertyId:'trailer-01',itemId:'flower-garden',buyer})).error,'another_upgrade_pending');
 assert.equal((await runtime.start({propertyId:'trailer-01',itemId:'porch-lights',buyer})).reused,true);
 assert.equal(creates,1);
 assert.equal((await runtime.confirm({orderId:first.orderId,buyer:other})).error,'tycoon_order_not_found');
 assert.equal((await runtime.confirm({orderId:first.orderId,buyer})).pending,true);
 signed=true;
 assert.equal((await runtime.confirm({orderId:first.orderId,buyer})).pending,true);
 validated=true;
 for(const bad of [r=>r.tx_json.Amount='1',r=>r.tx_json.Destination=buyer,r=>r.tx_json.Memos=[],
  r=>r.meta.delivered_amount='1',r=>r.tx_json.Flags=0x00020000]){
  mutate=r=>{r.tx_json.Memos=JSON.parse(JSON.stringify(tx.Memos));bad(r);};
  await assert.rejects(runtime.confirm({orderId:first.orderId,buyer}));
  assert.equal(runtime.store.state('trailer-01').upgradeShareUnits,0);
 }
 mutate=()=>{};
 const settled=await runtime.confirm({orderId:first.orderId,buyer});
 assert(settled.ok);
 assert.equal(settled.property.recordedValueDrops,6000000);
 assert.equal(settled.property.recordedShareUnits,2);
 assert.equal(settled.property.liveRewardShareUnits,1,'existing payout distribution stays untouched');
 assert.equal(db.prepare('SELECT share_units FROM estate_property_ownership WHERE property_id=?').get('trailer-01').share_units,1);
 assert.equal((await runtime.confirm({orderId:first.orderId,buyer})).alreadySettled,true);
 assert.equal((await runtime.start({propertyId:'trailer-01',itemId:'porch-lights',buyer})).error,'upgrade_already_owned');
 assert.equal(runtime.portfolio(buyer).upgradeShareUnits,1);
 const second=await runtime.start({propertyId:'trailer-01',itemId:'reinforced-floor',buyer});
 assert.equal(tx.Amount,'9000000');
 hash=hashes[1];mutate=()=>{};const settle2=await runtime.confirm({orderId:second.orderId,buyer});
 assert.equal(settle2.property.recordedShareUnits,5);
 assert.equal(settle2.property.recordedValueDrops,15000000);
 const grow=await runtime.start({propertyId:'trailer-01',itemId:'grow-lounge',buyer});
 hash=hashes[2];now+=700000;paused=true;runtime=build();
 const settle3=await runtime.confirm({orderId:grow.orderId,buyer});
 assert(settle3.ok,'in-window payment can reconcile after process restart and pause');
 assert.equal(settle3.property.recordedShareUnits,8);
 assert.equal(settle3.property.recordedValueDrops,24000000);
 assert.deepEqual(settle3.property.unlockedItemIds.sort(),['grow-lounge','porch-lights','reinforced-floor'].sort());
 assert.equal((await runtime.start({propertyId:'trailer-01',itemId:'flower-garden',buyer})).error,'estate_treasury_paused');
 paused=false;
 const next=await runtime.start({propertyId:'trailer-01',itemId:'flower-garden',buyer});
 db.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=?').run(other,'trailer-01');
 assert.equal((await runtime.confirm({orderId:next.orderId,buyer})).error,'property_owner_changed');
 assert.equal(runtime.portfolio(buyer).recordedShareUnits,0);
 assert.equal(runtime.portfolio(other).recordedShareUnits,8,'development follows property on resale, not prior wallet');
 db.close();
 console.log('Estates Tycoon: prices, prerequisites, owner authorization, Xaman ledger checks, replay, pause/restart, value/share accounting, resale and disabled distribution policy passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
