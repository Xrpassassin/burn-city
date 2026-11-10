'use strict';
// DISPOSABLE public XRPL TESTNET end-to-end run of the Estates monthly plan executor.
// Fresh faucet wallets only; test IOUs "IMG" and "RLUSD" from throwaway issuers (NOT mainnet tokens).
// purchase XRP -> chunked two-sided deposit (guards) -> simulated fee growth -> monthly harvest
// -> IMG burn to issuer -> two-sided redeposit -> pro-rata holder payouts (+ carry for a holder without lines).
const assert=require('node:assert/strict');
const xrpl=require('xrpl');const {DatabaseSync}=require('node:sqlite');
const P=require('../server/estate-monthly-plan');const {N}=require('../server/estate-liquidity-ledger');
const {createEstateMonthlyExecutor}=require('../server/estate-monthly-executor');
const {createEstateCapitalAllocation}=require('../server/estate-capital-allocation');
if(process.env.TREASURY_SEED||process.env.ESTATE_TREASURY_SEED)throw Error('production_credentials_not_allowed');
const client=new xrpl.Client(process.env.TESTNET_WSS||'wss://s.altnet.rippletest.net:51233',{connectionTimeout:20000,timeout:30000});
const RLHEX=P.RLUSD_HEX;
async function send(w,tx){const f=await client.autofill({Account:w.classicAddress,...tx});const r=(await client.submitAndWait(w.sign(f).tx_blob)).result;
 if(r.meta?.TransactionResult!=='tesSUCCESS')throw Error('tx_failed:'+tx.TransactionType+':'+r.meta?.TransactionResult);return r;}
const bal=async(acct,cur,iss)=>{const l=(await client.request({command:'account_lines',account:acct,peer:iss})).result.lines.find(x=>x.currency===cur);return l?.balance||'0';};
async function run(){
 await client.connect();const t0=Date.now();
 try{
  // Sequential with backoff: the public faucet rate-limits bursts (HTTP 429).
  const fund=async()=>{for(let i=0;;i++){try{return (await client.fundWallet(null,{faucetHost:'faucet.altnet.rippletest.net'})).wallet;}catch(e){if(i>=5)throw e;await new Promise(r=>setTimeout(r,5000*(i+1)));}}};
  const ws=[];for(let i=0;i<8;i++)ws.push(await fund());
  const [imgIss,rlIss,maker,maker2,treasury,holderA,holderB,trader]=ws;
  console.log('wallets funded',{treasury:treasury.classicAddress,imgIssuer:imgIss.classicAddress,rlusdIssuer:rlIss.classicAddress});
  const IMG={currency:'IMG',issuer:imgIss.classicAddress},RL={currency:RLHEX,issuer:rlIss.classicAddress};
  await Promise.all([imgIss,rlIss].map(w=>send(w,{TransactionType:'AccountSet',SetFlag:xrpl.AccountSetAsfFlags.asfDefaultRipple})));
  await Promise.all([maker,maker2,treasury,holderA,trader].map(async w=>{for(const i of [IMG,RL])await send(w,{TransactionType:'TrustSet',LimitAmount:{...i,value:'100000000'}});}));
  for(const [w,img,rl] of [[maker,'60000','200'],[maker2,'60000','60'],[trader,'20000','40']]){await send(imgIss,{TransactionType:'Payment',Destination:w.classicAddress,Amount:{...IMG,value:img}});await send(rlIss,{TransactionType:'Payment',Destination:w.classicAddress,Amount:{...RL,value:rl}});}
  // Pools priced consistently: 2.5 RLUSD/XRP, 0.002 RLUSD/IMG => 1250 IMG/XRP. Target pool is tiny like mainnet (~$80).
  await send(maker,{TransactionType:'AMMCreate',Amount:{...IMG,value:'20000'},Amount2:{...RL,value:'40'},TradingFee:1000});
  await send(maker,{TransactionType:'AMMCreate',Amount:'40000000',Amount2:{...RL,value:'100'},TradingFee:300});
  await send(maker2,{TransactionType:'AMMCreate',Amount:'40000000',Amount2:{...IMG,value:'50000'},TradingFee:300});
  const amm=(await client.request({command:'amm_info',asset:IMG,asset2:RL,ledger_index:'validated'})).result.amm;
  console.log('test pools created; IMG/RLUSD AMM',amm.account);
  // Local game DB with three properties: A owns 3 units (2 lots), B owns 2 units and has NO trust lines.
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,share_units INTEGER,purchase_tx TEXT,purchase_amount_drops INTEGER,purchased_at INTEGER)');
  const cap=createEstateCapitalAllocation(db);
  const buy=await send(holderA,{TransactionType:'Payment',Destination:treasury.classicAddress,Amount:'3000000'});
  const own=[['trailer-01',holderA.classicAddress,1,buy.hash,3000000],['cabin-01',holderA.classicAddress,2,'B'.repeat(64),0],['cabin-02',holderB.classicAddress,2,'C'.repeat(64),0]];
  for(const o of own)db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run(...o,Date.now());
  cap.record({purchase_tx:buy.hash,property_id:'trailer-01',acct:holderA.classicAddress,purchase_amount_drops:3000000});
  const env={ESTATE_IMG_RLUSD_POOL_ACCOUNT:amm.account,ESTATE_IMG_ISSUER:IMG.issuer,ESTATE_RLUSD_ISSUER:RL.issuer,ESTATE_RLUSD_CURRENCY:RLHEX,
   ESTATE_MAX_DEPOSIT_DROPS:'1000000',ESTATE_MAX_PRICE_IMPACT_BPS:'20',ESTATE_SWAP_SLIPPAGE_BPS:'150',ESTATE_MAX_POOL_DEVIATION_BPS:'400',ESTATE_PAYOUT_DUST_RLUSD:'0.000001'};
  let clock=Date.UTC(2026,10,20);
  const mk=e=>createEstateMonthlyExecutor({db,client,wallet:()=>treasury,treasury:treasury.classicAddress,cfg:P.monthlyConfig(e),enabled:true,paused:()=>false,
   xrpRlusdAsset:RL,xrpImgAsset:IMG,now:()=>clock,log:(k,o)=>console.log(' ',k,JSON.stringify(o))});
  // 1) Guard trips (impact cap 0.2%): funds are queued, nothing is sent.
  let ex=mk(env);let r=await ex.processDeposits();
  assert.equal(r.results[0].held,'guard:price_impact_rlusd_leg');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_mp_txs').get().n,0,'guard queued funds; no tx');
  // Hard guards refuse to sign before anything reaches the ledger.
  await assert.rejects(ex._send('guard-test-amm-payment',{TransactionType:'Payment',Destination:amm.account,Amount:'1000'}),/payment_to_amm_forbidden/);
  await assert.rejects(ex._send('guard-test-single',{TransactionType:'AMMDeposit',Asset:IMG,Asset2:RL,Amount:{...IMG,value:'1'},Flags:P.TF.singleAsset}),/single_sided/);
  // 2) Normal caps: 2.97 XRP invested in 1-XRP chunks (per-deposit max), two-sided every time.
  ex=mk({...env,ESTATE_MAX_PRICE_IMPACT_BPS:'300'});
  for(let i=0;i<4;i++){r=await ex.processDeposits();console.log(' deposit pass',i,JSON.stringify(r.results));}
  const dep=db.prepare("SELECT * FROM estate_mp_deposits WHERE kind='purchase'").get();
  assert.equal(dep.state,'deposited');assert(new N(dep.lp_out).gt(0));assert(new N(dep.img_in).gt(0)&&new N(dep.rlusd_in).gt(0));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE '%:amm' AND state='validated'").get().n,3,'three chunked two-sided deposits');
  const lpLine=await bal(treasury.classicAddress,amm.lp_token.currency,amm.account);
  assert(new N(lpLine).minus(dep.lp_out).abs().lt('1e-9'),'treasury holds the LP tokens');
  const principal=ex.ledger.principalK();
  // 3) Simulated fee growth: trader swaps back and forth through the target pool (1% fee).
  for(let i=0;i<8;i++){
   await send(trader,{TransactionType:'Payment',Destination:trader.classicAddress,Amount:{...RL,value:'3'},SendMax:{...IMG,value:'2500'}});
   await send(trader,{TransactionType:'Payment',Destination:trader.classicAddress,Amount:{...IMG,value:'1300'},SendMax:{...RL,value:'4'}});
  }
  // 4) Not due inside the month; due after it ends. Harvest only the gain above principal.
  assert.equal((await ex.runMonthly()).state,'not_due','no harvest inside the first month');
  clock=Date.UTC(2026,11,1,1);
  const issuerBefore=(await client.request({command:'gateway_balances',account:IMG.issuer,ledger_index:'validated'})).result.obligations?.IMG;
  const aImg0=await bal(holderA.classicAddress,'IMG',IMG.issuer),aRl0=await bal(holderA.classicAddress,RLHEX,RL.issuer);
  const m=await ex.runMonthly();console.log(' monthly',JSON.stringify(m));
  assert.equal(m.period,'2026-11');assert.equal(m.state,'paid');
  const h=ex.ledger.harvest('2026-11');assert(new N(h.lp_in).gt(0)&&new N(h.img_out).gt(0)&&new N(h.rlusd_out).gt(0));
  assert(new N(h.lp_in).lt(dep.lp_out),'only the gain is withdrawn');
  // principal stays: remaining tracked LP x current k >= principal
  const ai=(await client.request({command:'amm_info',asset:IMG,asset2:RL,ledger_index:'validated'})).result.amm;
  const kNow=P.kPerLp({poolImg:ai.amount.value,poolRlusd:ai.amount2.value,lpSupply:ai.lp_token.value});
  const trackedAfter=new N(dep.lp_out).minus(h.lp_in);
  assert(trackedAfter.times(kNow).gte(new N(principal).times('0.999999')),'principal remains in the pool');
  const split=JSON.parse(h.split_json).split;
  const issuerAfter=(await client.request({command:'gateway_balances',account:IMG.issuer,ledger_index:'validated'})).result.obligations?.IMG;
  assert(new N(issuerBefore).minus(issuerAfter).gte(split.burnImg),'IMG burned (issuer obligations fell)');
  const aImg1=await bal(holderA.classicAddress,'IMG',IMG.issuer),aRl1=await bal(holderA.classicAddress,RLHEX,RL.issuer);
  const pays=db.prepare("SELECT * FROM estate_mp_payouts WHERE period='2026-11'").all();console.log(' payouts',JSON.stringify(pays));
  const pa=pays.filter(p=>p.acct===holderA.classicAddress);assert(pa.every(p=>p.state==='paid'));
  assert(new N(aImg1).minus(aImg0).eq(pa.find(p=>p.currency==='IMG').amount)&&new N(aRl1).minus(aRl0).eq(pa.find(p=>p.currency==='RLUSD').amount),'holder A paid pro rata');
  assert(pays.filter(p=>p.acct===holderB.classicAddress).every(p=>p.state==='carried'),'holder B (no trust lines) carried');
  const carry=ex.ledger.carry();assert(new N(carry[holderB.classicAddress].img).gt(0));
  // A got 3/5, B 2/5 of the holders pot
  assert(new N(pa.find(p=>p.currency==='RLUSD').amount).div(split.holdersRlusd).minus('0.6').abs().lt('0.0001'));
  // 5) The 10% redeposit is two-sided and becomes principal.
  const pk0=new N(ex.ledger.principalK());r=await ex.processDeposits();console.log(' redeposit',JSON.stringify(r.results));
  const red=db.prepare("SELECT * FROM estate_mp_deposits WHERE kind='redeposit'").get();assert.equal(red.state,'deposited');assert(new N(ex.ledger.principalK()).gt(pk0));
  // 6) Same month again: nothing happens (monthly, once).
  assert.equal((await ex.runMonthly()).state,'not_due');
  const types=db.prepare("SELECT step,state,result FROM estate_mp_txs ORDER BY created").all();
  console.log('TESTNET E2E PASSED in',Math.round((Date.now()-t0)/1000),'s; txs:',types.length);console.table(types.map(t=>({step:t.step.replace(/[0-9A-F]{64}/,'<purchase>'),state:t.state,result:t.result})));
  console.log(JSON.stringify({split,payouts:pays.map(p=>({acct:p.acct===holderA.classicAddress?'A':'B',currency:p.currency,amount:p.amount,state:p.state})),lpIn:h.lp_in,lpDeposited:dep.lp_out}));
 }finally{await client.disconnect();}
}
run().catch(e=>{console.error('TESTNET E2E FAILED',e);process.exit(1);});
