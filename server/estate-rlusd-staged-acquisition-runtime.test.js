'use strict';
const assert=require('node:assert/strict');
const {N,value}=require('./estate-liquidity-ledger');
const {fixture}=require('./estate-liquidity-runtime.test');
function mansion(f){
 // Fixture has already verified an initial trailer. Replace the *disposable*
 // ledger rows consistently to represent a settled 300 XRP test sale.
 f.db.prepare('UPDATE estate_property_ownership SET purchase_amount_drops=300000000').run();
 f.db.prepare("UPDATE estate_capital_allocations SET purchase_drops='300000000',img_rlusd_drops='297000000',operating_reserve_drops='3000000'").run();
}
function alignMockMarket(f){
 // Simulate separate market arbitrage restoring the external reference
 // ratio between swaps. This does NOT imply real markets self-correct.
 const market=f.xrpPool.x.div(f.xrpPool.y).times(f.stableXrp.y).div(f.stableXrp.x);
 f.stablePool.y=f.stablePool.x.times(market);
}
(async()=>{
 const f=fixture({policyVersion:2});mansion(f);
 let r=f.make({payoutsEnabled:false});
 for(let i=0;i<150;i++){
  alignMockMarket(f);
  await r.tick();
  if(f.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE pair='img-rlusd' AND state='invested'").get().n===1)break;
  if(i===50)r=f.make({payoutsEnabled:false}); // Restart mid-acquisition.
 }
 const job=f.db.prepare("SELECT * FROM estate_liquidity_jobs WHERE pair='img-rlusd'").get();
 assert.equal(job.state,'invested',job.note||job.state);
 const d=JSON.parse(job.data_json);
 const buys=f.sent.filter(t=>t.TransactionType==='Payment'&&t.Destination===f.treasury);
 const imgBuys=buys.filter(t=>t.Amount?.currency===f.IMG.currency);
 const rlusdBuys=buys.filter(t=>t.Amount?.currency===f.RLUSD.currency);
 assert(imgBuys.length>=2,'large purchase must span several IMG trades');
 assert(rlusdBuys.length>=2,'large purchase must span several RLUSD trades');
 assert.equal(imgBuys.length,d.imgStageCount);
 assert.equal(rlusdBuys.length,d.rlusdStageCount);
 const sum=rows=>rows.reduce((acc,row)=>acc+BigInt(row.SendMax),0n);
 assert.equal(sum(imgBuys).toString(),d.plannedImgBudgetDrops);
 assert.equal(sum(rlusdBuys).toString(),d.plannedRlusdBudgetDrops);
 assert.equal(sum(buys),297000000n,'all earmarked principal was budgeted, not all necessarily spent');
 assert.equal(d.imgCommittedBudgetDrops,d.plannedImgBudgetDrops);
 assert.equal(d.rlusdCommittedBudgetDrops,d.plannedRlusdBudgetDrops);
 const jobs=f.db.prepare("SELECT id FROM estate_treasury_transactions WHERE purpose='capital_buy'").all();
 assert.equal(new Set(jobs.map(x=>x.id)).size,buys.length,'each tranche has a durable distinct transaction id');
 assert.equal(f.sent.filter(t=>t.TransactionType==='AMMDeposit').length,1,
  'staged acquisition can culminate in one proportional two-sided deposit');
 assert(value(d.basis).gt(0),'LP cost basis comes from validated expenditures');
 assert(BigInt(d.cash)>=0n,'unspent XRP remains reserved principal');
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0,
  'purchase principal and LP minting never create owner rewards');
 const sent=f.sent.length;r=f.make({payoutsEnabled:false});
 for(let i=0;i<6;i++)await r.tick();
 assert.equal(f.sent.length,sent,'restart never replays any completed stage or LP deposit');
 // When reference and target prices drift beyond the configured limit, the
 // next stage must stop rather than relaxing price guards.
 const drift=fixture({policyVersion:2});mansion(drift);let stopped=drift.make({payoutsEnabled:false});
 for(let i=0;i<12;i++)await stopped.tick();
 const partial=drift.sent.filter(t=>t.TransactionType==='Payment'&&t.Destination===drift.treasury);
 assert.equal(partial.length,1,'one guarded tranche is executed before price drift blocks another');
 assert.match(stopped.status(drift.owner).liquidityStatus,/img_rlusd_market_price_mismatch/);
 assert.equal(drift.sent.filter(t=>t.TransactionType==='AMMDeposit').length,0);
 assert.equal(drift.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 const paused=fixture({policyVersion:2});mansion(paused);
 const off=paused.make({fundingEnabled:false,payoutsEnabled:false});
 await off.tick();assert.equal(paused.sent.length,0);
 console.log('Estates multi-stage funding fixture: 300 XRP purchase fully budgeted; repeated bounded trades, one AMM deposit, durable stage IDs, crash recovery, market mismatch halt, no rewards and disabled gates passed');
})().catch(e=>{console.error(e);process.exitCode=1});
