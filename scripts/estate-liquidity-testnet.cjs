'use strict';
// Real public TESTNET transactions with newly generated/faucet-funded wallets.
// Never reads a treasury seed or configuration from production.
const assert=require('node:assert/strict'),xrpl=require('xrpl'),{DatabaseSync}=require('node:sqlite');
const {createEstateLiquidityRuntime}=require('../server/estate-liquidity-runtime');
const {createEstateSaleReservations}=require('../server/estate-sale-reservations');
const {createEstateSaleOrchestrator}=require('../server/estate-sale-orchestrator');
const url=process.env.ESTATE_TESTNET_WSS||'wss://s.altnet.rippletest.net:51233';
if(!['wss://s.altnet.rippletest.net:51233','wss://testnet.xrpl-labs.com'].includes(url))throw Error('allowlisted_public_testnet_required');
if(process.env.TREASURY_SEED)throw Error('production_seed_must_not_be_present');
const client=new xrpl.Client(url,{connectionTimeout:15000,timeout:20000});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await client.connect();
 try{
  const wallets=[];
  for(let i=0;i<4;i++){const result=await client.fundWallet();wallets.push(result.wallet);console.log('Faucet wallet funded',i+1);}
  const [issuer,maker,treasury,owner]=wallets,IMG={currency:'IMG',issuer:issuer.classicAddress},RLUSD={currency:'524C555344000000000000000000000000000000',issuer:issuer.classicAddress};
  const send=async(w,tx)=>{const t=await client.autofill({Account:w.classicAddress,...tx});const result=(await client.submitAndWait(w.sign(t).tx_blob)).result;assert.equal(result.meta.TransactionResult,'tesSUCCESS',JSON.stringify({type:tx.TransactionType,result:result.meta.TransactionResult}));return result;};
  await send(issuer,{TransactionType:'AccountSet',SetFlag:xrpl.AccountSetAsfFlags.asfDefaultRipple});
  for(const w of [maker,treasury])for(const a of [IMG,RLUSD])await send(w,{TransactionType:'TrustSet',LimitAmount:{...a,value:'1000000'}});
  for(const a of [IMG,RLUSD])await send(issuer,{TransactionType:'Payment',Destination:maker.classicAddress,Amount:{...a,value:'100000'}});
  for(const a of [IMG,RLUSD])await send(maker,{TransactionType:'AMMCreate',Amount:'40000000',Amount2:{...a,value:'40000'},TradingFee:300});
  await send(maker,{TransactionType:'AMMCreate',Amount:{...IMG,value:'20000'},Amount2:{...RLUSD,value:'20000'},TradingFee:300});
  const pair=(await client.request({command:'amm_info',asset:IMG,asset2:RLUSD,ledger_index:'validated'})).result.amm.account;
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER);CREATE TABLE estate_img_scan_watermarks(id INTEGER PRIMARY KEY,scanned_through_ms INTEGER,ledger_index INTEGER,verified_at_ms INTEGER)');
  const reservations=createEstateSaleReservations(db),reservation=reservations.reserve({reservationId:'testnet-estate-reservation',propertyId:'trailer-01',buyer:owner.classicAddress,now:Date.now()});
  const purchased=await send(owner,{TransactionType:'Payment',Destination:treasury.classicAddress,Amount:'3000000',Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:Buffer.from(reservation.reservation_id).toString('hex').toUpperCase()}}]});
  assert.ok(purchased.hash,'validated purchase hash required');
  await createEstateSaleOrchestrator(db,{treasury:treasury.classicAddress,client}).settle({reservationId:reservation.reservation_id,txHash:purchased.hash,now:Date.now()});
  const allocation=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?').get(purchased.hash);
  // New sales book policy v3 (monthly plan, estate-monthly-executor.js). This script proves the
  // RETIRED hourly engine, which only funds v2 rows, so the fixture row is relabelled v2 (same split).
  assert.equal(allocation.policy_version,3);
  db.prepare('UPDATE estate_capital_allocations SET policy_version=2 WHERE purchase_tx=?').run(purchased.hash);
  assert.equal(allocation.img_rlusd_drops,'2970000');
  assert.equal(allocation.operating_reserve_drops,'30000');
  assert.equal(allocation.img_plx_drops,'0');
  assert.equal(allocation.img_xrp_drops,'0');
  // Disposable faucet pools have only 40 XRP per conversion leg. Allow the
  // fixture's own price movement while keeping the live runtime defaults intact.
  const runtime=createEstateLiquidityRuntime({
   db,client,wallet:()=>treasury,treasury:treasury.classicAddress,imgIssuer:issuer.classicAddress,
   rlusdIssuer:issuer.classicAddress,rlusdPoolAccount:pair,rlusdEnabled:true,maxAcquisitionImpactBps:1000,
   guard:{paused:()=>false,check:async()=>null},fundingEnabled:true
  });
  const initialStatus=runtime.status(owner.classicAddress);
  assert.equal(initialStatus.legacyAmmTradingEnabled,false);
  assert.equal(initialStatus.imgRlusdFundingEnabled,true);
  async function until(predicate,label,limit=150){
   let repeated=0,lastNote='';
   for(let i=0;i<limit;i++){
    if(predicate()){console.log(label,'passed');return;}
    await runtime.tick();
    const currentNote=runtime.status(owner.classicAddress).liquidityStatus;if(currentNote===lastNote&&currentNote!=='enabled'&&!currentNote.startsWith('awaiting_'))repeated++;else repeated=0;lastNote=currentNote;
    if(repeated>=3){for(const row of db.prepare("SELECT purpose,draft_json,result_json,note FROM estate_treasury_transactions WHERE state='validated'").all()){const result=JSON.parse(row.result_json);console.log('Public testnet proof diagnostic',JSON.stringify({purpose:row.purpose,draft:JSON.parse(row.draft_json),hash:result.hash,delivered:result.meta.delivered_amount,nodes:result.meta.AffectedNodes.filter(n=>['AccountRoot','RippleState'].includes((n.ModifiedNode||n.CreatedNode||n.DeletedNode)?.LedgerEntryType))}));}throw Error('testnet_proof_blocked:'+currentNote);}
    const held=db.prepare("SELECT id,state,note FROM estate_treasury_transactions WHERE state='held'").all();if(held.length)throw Error('testnet_transaction_held:'+JSON.stringify(held));
    if(i%10===0)console.log(label,JSON.stringify({status:runtime.status(owner.classicAddress).liquidityStatus,jobs:db.prepare('SELECT pair,state,note FROM estate_liquidity_jobs').all(),intents:db.prepare("SELECT purpose,state,note FROM estate_treasury_transactions WHERE state!='applied'").all()}));
    await wait(2000);
   }throw Error('testnet_timeout:'+label+':'+JSON.stringify(runtime.status(owner.classicAddress)));
  }
  await until(()=>db.prepare("SELECT state FROM estate_liquidity_jobs WHERE purchase_tx=? AND pair='img-rlusd'").get(purchased.hash)?.state==='invested','99/1 IMG/RLUSD two-sided funding');
  const jobs=db.prepare('SELECT * FROM estate_liquidity_jobs').all();
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].initial_budget_drops,allocation.img_rlusd_drops);
  const position=JSON.parse(jobs[0].data_json);
  assert.equal(position.lpAccount,pair);
  assert(Number(position.lp)>0,'validated deposit must mint LP tokens');
  const deposits=db.prepare("SELECT tx_hash FROM estate_treasury_transactions WHERE state='applied' AND purpose='capital_deposit'").all();
  assert.equal(deposits.length,1);
  const depositProof=(await client.request({command:'tx',transaction:deposits[0].tx_hash,binary:false})).result;
  assert.equal(depositProof.validated,true);
  assert.equal(depositProof.meta.TransactionResult,'tesSUCCESS');
  const deposit=depositProof.tx_json||depositProof;
  assert.equal(deposit.TransactionType,'AMMDeposit');
  assert.deepEqual(deposit.Asset,IMG);
  assert.deepEqual(deposit.Asset2,RLUSD);
  assert(Number(deposit.Amount.value)>0&&Number(deposit.Amount2.value)>0,'deposit must contain both assets');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n,0,'purchase principal is not a reward');
  // Fund verified disposable reward inventory, then exercise both real net
  // payout paths. Production seeds/configuration remain unavailable here.
  await send(owner,{TransactionType:'TrustSet',LimitAmount:{...IMG,value:'1000000'},Flags:131072});
  await send(issuer,{TransactionType:'Payment',Destination:treasury.classicAddress,Amount:{...IMG,value:'10'}});
  const {createEstateHourlyRuntime}=require('../server/estate-hourly-runtime');
  const {createEstateNetRewardExecutor}=require('../server/estate-net-reward-executor');
  db.exec('CREATE TABLE estate_owner_payout_preferences(acct TEXT PRIMARY KEY,currency TEXT)');
  const hourly=createEstateHourlyRuntime({db,client,treasury:treasury.classicAddress,imgIssuer:issuer.classicAddress});
  const netOptions={db,client,wallet:()=>treasury,treasury:treasury.classicAddress,imgIssuer:issuer.classicAddress,guard:{paused:()=>false,check:async()=>null},enabled:true};
  const beforeNet=BigInt((await client.request({command:'account_info',account:treasury.classicAddress,ledger_index:'validated'})).result.account_data.Balance);
  const netHashes=[];
  for(const [hour,currency] of [[0,'IMG'],[3600000,'XRP']]){
   db.prepare('INSERT INTO estate_owner_payout_preferences VALUES(?,?) ON CONFLICT(acct) DO UPDATE SET currency=excluded.currency').run(owner.classicAddress,currency);
   db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?,?,?,?,?)').run(hour,'1000000',1,1,'testnet-'+currency,hour+3600000);
   db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(hour,owner.classicAddress,'1000000');hourly.enqueue(hour);
   let paid;
   for(let attempt=0;attempt<60;attempt++){
    // Recreate on every pass to test durable recovery, not in-memory state.
    await createEstateNetRewardExecutor(netOptions).tick();
    paid=db.prepare('SELECT * FROM estate_hourly_payouts WHERE epoch_start_ms=?').get(hour);if(paid.state==='confirmed')break;
    if(attempt%10===0)console.log('Net reward testnet',currency,paid.note||paid.state);
    if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state='held'").get())throw Error('net_reward_testnet_held');
    await wait(2000);
   }
   assert.equal(paid.state,'confirmed',paid.note);
   const paidProof=(await client.request({command:'tx',transaction:paid.tx_hash,binary:false})).result;
   assert.equal(paidProof.validated,true);assert.equal(paidProof.meta.TransactionResult,'tesSUCCESS');
   assert.equal((paidProof.tx_json||paidProof).Destination,owner.classicAddress);
   if(currency==='IMG')assert.equal(paidProof.meta.delivered_amount.currency,'IMG');else assert.equal(typeof paidProof.meta.delivered_amount,'string');
   const fees=db.prepare('SELECT fee_paid_drops,unrecovered_fee_drops,state FROM estate_reward_settlements WHERE payout_id=?').get(paid.id);
   assert.equal(fees.state,'paid');assert.equal(fees.unrecovered_fee_drops,'0');assert(BigInt(fees.fee_paid_drops)>0n);
   netHashes.push({currency,hash:paid.tx_hash});console.log('Actual net hourly reward',currency,'passed');
  }
  const afterNet=BigInt((await client.request({command:'account_info',account:treasury.classicAddress,ledger_index:'validated'})).result.account_data.Balance);
  assert(afterNet>=beforeNet,'reward conversion must cover every network fee without reducing pre-existing treasury XRP');
  console.log('Actual treasury XRP preservation after IMG and XRP net rewards passed',JSON.stringify(netHashes));
  console.log(JSON.stringify({network:'testnet',passed:true,purchaseHash:purchased.hash,liquidityTransactions:db.prepare("SELECT purpose,tx_hash FROM estate_treasury_transactions WHERE state='applied'").all(),depositHash:deposits[0].tx_hash,netRewardTransactions:netHashes}));
 }finally{await client.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
