'use strict';
// Instant deposit on purchase + fast deposit chunks while queued. Uses a simulated XRPL
// (three AMM pools, the treasury's balances, signed-blob submit) and the real executor/service.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const xrpl=require('xrpl');
const P=require('./estate-monthly-plan');
const {createEstateSalesRuntime}=require('./estate-sales-runtime');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateXamanPayloadStore}=require('./estate-sale-xaman-payload-store');
const {createEstateMonthlyService}=require('./estate-monthly-service');

const wallet=xrpl.Wallet.generate();const treasury=wallet.classicAddress;
const buyer='rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST';
const IMG={currency:'IMG',issuer:P.IMG_ISSUER},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},LPC='03'+'A'.repeat(38);
const ACCOUNT_ZERO='rrrrrrrrrrrrrrrrrrrrBZbvji';
const fix=v=>Number(v).toFixed(6);
// ---- simulated ledger ----
function makeLedger(){
 const L={seq:1000,tx:new Map(),fail:null,submits:[],
  xrl:{drops:10e12,tokens:24e6,fee:500},          // XRP/RLUSD (deep)
  xim:{drops:5000e6,tokens:5e6,fee:1000},         // XRP/IMG (1000 IMG per XRP)
  amm:{img:20000,rl:48,lp:1000,fee:1000},          // IMG/RLUSD, 0.0024 RLUSD per IMG (matches ref)
  bal:{xrp:200e6,IMG:0,RL:0,LP:0},seqAcct:1};
 const line=(cur,issuer,before,after)=>({ModifiedNode:{LedgerEntryType:'RippleState',
  FinalFields:{Balance:{currency:cur,issuer:ACCOUNT_ZERO,value:fix(after)},LowLimit:{currency:cur,issuer:treasury,value:'1e15'},HighLimit:{currency:cur,issuer,value:'0'}},
  PreviousFields:{Balance:{currency:cur,issuer:ACCOUNT_ZERO,value:fix(before)}}}});
 const root=(before,after)=>({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:String(after)},PreviousFields:{Balance:String(before)}}});
 function apply(tx){
  const nodes=[],x0=L.bal.xrp;let result='tesSUCCESS';
  if(tx.TransactionType==='Payment'&&tx.Destination===treasury){
   const key=tx.Amount.currency==='IMG'?'IMG':'RL',pool=key==='IMG'?L.xim:L.xrl,out=Number(tx.Amount.value);
   const xin=Math.ceil(pool.drops*out/(pool.tokens-out)/(1-pool.fee/100000));
   if(xin>Number(tx.SendMax))result='tecPATH_PARTIAL';
   else{pool.drops+=xin;pool.tokens-=out;const b=L.bal[key];L.bal[key]+=out;L.bal.xrp-=xin+12;
    nodes.push(line(tx.Amount.currency,tx.Amount.issuer,b,L.bal[key]),root(x0,L.bal.xrp));}
  }else if(tx.TransactionType==='AMMDeposit'&&L.forceAmm){result=L.forceAmm;
  }else if(tx.TransactionType==='AMMDeposit'){
   const i=Number(tx.Amount.value),r=Number(tx.Amount2.value);
   if(i>L.bal.IMG+1e-9||r>L.bal.RL+1e-9)result='tecUNFUNDED_AMM';
   else{const lp=L.amm.lp*i/L.amm.img;L.amm.img+=i;L.amm.rl+=r;L.amm.lp+=lp;
    const bi=L.bal.IMG,br=L.bal.RL,bl=L.bal.LP;L.bal.IMG-=i;L.bal.RL-=r;L.bal.LP+=lp;L.bal.xrp-=12;
    nodes.push(line('IMG',IMG.issuer,bi,L.bal.IMG),line(RL.currency,RL.issuer,br,L.bal.RL),line(LPC,P.IMG_RLUSD_POOL,bl,L.bal.LP),root(x0,L.bal.xrp));}
  }else result='temDISABLED';
  return {result,nodes};
 }
 const amm=(a,b,fee,ammAcct)=>({amm:{account:ammAcct,amount:a,amount2:b,trading_fee:fee,lp_token:{currency:LPC,issuer:ammAcct,value:String(L.amm.lp)}}});
 const client={
  calls:0,
  async request(q){
   client.calls++;
   if(L.fail){const f=L.fail;if(f.times-->0){const e=Error(f.message);throw e;}L.fail=null;}
   switch(q.command){
    case 'amm_info':
     if(q.asset.currency==='XRP'){const p=q.asset2.currency==='IMG'?L.xim:L.xrl;return {result:amm(String(p.drops),{...q.asset2,value:String(p.tokens)},p.fee,'rAMMxrp'+q.asset2.currency)};}
     return {result:amm({...IMG,value:String(L.amm.img)},{...RL,value:String(L.amm.rl)},L.amm.fee,P.IMG_RLUSD_POOL)};
    case 'account_info':return {result:{account_data:{Balance:String(L.bal.xrp),OwnerCount:3}}};
    case 'server_state':return {result:{state:{validated_ledger:{reserve_base:1000000,reserve_inc:200000}}}};
    case 'ledger':return {result:{ledger_index:L.seq}};
    case 'account_lines':return {result:{lines:[{currency:LPC,balance:String(L.bal.LP)}]}};
    case 'submit':{
     const tx=xrpl.decode(q.tx_blob),hash=xrpl.hashes.hashSignedTx(q.tx_blob);L.seq++;
     const {result,nodes}=apply(tx);L.submits.push({hash,type:tx.TransactionType,tx,result});
     L.tx.set(hash,{...tx,hash,validated:true,ledger_index:L.seq,meta:{TransactionResult:result,AffectedNodes:nodes}});
     return {result:{engine_result:result.startsWith('tes')?'tesSUCCESS':result}};}
    case 'tx':{const t=L.tx.get(String(q.transaction).toUpperCase());if(!t){const e=Error('txnNotFound');e.data={error:'txnNotFound'};throw e;}return {result:structuredClone(t)};}
   }
   throw Error('unexpected_command:'+q.command);
  },
  async autofill(tx){return {...tx,Fee:'12',Sequence:L.seqAcct++,LastLedgerSequence:L.seq+20,Flags:tx.Flags||0};}
 };
 return {L,client};
}
// ---- fixtures ----
function setupDb(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 return db;
}
function fakeTimers(start=1794300000000){
 const t={now:start,queue:[],id:0};
 return Object.assign(t,{setTimeout:(f,ms)=>{const h={id:++t.id,f,ms,at:t.now+ms,unref(){}};t.queue.push(h);return h;},
  clearTimeout:h=>{t.queue=t.queue.filter(x=>x!==h);},nowFn:()=>t.now,
  pending:()=>t.queue.slice(),
  async fire(){const h=t.queue.shift();assert.ok(h,'timer scheduled');t.now=Math.max(t.now,h.at);await h.f();await new Promise(r=>setImmediate(r));return h.ms;}});
}
const env={ESTATE_MONTHLY_PLAN_ENABLED:'1',ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL};
const config={NETWORK:'mainnet',DRY_RUN:false,XUMM_KEY:'k',XUMM_SECRET:'s',ESTATE_TREASURY:treasury,TREASURY_SEED:wallet.seed};
function service(db,client,timers,extraEnv={},guardState={paused:false}){
 return createEstateMonthlyService({db,pay:{ledger:async()=>client},config,guard:{paused:()=>guardState.paused,log:()=>{}},env:{...env,...extraEnv},
  timers:{setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout,now:timers.nowFn}});
}
const deposit=db=>db.prepare("SELECT * FROM estate_mp_deposits WHERE kind='purchase'").get();
const ammHashes=L=>L.submits.filter(s=>s.type==='AMMDeposit'&&s.result==='tesSUCCESS').map(s=>s.hash);

(async()=>{
 // ===== 1. settlement triggers queue + immediate run =====
 {
  const db=setupDb(),{L,client}=makeLedger(),timers=fakeTimers();
  const svc=service(db,client,timers);
  assert.equal(svc.start(),true);
  assert.equal(timers.pending()[0].ms,30000,'boot tick after 30s (restart resume)');
  const rid='estate_instant_test_00000001',hash='5D172215A72BAC9914CDF7DD59C201A5C4ED6C1A407BA4ECD1B2683287D60498',T0=timers.now-60000;
  createEstateSaleReservations(db).reserve({reservationId:rid,propertyId:'starter-04',buyer,now:T0});
  createEstateXamanPayloadStore(db).bind({reservationId:rid,uuid:'uuid-x',buyer,now:T0+1000});
  L.tx.set(hash,{hash,validated:true,ledger_index:900,TransactionType:'Payment',Account:buyer,Destination:treasury,Amount:'75000000',
   Memos:[{Memo:{MemoType:Buffer.from('burncity/estates').toString('hex').toUpperCase(),MemoData:Buffer.from(rid).toString('hex').toUpperCase()}}],date:Math.floor((T0+40000)/1000)-946684800,
   meta:{TransactionResult:'tesSUCCESS',delivered_amount:'75000000'}});
  const sdk={payload:{create:async()=>{throw Error('no_create')},get:async()=>({meta:{signed:true},response:{account:buyer,txid:hash}})}};
  const sales=createEstateSalesRuntime({db,pay:{sdk:()=>sdk,ledger:async()=>client},config,env:{},paused:()=>false,onSettled:()=>svc.kick()});
  const res=await sales.finalize({reservationId:rid,buyer,now:timers.now});
  assert.equal(res.ok,true);assert.equal(res.status,'settled');
  assert.equal(deposit(db),undefined,'HTTP response returns before the deposit hook runs');
  await new Promise(r=>setImmediate(r));
  const q=deposit(db);assert.equal(q.state,'queued');assert.equal(q.xrp_drops,'74250000');assert.equal(q.xrp_remaining_drops,'74250000');
  const next=timers.pending();assert.equal(next.length,1);assert.equal(next[0].ms,0,'deposit run kicked immediately');
  assert.equal(await timers.fire(),0);
  assert.equal(ammHashes(L).length,1,'first chunk deposited');
  assert.deepEqual(L.submits.map(s=>s.type),['Payment','Payment','AMMDeposit']);
  assert.equal(L.submits[0].tx.SendMax,'4000000');assert.equal(L.submits[1].tx.SendMax,'4000000');
  assert.equal(deposit(db).xrp_remaining_drops,'66250000');
  assert.equal(timers.pending()[0].ms,300000,'fast cadence while queued');
  assert.equal(svc.status().depositCadence.mode,'fast');
  // Monthly check runs on the first pass only, then at most hourly.
  assert.ok(svc.status().lastError===null);
  // ===== 2. no concurrent runs =====
  const before=L.submits.length;
  const [a,b]=await Promise.all([svc.tick(),svc.tick()]);
  assert.equal(b.error,'tick_in_progress');
  assert.equal(L.submits.length-before,3,'exactly one chunk for two concurrent ticks');
  const ex=svc.executor;const [c,d]=await Promise.all([ex.processDeposits(),ex.processDeposits()]);
  assert.equal(d.error,'deposit_run_in_progress');assert.equal(c.ok,true);
  assert.equal(L.submits.length-before,6);
  assert.equal(svc.kick(),true);// idempotent queueing
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_mp_deposits').get().n,1);
  // ===== 3. drain the queue: fast cadence until empty, then back to hourly =====
  timers.queue.length=0;svc.kick();
  let guardFree=0;
  while(deposit(db).state==='queued'&&guardFree<40){
   L.xim.drops=5000e6*(L.xim.tokens/5e6)**-1*1; // keep reference prices aligned (arbitrage)
   const k=Math.sqrt(L.xim.drops*L.xim.tokens);L.xim.drops=k*Math.sqrt(1e3/1);L.xim.tokens=k/Math.sqrt(1e3);
   const ms=await timers.fire();guardFree++;
   if(deposit(db).state==='queued')assert.equal(timers.pending()[0].ms,300000);
  }
  assert.equal(deposit(db).state,'deposited');
  assert.equal(timers.pending()[0].ms,3600000,'hourly cadence once the queue is empty');
  assert.equal(svc.status().depositCadence.mode,'idle');
  const ammN=ammHashes(L).length;assert.ok(ammN>=10,'74.25 XRP in <=8 XRP chunks');
  for(const s of L.submits.filter(s=>s.type==='Payment'))assert.ok(Number(s.tx.SendMax)<=4000000,'<=8 XRP per chunk');
  // every submitted tx passed the unchanged guards
  for(const s of L.submits)assert.equal(P.assertSafeTransaction(s.tx,{treasury,poolAccount:P.IMG_RLUSD_POOL,imgIssuer:IMG.issuer,imgCurrency:'IMG',rlusdIssuer:RL.issuer,rlusdCurrency:RL.currency}),true);
  console.log('instant deposit: settle->queue->run, fast cadence, single-flight, back to hourly ('+ammN+' chunks)');
 }
 // ===== 4. guards still enforced; guard holds back off to the next interval =====
 {
  const db=setupDb(),{L,client}=makeLedger(),timers=fakeTimers();
  const svc=service(db,client,timers);svc.start();
  const ex=svc.executor;ex.ledger.enqueuePurchase({purchaseTx:'B'.repeat(64),investDrops:'20000000'});
  // pool deviation > 3%
  L.amm.rl=48*1.05;
  assert.equal(await timers.fire(),30000);
  assert.equal(L.submits.length,0);assert.equal(deposit(db).note,'guard:pool_price_deviation');
  assert.equal(timers.pending()[0].ms,300000,'guard hold waits for the next interval');
  L.amm.rl=48;
  // shallow IMG/XRP pool: 4 XRP leg > 1% impact -> chunk auto-sized smaller, guard still satisfied
  L.xim={drops:200e6,tokens:200000,fee:1000};
  await timers.fire();
  const legs=L.submits.filter(s=>s.type==='Payment').map(s=>Number(s.tx.SendMax));
  assert.equal(legs.length,2);assert.ok(legs.every(x=>x<4000000&&x>=100000),'impact cap sized the chunk smaller: '+legs);
  for(const x of legs)assert.ok(x*0.99/(200e6+x*0.99)*10000<=100,'impact <=1%');
  // pool so shallow that even the minimum chunk breaks 1% -> held, nothing sent
  L.xim={drops:5e6,tokens:5000,fee:1000};const n=L.submits.length;
  L.amm.img=20000;L.amm.rl=48;
  await timers.fire();
  assert.equal(L.submits.length,n);assert.match(deposit(db).note,/guard:price_impact_img_leg|guard:pool_price_deviation/);
  // unsafe shapes are still refused before signing
  await assert.rejects(ex._send('t:single',{TransactionType:'AMMDeposit',Asset:IMG,Asset2:RL,Amount:{...IMG,value:'1'},Flags:P.TF.singleAsset}),/single_sided_deposit_forbidden/);
  await assert.rejects(ex._send('t:amm-pay',{TransactionType:'Payment',Destination:P.IMG_RLUSD_POOL,Amount:'1000000'}),/payment_to_amm_forbidden/);
  await assert.rejects(ex._send('t:other',{TransactionType:'Payment',Destination:buyer,Amount:'1000000'}),/destination_not_allowed/);
  assert.equal(L.submits.length,n);
  // treasury paused: nothing runs, kick refuses
  const g={paused:true};const paused=service(setupDb(),client,fakeTimers(),{},g);
  assert.equal(paused.kick(),false);
  console.log('instant deposit: deviation/impact/shape guards enforced, holds back off, impact auto-sizing');
 }
 // ===== 5. rate-limit backoff =====
 {
  const db=setupDb(),{L,client}=makeLedger(),timers=fakeTimers();
  const svc=service(db,client,timers);svc.start();svc.executor.ledger.enqueuePurchase({purchaseTx:'C'.repeat(64),investDrops:'20000000'});
  L.fail={message:'units quota exhausted',times:Infinity};
  await timers.fire();assert.equal(timers.pending()[0].ms,600000,'rate limit backoff 2x');
  assert.equal(svc.kick(),true);assert.equal(timers.pending()[0].ms,600000,'kick keeps the backoff');
  await timers.fire();assert.equal(timers.pending()[0].ms,1200000,'rate limit backoff 4x');
  L.fail=null;await timers.fire();assert.equal(timers.pending()[0].ms,300000,'recovers to fast cadence');
  assert.equal(ammHashes(L).length,1);
  // a ledger step failure is sticky (never re-signed) and drops to the hourly cadence, not fast retries
  L.forceAmm='tecAMM_FAILED';await timers.fire();
  assert.match(svc.status().lastError,/^step_failed:.*:amm:tecAMM_FAILED/);assert.equal(timers.pending()[0].ms,3600000);
  const n=L.submits.length;await timers.fire();assert.equal(L.submits.length,n,'failed step not resubmitted');
  console.log('instant deposit: rate-limit backoff and recovery; step failure backs off hourly');
 }
 // ===== 6. restart resumes a half-finished chunk without re-signing finished legs =====
 {
  const db=setupDb(),{L,client}=makeLedger(),timers=fakeTimers();
  const svc=service(db,client,timers);svc.start();svc.executor.ledger.enqueuePurchase({purchaseTx:'D'.repeat(64),investDrops:'20000000'});
  const orig=client.autofill;let n=0;client.autofill=async tx=>{if(++n===2)throw Error('NotConnectedError');return orig(tx);};
  await timers.fire();
  assert.deepEqual(L.submits.map(s=>s.type),['Payment'],'crash after the RLUSD leg');
  assert.ok(JSON.parse(deposit(db).chunk_json).done.rl);
  svc.stop();client.autofill=orig;
  const t2=fakeTimers(timers.now+60000),svc2=service(db,client,t2);svc2.start();
  assert.equal(t2.pending()[0].ms,30000);await t2.fire();
  assert.deepEqual(L.submits.map(s=>s.type),['Payment','Payment','AMMDeposit'],'resumed: IMG leg + deposit only');
  assert.equal(new Set(L.submits.map(s=>s.hash)).size,3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE 'dep:%:0:%'").get().n,3);
  assert.equal(t2.pending()[0].ms,300000);
  // monthly check: first pass + hourly only
  await t2.fire();assert.equal(svc2.status().lastError,null);
  // monthly harvest check: first pass, then at most hourly (fast deposit passes skip it)
  const fast=await svc2.tick();assert.equal(fast.monthly,undefined);
  t2.now+=3600000;const hourly=await svc2.tick();assert.equal(hourly.monthly.ok,true);
  console.log('instant deposit: restart resumes the same chunk');
 }
 // ===== 7. interval config =====
 assert.equal(P.monthlyConfig({}).depositChunkIntervalMs,300000);
 assert.equal(P.monthlyConfig({ESTATE_DEPOSIT_CHUNK_INTERVAL_MS:'120000'}).depositChunkIntervalMs,120000);
 assert.throws(()=>P.monthlyConfig({ESTATE_DEPOSIT_CHUNK_INTERVAL_MS:'1000'}),/invalid_monthly_plan_setting/);
 console.log('Estate instant deposit tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
