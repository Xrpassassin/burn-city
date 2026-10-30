'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createEstateHourlyRuntime,POOL,SOURCE}=require('./estate-hourly-runtime');
const {createImgHistoricalBootstrap}=require('./estate-img-historical-bootstrap');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',issuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',owner='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q';
const hour=1700000000000-1700000000000%3600000,initial=101;
function setup(rewards=true){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,share_units INTEGER,purchased_at INTEGER);CREATE TABLE estate_owner_payout_preferences(acct TEXT PRIMARY KEY,currency TEXT)');
 const date=ms=>ms/1000-946684800;
 const times=[hour+1000,hour+2000,hour+3600000];
 const hashes=['B','C','D'].map(c=>c.repeat(64));
 const client={request:async q=>{
  if(q.command==='ledger'&&q.ledger_index==='validated')return {result:{validated:true,ledger_index:103}};
  const i=q.command==='ledger'?q.ledger_index-101:q.command==='account_tx'?q.ledger_index_min-101:Number(q.transaction[0])-1;
  const time=times[i];
  if(q.command==='ledger')return {result:{validated:true,ledger:{ledger_index:101+i,close_time:date(time),ledger_hash:hashes[i],parent_hash:i?hashes[i-1]:'A'.repeat(64),transaction_hash:'E'.repeat(64),transactions:rewards&&i<2?[String(i+1).repeat(64)]:[]}}};
  if(q.command==='account_tx')return {result:{validated:true,account:treasury,ledger_index_min:101+i,ledger_index_max:101+i,transactions:rewards&&i<2?[{validated:true,ledger_index:101+i,hash:String(i+1).repeat(64),tx_json:{TransactionType:'Payment',Account:SOURCE,Destination:treasury}}]:[]}};
  return {result:{validated:true,ledger_index:101+i,hash:q.transaction,date:date(time),TransactionType:'Payment',Account:SOURCE,Destination:treasury,Memos:[{Memo:{MemoData:Buffer.from(JSON.stringify({payoutType:'lp',poolAccount:POOL,rewardAsset:'IMG',roundId:'test-'+i})).toString('hex')}}],meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:'IMG',issuer,value:'1.000001234'}}}};
 }};
 return {db,client};}
(async()=>{
 const {db,client}=setup();
 const {createImgRewardVerifier}=require('./estate-img-xrpl-receipt-verifier');
 const verify=createImgRewardVerifier(client,{treasury,imgIssuer:issuer,allowedSources:[SOURCE],rewardPoolAccount:'another-pool'});
 assert.equal((await verify('1'.repeat(64))).ignored,true);
const runtime=createEstateHourlyRuntime({db,client,treasury,imgIssuer:issuer,enabled:true,maxLedgers:1});
 assert.equal((await runtime.tick()).blocked,'historical_bootstrap_required');
 createImgHistoricalBootstrap(db).configure({startLedgerIndex:initial,startLedgerHash:'B'.repeat(64),treasury,imgIssuer:issuer,allowedSources:[SOURCE],confirmedOnChain:true});
 await runtime.tick(); // first receipt had no owners
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?)').run('trailer-01',owner,1,hour+1500);
 db.prepare('INSERT INTO estate_owner_payout_preferences VALUES(?,?)').run(owner,'IMG');
 await runtime.tick();await runtime.tick();
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_img_retained_receipts').get().n,1);
 const rows=runtime.state(owner).payouts;assert.equal(rows.length,1);assert.equal(rows[0].img_units,'1000001');assert.equal(rows[0].currency,'IMG');
 const restarted=createEstateHourlyRuntime({db,client,treasury,imgIssuer:issuer,enabled:true,maxLedgers:1});await restarted.tick();assert.equal(restarted.state(owner).payouts.length,1);
 assert.equal(db.prepare('SELECT total_units FROM estate_img_hourly_batches').get().total_units,'1000001');
 const empty=setup(false);
 empty.db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?)').run('trailer-01',owner,1,hour);
 const noEarnings=createEstateHourlyRuntime({db:empty.db,client:empty.client,treasury,imgIssuer:issuer,enabled:true});
 createImgHistoricalBootstrap(empty.db).configure({startLedgerIndex:initial,startLedgerHash:'B'.repeat(64),treasury,imgIssuer:issuer,allowedSources:[SOURCE],confirmedOnChain:true});
 await noEarnings.tick();
 assert.equal(noEarnings.state(owner).payouts.length,0,'closed hours with no verified rewards create no payouts');
 assert.equal(empty.db.prepare('SELECT COUNT(*) n FROM estate_img_hourly_batches').get().n,0);
 console.log('Hourly source verification, no-owner retention, historical eligibility, close and restart tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
