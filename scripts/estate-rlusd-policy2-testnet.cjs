'use strict';
// ISOLATED PUBLIC TESTNET acceptance test. Disposable wallets and MOCK assets.
// Never connects to XRPL mainnet, reads a treasury seed, or enables app sales.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const xrpl=require('xrpl');
const {DatabaseSync}=require('node:sqlite');
const {createEstateSaleOrchestrator}=require('../server/estate-sale-orchestrator');
const {createEstateLiquidityRuntime,estateCashReserve}=require('../server/estate-liquidity-runtime');
const {balanceDelta,value}=require('../server/estate-liquidity-ledger');
const {splitEstateCapital}=require('../server/estate-capital-allocation');

const DEFAULT_TESTNET='wss://s.altnet.rippletest.net:51233';
const TESTNET_ALLOWLIST=new Set([
 'wss://s.altnet.rippletest.net:51233',
 'wss://testnet.xrpl-labs.com'
]);
const endpoint=process.env.ESTATE_TESTNET_WSS||DEFAULT_TESTNET;
if(!TESTNET_ALLOWLIST.has(endpoint))throw Error('public_testnet_endpoint_required');
for(const key of ['TREASURY_SEED','ESTATE_TREASURY_SEED','XRPL_SEED','XRPL_SECRET',
 'XAMAN_API_SECRET','FLY_API_TOKEN']){
 if(process.env[key])throw Error('production_secrets_forbidden_in_testnet_harness:'+key);
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const client=new xrpl.Client(endpoint,{connectionTimeout:18000,timeout:20000});
const XRP={currency:'XRP'};
const RLU_CURRENCY='524C555344000000000000000000000000000000';
const money=amount=>BigInt(amount);
async function submit(wallet,tx){
 const filled=await client.autofill({Account:wallet.classicAddress,...tx});
 xrpl.validate(filled);
 const response=(await client.submitAndWait(wallet.sign(filled).tx_blob)).result;
 assert.equal(response.validated,true,'disposable_testnet_transaction_must_validate');
 assert.equal(response.meta?.TransactionResult,'tesSUCCESS',
  'disposable_testnet_transaction_must_succeed:'+tx.TransactionType+':'+response.meta?.TransactionResult);
 assert(/^[A-Fa-f0-9]{64}$/.test(response.hash||''),'validated_testnet_hash_required');
 return response;
}
async function accountBalance(wallet){
 const r=(await client.request({command:'account_info',
  account:wallet.classicAddress,ledger_index:'validated'})).result;
 assert.equal(r.validated,true);
 return BigInt(r.account_data.Balance);
}
async function walletFromFaucet(label,amount){
 // The public faucet often defaults to 100 test XRP; independent 600-XRP
 // deep-market makers explicitly need a larger but faucet-permitted grant.
 const funded=await client.fundWallet(null,amount?{amount:String(amount)}:undefined);
 const wallet=funded.wallet;
 assert(wallet?.classicAddress,'disposable_wallet_faucet_failed:'+label);
 console.log('Fresh disposable public-testnet wallet ready:',label);
 return wallet;
}
async function createPool(wallet,asset1,amount1,asset2,amount2){
 const sendAmount=(asset,quantity)=>asset.currency==='XRP'?quantity:
  {...asset,value:quantity};
 const receipt=await submit(wallet,{TransactionType:'AMMCreate',
  Amount:sendAmount(asset1,amount1),Amount2:sendAmount(asset2,amount2),
  TradingFee:300});
 const info=(await client.request({command:'amm_info',asset:asset1,asset2,
  ledger_index:'validated'})).result;
 assert.equal(info.validated,true);
 assert(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(info.amm?.account||''));
 return {account:info.amm.account,hash:receipt.hash,ledgerIndex:receipt.ledger_index};
}
function setupDb(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE estate_property_ownership(
   property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,
   purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER);
  CREATE TABLE estate_img_scan_watermarks(
   id INTEGER PRIMARY KEY,scanned_through_ms INTEGER);`);
 return db;
}
function verifiedTx(hash){
 return client.request({command:'tx',transaction:hash,binary:false})
  .then(r=>r.result);
}
async function run(){
 await client.connect();
 const db=setupDb();
 try{
  // Faucet wallets are generated during this run only, never from saved
  // environment credentials. Independent makers permit ample XRP depth
  // for both acquisition pools without depending on faucet amount >1000.
  const [issuer,makerImg,makerRlusd,makerPair,treasury,owner]=[
   await walletFromFaucet('issuer'),
   await walletFromFaucet('xrp_img_maker','700'),
   await walletFromFaucet('xrp_mock_rlusd_maker','700'),
   await walletFromFaucet('img_mock_rlusd_maker'),
   await walletFromFaucet('treasury'),
   await walletFromFaucet('property_buyer')
  ];
  const IMG={currency:'IMG',issuer:issuer.classicAddress};
  const MOCK_RLUSD={currency:RLU_CURRENCY,issuer:issuer.classicAddress};
  assert.notEqual(MOCK_RLUSD.issuer,'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
   'real_rlusd_issuer_must_never_be_used');
  for(const [label,wallet] of [['xrp_img',makerImg],['xrp_rlusd',makerRlusd]]){
   assert((await accountBalance(wallet))>620000000n,
    'faucet_balance_insufficient_for_separate_pool:'+label);
  }
  await submit(issuer,{TransactionType:'AccountSet',
   SetFlag:xrpl.AccountSetAsfFlags.asfDefaultRipple});
  for(const wallet of [makerImg,makerRlusd,makerPair,treasury]){
   for(const issue of [IMG,MOCK_RLUSD])
    await submit(wallet,{TransactionType:'TrustSet',
     LimitAmount:{...issue,value:'1000000'}});
  }
  for(const [wallet,issue] of [
   [makerImg,IMG],[makerRlusd,MOCK_RLUSD],
   [makerPair,IMG],[makerPair,MOCK_RLUSD]
  ])await submit(issuer,{TransactionType:'Payment',
    Destination:wallet.classicAddress,Amount:{...issue,value:'10000'}});
  // Aligned triangle: both XRP pools are 600 XRP / 6000 issued units;
  // IMG/mock-RLUSD has equal 6000/6000 inventory. The target AMM's
  // 1:1 issued-asset spot initially matches both XRP reference pools.
  const imgPool=await createPool(makerImg,XRP,'600000000',IMG,'6000');
  const stablePool=await createPool(makerRlusd,XRP,'600000000',MOCK_RLUSD,'6000');
  const targetPool=await createPool(makerPair,IMG,'6000',MOCK_RLUSD,'6000');
  assert(new Set([imgPool.account,stablePool.account,targetPool.account]).size===3);
  const configured={db,client,treasury:treasury.classicAddress};
  const orchestrator=createEstateSaleOrchestrator(db,configured);
  const now=Date.now();
  const reservationId='estate-policy2-'+crypto.randomBytes(8).toString('hex');
  const reservation=orchestrator.reserve({reservationId,propertyId:'trailer-01',
   buyer:owner.classicAddress,now,ttlMs:900000});
  assert.equal(reservation.price_drops,3000000);
  const purchase=await submit(owner,{TransactionType:'Payment',
   Destination:treasury.classicAddress,Amount:'3000000',Flags:0,
   Memos:[{Memo:{
    MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),
    MemoData:Buffer.from(reservationId).toString('hex').toUpperCase()
   }}]});
  const ownership=await orchestrator.settle({
   reservationId,txHash:purchase.hash,now:Date.now()});
  assert.equal(ownership.status,'settled');
  assert.equal(ownership.distributable,false);
  const saved=db.prepare('SELECT * FROM estate_property_ownership WHERE property_id=?')
   .get('trailer-01');
  assert.equal(saved.purchase_tx,purchase.hash);
  assert.equal(saved.acct,owner.classicAddress);
  const alloc=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?')
   .get(purchase.hash);
  assert(alloc,'verified_purchase_must_record_capital');
  // New sales book policy v3 (same 99/1 split). This acceptance run proves the retired
  // hourly engine, which funds only v2 rows, so the fixture row is relabelled v2.
  assert.equal(alloc.policy_version,3);
  db.prepare('UPDATE estate_capital_allocations SET policy_version=2 WHERE purchase_tx=?').run(purchase.hash);
  assert.equal(alloc.purchase_drops,'3000000');
  assert.equal(alloc.img_rlusd_drops,'2970000');
  assert.equal(alloc.operating_reserve_drops,'30000');
  assert.equal(alloc.img_plx_drops,'0');
  assert.equal(alloc.img_xrp_drops,'0');
  assert.deepEqual(splitEstateCapital('3000000'),{
   purchaseDrops:'3000000',imgPlxDrops:'0',imgXrpDrops:'0',
   imgRlusdDrops:'2970000',operatingReserveDrops:'30000'
  });
  assert.equal(estateCashReserve(db),'2970000');
  const again=await orchestrator.settle({reservationId,txHash:purchase.hash});
  assert.equal(again.status,'already_settled');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_capital_allocations').get().n,1);

  // Model the exact treasury-signing service, but with explicit testnet-only
  // dependency injection and a disposable treasury wallet. The production
  // server still has all sales/funding/distribution switches OFF.
  const guard={
   paused:()=>false,
   check:async(_client,address,feeDrops)=>{
    assert.equal(address,treasury.classicAddress);
    const info=(await client.request({command:'account_info',
     account:address,ledger_index:'validated'})).result;
    if(info.validated!==true)return 'unvalidated_treasury_balance';
    const free=BigInt(info.account_data.Balance)-BigInt(estateCashReserve(db));
    return free<3000000n+BigInt(feeDrops)?'testnet_treasury_fee_reserve_low':null;
   }
  };
  const options={db,client,wallet:()=>treasury,
   treasury:treasury.classicAddress,
   imgIssuer:issuer.classicAddress,rlusdIssuer:issuer.classicAddress,
   plxIssuer:issuer.classicAddress,rlusdPoolAccount:targetPool.account,
   rlusdEnabled:true,legacyTradingEnabled:false,
   fundingEnabled:true,harvestEnabled:false,payoutsEnabled:false,
   guard,maxAcquisitionImpactBps:100,maxFeeDrops:100,slippageBps:300
  };
  let runtime=createEstateLiquidityRuntime(options);
  let invested=false,failedNote=null,stableRepeats=0,previousNote='';
  for(let attempt=0;attempt<100;attempt++){
   await runtime.tick();
   const j=db.prepare("SELECT * FROM estate_liquidity_jobs WHERE pair='img-rlusd'").get();
   if(j?.state==='invested'){invested=true;break;}
   const held=db.prepare("SELECT id,note FROM estate_treasury_transactions WHERE state='held'").all();
   assert.equal(held.length,0,'held_treasury_transaction:'+JSON.stringify(held));
   if(j?.note){
    failedNote=j.note;
    stableRepeats=j.note===previousNote?stableRepeats+1:0;
    previousNote=j.note;
    if(stableRepeats>=4)throw Error('testnet_funding_stalled:'+failedNote);
   }
   // Exercise process-local restart while persisting the exact SQLite journal
   // and immutable signed transaction blobs. A fresh runtime must NOT replay.
   if(attempt===3)runtime=createEstateLiquidityRuntime(options);
   await wait(1200);
  }
  assert(invested,'testnet_funding_did_not_complete:'+(failedNote||'timeout'));
  const job=db.prepare("SELECT * FROM estate_liquidity_jobs WHERE pair='img-rlusd'").get();
  assert(job);
  const data=JSON.parse(job.data_json);
  assert(value(data.lp).gt(0));
  assert(BigInt(data.basis)>0n);
  assert(BigInt(data.cash)>=0n,'unspent_xrp_remains_principal');
  assert.equal(data.lpAccount,targetPool.account);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM estate_treasury_transactions WHERE purpose='capital_deposit' AND state='applied'").get().n,1);
  const intents=db.prepare("SELECT * FROM estate_treasury_transactions WHERE state='applied' ORDER BY created_at,id").all();
  const purchases=intents.filter(x=>x.purpose==='capital_buy');
  const deposit=intents.filter(x=>x.purpose==='capital_deposit');
  assert(purchases.length>=2,'two_independently_proved_asset_acquisitions_required');
  assert.equal(deposit.length,1);
  assert(purchases.every(x=>x.tx_hash&&x.ledger_index>0));
  assert(deposit[0].tx_hash&&deposit[0].ledger_index>0);
  const dtx=await verifiedTx(deposit[0].tx_hash);
  assert.equal(dtx.validated,true);
  assert.equal(dtx.meta?.TransactionResult,'tesSUCCESS');
  const transaction=dtx.tx_json||dtx;
  assert.equal(transaction.TransactionType,'AMMDeposit');
  assert.equal(transaction.Flags,0x00100000);
  const minted=balanceDelta(dtx,treasury.classicAddress,
   {currency:data.lpCurrency,issuer:targetPool.account});
  assert(minted.gt(0),'ledger_verified_lp_mint_required');
  assert(minted.eq(value(data.lp)),'persisted_lp_must_equal_validated_actual');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n,0,
   'new_purchase_principal_is_not_realized_profit');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0,
   'new_purchase_principal_is_not_holder_reward');
  const countBefore=db.prepare('SELECT COUNT(*) n FROM estate_treasury_transactions').get().n;
  runtime=createEstateLiquidityRuntime(options);
  for(let i=0;i<5;i++)await runtime.tick();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_treasury_transactions').get().n,
   countBefore,'restart_cannot_duplicate_signed_intents');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM estate_treasury_transactions WHERE purpose='capital_deposit'").get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);

  console.log('ESTATES_POLICY2_ACTUAL_TESTNET='+JSON.stringify({
   network:'XRPL public testnet',passed:true,
   assets:'mock IMG and mock RLUSD, both issued by new disposable faucet issuer',
   realIssuerOrCustomerFundsUsed:false,
   purchaseHash:purchase.hash,purchaseLedger:purchase.ledger_index,
   poolAccounts:{xrpImg:imgPool.account,xrpMockRlusd:stablePool.account,
    imgMockRlusd:targetPool.account},
   acquisitionProofs:purchases.map(p=>({hash:p.tx_hash,ledgerIndex:p.ledger_index})),
   depositHash:deposit[0].tx_hash,depositLedger:deposit[0].ledger_index,
   lpMinted:minted.toFixed(),lpBasisDrops:data.basis,
   uninvestedPrincipalDrops:data.cash,
   reserveDrops:alloc.operating_reserve_drops,
   settledOwnership:1,purchasePrincipalPaidAsRewards:false,
   restartReplayPrevention:true,productionFinanceActivation:false
  }));
 }finally{
  db.close();
  if(client.isConnected())await client.disconnect();
 }
}
run().catch(e=>{console.error('ESTATES_POLICY2_TESTNET_FAILURE',e.message);process.exitCode=1;});
