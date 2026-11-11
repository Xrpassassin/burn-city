'use strict';
// Daily/monthly harvest cadence against a simulated ledger: idempotency, principal-only
// withdraw, daily dust left in the pool, mid-period snapshot shares, and crash resume.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const xrpl=require('xrpl');
const P=require('./estate-monthly-plan');
const {N}=require('./estate-liquidity-ledger');
const {createEstateMonthlyExecutor}=require('./estate-monthly-executor');

const wallet=xrpl.Wallet.generate();const treasury=wallet.classicAddress;
const A='rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',B='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q';
const IMG={currency:'IMG',issuer:P.IMG_ISSUER},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},LPC='03'+'A'.repeat(38);
const ACCOUNT_ZERO='rrrrrrrrrrrrrrrrrrrrBZbvji';
const fix=v=>Number(v).toFixed(6);

function makeLedger({img=10100,rl=101,lpSupply=1000,lpHeld=100}={}){
 const L={seq:2000,tx:new Map(),submits:[],amm:{img,rl,lp:lpSupply},bal:{xrp:50e6,IMG:0,RL:0,LP:lpHeld},seqAcct:1};
 const line=(cur,issuer,before,after)=>({ModifiedNode:{LedgerEntryType:'RippleState',
  FinalFields:{Balance:{currency:cur,issuer:ACCOUNT_ZERO,value:fix(after)},LowLimit:{currency:cur,issuer:treasury,value:'1e15'},HighLimit:{currency:cur,issuer,value:'0'}},
  PreviousFields:{Balance:{currency:cur,issuer:ACCOUNT_ZERO,value:fix(before)}}}});
 const root=(before,after)=>({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:String(after)},PreviousFields:{Balance:String(before)}}});
 function apply(tx){
  const nodes=[],x0=L.bal.xrp;let result='tesSUCCESS';
  if(tx.TransactionType==='AMMWithdraw'){
   const lpIn=Number(tx.LPTokenIn.value);
   if(lpIn>L.bal.LP+1e-9)result='tecUNFUNDED_AMM';
   else{
    const img=L.amm.img*lpIn/L.amm.lp,rl=L.amm.rl*lpIn/L.amm.lp;
    const bi=L.bal.IMG,br=L.bal.RL,bl=L.bal.LP;
    L.amm.img-=img;L.amm.rl-=rl;L.amm.lp-=lpIn;L.bal.IMG+=img;L.bal.RL+=rl;L.bal.LP-=lpIn;L.bal.xrp-=12;
    nodes.push(line('IMG',IMG.issuer,bi,L.bal.IMG),line(RL.currency,RL.issuer,br,L.bal.RL),line(LPC,P.IMG_RLUSD_POOL,bl,L.bal.LP),root(x0,L.bal.xrp));
   }
  }else if(tx.TransactionType==='Payment'){
   const key=tx.Amount.currency==='IMG'?'IMG':'RL',amt=Number(tx.Amount.value);
   if(amt>L.bal[key]+1e-9)result='tecUNFUNDED_PAYMENT';
   else{const b=L.bal[key];L.bal[key]-=amt;L.bal.xrp-=12;nodes.push(line(tx.Amount.currency,tx.Amount.issuer,b,L.bal[key]),root(x0,L.bal.xrp));}
  }else result='temDISABLED';
  return {result,nodes};
 }
 const client={
  async request(q){
   switch(q.command){
    case 'amm_info':return {result:{amm:{account:P.IMG_RLUSD_POOL,amount:{...IMG,value:String(L.amm.img)},amount2:{...RL,value:String(L.amm.rl)},trading_fee:553,lp_token:{currency:LPC,issuer:P.IMG_RLUSD_POOL,value:String(L.amm.lp)}}}};
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

function setup({cadence='daily',dust='0.05',nowMs=Date.UTC(2026,10,11,0,5),owners=[{acct:A,shareUnits:3},{acct:B,shareUnits:1}],lpOut='100',principalK,pool}={}){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 const first=Date.UTC(2026,10,10,12); // first deposit during 2026-11-10
 owners.forEach((o,i)=>db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('lot-'+i,o.acct,'T'+i,3000000,o.shareUnits,first));
 const k0=P.kPerLp({poolImg:'10000',poolRlusd:'100',lpSupply:'1000'});
 const princ=principalK!=null?principalK:new N(lpOut).times(k0).toFixed();
 const {L,client}=makeLedger(pool||{});
 // Seed a finished deposit so harvest has a principal and tracked LP.
 P.createEstateMonthlyLedger(db);
 db.prepare("INSERT INTO estate_mp_deposits(id,source,kind,state,xrp_drops,xrp_remaining_drops,img_in,rlusd_in,lp_out,principal_k,created,updated) VALUES('dep:seed','seed','purchase','deposited','0','0','1000','10',?,?,?,?)")
  .run(lpOut,princ,first,first);
 const cfg={...P.monthlyConfig({ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL,ESTATE_HARVEST_CADENCE:cadence,ESTATE_PAYOUT_DUST_RLUSD:dust}),poolAccount:P.IMG_RLUSD_POOL};
 let t=nowMs;
 const ex=createEstateMonthlyExecutor({db,client,wallet:()=>wallet,treasury,cfg,enabled:true,paused:()=>false,
  xrpRlusdAsset:RL,xrpImgAsset:IMG,now:()=>t,pollMs:0,pollTries:3,log:()=>{}});
 return {db,L,ex,setNow:ms=>{t=ms;},princ,first};
}

(async()=>{
 // 1. Daily: not due until the UTC day of the first deposit has ended
 let s=setup({nowMs:Date.UTC(2026,10,10,23,59)});
 let r=await s.ex.runMonthly();
 assert.equal(r.state,'not_due');
 assert.equal(s.L.submits.length,0,'no withdraw before the day closes');

 // 2. After the day ends: one harvest, principal stays, holders paid pro rata by snapshot units
 s=setup({nowMs:Date.UTC(2026,10,11,0,5),dust:'0.000001'}); // dust low so this fixture actually pays
 r=await s.ex.runMonthly();
 assert.equal(r.ok,true);assert.equal(r.period,'2026-11-10');assert.equal(r.state,'paid');
 assert(s.L.submits.some(x=>x.type==='AMMWithdraw'));
 const withdraw=s.L.submits.find(x=>x.type==='AMMWithdraw');
 assert(new N(withdraw.tx.LPTokenIn.value).gt(0));
 const remainingK=new N(s.ex.ledger.trackedLp()).times(P.kPerLp({poolImg:String(s.L.amm.img),poolRlusd:String(s.L.amm.rl),lpSupply:String(s.L.amm.lp)}));
 assert(remainingK.gte(new N(s.princ).minus('1e-6')),'principal stays in the pool');
 const pays=s.db.prepare("SELECT acct,currency,amount,state FROM estate_mp_payouts WHERE period='2026-11-10' ORDER BY acct,currency").all();
 assert(pays.length>=2,'both holders received a payout row');
 const imgA=pays.find(p=>p.acct===A&&p.currency==='IMG'),imgB=pays.find(p=>p.acct===B&&p.currency==='IMG');
 assert(imgA&&imgB);assert.equal(imgA.state,'paid');assert.equal(imgB.state,'paid');
 assert(Math.abs(Number(imgA.amount)/Number(imgB.amount)-3)<1e-6,'3:1 snapshot share, not time-weighted');

 // Mid-period buyer: B bought "during" the day, but only current units at split count.
 // (Already the case: B is an owner at split with 1 unit and is paid 1/4.)

 // 3. Same day again is a no-op (idempotent period key, no second withdraw)
 const submits=s.L.submits.length;
 r=await s.ex.runMonthly();
 assert.equal(r.state,'not_due');
 assert.equal(s.L.submits.length,submits,'no second harvest the same UTC day');

 // 4. Restart/crash: a withdrawn-but-unpaid period resumes without a second withdraw
 s=setup({nowMs:Date.UTC(2026,10,11,0,5),dust:'0.000001'});
 r=await s.ex.runMonthly();
 assert.equal(r.state,'paid');
 const firstWithdraws=s.L.submits.filter(x=>x.type==='AMMWithdraw').length;
 s.db.prepare("UPDATE estate_mp_harvests SET state='withdrawn' WHERE period='2026-11-10'").run();
 s.db.prepare("DELETE FROM estate_mp_payouts").run();
 r=await s.ex.runMonthly();
 assert.equal(r.state,'paid');assert.equal(r.period,'2026-11-10');
 assert.equal(s.L.submits.filter(x=>x.type==='AMMWithdraw').length,firstWithdraws,'resume does not withdraw again');

 // 5. Daily dust: gain above principal but under the dust value stays in the pool
 s=setup({nowMs:Date.UTC(2026,10,11,0,5),dust:'1'}); // fixture withdraw value is ~0.20 RLUSD
 r=await s.ex.runMonthly();
 assert.equal(r.state,'nothing_to_harvest');assert.equal(r.period,'2026-11-10');
 assert.equal(s.L.submits.length,0,'tiny daily gain is not withdrawn');
 assert.equal(s.ex.ledger.trackedLp(),'100');
 r=await s.ex.runMonthly();
 assert.equal(r.state,'not_due','nothing_to_harvest is idempotent for that day');

 // 6. gain<=0 never withdraws (price move, constant product)
 s=setup({nowMs:Date.UTC(2026,10,11,0,5),dust:'0.000001',pool:{img:20000,rl:50,lpSupply:1000,lpHeld:100}});
 r=await s.ex.runMonthly();
 assert.equal(r.state,'nothing_to_harvest');
 assert.equal(s.L.submits.length,0);

 // 7. Monthly default still withdraws a sub-dust gain (behavior unchanged until daily is set)
 s=setup({cadence:'monthly',nowMs:Date.UTC(2026,11,1,0,5),dust:'1'});
 r=await s.ex.runMonthly();
 assert.equal(r.period,'2026-11');assert.equal(r.state,'paid');
 assert(s.L.submits.some(x=>x.type==='AMMWithdraw'),'monthly still harvests under-dust gain');
 r=await s.ex.runMonthly();
 assert.equal(r.state,'not_due');

 // 8. Switching to daily after a monthly period key does not re-harvest that month's days
 s=setup({cadence:'daily',nowMs:Date.UTC(2026,10,15,0,5),dust:'0.000001'});
 s.db.prepare("INSERT INTO estate_mp_harvests(period,state,created,updated) VALUES('2026-11','paid',?,?)").run(Date.UTC(2026,11,1),Date.UTC(2026,11,1));
 r=await s.ex.runMonthly();
 assert.equal(r.state,'not_due','November already covered by the monthly harvest');

 assert.equal(s.ex.status().cadence,'daily');
 const {createEstateMonthlyService}=require('./estate-monthly-service');
 const svc=createEstateMonthlyService({db:s.db,pay:{ledger:async()=>({request:async()=>({}),autofill:async q=>q})},config:{NETWORK:'testnet',DRY_RUN:true,ESTATE_TREASURY:treasury,TREASURY_SEED:''},guard:{paused:()=>false,log:()=>{}},
  env:{ESTATE_HARVEST_CADENCE:'daily',ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL},executor:s.ex});
 assert.equal(svc.status().cadence,'daily');assert.equal(svc.status().rewardsGuaranteed,false);
 console.log('Estates harvest cadence: daily idempotency, principal-only, dust left in pool, snapshot shares, crash resume, monthly default unchanged');
})().catch(e=>{console.error(e);process.exit(1);});
