'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {STAGES,prestigeFor}=require('./estate-prestige');
const {createEstatePrestigeRuntime}=require('./estate-prestige-runtime');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const config={DRY_RUN:false,NETWORK:'mainnet',XUMM_KEY:'test',XUMM_SECRET:'test',ESTATE_TREASURY:treasury};
function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,1);return db;}
for(const s of STAGES){assert.equal(prestigeFor(s.thresholdDrops).level,s.level);if(s.level)assert.equal(prestigeFor(s.thresholdDrops-1).level,s.level-1);}
for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'3000000'])assert.throws(()=>prestigeFor(value));
(async()=>{
 for(const [env,cfg] of [[{},config],[{ESTATE_COSMETIC_UPGRADES_ENABLED:'true'},config],[{ESTATE_COSMETIC_UPGRADES_ENABLED:'1'},{...config,DRY_RUN:true}],[{ESTATE_COSMETIC_UPGRADES_ENABLED:'1'},{...config,NETWORK:'testnet'}],[{ESTATE_COSMETIC_UPGRADES_ENABLED:'1'},{...config,XUMM_SECRET:''}]]){
  const db=database(),r=createEstatePrestigeRuntime({db,config:cfg,env,paused:()=>false,pay:{sdk(){throw Error('must_not_request_signing');}}});
  assert.equal(r.quote({propertyId:'trailer-01',buyer}).upgradesEnabled,false);
  assert.equal((await r.start({propertyId:'trailer-01',buyer})).error,'cosmetic_upgrades_disabled');assert.equal((await r.confirm({upgradeId:'fake',buyer})).error,'cosmetic_upgrades_disabled');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_cosmetic_upgrades').get().n,0);db.close();
 }
 const db=database(),env={ESTATE_COSMETIC_UPGRADES_ENABLED:'1'},hash='A'.repeat(64);let now=1800000000000,paused=false,signed=false,validated=false,payload,creates=0,txMutation=()=>{},returnedHash=hash,createdAt=now;
 const sdk={payload:{create:async p=>{creates++;createdAt=now;payload=p;return {uuid:'payload-'+creates,next:{always:'https://example.com/sign'}};},get:async()=>({meta:{signed},response:{account:buyer,txid:returnedHash},next:{always:'https://example.com/sign'}})}};
 const pay={sdk:()=>sdk,ledger:async()=>({request:async()=>{const result={hash:returnedHash,validated,ledger_index:123,tx_json:{...payload.txjson,date:Math.floor(createdAt/1000)-946684800+5},meta:{TransactionResult:'tesSUCCESS',delivered_amount:payload.txjson.Amount}};txMutation(result);return {result};}})};
 const build=()=>createEstatePrestigeRuntime({db,config,env,pay,paused:()=>paused,clock:()=>now});
 let r=build(),quote=r.quote({propertyId:'trailer-01',buyer});assert.equal(quote.totalSpentDrops,3000000);assert.equal(quote.next.remainingDrops,12000000);assert.equal(quote.shareUnits,1);
 const publicState=r.publicState();assert(!JSON.stringify(publicState).includes(buyer));assert(!JSON.stringify(publicState).includes('B'.repeat(64)));
 assert.equal(r.quote({propertyId:'trailer-01',buyer:treasury}).canUpgrade,false);
 assert.equal((await r.start({propertyId:'trailer-01',buyer:treasury})).error,'property_owner_required');
 const started=await r.start({propertyId:'trailer-01',buyer,priceDrops:1,targetLevel:5});assert(started.ok);assert.equal(payload.txjson.Amount,'12000000');assert.equal(creates,1);
 assert.equal((await r.start({propertyId:'trailer-01',buyer})).upgradeId,started.upgradeId);assert.equal(creates,1);
 assert.equal((await r.confirm({upgradeId:started.upgradeId,buyer:treasury})).error,'upgrade_not_found');
 assert.equal((await r.confirm({upgradeId:started.upgradeId,buyer})).pending,true);
 signed=true;assert.equal((await r.confirm({upgradeId:started.upgradeId,buyer})).pending,true);
 validated=true;
 for(const change of [x=>x.tx_json.Account=treasury,x=>x.tx_json.Destination=buyer,x=>x.tx_json.Amount='1',x=>x.meta.delivered_amount='1',x=>x.tx_json.Flags=0x00020000,x=>x.tx_json.Memos[0].Memo.MemoType=Buffer.from('burncity/estates').toString('hex'),x=>x.tx_json.Memos=[{Memo:{MemoType:Buffer.from('burncity/estates/cosmetic').toString('hex'),MemoData:'00'}}],x=>x.tx_json.date=1800000000-946684800+800]){
  txMutation=x=>{x.tx_json.Memos=JSON.parse(JSON.stringify(payload.txjson.Memos));change(x);};await assert.rejects(r.confirm({upgradeId:started.upgradeId,buyer}));assert.equal(r.quote({propertyId:'trailer-01',buyer}).level,0);
 }
 txMutation=()=>{};paused=true;assert.equal((await r.start({propertyId:'trailer-01',buyer})).error,'estate_treasury_paused');
 now+=700000;r=build();const result=await r.confirm({upgradeId:started.upgradeId,buyer});assert(result.ok,'late confirmation of an in-window payment survives restart and pause');assert.equal(result.appearance.level,1);assert.equal(result.appearance.totalSpentDrops,15000000);
 assert((await r.confirm({upgradeId:started.upgradeId,buyer})).alreadySettled);assert.equal(r.quote({propertyId:'trailer-01',buyer}).totalSpentDrops,15000000);assert.equal(db.prepare('SELECT share_units FROM estate_property_ownership').get().share_units,1);
 paused=false;const second=await r.start({propertyId:'trailer-01',buyer});assert.equal(payload.txjson.Amount,'60000000');
 await assert.rejects(r.confirm({upgradeId:second.upgradeId,buyer}),/UNIQUE/,'a payment hash cannot credit two upgrades');
 db.prepare('UPDATE estate_property_ownership SET acct=?').run(treasury);assert.equal((await r.confirm({upgradeId:second.upgradeId,buyer})).error,'property_owner_changed');db.close();
 // Ambiguous payload creation is held through process restart, never reissued.
 const heldDb=database();let attempts=0;const heldPay={sdk:()=>({payload:{create:async()=>{attempts++;throw Error('remote_timeout');}}})};
 const held=()=>createEstatePrestigeRuntime({db:heldDb,config,env,pay:heldPay,paused:()=>false,clock:()=>now});
 assert.equal((await held().start({propertyId:'trailer-01',buyer})).error,'upgrade_payload_requires_review');assert.equal((await held().start({propertyId:'trailer-01',buyer})).error,'upgrade_payload_pending');assert.equal(attempts,1);heldDb.close();
 console.log('Estate prestige: thresholds, verified spending, opt-in, ownership, exact ledger checks, replay, late/pause recovery, and ambiguous payload holds passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
