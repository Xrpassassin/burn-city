'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),xrpl=require('xrpl');
const {createEstateHourlyRuntime}=require('./estate-hourly-runtime');
const {createEstatePayoutExecutor,quoteXrp}=require('./estate-payout-executor');
function setup(currency='IMG'){
 const wallet=xrpl.Wallet.generate(),treasury=wallet.classicAddress,issuer=xrpl.Wallet.generate().classicAddress,owner=xrpl.Wallet.generate().classicAddress;
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,share_units INTEGER,purchased_at INTEGER);CREATE TABLE estate_owner_payout_preferences(acct TEXT PRIMARY KEY,currency TEXT)');
 let paused=false,submits=0,validated=false,failSubmit=false,missingLine=false,badHash=false,decoded,hash;
 const ledgerHash='A'.repeat(64);
 const client={autofill:async tx=>({...tx,Fee:'12',Sequence:1,LastLedgerSequence:120}),request:async q=>{
  if(q.command==='ledger')return {result:{validated:true,ledger_index:100,ledger_hash:ledgerHash}};
  if(q.command==='account_info')return {result:{validated:true,ledger_hash:ledgerHash,account_data:{Account:q.account,Flags:0}}};
  if(q.command==='account_lines')return {result:{validated:true,ledger_hash:ledgerHash,lines:missingLine&&q.account===owner?[]:[{currency:'IMG',account:issuer,balance:q.account===treasury?'10':'0',limit:'1000'}]}};
  if(q.command==='amm_info')return {result:{validated:true,ledger_hash:ledgerHash,amm:{amount:'1000000',amount2:{currency:'IMG',issuer,value:'100'},trading_fee:300}}};
  if(q.command==='submit'){submits++;decoded=xrpl.decode(q.tx_blob);hash=xrpl.hashes.hashSignedTx(q.tx_blob);if(failSubmit)throw Error('unknown_submit_outcome');return {result:{engine_result:'tesSUCCESS'}};}
  if(q.command==='tx')return {result:{hash:badHash?'B'.repeat(64):hash,validated,tx_json:decoded,meta:{TransactionResult:'tesSUCCESS',delivered_amount:decoded.Amount,AffectedNodes:[{ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency:'IMG',value:currency==='XRP'?'9.1':'9'}},PreviousFields:{Balance:{currency:'IMG',value:'10'}}}}]}}};
  throw Error('unexpected_request:'+q.command);
 }};
 const runtime=createEstateHourlyRuntime({db,client,treasury,imgIssuer:issuer,enabled:false});
 db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?,?,?,?,?)').run(0,'1000000',1,1,'digest',3600000);
 db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(0,owner,'1000000');
 db.prepare('INSERT INTO estate_owner_payout_preferences VALUES(?,?)').run(owner,currency);
 runtime.enqueue(0);
 const make=(enabled=true,options={})=>createEstatePayoutExecutor({db,client,wallet:()=>wallet,treasury,imgIssuer:issuer,enabled,guard:{paused:()=>paused,check:async()=>null},...options});
 return {db,runtime,make,owner,issuer,get submits(){return submits;},set paused(v){paused=v;},set validated(v){validated=v;},set failSubmit(v){failSubmit=v;},set missingLine(v){missingLine=v;},set badHash(v){badHash=v;}};
}
(async()=>{
 const a=setup();assert.equal((await a.make(false).tick()).skipped,'disabled');a.paused=true;assert.equal((await a.make().tick()).blocked,'payouts_paused');assert.equal(a.submits,0);
 a.paused=false;a.missingLine=true;await a.make().tick();assert.equal(a.submits,0);assert.equal(a.runtime.state(a.owner).payouts[0].note,'recipient_img_trustline_unavailable');
 a.missingLine=false;a.failSubmit=true;assert.ok((await a.make().tick()).submitted);assert.equal(a.submits,1);
 await a.make().tick();assert.equal(a.submits,1);assert.equal(a.runtime.state(a.owner).payouts[0].state,'submitted');
 a.validated=true;a.paused=true;assert.ok((await a.make(false).tick()).confirmed);assert.equal(a.runtime.state(a.owner).payouts[0].state,'confirmed');await a.make().tick();assert.equal(a.submits,1);
 const b=setup('XRP');assert.ok((await b.make().tick()).submitted);b.validated=true;assert.ok((await b.make().tick()).confirmed);assert.equal(b.runtime.state(b.owner).payouts[0].remainder_img_units,'100000');
 assert.equal(b.db.prepare('SELECT units FROM estate_payout_credits').get().units,'100000');
 b.runtime.enqueue(0);assert.equal(b.db.prepare('SELECT units FROM estate_payout_credits').get().units,'100000');
 b.db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?,?,?,?,?)').run(3600000,'1000000',1,1,'digest2',7200000);b.db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(3600000,b.owner,'1000000');b.runtime.enqueue(3600000);
 assert.equal(b.db.prepare('SELECT img_units FROM estate_hourly_payouts WHERE epoch_start_ms=3600000').get().img_units,'1100000');assert.equal(b.db.prepare('SELECT units FROM estate_payout_credits').get().units,'0');
 const concurrent=setup();await Promise.all([concurrent.make().tick(),concurrent.make().tick()]);assert.equal(concurrent.submits,1);
 const capped=setup();await capped.make(true,{maxDailyImgUnits:'1'}).tick();assert.equal(capped.submits,0);assert.equal(capped.runtime.state(capped.owner).payouts[0].note,'daily_payment_budget_limit');
 const interrupted=setup();interrupted.db.exec("UPDATE estate_hourly_payouts SET state='preparing'");assert.equal((await interrupted.make().tick()).blocked,'interrupted_preparation_review_required');assert.equal(interrupted.submits,0);
 const c=setup();await c.make().tick();c.validated=true;c.badHash=true;await c.make().tick();assert.equal(c.runtime.state(c.owner).payouts[0].state,'submitted');assert.equal(c.submits,1);
 assert.throws(()=>quoteXrp({amount:'1',amount2:{currency:'IMG',issuer:b.issuer,value:'100'},trading_fee:300},'1',b.issuer),/below_xrp/);
 console.log('Payout software: IMG/XRP, trustlines, pause, persisted signed blob, ambiguous submit, hash proof and remainder credit tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
