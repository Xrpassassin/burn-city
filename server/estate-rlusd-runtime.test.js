'use strict';
const assert=require('node:assert/strict');
const {fixture,until}=require('./estate-liquidity-runtime.test');
const {estateCashReserve}=require('./estate-liquidity-runtime');
const {value}=require('./estate-liquidity-ledger');
function preference(f,currency){f.db.exec('CREATE TABLE IF NOT EXISTS estate_owner_payout_preferences(acct TEXT PRIMARY KEY,currency TEXT)');f.db.prepare('INSERT INTO estate_owner_payout_preferences VALUES(?,?) ON CONFLICT(acct) DO UPDATE SET currency=excluded.currency').run(f.owner,currency);}
(async()=>{
 const f=fixture({policyVersion:2});preference(f,'XRP');let r=f.make();
 const readiness=require('./estate-rlusd-readiness').inspectEstateRlusdReadiness;
 const ready=await readiness({client:f.client,treasury:f.treasury,imgIssuer:f.IMG.issuer,poolAccount:f.stablePool.account});assert.equal(ready.ready,true);assert.ok(BigInt(ready.indicativeMaxPurchaseDrops)>0n);
 const frozen={request:async q=>{const r=await f.client.request(q);if(q.command==='account_lines'&&q.peer===f.RLUSD.issuer)r.result.lines[0].freeze_peer=true;return r;}};
 assert.equal((await readiness({client:frozen,treasury:f.treasury,imgIssuer:f.IMG.issuer,poolAccount:f.stablePool.account})).ready,false);

 assert.equal(estateCashReserve(f.db),'2970000');
 f.paused=true;await r.tick();assert.equal(f.sent.length,0);f.paused=false;
 f.unknown=true;await until(f,r,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE state='invested'").get().n===1,80);
 assert.equal(f.sent.filter(t=>t.TransactionType==='AMMDeposit').length,1);
 const deposit=f.sent.find(t=>t.TransactionType==='AMMDeposit');assert.equal(deposit.Asset2.currency,f.RLUSD.currency);
 assert.equal(f.sent.filter(t=>t.TransactionType==='Payment'&&t.Amount?.currency==='PLX').length,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n,0);
 const initialSent=f.sent.length;r=f.make();await r.tick();assert.equal(f.sent.length,initialSent,'restart cannot duplicate acquisition/deposit');
 // Lost principal never creates hourly rewards.
 f.clock+=3600000;f.stablePool.x=f.stablePool.x.times('.5');f.stablePool.y=f.stablePool.y.times('.5');r=f.make({harvestEnabled:true});await r.tick();assert.equal(f.sent.length,initialSent);
 // External fee growth, followed by actual redemption and both token sales.
 f.clock+=3600000;f.stablePool.x=f.stablePool.x.times('4');f.stablePool.y=f.stablePool.y.times('4');
 await until(f,r,()=>f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n===1,100);
 const receipt=f.db.prepare('SELECT * FROM estate_xrp_profit_receipts').get();assert.ok(BigInt(receipt.distributable_drops)>0n);
 assert.equal(f.db.prepare('SELECT payout_policy FROM estate_xrp_profit_payouts').get().payout_policy,2);
 assert.equal(f.sent.filter(t=>t.Destination===f.owner).length,0,'no payment before the reward hour closes');
 // Pause acquisition so the reward test does not depend on reinvestment depth.
 r=f.make({fundingEnabled:false,harvestEnabled:true,maxNativePayoutDrops:'100000000'});f.clock=receipt.available_after_ms;
 await until(f,r,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_xrp_profit_payouts WHERE state='confirmed'").get().n===1,80);
 assert.equal(f.sent.filter(t=>t.Destination===f.owner).length,1);
 const cashPay=f.sent.find(t=>t.Destination===f.owner);assert.equal(typeof cashPay.Amount,'string');assert.ok(BigInt(cashPay.Amount)<BigInt(receipt.distributable_drops));
 r=f.make({fundingEnabled:false,harvestEnabled:true});await r.tick();assert.equal(f.sent.filter(t=>t.Destination===f.owner).length,1);
 // IMG preference is a separately bounded acquisition funded by earned cash.
 const g=fixture({policyVersion:2});preference(g,'IMG');let gr=g.make();await until(g,gr,()=>g.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE state='invested'").get().n===1,80);
 g.clock+=3600000;g.stablePool.x=g.stablePool.x.times('2');g.stablePool.y=g.stablePool.y.times('2');gr=g.make({harvestEnabled:true});
 await until(g,gr,()=>g.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n===1,100);
 const imgReceipt=g.db.prepare('SELECT * FROM estate_xrp_profit_receipts').get();g.clock=imgReceipt.available_after_ms;
 gr=g.make({fundingEnabled:false,harvestEnabled:true,maxNativePayoutDrops:'100000000'});
 await until(g,gr,()=>g.db.prepare("SELECT COUNT(*) n FROM estate_xrp_profit_payouts WHERE state='confirmed'").get().n===1,80);
 const imgPay=g.sent.find(t=>t.Destination===g.owner);assert.equal(imgPay.Amount.currency,'IMG');assert.ok(value(imgPay.Amount.value).gt(0));
 assert.equal(g.db.prepare('SELECT currency FROM estate_xrp_profit_payouts').get().currency,'IMG');
 // Missing activation, wrong pool, bad market price and excessive acquisition
 // impact park the purchase without submitting any transaction.
 for(const config of [{rlusdEnabled:false},{rlusdPoolAccount:g.owner},{maxAcquisitionImpactBps:1}]){
  const blocked=fixture({policyVersion:2}),br=blocked.make(config);await br.tick();assert.equal(blocked.sent.length,0);assert.equal(estateCashReserve(blocked.db),'2970000');
 }
 const bad=fixture({policyVersion:2});bad.stablePool.y=bad.stablePool.y.times('2');await bad.make().tick();assert.equal(bad.sent.length,0);
 // Tiny entitlements accrue once, including their unused fee allowance.
 const tiny=fixture({policyVersion:2});preference(tiny,'XRP');const tr=tiny.make({fundingEnabled:false});
 const enqueue=(id,amount)=>tiny.db.prepare("INSERT INTO estate_xrp_profit_payouts(id,source_id,owner,amount_drops,base_amount_drops,available_after_ms,state,payout_policy) VALUES(?,?,?,?,?,?,'queued',2)").run(id,id,tiny.owner,amount,amount,tiny.clock);
 enqueue('tiny-1','50');await tr.tick();assert.equal(tiny.db.prepare('SELECT carried FROM estate_xrp_profit_payouts').get().carried,1);
 assert.equal(tiny.db.prepare('SELECT amount_drops FROM estate_xrp_profit_credits').get().amount_drops,'150');await tr.tick();assert.equal(tiny.db.prepare('SELECT amount_drops FROM estate_xrp_profit_credits').get().amount_drops,'150');
 enqueue('tiny-2','1000');await until(tiny,tr,()=>tiny.db.prepare("SELECT state FROM estate_xrp_profit_payouts WHERE id='tiny-2'").get().state==='confirmed',30);
 assert.equal(tiny.sent.find(t=>t.Destination===tiny.owner).Amount,'1050');
 // Missing holder IMG trustline cannot spend earned rewards or switch currency.
 const missing=fixture({policyVersion:2});preference(missing,'IMG');missing.make({fundingEnabled:false});
 missing.db.prepare("INSERT INTO estate_xrp_profit_payouts(id,source_id,owner,amount_drops,base_amount_drops,available_after_ms,state,payout_policy) VALUES('missing','missing',?,'100000','100000',?,'queued',2)").run(missing.owner,missing.clock);
 const client={...missing.client,request:async q=>{if(q.command==='account_lines'&&q.account===missing.owner)return {result:{validated:true,ledger_hash:(await missing.client.request({command:'ledger'})).result.ledger_hash,lines:[]}};return missing.client.request(q);}};
 const mr=missing.make({client,fundingEnabled:false});await mr.tick();assert.equal(missing.sent.length,0);assert.match(missing.db.prepare('SELECT note FROM estate_xrp_profit_payouts').get().note,/trustline/);
 // Database upgrade keeps old budgets and their original version intact.
 const old=fixture(),db=old.db;
 const before=db.prepare('SELECT * FROM estate_capital_allocations').get();
 require('./estate-capital-allocation').createEstateCapitalAllocation(db);
 assert.deepEqual(db.prepare('SELECT * FROM estate_capital_allocations').get(),before);
 assert.equal(before.policy_version,1);
 console.log('IMG/RLUSD: reserved proceeds, two-asset deposits, restart, price/activation guards, loss/no payout, verified realization, hourly XRP/IMG delivery passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
