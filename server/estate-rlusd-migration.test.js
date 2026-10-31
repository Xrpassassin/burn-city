'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createEstateCapitalAllocation}=require('./estate-capital-allocation');
const {createEstateLiquidityRuntime}=require('./estate-liquidity-runtime');
const {fixture,until}=require('./estate-liquidity-runtime.test');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT,purchase_amount_drops INTEGER,purchased_at INTEGER,share_units INTEGER DEFAULT 1);
CREATE TABLE estate_capital_allocations(purchase_tx TEXT PRIMARY KEY,property_id TEXT NOT NULL UNIQUE,buyer TEXT NOT NULL,purchase_drops TEXT NOT NULL,img_plx_drops TEXT NOT NULL,img_xrp_drops TEXT NOT NULL,policy_version INTEGER NOT NULL CHECK(policy_version=1),state TEXT NOT NULL CHECK(state='awaiting_liquidity_execution'),created_at INTEGER NOT NULL);
CREATE INDEX allocation_buyer ON estate_capital_allocations(buyer);
INSERT INTO estate_property_ownership(property_id,acct,purchase_tx,purchase_amount_drops,purchased_at) VALUES('old','owner','${'A'.repeat(64)}',3000000,1);
INSERT INTO estate_capital_allocations VALUES('${'A'.repeat(64)}','old','owner','3000000','2100000','900000',1,'awaiting_liquidity_execution',1);
CREATE TABLE estate_liquidity_jobs(id TEXT PRIMARY KEY,purchase_tx TEXT NOT NULL,pair TEXT NOT NULL CHECK(pair IN ('img-plx','img-xrp')),initial_budget_drops TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL,note TEXT,last_harvest_hour INTEGER,UNIQUE(purchase_tx,pair));
INSERT INTO estate_liquidity_jobs VALUES('old-position','${'A'.repeat(64)}','img-plx','2100000','invested','{"cash":"0","img":"0","plx":"0","imgCost":"0","plxCost":"0","fees":"0","lp":"1","basis":"2100000","generation":0}',NULL,1);`);
const saved=db.prepare('SELECT * FROM estate_liquidity_jobs').get();
const capital=createEstateCapitalAllocation(db);
assert.equal(capital.record(db.prepare('SELECT * FROM estate_property_ownership').get()).policy_version,1,'replay preserves historical routing');
assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='allocation_buyer'").get());
const opts={db,client:{},wallet:()=>null,treasury:'r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V',imgIssuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',plxIssuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',guard:{paused:()=>true}};
createEstateLiquidityRuntime(opts);assert.deepEqual(db.prepare('SELECT * FROM estate_liquidity_jobs').get(),saved);
createEstateLiquidityRuntime(opts);assert.deepEqual(db.prepare('SELECT * FROM estate_liquidity_jobs').get(),saved,'restart does not alter migrated journals');
db.prepare('INSERT INTO estate_property_ownership(property_id,acct,purchase_tx,purchase_amount_drops,purchased_at) VALUES(?,?,?,?,?)').run('new','owner','B'.repeat(64),3000000,2);
const fresh=capital.record(db.prepare("SELECT * FROM estate_property_ownership WHERE property_id='new'").get());
assert.equal(fresh.policy_version,2);assert.equal(fresh.img_rlusd_drops,'2970000');assert.equal(fresh.operating_reserve_drops,'30000');assert.equal(fresh.img_plx_drops,'0');
(async()=>{
 // Foreign keys prevent a destructive rebuild instead of silently rewriting dependencies.
 const dependency=new DatabaseSync(':memory:');dependency.exec("CREATE TABLE parent(id TEXT PRIMARY KEY,CHECK(id!='x'));CREATE TABLE child(id TEXT REFERENCES parent(id));");
 assert.throws(()=>require('./estate-schema-upgrade').extendCheck(dependency,'parent',"CHECK(id!='x')","CHECK(id!='y')"),/dependency_review/);
 // Another underwater lot suppresses distribution despite this lot's gain.
 const f=fixture({policyVersion:2});let r=f.make();await until(f,r,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE state='invested'").get().n===1,80);
 const j=f.db.prepare('SELECT * FROM estate_liquidity_jobs').get(),d=JSON.parse(j.data_json);
 const other={...d,lp:'1',basis:'999999999999'};
 f.db.prepare("INSERT INTO estate_liquidity_jobs VALUES('impaired',?,'img-rlusd','0','invested',?,NULL,NULL)").run('C'.repeat(64),JSON.stringify(other));
 const key=d.lpCurrency+':'+d.lpAccount;f.balances.set(key,f.balances.get(key).plus(1));
 f.clock+=3600000;f.stablePool.x=f.stablePool.x.times(2);f.stablePool.y=f.stablePool.y.times(2);r=f.make({fundingEnabled:false,harvestEnabled:true});await r.tick();
 assert.equal(f.sent.filter(t=>t.TransactionType==='AMMWithdraw').length,0);
 assert.match(f.db.prepare('SELECT note FROM estate_liquidity_jobs WHERE id=?').get(j.id).note,/portfolio_loss/);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 console.log('IMG/RLUSD migration: legacy rows/indexes/basis preserved, new policy exact, FK guard, impaired portfolio cannot create rewards');
})().catch(e=>{console.error(e);process.exitCode=1;});
