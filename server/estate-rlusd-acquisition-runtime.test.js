'use strict';
const assert=require('node:assert/strict');
const {fixture,until}=require('./estate-liquidity-runtime.test');
const {planEstateRlusdAcquisitionSplit:plan}=require('./estate-rlusd-acquisition-ratio-preview');
const {N,value}=require('./estate-liquidity-ledger');
(async()=>{
 const f=fixture({policyVersion:2});
 // Simulate a small 80-bps gap between the existing AMM ratio and the
 // independent XRP/IMG + XRP/RLUSD reference market (inside the 100-bps cap).
 f.stablePool.y=new N('100.8');
 let r=f.make();
 const original=plan({
  earmarkedCapitalDrops:'2970000',
  poolImg:'1000000',poolRlusd:'100.8',
  referenceXrpPerImg:'0.0001',referenceXrpPerRlusd:'1'
 });
 assert.notEqual(original.indicativeImgAcquisitionBudgetDrops,'1485000',
  'small price divergence must shift the 50/50 XRP spending plan');
 await until(f,r,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE pair='img-rlusd' AND state='invested'").get().n===1,100);
 const buys=f.sent.filter(tx=>tx.TransactionType==='Payment'&&tx.Destination===f.treasury);
 assert.equal(buys.length,2,'exactly two ledger-validated asset purchases');
 assert.equal(buys[0].SendMax,original.indicativeImgAcquisitionBudgetDrops);
 assert.equal(buys[1].SendMax,original.indicativeRlusdAcquisitionBudgetDrops,
  'unused first-leg SendMax must not inflate the second-leg allocation');
 assert.equal(BigInt(buys[0].SendMax)+BigInt(buys[1].SendMax),2970000n);
 const deposits=f.sent.filter(tx=>tx.TransactionType==='AMMDeposit');
 assert.equal(deposits.length,1);
 assert.equal(deposits[0].Flags,0x00100000);
 assert(deposits[0].LPTokenOut?.value,'minimum LP floor must remain present');
 const position=f.db.prepare("SELECT * FROM estate_liquidity_jobs WHERE pair='img-rlusd'").get();
 const d=JSON.parse(position.data_json);
 assert.equal(d.plannedRlusdBudgetDrops,original.indicativeRlusdAcquisitionBudgetDrops);
 assert(BigInt(d.cash)>0n,'unspent XRP is preserved as purchase principal');
 assert(value(d.basis).gt(0));
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 const before=f.sent.length;
 r=f.make();for(let i=0;i<6;i++)await r.tick();
 assert.equal(f.sent.length,before,'restart never repeats proven buys or deposits');
 const disabled=fixture({policyVersion:2});
 const dr=disabled.make({fundingEnabled:false,payoutsEnabled:false});
 await dr.tick();assert.equal(disabled.sent.length,0,'default financial gates hold');
 const mismatch=fixture({policyVersion:2});
 mismatch.stablePool.y=new N('102');
 const mr=mismatch.make();
 await mr.tick();
 assert.equal(mismatch.sent.length,0,'market mispricing must still prevent trade signing');
 assert.match(mr.status(mismatch.owner).liquidityStatus,/img_rlusd_market_price_mismatch/);
 console.log('New policy IMG/RLUSD funding: validated ratio-budget execution, capped second leg, principal carry, LP minimum, restart, and market guards passed');
})().catch(e=>{console.error(e);process.exitCode=1});
