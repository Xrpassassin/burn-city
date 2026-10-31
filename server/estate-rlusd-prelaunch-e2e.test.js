'use strict';
// Simulates a settled purchase record. Never contacts Xaman or mainnet.
const assert=require('node:assert/strict');
const {fixture,until}=require('./estate-liquidity-runtime.test');
const {quoteEstate}=require('./estate-purchase-contract');
const {estateCashReserve}=require('./estate-liquidity-runtime');
(async()=>{
 const quote=quoteEstate('trailer-01');
 assert.equal(quote.priceDrops,3000000);
 assert.equal(quote.paymentEnabled,false);
 const f=fixture({policyVersion:2});
 const recorded=f.db.prepare('SELECT purchase_amount_drops,property_id FROM estate_property_ownership').get();
 assert.equal(recorded.property_id,quote.propertyId);
 assert.equal(recorded.purchase_amount_drops,quote.priceDrops);
 const allocation=f.db.prepare('SELECT * FROM estate_capital_allocations').get();
 assert.equal(allocation.img_rlusd_drops,'2970000');
 assert.equal(allocation.operating_reserve_drops,'30000');
 assert.equal(estateCashReserve(f.db),'2970000');
 // Closed gates: no trade, deposit, redemption or payout.
 let runtime=f.make({fundingEnabled:false,harvestEnabled:false,payoutsEnabled:false});
 await runtime.tick();
 assert.equal(f.sent.length,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n,0);
 // Only the simulated sandbox enables funding: both assets acquired and deposited.
 runtime=f.make({fundingEnabled:true,harvestEnabled:false,payoutsEnabled:false});
 await until(f,runtime,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE state='invested'").get().n===1,80);
 assert.equal(f.sent.filter(t=>t.TransactionType==='AMMDeposit').length,1);
 assert.equal(f.sent.filter(t=>t.TransactionType==='Payment'&&t.Destination===f.owner).length,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 // A profitable mark alone is not permission to send an unapproved bonus.
 f.clock+=3600000;
 f.stablePool.x=f.stablePool.x.times('3');
 f.stablePool.y=f.stablePool.y.times('3');
 runtime=f.make({fundingEnabled:false,harvestEnabled:false,payoutsEnabled:false});
 await runtime.tick();
 assert.equal(f.sent.filter(t=>t.Destination===f.owner).length,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 console.log('Prelaunch simulated quote, reserved purchase capital, two-sided funding, and bonus isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
