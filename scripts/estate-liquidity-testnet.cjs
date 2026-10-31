'use strict';
// Real public TESTNET transactions with newly generated/faucet-funded wallets.
// Never reads a treasury seed or configuration from production.
const assert=require('node:assert/strict'),xrpl=require('xrpl'),{DatabaseSync}=require('node:sqlite');
const {createEstateLiquidityRuntime}=require('../server/estate-liquidity-runtime');
const {createEstateCapitalAllocation}=require('../server/estate-capital-allocation');
const {createEstateSaleReservations}=require('../server/estate-sale-reservations');
const {createEstateSaleOrchestrator}=require('../server/estate-sale-orchestrator');
const {token,value,drops}=require('../server/estate-liquidity-ledger');
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
  const [issuer,maker,treasury,owner]=wallets,IMG={currency:'IMG',issuer:issuer.classicAddress},PLX={currency:'PLX',issuer:issuer.classicAddress};
  const send=async(w,tx)=>{const t=await client.autofill({Account:w.classicAddress,...tx});const result=(await client.submitAndWait(w.sign(t).tx_blob)).result;assert.equal(result.meta.TransactionResult,'tesSUCCESS',JSON.stringify({type:tx.TransactionType,result:result.meta.TransactionResult}));return result;};
  await send(issuer,{TransactionType:'AccountSet',SetFlag:xrpl.AccountSetAsfFlags.asfDefaultRipple});
  for(const w of [maker,treasury])for(const a of [IMG,PLX])await send(w,{TransactionType:'TrustSet',LimitAmount:{...a,value:'1000000'}});
  for(const a of [IMG,PLX])await send(issuer,{TransactionType:'Payment',Destination:maker.classicAddress,Amount:{...a,value:'100000'}});
  for(const a of [IMG,PLX])await send(maker,{TransactionType:'AMMCreate',Amount:'20000000',Amount2:{...a,value:'20000'},TradingFee:300});
  await send(maker,{TransactionType:'AMMCreate',Amount:{...IMG,value:'20000'},Amount2:{...PLX,value:'20000'},TradingFee:300});
  const pair=(await client.request({command:'amm_info',asset:IMG,asset2:PLX,ledger_index:'validated'})).result.amm.account;
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER);CREATE TABLE estate_img_scan_watermarks(id INTEGER PRIMARY KEY,scanned_through_ms INTEGER,ledger_index INTEGER,verified_at_ms INTEGER)');
  createEstateCapitalAllocation(db,{policyVersion:1});const reservations=createEstateSaleReservations(db),reservation=reservations.reserve({reservationId:'testnet-estate-reservation',propertyId:'trailer-01',buyer:owner.classicAddress,now:Date.now()});
  const purchased=await send(owner,{TransactionType:'Payment',Destination:treasury.classicAddress,Amount:'3000000',Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:Buffer.from(reservation.reservation_id).toString('hex').toUpperCase()}}]});
  assert.ok(purchased.hash,'validated purchase hash required');
  await createEstateSaleOrchestrator(db,{treasury:treasury.classicAddress,client}).settle({reservationId:reservation.reservation_id,txHash:purchased.hash,now:Date.now()});
  // This scenario proves historical policy-1 positions continue to execute.
  // Current sale settlement correctly writes policy 2; seed the disposable
  // test database with the exact pre-upgrade allocation before executing it.
  const legacy=require('../server/estate-capital-allocation').splitEstateCapital('3000000',1);
  assert.equal(db.prepare('SELECT policy_version FROM estate_capital_allocations WHERE purchase_tx=?').get(purchased.hash).policy_version,2);
  db.prepare("UPDATE estate_capital_allocations SET policy_version=1,img_plx_drops=?,img_xrp_drops=?,img_rlusd_drops='0',operating_reserve_drops='0' WHERE purchase_tx=?").run(legacy.imgPlxDrops,legacy.imgXrpDrops,purchased.hash);
  let clock=Date.now();
  const options={db,client,wallet:()=>treasury,treasury:treasury.classicAddress,imgIssuer:issuer.classicAddress,plxIssuer:issuer.classicAddress,guard:{paused:()=>false,check:async()=>null},fundingEnabled:true,harvestEnabled:false,payoutsEnabled:true,now:()=>clock,imgPlxPoolAccount:pair,maxNativePayoutDrops:'100000000',maxNativeDailyDrops:'1000000000'};
  let runtime=createEstateLiquidityRuntime(options);
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
  await until(()=>db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE state='invested'").get().n===2,'70/30 actual two-sided funding');
  // Create test price movement through a real bounded trade, not a fabricated
  // accounting receipt. All assets and funds here are disposable testnet units.
  await send(maker,{TransactionType:'Payment',Destination:maker.classicAddress,Amount:{...IMG,value:'5000'},SendMax:'10000000',Flags:0});
  clock+=3600000;runtime=createEstateLiquidityRuntime({...options,harvestEnabled:true});
  await until(()=>db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n===1,'Validated net XRP realization');
  const receipt=db.prepare('SELECT * FROM estate_xrp_profit_receipts').get();assert.ok(BigInt(receipt.distributable_drops)>0n);
  // Advance only the test database's scan watermark. Real production hour close
  // is covered by scanner tests; this avoids waiting a wall-clock hour on testnet.
  db.prepare('INSERT INTO estate_img_scan_watermarks(id,scanned_through_ms) VALUES(1,?)').run(receipt.available_after_ms);
  await until(()=>db.prepare("SELECT COUNT(*) n FROM estate_xrp_profit_payouts WHERE state='confirmed'").get().n===1,'Actual owner XRP wallet payout');
  const payout=db.prepare('SELECT * FROM estate_xrp_profit_payouts').get(),proof=(await client.request({command:'tx',transaction:payout.tx_hash,binary:false})).result;
  assert.equal(proof.validated,true);assert.equal(proof.meta.TransactionResult,'tesSUCCESS');assert.equal(proof.meta.delivered_amount,payout.amount_drops);
  const tx=proof.tx_json||proof;assert.equal(tx.Destination,owner.classicAddress);
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
  console.log(JSON.stringify({network:'testnet',passed:true,purchaseHash:purchased.hash,liquidityTransactions:db.prepare("SELECT purpose,tx_hash FROM estate_treasury_transactions WHERE state='applied'").all(),nativePayoutHash:payout.tx_hash,payoutDrops:payout.amount_drops,hourCloseUsesTestWatermark:true}));
 }finally{await client.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
