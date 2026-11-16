'use strict';
// Hourly holder drip against a simulated ledger: OFF by default, fixed 90% LP budget with a hard cap,
// one slice per UTC hour (no catch-up dump), 3.22% of value burned in IMG to the issuer, pro-rata
// holder payouts, dust/tec carry, crash resume, pause, completion, and monthly-plan bookkeeping.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const xrpl=require('xrpl');
const P=require('./estate-monthly-plan');
const D=require('./estate-hourly-drip');
const {N}=require('./estate-liquidity-ledger');
const {createEstateMonthlyExecutor}=require('./estate-monthly-executor');
const {createEstateMonthlyService}=require('./estate-monthly-service');

const wallet=xrpl.Wallet.generate();const treasury=wallet.classicAddress;
const A='rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',B='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',C='rDtUEMFVDi3K7TUQAQLi6xxa1WCer84dcA';
const IMG={currency:'IMG',issuer:P.IMG_ISSUER},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},LPC='03'+'A'.repeat(38);
const ACCOUNT_ZERO='rrrrrrrrrrrrrrrrrrrrBZbvji';
const fix=v=>Number(v).toFixed(9);
function makeLedger({img=38000,rl=61.4,lpSupply=1525,lpHeld=1106,noTrust=new Set()}={}){
 const L={seq:5000,tx:new Map(),submits:[],amm:{img,rl,lp:lpSupply},bal:{xrp:50e6,IMG:0,RL:0,LP:lpHeld},seqAcct:1,paid:{}};
 const line=(cur,issuer,before,after)=>({ModifiedNode:{LedgerEntryType:'RippleState',
  FinalFields:{Balance:{currency:cur,issuer:ACCOUNT_ZERO,value:fix(after)},LowLimit:{currency:cur,issuer:treasury,value:'1e15'},HighLimit:{currency:cur,issuer,value:'0'}},
  PreviousFields:{Balance:{currency:cur,issuer:ACCOUNT_ZERO,value:fix(before)}}}});
 const root=(b,a)=>({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:String(a)},PreviousFields:{Balance:String(b)}}});
 function apply(tx){
  const nodes=[],x0=L.bal.xrp;let result='tesSUCCESS';
  if(tx.TransactionType==='AMMWithdraw'){
   const lpIn=Number(tx.LPTokenIn.value);
   if(lpIn>L.bal.LP+1e-9)result='tecUNFUNDED_AMM';
   else{const i=L.amm.img*lpIn/L.amm.lp,r=L.amm.rl*lpIn/L.amm.lp,bi=L.bal.IMG,br=L.bal.RL,bl=L.bal.LP;
    L.amm.img-=i;L.amm.rl-=r;L.amm.lp-=lpIn;L.bal.IMG+=i;L.bal.RL+=r;L.bal.LP-=lpIn;L.bal.xrp-=12;
    nodes.push(line('IMG',IMG.issuer,bi,L.bal.IMG),line(RL.currency,RL.issuer,br,L.bal.RL),line(LPC,P.IMG_RLUSD_POOL,bl,L.bal.LP),root(x0,L.bal.xrp));}
  }else if(tx.TransactionType==='Payment'){
   const key=tx.Amount.currency==='IMG'?'IMG':'RL',amt=Number(tx.Amount.value);
   if(noTrust.has(tx.Destination))result='tecPATH_DRY';
   else if(amt>L.bal[key]+1e-9)result='tecUNFUNDED_PAYMENT';
   else{const b=L.bal[key];L.bal[key]-=amt;L.bal.xrp-=12;L.paid[tx.Destination+':'+key]=(L.paid[tx.Destination+':'+key]||0)+amt;nodes.push(line(tx.Amount.currency,tx.Amount.issuer,b,L.bal[key]),root(x0,L.bal.xrp));}
  }else result='temDISABLED';
  return {result,nodes};
 }
 const client={
  async request(q){
   switch(q.command){
    case 'amm_info':return {result:{amm:{account:P.IMG_RLUSD_POOL,amount:{...IMG,value:String(L.amm.img)},amount2:{...RL,value:String(L.amm.rl)},trading_fee:553,lp_token:{currency:LPC,issuer:P.IMG_RLUSD_POOL,value:String(L.amm.lp)}}}};
    case 'account_info':return {result:{account_data:{Balance:String(L.bal.xrp),OwnerCount:4}}};
    case 'server_state':return {result:{state:{validated_ledger:{reserve_base:1000000,reserve_inc:200000}}}};
    case 'ledger':return {result:{ledger_index:L.seq}};
    case 'account_lines':return {result:{lines:[{currency:LPC,balance:String(L.bal.LP)}]}};
    case 'submit':{const tx=xrpl.decode(q.tx_blob),hash=xrpl.hashes.hashSignedTx(q.tx_blob);L.seq++;
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
function setup({env={},nowMs=Date.UTC(2026,10,16,1,5),owners=[{acct:A,shareUnits:3},{acct:B,shareUnits:1}],ledger={},paused=false}={}){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
 owners.forEach((o,i)=>db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('lot-'+i,o.acct,'T'+i,3000000,o.shareUnits,Date.UTC(2026,10,10)));
 const {L,client}=makeLedger(ledger);
 P.createEstateMonthlyLedger(db);
 // Plan-tracked principal: 1008.31 of the 1106 LP held (the rest is operator LP), like production.
 const k0=P.kPerLp({poolImg:String(L.amm.img),poolRlusd:String(L.amm.rl),lpSupply:String(L.amm.lp)});
 db.prepare("INSERT INTO estate_mp_deposits(id,source,kind,state,xrp_drops,xrp_remaining_drops,img_in,rlusd_in,lp_out,principal_k,created,updated) VALUES('dep:seed','seed','purchase','deposited','0','0','1','1','1008.31',?,?,?)")
  .run(new N('1008.31').times(k0).toFixed(),Date.UTC(2026,10,9),Date.UTC(2026,10,9));
 const cfg={...P.monthlyConfig({ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL,ESTATE_HARVEST_CADENCE:'daily'}),poolAccount:P.IMG_RLUSD_POOL};
 const drip=D.hdConfig(env);
 let t=nowMs,isPaused=paused;
 const ex=createEstateMonthlyExecutor({db,client,wallet:()=>wallet,treasury,cfg,enabled:true,paused:()=>isPaused,
  xrpRlusdAsset:RL,xrpImgAsset:IMG,now:()=>t,pollMs:0,pollTries:3,log:()=>{},drip});
 return {db,L,ex,setNow:ms=>{t=ms;},setPaused:v=>{isPaused=v;}};
}
const ON={ESTATE_HOURLY_DRIP_ENABLED:'1',ESTATE_HOURLY_DRIP_MAX_LP:'995.8',ESTATE_HOURLY_DUST_RLUSD:'0.000001'};
const H=h=>Date.UTC(2026,10,16,h,5);

(async()=>{
 // Config: everything OFF by default; validation.
 const d0=D.hdConfig({});
 assert.equal(d0.enabled,false);assert.equal(d0.budgetBps,9000);assert.equal(d0.hours,2160);assert.equal(d0.burnBps,322);assert.equal(d0.dust,'0.01');assert.equal(d0.maxLp,'');
 assert.throws(()=>D.hdConfig({ESTATE_HOURLY_BURN_BPS:'5000'}),/invalid_hourly_drip_setting/);
 assert.throws(()=>D.hdConfig({ESTATE_HOURLY_DRIP_HOURS:'2'}),/invalid_hourly_drip_setting/);
 assert.throws(()=>D.hdConfig({ESTATE_HOURLY_DRIP_MAX_LP:'abc'}),/invalid_hourly_drip_setting/);

 // Pure math
 assert.equal(D.budgetFor({onLedgerLp:'1106.437692246587',budgetBps:9000,maxLp:'2000'}),'995.793923021928');
 assert.equal(D.budgetFor({onLedgerLp:'1106.437692246587',budgetBps:9000,maxLp:'995.79'}),'995.79','operator cap wins');
 assert.throws(()=>D.budgetFor({onLedgerLp:'1',budgetBps:9000,maxLp:''}),/max_lp_required/);
 assert.equal(D.sliceLp({budgetLp:'240',hours:24,withdrawnLp:'0',slicesDone:0}),'10');
 assert.equal(D.sliceLp({budgetLp:'240',hours:24,withdrawnLp:'235',slicesDone:23}),'5','last slice takes the remainder');
 assert.equal(D.sliceLp({budgetLp:'240',hours:24,withdrawnLp:'240',slicesDone:24}),'0');
 const sp=D.splitSlice({img:'100',rlusd:'0.16',burnBps:322});
 assert.equal(sp.burnImg,'6.44');assert.equal(sp.holdersImg,'93.56');assert.equal(sp.holdersRlusd,'0.16');
 const adj=D.planAdjustment({onledger_lp_at_start:'1000',tracked_lp_at_start:'900',principal_k_at_start:'90'},'100');
 assert.equal(adj.trackedLp.toFixed(),'90');assert.equal(adj.principalK.toFixed(),'9');

 // OFF by default: nothing is signed.
 let s=setup();
 let r=await s.ex.runHourlyDrip();
 assert.equal(r.error,'hourly_drip_disabled');assert.equal(s.L.submits.length,0);
 // Enabled without the operator LP cap: refuses.
 s=setup({env:{ESTATE_HOURLY_DRIP_ENABLED:'1'}});
 r=await s.ex.runHourlyDrip();
 assert.equal(r.error,'hourly_drip_max_lp_required');assert.equal(s.L.submits.length,0);

 // First hour: snapshot budget, one slice, burn, pay holders 3:1.
 s=setup({env:ON,nowMs:H(1)});
 const k0=P.kPerLp({poolImg:String(s.L.amm.img),poolRlusd:String(s.L.amm.rl),lpSupply:String(s.L.amm.lp)});
 r=await s.ex.runHourlyDrip();
 assert.equal(r.ok,true);assert.equal(r.state,'paid');assert.equal(r.hour,'2026-11-16T01');
 const prog=s.db.prepare('SELECT * FROM estate_hd_program').get();
 assert.equal(prog.budget_lp,'995.4');assert.equal(prog.hours,2160);assert.equal(prog.burn_bps,322);assert.equal(prog.onledger_lp_at_start,'1106');
 const wd=s.L.submits.filter(x=>x.type==='AMMWithdraw');assert.equal(wd.length,1);
 assert.equal(wd[0].tx.Flags,P.TF.lpToken);assert.equal(wd[0].tx.LPTokenIn.value,new N('995.4').div(2160).decimalPlaces(12,N.ROUND_DOWN).toFixed());
 const burn=s.L.submits.find(x=>x.type==='Payment'&&x.tx.Destination===P.IMG_ISSUER);
 assert(burn,'IMG burned to the issuer');assert.equal(burn.tx.Amount.currency,'IMG');
 const run=s.db.prepare('SELECT * FROM estate_hd_runs').get();
 const value=new N(run.rlusd_out).plus(new N(run.img_out).times(new N(run.rlusd_out).div(run.img_out)));
 const burnValue=new N(burn.tx.Amount.value).times(new N(run.rlusd_out).div(run.img_out));
 assert(Math.abs(burnValue.div(value).toNumber()-0.0322)<1e-4,'burn is 3.22% of the payout value');
 const pays=s.db.prepare("SELECT * FROM estate_hd_payouts ORDER BY acct,currency").all();
 const aI=pays.find(p=>p.acct===A&&p.currency==='IMG'),bI=pays.find(p=>p.acct===B&&p.currency==='IMG');
 assert.equal(aI.state,'paid');assert.equal(bI.state,'paid');
 assert(Math.abs(Number(aI.amount)/Number(bI.amount)-3)<1e-3,'pro rata by share units');
 assert(s.L.submits.every(x=>x.result==='tesSUCCESS'));
 const hdHashes=s.db.prepare("SELECT hash FROM estate_mp_txs WHERE step LIKE 'hd:%'").all();
 assert.equal(hdHashes.length,s.L.submits.length,'every drip tx is journaled in estate_mp_txs (watch.js known hashes)');

 // Same hour: no-op.
 const n1=s.L.submits.length;
 r=await s.ex.runHourlyDrip();assert.equal(r.state,'not_due');assert.equal(s.L.submits.length,n1);

 // Missed hours are NOT caught up: jump 10 h -> exactly one slice.
 s.setNow(H(11));r=await s.ex.runHourlyDrip();
 assert.equal(r.state,'paid');assert.equal(s.L.submits.filter(x=>x.type==='AMMWithdraw').length,2);
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM estate_hd_runs').get().n,2);

 // Bookkeeping: plan tracked LP / principal reduced pro rata; the daily harvest does not treat
 // the drip as a loss or harvest principal (no fee growth in this fixture => nothing to harvest).
 const w=new N(s.db.prepare('SELECT SUM(CAST(lp_in AS REAL)) v FROM estate_hd_runs').get().v);
 const expTracked=new N('1008.31').minus(w.div('1106').times('1008.31'));
 assert(new N(s.ex.ledger.trackedLp()).minus(expTracked).abs().lt('1e-9'));
 assert(new N(s.ex.ledger.principalK()).minus(new N('1008.31').times(k0).times(new N(1).minus(w.div('1106')))).abs().lt('1e-9'));
 s.setNow(Date.UTC(2026,10,17,0,10));
 const before=s.L.submits.length;
 const m=await s.ex.runMonthly();
 assert.equal(m.state,'nothing_to_harvest');assert.equal(s.L.submits.length,before);
 assert.equal(s.ex.status().hourlyDrip.program.slicesDone,2);

 // Crash between withdraw and payouts: resumes without a second withdraw.
 s=setup({env:ON,nowMs:H(2)});
 await s.ex.runHourlyDrip();
 s.db.prepare("UPDATE estate_hd_runs SET state='withdrawn',burn_img='0'").run();s.db.prepare('DELETE FROM estate_hd_payouts').run();
 s.setNow(H(3));r=await s.ex.runHourlyDrip();
 assert.equal(r.hour,'2026-11-16T02','open hour resumes first');
 assert.equal(s.L.submits.filter(x=>x.type==='AMMWithdraw').length,1,'no second withdraw');
 assert.equal(s.L.submits.filter(x=>x.tx.Destination===P.IMG_ISSUER).length,1,'burn step is journaled, not repeated');

 // Holder without a trust line: validated tec carries forward; others still paid.
 s=setup({env:ON,nowMs:H(4),owners:[{acct:A,shareUnits:25},{acct:C,shareUnits:1}],ledger:{noTrust:new Set([C])}});
 r=await s.ex.runHourlyDrip();assert.equal(r.state,'paid');
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM estate_hd_payouts WHERE acct=? AND state='carried'").get(C).n,2);
 const cc=s.db.prepare('SELECT * FROM estate_hd_carry WHERE acct=?').get(C);assert(new N(cc.img).gt(0)&&new N(cc.rlusd).gt(0));

 // Dust: tiny shares carry until they reach the floor.
 s=setup({env:{...ON,ESTATE_HOURLY_DUST_RLUSD:'0.01'},nowMs:H(5),owners:[{acct:A,shareUnits:25},{acct:C,shareUnits:1}]});
 await s.ex.runHourlyDrip();
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM estate_hd_payouts WHERE acct=?').get(C).n,0,'1/26 of one hour is under 0.01 RLUSD');
 assert(s.db.prepare('SELECT 1 FROM estate_hd_carry WHERE acct=?').get(C));

 // Pause stops every step.
 s=setup({env:ON,nowMs:H(6),paused:true});
 r=await s.ex.runHourlyDrip();assert.equal(r.error,'treasury_paused');assert.equal(s.L.submits.length,0);

 // Completion: a 24-hour program withdraws exactly the budget, then stops.
 s=setup({env:{...ON,ESTATE_HOURLY_DRIP_HOURS:'24',ESTATE_HOURLY_DRIP_MAX_LP:'240'}});
 for(let h=0;h<30;h++){s.setNow(Date.UTC(2026,10,20,0,5)+h*3600e3);await s.ex.runHourlyDrip();}
 const tot=s.db.prepare('SELECT COUNT(*) n FROM estate_hd_runs').get().n;assert.equal(tot,24);
 assert.equal(new N(s.ex.status().hourlyDrip.totals.lpWithdrawn).toFixed(),'240');
 assert(s.ex.status().hourlyDrip.program.completedMs);
 assert.equal((await s.ex.runHourlyDrip()).state,'completed');
 assert(new N(s.L.bal.LP).minus(1106-240).abs().lt(1e-6),'the other LP stays in the pool');

 // Service wiring: switch off by default; enabled without cap is blocked; status exposes aggregates only.
 const pay={ledger:async()=>({request:async()=>({}),autofill:async q=>q})};
 const base={NETWORK:'testnet',DRY_RUN:true,ESTATE_TREASURY:treasury,TREASURY_SEED:''};
 let svc=createEstateMonthlyService({db:s.db,pay,config:base,guard:{paused:()=>false,log:()=>{}},env:{ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL}});
 assert.deepEqual(svc.status().hourlyDripBlockers,['hourly_drip_switch_off']);
 svc=createEstateMonthlyService({db:s.db,pay,config:base,guard:{paused:()=>false,log:()=>{}},env:{ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL,ESTATE_HOURLY_DRIP_ENABLED:'1'}});
 assert(svc.status().hourlyDripBlockers.includes('hourly_drip_max_lp_not_set'));
 assert(svc.status().hourlyDripBlockers.includes('not_mainnet_live'),'drip also needs the live plan gates');
 assert.equal(JSON.stringify(svc.status().hourlyDrip).includes(A),false,'no holder addresses in status');
 console.log('Estates hourly drip: off by default, 90% LP budget with cap, one slice per hour, 3.22% IMG burn, pro-rata payouts, carry, resume, pause, completion, plan bookkeeping');
})().catch(e=>{console.error(e);process.exit(1);});
