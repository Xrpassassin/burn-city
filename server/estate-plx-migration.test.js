'use strict';
// IMG/RLUSD -> IMG/PLX migration against a simulated multi-pool ledger: OFF by default, confirm token
// pins the LP, PLX trust line required, withdraw -> chunked best-route conversion -> two-sided deposit,
// journaled and resumable (crash + tefPAST_SEQ), deviation hold, residual ledgering, monthly-plan
// principal adjustment, guard shapes, and Pollux payouts starting from the migration.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const xrpl=require('xrpl');
const P=require('./estate-monthly-plan');
const V=require('./estate-v4-plan');
const M=require('./estate-plx-migration');
const {N}=require('./estate-liquidity-ledger');
const {createEstateMonthlyExecutor}=require('./estate-monthly-executor');
const wallet=xrpl.Wallet.generate();const treasury=wallet.classicAddress;
const A='rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',B='rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST';
const IMG={currency:'IMG',issuer:P.IMG_ISSUER},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},PLX={currency:'PLX',issuer:V.PLX_ISSUER},XRP={currency:'XRP'};
const ZERO='rrrrrrrrrrrrrrrrrrrrBZbvji';
const key=a=>typeof a==='string'||a.currency==='XRP'?'XRP':a.currency+'.'+a.issuer;
function makeLedger({plxLine=true,imgPlx=[3922,33928],failOnce=null,crashOnce=null,tecOnce=false}={}){
 const pools={},bal={XRP:4068602},submits=[],txs=new Map();let seq=9000,acctSeq=1;const flags={failOnce,crashOnce,tecOnce};
 const add=(acct,a,b,ra,rb,lp,lpc,fee)=>{pools[[key(a),key(b)].sort().join('|')]={acct,a,b,r:{[key(a)]:ra,[key(b)]:rb},lp,lpc,fee};};
 add(P.IMG_RLUSD_POOL,IMG,RL,38052.43,61.4475,1525.1176,'03'+'A'.repeat(38),553);
 add(V.IMG_XRP_POOL,IMG,XRP,268420,448.627,10886485,'03'+'B'.repeat(38),422);
 add(M.PLX_XRP_POOL,PLX,XRP,162417203,31582.7,1805946738,'03'+'C'.repeat(38),500);
 add(M.XRP_RLUSD_POOL,XRP,RL,1941190,1881392,1612714173,'03'+'D'.repeat(38),315);
 add(M.PLX_RLUSD_POOL,PLX,RL,4212196,795.74,50675,'03'+'F'.repeat(38),260);
 add(V.IMG_PLX_POOL,IMG,PLX,imgPlx[0],imgPlx[1],11441.73,'03'+'E'.repeat(38),482);
 const pool=(a,b)=>pools[[key(a),key(b)].sort().join('|')];
 bal['03'+'A'.repeat(38)+'.'+P.IMG_RLUSD_POOL]=1106.4377;bal['IMG.'+P.IMG_ISSUER]=1176.78;bal[key(RL)]=0.818;if(plxLine)bal[key(PLX)]=0;
 const b=k=>bal[k]||0;
 const line=(k,before,after)=>{const i=k.lastIndexOf('.'),cur=k.slice(0,i),iss=k.slice(i+1);return {ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{Balance:{currency:cur,issuer:ZERO,value:String(+after.toFixed(12))},LowLimit:{currency:cur,issuer:treasury,value:'1e15'},HighLimit:{currency:cur,issuer:iss,value:'0'}},PreviousFields:{Balance:{currency:cur,issuer:ZERO,value:String(+before.toFixed(12))}}}};};
 const val=a=>typeof a==='string'?Number(a)/1e6:Number(a.value);
 function apply(tx){
  const before={...bal},nodes=[];let result='tesSUCCESS';
  if(tx.TransactionType==='AMMWithdraw'){
   const p=pool(tx.Asset,tx.Asset2),lk=p.lpc+'.'+p.acct,lp=Number(tx.LPTokenIn.value);
   if(lp>b(lk)+1e-9)result='tecUNFUNDED_AMM';else{const f=lp/p.lp;for(const k of Object.keys(p.r)){const d=p.r[k]*f;p.r[k]-=d;bal[k]=b(k)+d;}p.lp-=lp;bal[lk]-=lp;}
  }else if(tx.TransactionType==='Payment'&&!tx.SendMax){
   const k=key(tx.Amount);if(b(k)<val(tx.Amount))result='tecUNFUNDED_PAYMENT';else bal[k]-=val(tx.Amount);
  }else if(tx.TransactionType==='Payment'){
   const outK=key(tx.Amount),inK=key(tx.SendMax),p=pool(tx.Amount,tx.SendMax),want=val(tx.Amount),max=val(tx.SendMax);
   const fee=p.fee/1e5,need=p.r[inK]*want/((p.r[outK]-want)*(1-fee));
   if(inK!=='XRP'&&key(PLX)===outK&&!(key(PLX) in bal))result='tecPATH_DRY';
   else if(need>max+1e-12||(flags.tecOnce&&!(flags.tecOnce=false)))result='tecPATH_PARTIAL';
   else{p.r[inK]+=need;p.r[outK]-=want;if(inK==='XRP')bal.XRP-=Math.ceil(need*1e6);else bal[inK]-=need;if(outK==='XRP')bal.XRP+=Math.round(want*1e6);else bal[outK]=b(outK)+want;}
  }else if(tx.TransactionType==='AMMDeposit'){
   const p=pool(tx.Asset,tx.Asset2);const am=[tx.Amount,tx.Amount2].map(a=>[key(a),val(a)]);
   const f=Math.min(...am.map(([k,v])=>v/p.r[k]));for(const [k] of am){const d=p.r[k]*f;p.r[k]+=d;bal[k]-=d;}
   const lp=p.lp*f;p.lp+=lp;const lk=p.lpc+'.'+p.acct;bal[lk]=b(lk)+lp;
  }else result='temDISABLED';
  if(!result.startsWith('tes'))bal.XRP-=12;
  if(result==='tesSUCCESS'){bal.XRP-=12;
   for(const k of Object.keys(bal))if(k!=='XRP'&&(before[k]||0)!==bal[k])nodes.push(line(k,before[k]||0,bal[k]));
   nodes.push({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:String(bal.XRP)},PreviousFields:{Balance:String(before.XRP)}}});}
  return {result,nodes};
 }
 const client={
  async request(q){
   switch(q.command){
    case 'amm_info':{const p=pool(q.asset,q.asset2);const amt=x=>x.currency==='XRP'?String(Math.round(p.r.XRP*1e6)):{...x,value:String(p.r[key(x)])};
     return {result:{amm:{account:p.acct,amount:amt(p.a),amount2:amt(p.b),trading_fee:p.fee,lp_token:{currency:p.lpc,issuer:p.acct,value:String(p.lp)}}}};}
    case 'account_info':return {result:{ledger_index:seq,account_data:{Balance:String(bal.XRP),OwnerCount:4}}};
    case 'server_state':return {result:{state:{validated_ledger:{reserve_base:1000000,reserve_inc:200000}}}};
    case 'ledger':return {result:{ledger_index:seq}};
    case 'account_lines':return {result:{lines:Object.keys(bal).filter(k=>k!=='XRP').map(k=>{const i=k.lastIndexOf('.');return {currency:k.slice(0,i),account:k.slice(i+1),balance:String(bal[k])};})}};
    case 'submit':{const tx=xrpl.decode(q.tx_blob),hash=xrpl.hashes.hashSignedTx(q.tx_blob);
     if(flags.failOnce&&tx.TransactionType===flags.failOnce){flags.failOnce=null;return {result:{engine_result:'tefPAST_SEQ'}};}
     seq++;const {result,nodes}=apply(tx);submits.push({type:tx.TransactionType,tx,result});
     txs.set(hash,{...tx,hash,validated:true,meta:{TransactionResult:result,AffectedNodes:nodes}});
     if(flags.crashOnce&&tx.TransactionType===flags.crashOnce){flags.crashOnce=null;throw Error('NotConnectedError');}
     return {result:{engine_result:result.startsWith('tes')?'tesSUCCESS':result}};}
    case 'tx':{const t=txs.get(String(q.transaction).toUpperCase());if(!t){const e=Error('txnNotFound');e.data={error:'txnNotFound'};throw e;}return {result:structuredClone(t)};}
   }
   throw Error('unexpected:'+q.command);
  },
  async autofill(tx){return {...tx,Fee:'12',Sequence:acctSeq++,LastLedgerSequence:seq+20,Flags:tx.Flags||0};}
 };
 return {client,bal,submits,pool};
}
function setup({env={},ledger={},v4env={}}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL);
 CREATE TABLE estate_img_hourly_batches(epoch_start_ms INTEGER PRIMARY KEY,total_units TEXT NOT NULL);
 CREATE TABLE estate_img_hourly_entitlements(epoch_start_ms INTEGER NOT NULL,owner TEXT NOT NULL,amount_units TEXT NOT NULL,PRIMARY KEY(epoch_start_ms,owner));`);
 const L=makeLedger(ledger);P.createEstateMonthlyLedger(db);
 const k0=P.kPerLp({poolImg:'38052.43',poolRlusd:'61.4475',lpSupply:'1525.1176'});
 db.prepare("INSERT INTO estate_mp_deposits(id,source,kind,state,lp_out,principal_k,created,updated) VALUES('dep:x','x','purchase','deposited','1008.31',?,1,1)").run(new N('1008.31').times(k0).toFixed());
 let t=Date.UTC(2026,10,16,4,10);
 const cfg={...P.monthlyConfig({ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL}),poolAccount:P.IMG_RLUSD_POOL};
 const ex=createEstateMonthlyExecutor({db,client:L.client,wallet:()=>wallet,treasury,cfg,enabled:true,paused:()=>false,xrpRlusdAsset:RL,xrpImgAsset:IMG,
  now:()=>t,pollMs:0,pollTries:3,log:()=>{},mig:{...M.migConfig(env),plxIssuer:V.PLX_ISSUER},v4:V.v4Config(v4env)});
 return {db,L,ex,setNow:ms=>{t=ms;}};
}
const ON={ESTATE_PLX_MIGRATION_ENABLED:'1'};
(async()=>{
 const mc=M.migConfig({});assert.equal(mc.enabled,false);assert.equal(mc.bps,9000);
 assert.equal(M.targetLp('1106.437692246587',mc),'995.793923021928');
 assert.equal(M.targetLp('1106.437692246587',M.migConfig({ESTATE_PLX_MIGRATION_MAX_LP:'900'})),'900');
 assert.throws(()=>M.migConfig({ESTATE_PLX_MIGRATION_BPS:'0'}),/invalid_migration_setting/);
 // Guard shapes
 const ctx={treasury,imgIssuer:P.IMG_ISSUER,plxIssuer:V.PLX_ISSUER,maxLpIn:'10'};
 const G=tx=>M.assertSafeMigrationTransaction({Account:treasury,...tx},ctx);
 assert.throws(()=>G({TransactionType:'AMMWithdraw',Asset:IMG,Asset2:RL,LPTokenIn:{currency:'03',issuer:P.IMG_RLUSD_POOL,value:'11'},Flags:0x00010000}),/withdraw_exceeds_confirmed_lp/);
 assert.throws(()=>G({TransactionType:'Payment',Destination:A,Amount:{...PLX,value:'1'},SendMax:'10'}),/destination_not_allowed/);
 assert.throws(()=>G({TransactionType:'Payment',Destination:treasury,Amount:{...IMG,value:'1'},SendMax:'10'}),/swap_shape/);
 assert.throws(()=>G({TransactionType:'Payment',Destination:treasury,Amount:{...PLX,value:'1'},SendMax:'10',Paths:[[]]}),/explicit_paths_forbidden/);
 assert.throws(()=>G({TransactionType:'AMMDeposit',Asset:IMG,Asset2:PLX,Amount:{...IMG,value:'1'},Flags:0x00080000}),/two_sided_only/);
 assert.throws(()=>G({TransactionType:'OfferCreate'}),/type_not_allowed/);
 assert(G({TransactionType:'Payment',Destination:treasury,Amount:'1000',SendMax:{...RL,value:'1'}}));

 // Dry-run planner on the simulated live state
 let s=setup();
 const st=await M.readLiveState(s.L.client,treasury);
 const plan=M.planMigration(st,P.monthlyConfig({}),mc);
 assert.equal(plan.confirm,'MIGRATE-995.793923021928'.replace('995.793923021928',M.targetLp('1106.4377',mc)));
 assert(plan.steps[1].worstHopImpactBps<=100);assert(new N(plan.steps[2].lpOut).gt(0));assert(plan.reserve.plxTrustLineMissing===false);
 assert.equal(s.L.submits.length,0,'dry run signs nothing');

 // OFF by default / guards before anything is signed
 assert.equal((await s.ex.runPlxMigration({confirm:plan.confirm})).error,'migration_disabled');
 s=setup({env:ON,ledger:{plxLine:false}});
 assert.equal((await s.ex.runPlxMigration({confirm:'x'})).error,'plx_trustline_required');
 s=setup({env:ON});
 let r=await s.ex.runPlxMigration({confirm:'MIGRATE-1'});
 assert.equal(r.error,'confirm_mismatch');assert.equal(r.expected,plan.confirm);assert.equal(s.L.submits.length,0);

 // Full run
 r=await s.ex.runPlxMigration({confirm:plan.confirm});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.state,'completed');
 assert.equal(r.lpIn,M.targetLp('1106.4377',mc));
 const types=s.L.submits.map(x=>x.type);assert.equal(types.filter(t=>t==='AMMWithdraw').length,1);assert.equal(types.filter(t=>t==='AMMDeposit').length,1);
 assert(s.L.submits.every(x=>x.result==='tesSUCCESS'));
 assert(s.L.submits.filter(x=>x.type==='Payment').every(x=>x.tx.Destination===treasury&&!(Number(x.tx.Flags)&0x00020000)),'self swaps only, no partial payments');
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE 'mig:v1:%'").get().n,s.L.submits.length,'every step journaled');
 assert(new N(r.rlusdOut).minus(r.residual.rlusd).gt('40'));assert(new N(r.residual.rlusd).lt('0.01'));
 assert(BigInt(r.residual.xrpDrops)<200000n);
 assert(new N(r.plxDeposited).gt('190000'));assert(new N(r.imgDeposited).div(r.imgOut).gt('0.95'),'most IMG deposited; rest kept as residual');
 const lpKey=s.L.pool(IMG,PLX).lpc+'.'+V.IMG_PLX_POOL;assert(Math.abs(s.L.bal[lpKey]-Number(r.lpOut))<1e-6,'ledgered LP equals on-ledger LP');
 assert(s.L.bal[lpKey]/s.L.pool(IMG,PLX).lp>0.8,'estate owns most of IMG/PLX after deposit');
 // Monthly plan bookkeeping: 90% of tracked principal leaves with the migration
 assert(new N(s.ex.ledger.trackedLp()).minus(new N('1008.31').times(new N(1).minus(new N(r.lpIn).div('1106.4377')))).abs().lt('1e-6'));
 assert.equal(s.ex.status().plxMigration.state,'completed');
 const n=s.L.submits.length;r=await s.ex.runPlxMigration({confirm:plan.confirm});assert.equal(r.state,'completed');assert.equal(s.L.submits.length,n,'idempotent');

 // Crash after submitting the withdraw: resumes from the journal, no second withdraw
 s=setup({env:ON,ledger:{crashOnce:'AMMWithdraw'}});
 await assert.rejects(s.ex.runPlxMigration({confirm:plan.confirm}));
 r=await s.ex.runPlxMigration({confirm:plan.confirm});assert.equal(r.state,'completed');
 assert.equal(s.L.submits.filter(x=>x.type==='AMMWithdraw').length,1);
 // tefPAST_SEQ (another treasury tx took the sequence): never applied, re-signed once
 s=setup({env:ON,ledger:{failOnce:'AMMDeposit'}});
 r=await s.ex.runPlxMigration({confirm:plan.confirm});assert.equal(r.state,'completed',JSON.stringify(r));
 assert.equal(s.L.submits.filter(x=>x.type==='AMMDeposit').length,1);
 // A conversion chunk that fails with tec (fee only) is marked failed and requoted
 s=setup({env:ON,ledger:{tecOnce:true}});
 r=await s.ex.runPlxMigration({confirm:plan.confirm});assert.equal(r.state,'completed',JSON.stringify(r));
 assert.equal(s.L.submits.filter(x=>x.result==='tecPATH_PARTIAL').length,1);
 // IMG/PLX pool off-market: deposit holds (funds stay in the treasury, ledgered) until it is back
 s=setup({env:ON,ledger:{imgPlx:[3922,40000]}});
 r=await s.ex.runPlxMigration({confirm:plan.confirm});assert.equal(r.error,'guard:pool_price_deviation');
 assert.equal(s.ex.status().plxMigration.state,'converted');assert.equal(s.L.submits.filter(x=>x.type==='AMMDeposit').length,0);
 s.L.pool(IMG,PLX).r[key(PLX)]=3922*8.58;
 r=await s.ex.runPlxMigration({confirm:plan.confirm});assert.equal(r.state,'completed');
 // XRP mid-route is protected cash (guard reserve hook)
 assert.equal(M.migrationHeldXrpDrops(s.db),BigInt(s.db.prepare("SELECT xrp_held_drops v FROM estate_plx_migration").get().v));

 // Pollux payouts start from the migration even before any v4 purchase split
 s=setup({env:ON,v4env:{ESTATE_POLICY_V4_ENABLED:'1',ESTATE_POLLUX_PAYOUTS_ENABLED:'1'}});
 await s.ex.runPlxMigration({confirm:plan.confirm});
 s.db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?)').run(Date.UTC(2026,10,16,3),'500000');
 s.db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(Date.UTC(2026,10,16,3),A,'500000');
 s.db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?)').run(Date.UTC(2026,10,16,4),'1000000');
 s.db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(Date.UTC(2026,10,16,4),B,'1000000');
 r=await s.ex.runPolluxPayouts();
 assert.equal(r.hour,Date.UTC(2026,10,16,4),'hours before the migration are not paid');assert.equal(r.burnUnits,'32200');
 console.log('Estates IMG/PLX migration: off by default, confirm-pinned LP, PLX line required, withdraw -> best-route chunks -> two-sided deposit, journaled, crash/tef resume, deviation hold, residual ledger, plan adjustment, Pollux from migration');
})().catch(e=>{console.error(e);process.exit(1);});
