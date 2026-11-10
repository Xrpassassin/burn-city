'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const P=require('./estate-monthly-plan');
const {N}=require('./estate-liquidity-ledger');
const cfg=P.monthlyConfig({ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL});
// ---- policy: no PLX, monthly, 10/10/80, version bumped ----
assert.equal(P.POLICY.version,3);assert.equal(P.POLICY.imgPlxBps,0);assert.equal(P.POLICY.plx,false);assert.equal(P.POLICY.cadence,'monthly');
assert.equal(P.POLICY.burnBps+P.POLICY.redepositBps+P.POLICY.holdersBps,10000);
const CA=require('./estate-capital-allocation');assert.equal(CA.POLICY.version,3);assert.equal(CA.POLICY.imgPlxBps,0);
assert.equal(CA.splitEstateCapital('3000000').imgPlxDrops,'0');
// ---- purchase split + configurable reserve + per-deposit max ----
assert.deepEqual(P.splitPurchase('3000000',cfg),{purchaseDrops:'3000000',operatingReserveDrops:'30000',imgRlusdDrops:'2970000',imgPlxDrops:'0',imgXrpDrops:'0'});
assert.equal(P.splitPurchase('3000000',P.monthlyConfig({ESTATE_XRP_RESERVE_BPS:'500'})).operatingReserveDrops,'150000');
assert.equal(P.splitPurchase('1000000',P.monthlyConfig({ESTATE_XRP_RESERVE_MIN_DROPS:'200000'})).operatingReserveDrops,'200000');
assert.throws(()=>P.monthlyConfig({ESTATE_XRP_RESERVE_BPS:'9000'}),/invalid_monthly_plan_setting/);
const legs=P.depositLegs('60000000',cfg);assert.deepEqual(legs,{spendDrops:'8000000',rlusdLegDrops:'4000000',imgLegDrops:'4000000',queuedDrops:'52000000'});
assert.equal(P.depositLegs('2970000',cfg).queuedDrops,'0');
// ---- slippage / price-impact math (tiny pool: ~$77 TVL) ----
const q=P.quoteSwap({amountIn:'10',poolIn:'90',poolOut:'900',tradingFee:0});
assert.equal(q.out.toFixed(),'90');assert.equal(q.impactBps,1000);
assert(P.quoteSwap({amountIn:'1',poolIn:'1000',poolOut:'1000',tradingFee:553}).impactBps<10);
assert.equal(P.minOut('100',cfg).toFixed(),'99');
assert.deepEqual(P.ratioDeposit({heldImg:'1000',heldRlusd:'1',poolImg:'22657.586',poolRlusd:'38.4755'}),{img:'588.883471',rlusd:'1'});
assert.throws(()=>P.ratioDeposit({heldImg:'1000',heldRlusd:'0',poolImg:'1',poolRlusd:'1'}),/two_sided/);
assert.equal(P.poolDeviationBps('0.00170','0.00170'),0);assert(P.poolDeviationBps('0.0018','0.0017')>300);
// ---- principal-only harvest: fees grow k, price moves do not ----
const pool0={poolImg:'10000',poolRlusd:'100',lpSupply:'1000'};const k0=P.kPerLp(pool0);
const principalK=new N(100).times(k0).toFixed();
// price move (constant product, no fees): k unchanged -> nothing to harvest
assert.equal(P.harvestPlan({trackedLp:'100',onLedgerLp:'100',principalK,pool:{poolImg:'20000',poolRlusd:'50',lpSupply:'1000'}}).lpToWithdraw,'0');
// 1% fee growth in both reserves -> withdraw exactly the gain, never principal
const grown={poolImg:'10100',poolRlusd:'101',lpSupply:'1000'};
const h=P.harvestPlan({trackedLp:'100',onLedgerLp:'100',principalK,pool:grown});
assert(new N(h.lpToWithdraw).minus('0.990099').abs().lt('0.000001'),h.lpToWithdraw);
const remainingK=new N(100).minus(h.lpToWithdraw).times(P.kPerLp(grown));assert(remainingK.gte(new N(principalK).minus('1e-9')),'principal stays');
// operator LP that the plan never deposited is never harvested
assert.equal(P.harvestPlan({trackedLp:'100',onLedgerLp:'5000',principalK,pool:grown}).lpToWithdraw,h.lpToWithdraw);
assert.equal(P.harvestPlan({trackedLp:'100',onLedgerLp:'50',principalK,pool:grown}).lpToWithdraw,'0');
// ---- split math: value 10/10/80 ----
const s=P.splitHarvest({img:'1000',rlusd:'10'});
assert.deepEqual(s,{burnImg:'200',redepositImg:'100',redepositRlusd:'1',holdersImg:'700',holdersRlusd:'9'});
// valued at pool price (1000 IMG == 10 RLUSD): total 20 -> burn 2 (10%), redeposit 2 (10%), holders 16 (80%)
const px=new N('0.01'),val=(i,r)=>new N(i).times(px).plus(r);
assert.equal(val(s.burnImg,0).toFixed(),'2');assert.equal(val(s.redepositImg,s.redepositRlusd).toFixed(),'2');assert.equal(val(s.holdersImg,s.holdersRlusd).toFixed(),'16');
const s2=P.splitHarvest({img:'0.0000017',rlusd:'0.0000009'});assert.equal(new N(s2.burnImg).plus(s2.redepositImg).plus(s2.holdersImg).toFixed(),'0.000001');
// ---- pro rata payouts + dust carry-forward ----
const A='rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',B='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',C='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
let a=P.allocateHolders({holdersImg:'700',holdersRlusd:'9',owners:[{acct:A,shareUnits:3},{acct:B,shareUnits:1}],rlusdPerImg:'0.01',dust:'0.05'});
assert.deepEqual(a.payouts.map(p=>[p.acct,p.img,p.rlusd]).sort(),[[A,'525','6.75'],[B,'175','2.25']].sort());
assert.deepEqual(a.carry.__unallocated__,{img:'0',rlusd:'0'});
a=P.allocateHolders({holdersImg:'1',holdersRlusd:'0.01',owners:[{acct:A,shareUnits:99},{acct:B,shareUnits:1}],rlusdPerImg:'0.01',dust:'0.05'});
assert.equal(a.payouts.length,0,'both under dust -> carried');assert.equal(a.carry[A].img,'0.99');assert.equal(a.carry[B].rlusd,'0.0001');
const a2=P.allocateHolders({holdersImg:'10',holdersRlusd:'0.1',owners:[{acct:A,shareUnits:99},{acct:B,shareUnits:1}],carry:a.carry,rlusdPerImg:'0.01',dust:'0.05'});
assert.equal(a2.payouts.find(p=>p.acct===A).img,'10.89','carry joins next month');assert(a2.carry[B],'B still under dust');
const a3=P.allocateHolders({holdersImg:'1',holdersRlusd:'1',owners:[{acct:A,shareUnits:3}],carry:{[C]:{img:'5',rlusd:'0'}},rlusdPerImg:'0.01',dust:'0.05'});
assert.deepEqual(a3.carry[C],{img:'5',rlusd:'0'},'former holder keeps earned carry');
const a4=P.allocateHolders({holdersImg:'1',holdersRlusd:'1',owners:[{acct:A,shareUnits:1},{acct:B,shareUnits:1},{acct:C,shareUnits:1}],rlusdPerImg:'1',dust:'0'});
assert.equal(new N(a4.carry.__unallocated__.img).plus(a4.payouts.reduce((n,p)=>n.plus(p.img),new N(0))).toFixed(),'1','rounding residue carried, nothing lost');
// ---- monthly cadence (no hourly) ----
assert.equal(P.duePeriod(null,Date.UTC(2026,11,1,0,5)),'2026-11');
assert.equal(P.duePeriod('2026-11',Date.UTC(2026,11,15)),null,'once per month');
assert.equal(P.duePeriod('2026-10',Date.UTC(2026,11,15)),'2026-11');
assert.equal(P.duePeriod('2026-12',Date.UTC(2027,0,1)),null);
assert.equal(P.duePeriod('2026-11',Date.UTC(2027,0,2)),'2026-12');
{const hs=fs.readFileSync(path.join(__dirname,'estate-hourly-service.js'),'utf8');assert(hs.includes("legacyHourly&&env.ESTATE_DISTRIBUTIONS_ENABLED==='1'"),'hourly payouts need the explicit legacy switch');}
// ---- transaction guards ----
const ctx={treasury:B,poolAccount:P.IMG_RLUSD_POOL,imgIssuer:P.IMG_ISSUER,imgCurrency:'IMG',rlusdIssuer:P.RLUSD_ISSUER,rlusdCurrency:P.RLUSD_HEX,holders:new Set([A])};
const IMG={currency:'IMG',issuer:P.IMG_ISSUER},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER};
const dep={TransactionType:'AMMDeposit',Account:B,Asset:IMG,Asset2:RL,Amount:{...IMG,value:'10'},Amount2:{...RL,value:'0.02'},Flags:P.TF.twoAsset};
assert.equal(P.assertSafeTransaction(dep,ctx),true);
for(const bad of [{...dep,Flags:P.TF.singleAsset},{...dep,Flags:P.TF.oneAssetLPToken},{...dep,Flags:P.TF.limitLPToken},{...dep,Amount2:undefined},
 {...dep,Amount2:{...RL,value:'0'}},{...dep,Flags:P.TF.lpToken,LPTokenOut:{currency:'03',issuer:P.IMG_RLUSD_POOL,value:'1'}},{...dep,EPrice:{...RL,value:'1'}}])
 assert.throws(()=>P.assertSafeTransaction(bad,ctx),/single_sided_deposit_forbidden/);
for(const amt of ['1000000',{...RL,value:'1'},{...IMG,value:'1'}])assert.throws(()=>P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:P.IMG_RLUSD_POOL,Amount:amt},ctx),/payment_to_amm_forbidden/);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'AMMWithdraw',Account:B,Asset:IMG,Asset2:RL,Amount:{...IMG,value:'1'},Flags:P.TF.singleAsset},ctx),/only_proportional/);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'AMMWithdraw',Account:B,Asset:IMG,Asset2:RL,Flags:P.TF.withdrawAll},ctx),/only_proportional/);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'AMMWithdraw',Account:B,Asset:IMG,Asset2:RL,LPTokenIn:{currency:'03',issuer:P.IMG_RLUSD_POOL,value:'2'},Flags:P.TF.lpToken},{...ctx,maxLpIn:'1'}),/withdraw_exceeds_profit/);
assert.equal(P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:B,Amount:{...RL,value:'1'},SendMax:'500000'},ctx),true);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:B,Amount:{...RL,value:'1'},SendMax:'500000',Flags:P.TF.partialPayment},ctx),/partial_payment/);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',Amount:'1'},ctx),/destination_not_allowed/);
assert.equal(P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:P.IMG_ISSUER,Amount:{...IMG,value:'5'}},ctx),true);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:P.IMG_ISSUER,Amount:'5'},ctx),/burn_shape/);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'Payment',Account:B,Destination:A,Amount:'5'},ctx),/holder_payout_shape/);
assert.throws(()=>P.assertSafeTransaction({TransactionType:'OfferCreate',Account:B},ctx),/type_not_allowed/);
assert.throws(()=>P.assertSafeTransaction({...dep,Account:A},ctx),/account/);
// ---- terms gate: operator acceptance replaces legal signoff; published terms hash pinned ----
const {purchaseTerms}=require('./estate-purchase-terms-gate');
const tenv={ESTATE_OPERATOR_TERMS_ACCEPTED:'1',ESTATE_OPERATOR_ACCEPTANCE_REFERENCE:'operator-waiver-2026-11-09',ESTATE_PURCHASE_TERMS_VERSION:'estates-terms-2026-11-09',
 ESTATE_PURCHASE_TERMS_SHA256:'ab16c483a252b4592b087b7d126f28a24fa9a19db2b17693533281d9b469898c',ESTATE_PURCHASE_TERMS_URL:'https://burn-city-game.fly.dev/terms/estates-purchase-terms-2026-11-09.html'};
assert(purchaseTerms(tenv));assert.equal(purchaseTerms({...tenv,ESTATE_OPERATOR_TERMS_ACCEPTED:'0'}),null);assert.equal(purchaseTerms({...tenv,ESTATE_PURCHASE_TERMS_SHA256:''}),null);
assert.equal(purchaseTerms({ESTATE_PURCHASE_LEGAL_SIGNOFF:'1',ESTATE_PURCHASE_LEGAL_REFERENCE:'counsel-ref-123',...tenv,ESTATE_OPERATOR_TERMS_ACCEPTED:undefined}),null);
const page=fs.readFileSync(path.join(__dirname,'..','client','terms','estates-purchase-terms-2026-11-09.html'));
assert.equal(crypto.createHash('sha256').update(page).digest('hex'),tenv.ESTATE_PURCHASE_TERMS_SHA256,'published terms bytes changed: bump version + SHA256');
assert(/no guaranteed return/i.test(page)&&/monthly/i.test(page)&&!/PLX/.test(page));
// ---- #517 migration ----
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,share_units INTEGER,purchase_tx TEXT,purchase_amount_drops INTEGER,purchased_at INTEGER);
CREATE TABLE estate_capital_allocations(purchase_tx TEXT PRIMARY KEY,property_id TEXT NOT NULL UNIQUE,buyer TEXT NOT NULL,purchase_drops TEXT NOT NULL,img_plx_drops TEXT NOT NULL,img_xrp_drops TEXT NOT NULL,policy_version INTEGER NOT NULL CHECK(policy_version IN (1,2)),state TEXT NOT NULL CHECK(state='awaiting_liquidity_execution'),created_at INTEGER NOT NULL,img_rlusd_drops TEXT NOT NULL DEFAULT '0',operating_reserve_drops TEXT NOT NULL DEFAULT '0');
CREATE TABLE estate_liquidity_jobs(id TEXT PRIMARY KEY,purchase_tx TEXT NOT NULL,pair TEXT NOT NULL,initial_budget_drops TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL,note TEXT,last_harvest_hour INTEGER,UNIQUE(purchase_tx,pair));`);
const M=require('./estate-517-policy3-migration');const S=M.SALE;
db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run(S.propertyId,S.buyer,1,S.purchaseTx,3000000,1793397660790);
db.prepare("INSERT INTO estate_capital_allocations VALUES(?,?,?,'3000000','2100000','900000',1,'awaiting_liquidity_execution',1793397660790,'0','0')").run(S.purchaseTx,S.propertyId,S.buyer);
db.prepare("INSERT INTO estate_liquidity_jobs VALUES('j1',?,'img-plx','2100000','invested','{\"cash\":\"0\"}',NULL,NULL),('j2',?,'img-xrp','900000','invested','{\"cash\":\"0\"}',NULL,NULL)").run(S.purchaseTx,S.purchaseTx);
const dry=M.rebook517(db,{env:{}});assert.equal(dry.dryRun,true);assert.equal(db.prepare('SELECT policy_version v FROM estate_capital_allocations').get().v,1,'dry run changes nothing');
const done=M.rebook517(db,{env:{},apply:true});
assert.equal(done.applied,true);
const row=db.prepare('SELECT * FROM estate_capital_allocations').get();
assert.deepEqual([row.policy_version,row.img_plx_drops,row.img_xrp_drops,row.img_rlusd_drops,row.operating_reserve_drops],[3,'0','0','2970000','30000']);
assert.deepEqual(db.prepare('SELECT state FROM estate_liquidity_jobs').all().map(r=>r.state),['superseded_policy3','superseded_policy3']);
const dq=db.prepare('SELECT * FROM estate_mp_deposits').get();assert.deepEqual([dq.kind,dq.state,dq.xrp_remaining_drops],['purchase','queued','2970000']);
assert.equal(JSON.parse(db.prepare('SELECT data_json FROM estate_mp_migrations').get().data_json).before.allocation.img_plx_drops,'2100000','audit keeps prior rows');
assert.equal(M.rebook517(db,{env:{},apply:true}).alreadyApplied,true,'idempotent');
// guard reserve now protects the queued 2.97 XRP, then releases it as it is swapped
const {estateCashReserve}=require('./estate-liquidity-runtime');
assert.equal(estateCashReserve(db),'2970000');
db.prepare("UPDATE estate_mp_deposits SET xrp_remaining_drops='970000'").run();assert.equal(estateCashReserve(db),'970000');
assert.throws(()=>M.rebook517(new DatabaseSync(':memory:'),{apply:true}),/ownership_does_not_match|no such table/);
console.log('Estates monthly plan: v3 no-PLX policy, split 10/10/80, principal-only harvest, guards, monthly cadence + dust carry, terms gate and #517 re-book passed');
