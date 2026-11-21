'use strict';
// Policy v4 against a simulated multi-pool ledger: OFF by default, 90/5/5 split of NEW purchases with
// ledgered folds, IMG/PLX + IMG/XRP two-sided deposits (no withdrawals: auto-compound), IMG/RLUSD 5%
// through the existing queue, Pollux hourly IMG with a 3.22% burn, dust/tec carry, idempotency,
// guard reserve, and the service skipping the fee harvest while v4 is on.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const xrpl=require('xrpl');
const P=require('./estate-monthly-plan');
const V=require('./estate-v4-plan');
const {N}=require('./estate-liquidity-ledger');
const {createEstateMonthlyExecutor}=require('./estate-monthly-executor');
const {createEstateMonthlyService}=require('./estate-monthly-service');

const wallet=xrpl.Wallet.generate();const treasury=wallet.classicAddress;
const A='rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA',B='rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST',C='rDtUEMFVDi3K7TUQAQLi6xxa1WCer84dcA';
const IMG={currency:'IMG',issuer:P.IMG_ISSUER},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},PLX={currency:'PLX',issuer:V.PLX_ISSUER};
const ZERO='rrrrrrrrrrrrrrrrrrrrBZbvji';
const key=a=>typeof a==='string'||a.currency==='XRP'?'XRP':a.currency+'.'+a.issuer;
function makeLedger({noTrust=new Set(),plxPoolImg=3911,plxPoolPlx=34026}={}){
 const pools={},bal={XRP:200e6},paid={},submits=[],txs=new Map(),history=[],lineCalls=[];
 const lines={err:new Set(),stale:new Set(),limit:new Map()}; // owner IMG trust-line view (account_lines)
 let closeTime=Date.UTC(2026,10,16,8)/1000-946684800;let seq=9000,acctSeq=1;
 const addPool=(acct,a,b,ra,rb,lp,lpc)=>{pools[[key(a),key(b)].sort().join('|')]={acct,a,b,r:{[key(a)]:ra,[key(b)]:rb},lp,lpc};};
 addPool(P.IMG_RLUSD_POOL,IMG,RL,38052,61.45,1525,'03'+'A'.repeat(38));
 addPool(V.IMG_XRP_POOL,IMG,{currency:'XRP'},268420,448.627,10886485,'03'+'B'.repeat(38));
 addPool('rGQGMpTSSCk82iMWwaAtaSkuVW5UzenVBS',PLX,{currency:'XRP'},162467272,31572.8,1e9,'03'+'C'.repeat(38));
 addPool('rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',{currency:'XRP'},RL,1951179,1871940,1612805981,'03'+'D'.repeat(38));
 addPool(V.IMG_PLX_POOL,IMG,PLX,plxPoolImg,plxPoolPlx,11441,'03'+'E'.repeat(38));
 const pool=(a,b)=>pools[[key(a),key(b)].sort().join('|')];
 const b=k=>bal[k]||0;
 const line=(k,before,after)=>{const [cur,iss]=k.split('.');return {ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{Balance:{currency:cur,issuer:ZERO,value:String(+after.toFixed(12))},LowLimit:{currency:cur,issuer:treasury,value:'1e15'},HighLimit:{currency:cur,issuer:iss,value:'0'}},PreviousFields:{Balance:{currency:cur,issuer:ZERO,value:String(+before.toFixed(12))}}}};};
 function apply(tx){
  const before={...bal},nodes=[];let result='tesSUCCESS';
  if(tx.TransactionType==='Payment'&&tx.Destination===treasury){
   const k=key(tx.Amount),p=pool({currency:'XRP'},tx.Amount),xin=Number(tx.SendMax)/1e6;
   const out=p.r[k]*xin*(1-0.005)/(p.r.XRP+xin);if(out<Number(tx.Amount.value))result='tecPATH_PARTIAL';
   else{p.r.XRP+=xin;p.r[k]-=out;bal.XRP-=Number(tx.SendMax);bal[k]=b(k)+out;}
  }else if(tx.TransactionType==='Payment'){
   const k=key(tx.Amount),amt=Number(typeof tx.Amount==='string'?tx.Amount:tx.Amount.value);
   if(noTrust.has(tx.Destination)&&typeof tx.Amount==='object')result='tecPATH_DRY';else if(amt>b(k)+1e-9)result='tecUNFUNDED_PAYMENT';
   else{bal[k]-=amt;paid[tx.Destination]=(paid[tx.Destination]||0)+amt;}
  }else if(tx.TransactionType==='AMMDeposit'){
   const p=pool(tx.Asset,tx.Asset2);const amts=[tx.Amount,tx.Amount2].map(a=>typeof a==='string'?['XRP',Number(a)/1e6]:[key(a),Number(a.value)]);
   const f=Math.min(...amts.map(([k,v])=>v/p.r[k]));const lp=p.lp*f;
   for(const [k] of amts){const d=p.r[k]*f;p.r[k]+=d;if(k==='XRP')bal.XRP-=Math.round(d*1e6);else bal[k]-=d;}
   p.lp+=lp;const lk=p.lpc+'.'+p.acct;bal[lk]=b(lk)+lp;
  }else result='temDISABLED';
  if(result==='tesSUCCESS'){bal.XRP-=12;
   for(const k of Object.keys(bal))if(k!=='XRP'&&(before[k]||0)!==bal[k])nodes.push(line(k,before[k]||0,bal[k]));
   nodes.push({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:String(bal.XRP)},PreviousFields:{Balance:String(before.XRP)}}});}
  return {result,nodes};
 }
 const client={
  async request(q){
   switch(q.command){
    case 'amm_info':{const p=pool(q.asset,q.asset2);const amt=x=>x.currency==='XRP'?String(Math.round(p.r.XRP*1e6)):{...x,value:String(p.r[key(x)])};
     return {result:{amm:{account:p.acct,amount:amt(p.a),amount2:amt(p.b),trading_fee:500,lp_token:{currency:p.lpc,issuer:p.acct,value:String(p.lp)}}}};}
    case 'account_info':return {result:{validated:true,ledger_index:seq,account_data:{Account:treasury,Balance:String(bal.XRP),OwnerCount:6,Sequence:acctSeq++}}};
    case 'fee':return {result:{drops:{open_ledger_fee:'10'}}};
    case 'server_state':return {result:{state:{validated_ledger:{reserve_base:1000000,reserve_inc:200000}}}};
    case 'ledger':return {result:{ledger_index:seq,validated:true,ledger:{close_time:closeTime}}};
    case 'account_tx':return {result:{account:treasury,validated:true,ledger_index_min:q.ledger_index_min,ledger_index_max:q.ledger_index_max,
     transactions:history.filter(r=>r.ledger_index>=q.ledger_index_min&&r.ledger_index<=q.ledger_index_max).toReversed()}};
    case 'account_lines':{
     if(q.peer===P.IMG_ISSUER){lineCalls.push(q.account);if(lines.err.has(q.account))throw Error('rpc_timeout');
      const show=!noTrust.has(q.account)||lines.stale.has(q.account);
      return {result:{validated:q.ledger_index==='validated',account:q.account,lines:show?[{account:P.IMG_ISSUER,currency:'IMG',balance:'0',limit:lines.limit.get(q.account)||'1000000000'}]:[]}};}
     const p=Object.values(pools).find(x=>x.acct===q.peer);return {result:{lines:p?[{currency:p.lpc,balance:String(b(p.lpc+'.'+p.acct))}]:[]}};}
    case 'submit':{const tx=xrpl.decode(q.tx_blob),hash=xrpl.hashes.hashSignedTx(q.tx_blob);seq++;const {result,nodes}=apply(tx);submits.push({type:tx.TransactionType,tx,result});
     txs.set(hash,{...tx,hash,validated:true,meta:{TransactionResult:result,AffectedNodes:nodes,delivered_amount:tx.Amount}});return {result:{engine_result:result.startsWith('tes')?'tesSUCCESS':result}};}
    case 'tx':{const t=txs.get(String(q.transaction).toUpperCase());if(!t){const e=Error('txnNotFound');e.data={error:'txnNotFound'};throw e;}return {result:structuredClone(t)};}
   }
   throw Error('unexpected:'+q.command);
  },
  async autofill(tx){return {...tx,Fee:'12',Sequence:acctSeq++,LastLedgerSequence:seq+20,Flags:tx.Flags||0};}
 };
 function incoming({date,drops,memo,source=V.POLLUX_SOURCE,destination=treasury}){
  seq++;
  const hash=seq.toString(16).padStart(64,'0').toUpperCase();
  history.push({hash,ledger_index:seq,validated:true,tx_json:{TransactionType:'Payment',Account:source,Destination:destination,date:date/1000-946684800,
   Memos:[{Memo:{MemoData:Buffer.from(JSON.stringify(memo)).toString('hex')}}]},meta:{TransactionResult:'tesSUCCESS',delivered_amount:drops}});
 }
 return {client,bal,paid,submits,pools,pool,incoming,lines,lineCalls,setClose:ms=>{closeTime=ms/1000-946684800;seq++;}};
}
function setup({env={},t0=Date.UTC(2026,10,16,2,0),ledger={}}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL);
 CREATE TABLE estate_capital_allocations(purchase_tx TEXT PRIMARY KEY,property_id TEXT NOT NULL UNIQUE,buyer TEXT NOT NULL,purchase_drops TEXT NOT NULL,img_plx_drops TEXT NOT NULL,img_xrp_drops TEXT NOT NULL,policy_version INTEGER NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,img_rlusd_drops TEXT NOT NULL DEFAULT '0',operating_reserve_drops TEXT NOT NULL DEFAULT '0');
 CREATE TABLE estate_img_hourly_batches(epoch_start_ms INTEGER PRIMARY KEY,total_units TEXT NOT NULL,receipt_count INTEGER,allocation_count INTEGER,digest TEXT,created_at_ms INTEGER);
 CREATE TABLE estate_img_hourly_entitlements(epoch_start_ms INTEGER NOT NULL,owner TEXT NOT NULL,amount_units TEXT NOT NULL,PRIMARY KEY(epoch_start_ms,owner));`);
 const L=makeLedger(ledger);
 const cfg={...P.monthlyConfig({ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL}),poolAccount:P.IMG_RLUSD_POOL};
 let t=t0;const v4=V.v4Config(env);
 const ex=createEstateMonthlyExecutor({db,client:L.client,wallet:()=>wallet,treasury,cfg,enabled:true,paused:()=>false,
  xrpRlusdAsset:RL,xrpImgAsset:IMG,now:()=>t,pollMs:0,pollTries:3,log:()=>{},v4});
 const sell=(tx,prop,acct,drops,at)=>{db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run(prop,acct,tx,drops,{75000000:25,3000000:1}[drops]||1,at);
  const res=BigInt(drops)/100n;db.prepare("INSERT INTO estate_capital_allocations VALUES(?,?,?,?,'0','0',3,'awaiting_liquidity_execution',?,?,?)").run(tx,prop,acct,String(drops),at,(BigInt(drops)-res).toString(),res.toString());};
 return {db,L,ex,sell,setNow:ms=>{t=ms;}};
}
const ON={ESTATE_POLICY_V4_ENABLED:'1',ESTATE_IMG_PLX_POOL_ACCOUNT:V.IMG_PLX_POOL,ESTATE_POLLUX_PAYOUTS_ENABLED:'1'};
const H='F'.repeat(64),OLD='E'.repeat(64),TR='D'.repeat(64);

(async()=>{
 // Config + pure split
 const c0=V.v4Config({});assert.equal(c0.enabled,false);assert.equal(c0.plxBps,9000);assert.equal(c0.xrpBps,500);assert.equal(c0.rlusdBps,500);assert.equal(c0.burnBps,322);assert.equal(c0.polluxPayoutsEnabled,false);
 assert.throws(()=>V.v4Config({ESTATE_V4_PLX_BPS:'8000'}),/invalid_v4_setting/);
 assert.deepEqual(V.splitV4('74250000',c0,100000),{plxDrops:'66825000',xrpDrops:'3712500',rlusdDrops:'3712500',folded:[]});
 assert.deepEqual(V.splitV4('2970000',c0,100000),{plxDrops:'2970000',xrpDrops:'0',rlusdDrops:'0',folded:['img-xrp','img-rlusd']},'tiny legs fold into IMG/PLX');
 const sp=V.splitPolluxHour({entitlements:[{owner:A,amount_units:'100000'},{owner:B,amount_units:'2500000'}],burnBps:322});
 assert.equal(sp.totalUnits,2600000n);assert.equal(sp.payouts[0].units,96780n);assert.equal(sp.payouts[1].units,2419500n);assert.equal(sp.burnUnits,83720n);

 // Guard: no withdrawals (auto-compound), two-sided only, no AMM/unknown destinations
 const ctx={treasury,imgIssuer:P.IMG_ISSUER,imgCurrency:'IMG',plxIssuer:V.PLX_ISSUER,rlusdPool:P.IMG_RLUSD_POOL};
 assert.throws(()=>V.assertSafeV4Transaction({Account:treasury,TransactionType:'AMMWithdraw',Asset:IMG,Asset2:PLX,Flags:0x00010000},ctx),/type_not_allowed/);
 assert.throws(()=>V.assertSafeV4Transaction({Account:treasury,TransactionType:'AMMDeposit',Asset:IMG,Asset2:PLX,Amount:{...IMG,value:'1'},Flags:0x00080000},ctx),/two_sided_only/);
 assert.throws(()=>V.assertSafeV4Transaction({Account:treasury,TransactionType:'Payment',Destination:V.IMG_PLX_POOL,Amount:{...IMG,value:'1'}},ctx),/payment_to_amm_forbidden/);
 assert.throws(()=>V.assertSafeV4Transaction({Account:treasury,TransactionType:'Payment',Destination:C,Amount:{...IMG,value:'1'}},ctx),/destination_not_allowed/);
 assert.throws(()=>V.assertSafeV4Transaction({Account:treasury,TransactionType:'Payment',Destination:treasury,Amount:{...PLX,value:'1'},SendMax:'10',Flags:0x00020000},ctx),/partial_payment_forbidden/);
 assert(V.assertSafeV4Transaction({Account:treasury,TransactionType:'AMMDeposit',Asset:IMG,Asset2:{currency:'XRP'},Amount:{...IMG,value:'1'},Amount2:'1000',Flags:0x00100000},ctx));

 // OFF by default: a new purchase is a plain v3 IMG/RLUSD deposit; nothing v4 runs.
 let s=setup();s.sell(H,'starter-09',B,75000000,Date.UTC(2026,10,16,3));
 s.ex.syncPurchases();
 assert.equal(s.db.prepare("SELECT xrp_drops FROM estate_mp_deposits WHERE source=?").get(H).xrp_drops,'74250000');
 assert.equal((await s.ex.processV4Deposits()).error,'policy_v4_disabled');
 assert.equal((await s.ex.runPolluxPayouts()).error,'pollux_payouts_disabled');

 // ON: purchases before the v4 start stay v3; new ones split 90/5/5 and are ledgered.
 s=setup({env:ON});
 s.sell(OLD,'trailer-03',C,3000000,Date.UTC(2026,10,15));
 s.ex.syncPurchases(); // starts v4 at t0
 s.sell(H,'starter-09',B,75000000,Date.UTC(2026,10,16,3));s.sell(TR,'trailer-04',A,3000000,Date.UTC(2026,10,16,3));
 s.setNow(Date.UTC(2026,10,16,3,1));s.ex.syncPurchases();s.ex.syncPurchases();
 assert.equal(s.db.prepare('SELECT xrp_drops FROM estate_mp_deposits WHERE source=?').get(OLD).xrp_drops,'2970000','pre-v4 purchase unchanged');
 const split=s.db.prepare('SELECT * FROM estate_v4_splits WHERE purchase_tx=?').get(H);
 assert.equal(split.plx_drops,'66825000');assert.equal(split.xrp_drops,'3712500');assert.equal(split.rlusd_drops,'3712500');
 assert.equal(s.db.prepare('SELECT xrp_drops FROM estate_mp_deposits WHERE source=?').get(H).xrp_drops,'3712500','5% through the IMG/RLUSD queue');
 assert.equal(JSON.parse(s.db.prepare('SELECT folded_json FROM estate_v4_splits WHERE purchase_tx=?').get(TR).folded_json).length,2);
 assert(!s.db.prepare('SELECT 1 FROM estate_mp_deposits WHERE source=?').get(TR),'folded trailer has no RLUSD leg');
 assert.equal(s.db.prepare('SELECT COUNT(*) n FROM estate_v4_deposits').get().n,3);

 // Guard reserve: the queued v4 XRP stays protected; spent XRP leaves the reserve.
 assert.equal(V.v4SpentXrpDrops(s.db),0n);

 // Deposits: run until all v4 rows are deposited (8 XRP chunks, impact-capped).
 // Arbitrage between runs keeps the small IMG/PLX pool at the XRP-market reference (as on mainnet).
 const arb=()=>{const pp=s.L.pool(IMG,PLX),xi=s.L.pool(IMG,{currency:'XRP'}),xp=s.L.pool(PLX,{currency:'XRP'});
  const ref=(xp.r['PLX.'+V.PLX_ISSUER]/xp.r.XRP)/(xi.r['IMG.'+P.IMG_ISSUER]/xi.r.XRP);pp.r['PLX.'+V.PLX_ISSUER]=pp.r['IMG.'+P.IMG_ISSUER]*ref;};
 for(let i=0;i<40&&s.ex.v4QueuedCount();i++){arb();const r=await s.ex.processV4Deposits();assert.equal(r.ok,true,JSON.stringify(r));for(const x of r.results)assert(!x.held,'held '+x.held);}
 assert.equal(s.ex.v4QueuedCount(),0);
 const plxRow=s.db.prepare("SELECT * FROM estate_v4_deposits WHERE purchase_tx=? AND pair='img-plx'").get(H);
 assert(new N(plxRow.lp_out).gt(0)&&new N(plxRow.img_in).gt(0)&&new N(plxRow.counter_in).gt(0));
 const xrpRow=s.db.prepare("SELECT * FROM estate_v4_deposits WHERE purchase_tx=? AND pair='img-xrp'").get(H);
 assert(new N(xrpRow.lp_out).gt(0)&&new N(xrpRow.counter_in).gt(0));
 assert(BigInt(xrpRow.held_xrp_drops)<200000n,'XRP half went into the IMG/XRP pool');
 assert(s.L.submits.every(x=>x.type!=='AMMWithdraw'),'v4 never withdraws (auto-compound)');
 assert(s.L.submits.filter(x=>x.type==='AMMDeposit').every(x=>x.tx.Flags===P.TF.twoAsset));
 assert(V.v4SpentXrpDrops(s.db)>69000000n,'spent XRP is no longer counted as protected cash');
 const arbRl=()=>{const pr=s.L.pool(IMG,RL),xi=s.L.pool(IMG,{currency:'XRP'}),xr=s.L.pool(RL,{currency:'XRP'});
  const ref=(xr.r[RL.currency+'.'+RL.issuer]/xr.r.XRP)/(xi.r['IMG.'+P.IMG_ISSUER]/xi.r.XRP);pr.r[RL.currency+'.'+RL.issuer]=pr.r['IMG.'+P.IMG_ISSUER]*ref;};
 for(let i=0;i<10&&s.ex.queuedCount();i++){arbRl();const r3=await s.ex.processDeposits();assert.equal(r3.ok,true);for(const x of r3.results)assert(!x.held,'held '+x.held);}
 assert.equal(s.db.prepare('SELECT state FROM estate_mp_deposits WHERE source=?').get(H).state,'deposited','5% IMG/RLUSD deposited');
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE 'v4:%'").get().n,s.L.submits.filter(x=>x.tx.Destination!==undefined||x.type==='AMMDeposit').length-s.db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE 'dep:%'").get().n,'every v4 tx journaled (watch.js known hashes)');

 // Pollux hourly IMG: hours before the v4 start are ignored; later hours burn 3.22% and pay.
 s.L.bal['IMG.'+P.IMG_ISSUER]=(s.L.bal['IMG.'+P.IMG_ISSUER]||0)+10;
 const h0=Date.UTC(2026,10,16,1),h1=Date.UTC(2026,10,16,4),h2=Date.UTC(2026,10,16,5);
 const batch=(h,rows)=>{s.db.prepare('INSERT INTO estate_img_hourly_batches(epoch_start_ms,total_units) VALUES(?,?)').run(h,String(rows.reduce((n,r)=>n+r[1],0)));for(const [o,u] of rows)s.db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(h,o,String(u));};
 batch(h0,[[B,999999]]);batch(h1,[[B,2500000],[A,100000],[C,10000]]);batch(h2,[[C,50000]]);
 let p=await s.ex.runPolluxPayouts();
 assert.equal(p.hour,h1,'pre-start hour skipped');assert.equal(p.burnUnits,String(2610000n-(2419500n+96780n+9678n)));
 await s.ex.runPolluxBurns();
 assert(!s.L.submits.some(x=>x.tx.Destination===P.IMG_ISSUER),'small burn accrues without holding back owners');
 assert(Math.abs(Number(p.burnUnits)/2610000-0.0322)<1e-4,'3.22% of the hour reserved');
 assert.equal(s.db.prepare('SELECT amount_units FROM estate_px_payouts WHERE acct=?').get(B).amount_units,'2419500');
 assert.equal(s.db.prepare('SELECT units FROM estate_px_carry WHERE acct=?').get(C).units,'9678','under 0.05 IMG carries');
 p=await s.ex.runPolluxPayouts();assert.equal(p.hour,h2);
 assert.equal(s.db.prepare('SELECT amount_units FROM estate_px_payouts WHERE acct=? AND epoch_start_ms=?').get(C,h2).amount_units,String(9678n+48390n),'carry joins the next payout');
 const n=s.L.submits.length;p=await s.ex.runPolluxPayouts();assert.equal(p.state,'not_due');assert.equal(s.L.submits.length,n,'idempotent');
 assert.equal(s.ex.status().policyV4.totals.polluxHours,2);

 // Larger IMG rewards flush pending burn credits once, including the earlier small hours.
 const h3=Date.UTC(2026,10,16,6);
 s.L.bal['IMG.'+P.IMG_ISSUER]+=40;
 batch(h3,[[B,40000000]]);
 await s.ex.runPolluxPayouts();
 await s.ex.runPolluxBurns();
 const burn=s.L.submits.filter(x=>x.tx.Destination===P.IMG_ISSUER);
 assert.equal(burn.length,1);
 assert.equal(burn[0].tx.Amount.value,'1.373652');
 await s.ex.runPolluxBurns();
 assert.equal(s.L.submits.filter(x=>x.tx.Destination===P.IMG_ISSUER).length,1);

 // Mainnet memo shape, validated delivery, historical owner after a resale, dust, and XRP settlement.
 s=setup({env:ON});s.ex.syncPurchases();
 const arrival=Date.UTC(2026,10,16,4,7);
 s.sell(H,'trailer-01',B,3000000,arrival-1000);
 s.db.exec('CREATE TABLE estate_ownership_history(id INTEGER PRIMARY KEY,property_id TEXT,from_acct TEXT,to_acct TEXT,kind TEXT,at INTEGER)');
 s.db.prepare("INSERT INTO estate_ownership_history VALUES(1,?,?,?,'resale',?)").run('trailer-01',A,B,arrival+1000);
 const memo={payoutType:'lp_floor',rewardAsset:'XRP',floorToken:'IMG',floorKey:'IMG:'+P.IMG_ISSUER,pools:['PLX/IMG'],roundId:'PLX-FLOOR-2026-11-16T04:00Z',fallback:'thin_inventory'};
 s.L.incoming({date:arrival-7200000-600000,drops:'3000',memo});
 s.L.incoming({date:arrival,drops:'46',memo});
 s.L.incoming({date:arrival+1000,drops:'182',memo:{payoutType:'base',token:'XRP'}});
 s.L.incoming({date:arrival+1000,drops:'900',memo:{...memo,pools:['PLX/IMG','PLX/RLUSD']}});
 await s.ex.runPolluxXrp();
 assert.equal(s.ex.polluxRewards(A).xrp.pendingDrops,'45','receipt uses seller at the time of earning');
 assert.equal(s.ex.polluxRewards(B).xrp.pendingDrops,'0');
 assert.equal(s.L.submits.length,0);
 s.L.incoming({date:arrival+3600000,drops:'320000',memo});
 const autofill=s.L.client.autofill;
 s.L.client.autofill=()=>{throw Error('old payout autofill path unavailable');};
 await s.ex.runPolluxXrp();
 s.L.client.autofill=autofill;
 assert.equal(s.ex.polluxRewards(B).xrp.pendingDrops,'0');
 assert.equal(s.ex.polluxRewards(B).xrp.payments[0].amount_drops,309684);
 assert.equal(s.ex.polluxRewards(B).xrp.payments[0].fee_drops,12);
 assert.equal(s.L.paid[B],309684);
 await s.ex.runPolluxBurns();
 assert.equal(s.L.submits.filter(x=>x.tx.Destination===P.IMG_ISSUER).length,1,'only the XRP burn reserve is converted and retired');
 await s.ex.runPolluxXrp();
 await s.ex.runPolluxBurns();
 assert.equal(s.L.submits.length,3,'one XRP payout, one burn conversion and one IMG burn');

 // tec (no IMG trust line) carries forward.
 s=setup({env:ON,ledger:{noTrust:new Set([A])}});s.ex.syncPurchases();s.L.bal['IMG.'+P.IMG_ISSUER]=5;
 s.db.prepare('INSERT INTO estate_img_hourly_batches(epoch_start_ms,total_units) VALUES(?,?)').run(Date.UTC(2026,10,16,6),'1000000');
 s.db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(Date.UTC(2026,10,16,6),A,'1000000');
 p=await s.ex.runPolluxPayouts();assert.equal(p.state,'paid');
 assert.equal(s.db.prepare('SELECT state FROM estate_px_payouts WHERE acct=?').get(A).state,'carried');
 assert.equal(s.db.prepare('SELECT units FROM estate_px_carry WHERE acct=?').get(A).units,'967800');

 // IMG mode (ESTATE_POLLUX_PAYOUT_ASSET=img) + PLX holder 'base' rewards: every hour the closed XRP credits
 // are converted in one capped swap and paid in IMG; small holders carry; 3.22% of the IMG is held until the burn threshold.
 const X=require('./estate-pollux-xrp');
 {
  const c=V.v4Config({});assert.equal(c.polluxPayoutAsset,'native');assert.equal(c.polluxIncludeHolderBase,false);assert.equal(c.polluxBatchHours,0);assert.equal(c.polluxMinPayoutDrops,1000);
  const ci=V.v4Config({ESTATE_POLLUX_PAYOUT_ASSET:'img'});assert.equal(ci.polluxBatchHours,1);assert.equal(ci.polluxMinPayoutDrops,250);assert.equal(ci.polluxMinSwapDrops,250);assert.equal(ci.polluxBurnMinImgUnits,'1000000');
  assert.equal(V.v4Config({ESTATE_POLLUX_BURN_MIN_IMG:'2.5'}).polluxBurnMinImgUnits,'2500000');
  assert.throws(()=>V.v4Config({ESTATE_POLLUX_BURN_MIN_IMG:'0'}),/invalid_v4_setting/);
  assert.throws(()=>V.v4Config({ESTATE_POLLUX_PAYOUT_ASSET:'plx'}),/invalid_v4_setting/);
  assert.throws(()=>V.v4Config({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'5'}),/invalid_v4_setting/);
  const enc=m=>({Memos:[{Memo:{MemoData:Buffer.from(JSON.stringify(m)).toString('hex')}}]});
  const base={payoutType:'base',token:'XRP',roundId:'PLX-HOLDER-2026-11-16T04:00Z',rate:'1.94%'};
  assert.equal(X.polluxRewardKind(enc(base),V.IMG_PLX_POOL,'XRP'),null,'base ignored unless opted in');
  assert.equal(X.polluxRewardKind(enc(base),V.IMG_PLX_POOL,'XRP',{includeBase:true}),'base');
  assert.equal(X.polluxRewardKind(enc({...base,roundId:'x'}),V.IMG_PLX_POOL,'XRP',{includeBase:true}),null);
  assert.equal(X.polluxRewardKind(enc({...base,poolAccount:'rX'}),V.IMG_PLX_POOL,'XRP',{includeBase:true}),null);
 }
 const HR=3600000,floorMemo=h=>({payoutType:'lp_floor',rewardAsset:'XRP',floorToken:'IMG',floorKey:'IMG:'+P.IMG_ISSUER,pools:['PLX/IMG'],roundId:'PLX-FLOOR-'+new Date(h).toISOString().slice(0,13)+':00Z',fallback:'thin_inventory'});
 const baseMemo=h=>({payoutType:'base',token:'XRP',roundId:'PLX-HOLDER-'+new Date(h).toISOString().slice(0,13)+':00Z'});
 function imgSetup(env,noTrust=new Set()){
  const s=setup({env:{...ON,ESTATE_POLLUX_PAYOUT_ASSET:'img',...env},ledger:{noTrust}});s.ex.syncPurchases();
  const t0=Date.UTC(2026,10,16,4,0);s.setNow(t0);
  s.sell('1'.repeat(64),'trailer-01',B,3000000,t0-60000);s.sell('2'.repeat(64),'starter-04',A,75000000,t0-60000);
  s.db.exec('CREATE TABLE estate_ownership_history(id INTEGER PRIMARY KEY,property_id TEXT,from_acct TEXT,to_acct TEXT,kind TEXT,at INTEGER)');
  // Pollux pays at :07; the estate service wakes at least every 15 minutes.
  const hour=async(h,{lp='600',base='2400'}={})=>{
   const at=t0+h*HR;if(lp)s.L.incoming({date:at+7*60000,drops:lp,memo:floorMemo(at)});if(base)s.L.incoming({date:at+7*60000+30000,drops:base,memo:baseMemo(at)});
   s.setNow(at+HR+10*60000);s.L.setClose(at+HR+10*60000);await s.ex.runPolluxXrp();await s.ex.runPolluxBurns();
  };
  return {...s,t0,hour,noTrust};
 }
 {
  const s=imgSetup({ESTATE_POLLUX_INCLUDE_HOLDER_BASE:'1'});
  const imgPaid=acct=>s.L.submits.filter(x=>x.tx.Destination===acct&&typeof x.tx.Amount==='object'&&x.result==='tesSUCCESS').length;
  const burns=()=>s.L.submits.filter(x=>x.tx.Destination===P.IMG_ISSUER);
  await s.hour(0);
  let st=s.ex.polluxRewards();
  assert.deepEqual(st.receivedByKind,{lp:'600',base:'2400'});assert.equal(st.payoutAsset,'img');assert.equal(st.batchHours,1);
  const swap=s.L.submits.filter(x=>x.tx.Destination===treasury);
  assert.equal(swap.length,1,'one XRP->IMG swap for the hour');assert.equal(swap[0].tx.Flags&0x00020000,0);assert.equal(swap[0].tx.Paths,undefined);
  // 3000 drops: 96 reserved for the burn (3.22%); A (25 units) ~2785, B (1 unit) ~111 < 250 -> B carries.
  assert.equal(Number(swap[0].tx.SendMax),3000-96-111-15+96);
  assert.equal(imgPaid(A),1);assert.equal(imgPaid(B),0,'trailer below the minimum carries forward');
  assert.equal(s.ex.polluxRewards(B).xrp.pendingDrops,'111');
  assert.equal(burns().length,0,'burn share is held, not sent');
  const held1=BigInt(s.ex.status().policyV4.polluxBurnHeld.imgUnits);assert(held1>0n);
  assert.equal(s.ex.status().policyV4.polluxBurnHeld.thresholdImg,'1.000000');
  assert.equal(s.ex.status().policyV4.polluxBurnHeld.xrpDropsAwaitingConversion,'0');
  // Same hour again: nothing new (idempotent, one batch per hour).
  let n=s.L.submits.length;await s.ex.runPolluxXrp();await s.ex.runPolluxBurns();assert.equal(s.L.submits.length,n);
  // Hours 1..2: A is paid every hour; B reaches the minimum on hour 2 (3 x ~111 >= 250).
  await s.hour(1);assert.equal(imgPaid(A),2);assert.equal(imgPaid(B),0);
  await s.hour(2);assert.equal(imgPaid(A),3);assert.equal(imgPaid(B),1,'trailer paid once its carry is worth a payment');
  assert.equal(s.ex.polluxRewards(B).xrp.pendingDrops,'0');
  assert.equal(s.L.submits.filter(x=>typeof x.tx.Amount==='string'&&x.tx.Destination!==treasury).length,0,'no native XRP payouts in IMG mode');
  // The held burn grows every hour and is sent to the issuer once (only) after it crosses 1 IMG.
  let h=3;while(!burns().length&&h<40){const before=BigInt(s.ex.status().policyV4.polluxBurnHeld.imgUnits);await s.hour(h++);
   if(!burns().length)assert(BigInt(s.ex.status().policyV4.polluxBurnHeld.imgUnits)>before,'burn accrues hourly while held');}
  assert.equal(burns().length,1);assert(Number(burns()[0].tx.Amount.value)>=1,'burned only at/after the threshold');
  assert(BigInt(s.ex.status().policyV4.polluxBurnHeld.imgUnits)<1000000n);
  assert.equal(s.ex.status().policyV4.totals.polluxImgBurned,burns()[0].tx.Amount.value.padEnd(8,'0'));
  assert.equal(imgPaid(A),h,'A paid every hour');
  assert.equal(X.xrpRewardReserve(s.db),BigInt(s.ex.polluxRewards(B).xrp.pendingDrops)+BigInt(s.ex.polluxRewards(A).xrp.pendingDrops),'reserve = unconverted owner credit');
  // Hours with no rewards: nothing happens.
  n=s.L.submits.length;await s.hour(h,{lp:null,base:null});assert.equal(s.L.submits.length,n);
 }
 // No IMG trust line (ESTATE_POLLUX_NO_TRUSTLINE_XRP, default on): checked on validated account_lines before the
// swap; such owners are paid their closed XRP credit natively, never also swapped; the burn reservation is unchanged.
const xrpTo=(s,acct)=>s.L.submits.filter(x=>x.tx.Destination===acct&&typeof x.tx.Amount==='string'&&x.result==='tesSUCCESS');
const imgTo=(s,acct)=>s.L.submits.filter(x=>x.tx.Destination===acct&&typeof x.tx.Amount==='object'&&x.result==='tesSUCCESS');
const batches=s=>s.db.prepare('SELECT * FROM estate_pollux_img_batches ORDER BY id').all();
const sharesOf=(s,acct)=>s.db.prepare('SELECT * FROM estate_pollux_img_shares WHERE owner=? ORDER BY batch_id').all(acct);
{
 // Mixed owners in one batch: A (line) -> IMG, B (no line) -> native XRP; nothing double-paid or double-counted.
 const s=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100'});
 assert.equal(V.v4Config({}).polluxNoTrustlineXrp,true,'fallback defaults on');
 s.noTrust.add(B);await s.hour(0,{lp:'6000',base:null});
 assert.deepEqual([...new Set(s.L.lineCalls)].sort(),[A,B].sort(),'every ready owner checked on validated account_lines');
 assert.equal(imgTo(s,A).length,1);assert.equal(imgTo(s,B).length,0);
 assert.equal(xrpTo(s,B).length,1,'B paid in XRP');assert.equal(xrpTo(s,A).length,0);
 assert.equal(sharesOf(s,B).length,0,'B never enters the swap');
 const pay=s.db.prepare('SELECT * FROM estate_pollux_xrp_payments WHERE owner=?').all(B);
 assert.equal(pay.length,1);assert.equal(pay[0].state,'paid');assert.equal(Number(xrpTo(s,B)[0].tx.Amount),pay[0].amount_drops);
 const earnedB=s.db.prepare('SELECT SUM(drops) d FROM estate_pollux_xrp_allocations WHERE owner=?').get(B).d;
 assert.equal(pay[0].gross_drops,earnedB,'whole closed credit paid');assert.equal(s.ex.polluxRewards(B).xrp.pendingDrops,'0');
 const b0=batches(s);assert.equal(b0.length,1);
 assert.equal(b0[0].burn_drops,String(6000*322/10000|0),'3.22% burn reservation rides the swap unchanged');
 assert.equal(Number(b0[0].convert_drops),Number(s.db.prepare("SELECT convert_drops c FROM estate_pollux_img_shares WHERE owner=?").get(A).c)+Number(b0[0].burn_drops),'swap = A + burn only');
 assert.equal(X.xrpRewardReserve(s.db),BigInt(s.ex.polluxRewards(A).xrp.pendingDrops),'XRP-paid credit counted as spent');
 // Same hour again: idempotent, nothing new.
 const n=s.L.submits.length;await s.ex.runPolluxXrp();await s.ex.runPolluxXrp();assert.equal(s.L.submits.length,n,'no duplicate payment');
 // Next hours: exactly one XRP payment per hour for B; one IMG payment per hour for A.
 await s.hour(1,{lp:'6000',base:null});await s.hour(2,{lp:'6000',base:null});
 assert.equal(xrpTo(s,B).length,3);assert.equal(imgTo(s,A).length,3);assert.equal(sharesOf(s,B).length,0);
 const spent=s.db.prepare('SELECT SUM(spent_drops) d FROM estate_pollux_xrp_payments WHERE owner=?').get(B).d;
 assert.equal(spent,s.db.prepare('SELECT SUM(drops) d FROM estate_pollux_xrp_allocations WHERE owner=?').get(B).d,'paid + fees = earned, exactly once');
 // Flag off reproduces the old behaviour and the identical burn reservation.
 const o=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100',ESTATE_POLLUX_NO_TRUSTLINE_XRP:'0'});
 o.noTrust.add(B);await o.hour(0,{lp:'6000',base:null});
 assert.equal(o.L.lineCalls.length,0,'flag off: no trust-line check');assert.equal(xrpTo(o,B).length,0);
 assert.equal(sharesOf(o,B)[0].state,'held','flag off: tec -> held (old behaviour)');
 assert.equal(batches(o)[0].burn_drops,b0[0].burn_drops,'burn identical with the flag on or off');
}
{
 // Trust-line check failures are fail-safe: the owner is skipped (no XRP, no swap share), credit intact, retried later.
 const s=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100'});
 s.noTrust.add(B);s.L.lines.err.add(B);await s.hour(0,{lp:'6000',base:null});
 assert.equal(xrpTo(s,B).length,0);assert.equal(sharesOf(s,B).length,0);assert.equal(imgTo(s,A).length,1,'others still paid');
 const pend=BigInt(s.ex.polluxRewards(B).xrp.pendingDrops);assert(pend>=100n,'credit untouched');
 s.L.lines.err.clear();await s.hour(1,{lp:'6000',base:null});
 assert.equal(xrpTo(s,B).length,1,'retried next hour, once');
 assert.equal(BigInt(xrpTo(s,B)[0].tx.Amount)+BigInt(s.db.prepare('SELECT fee_drops f FROM estate_pollux_xrp_payments WHERE owner=?').get(B).f),
  BigInt(s.db.prepare('SELECT SUM(drops) d FROM estate_pollux_xrp_allocations WHERE owner=?').get(B).d),'both hours paid together, never twice');
 // An unvalidated answer is not trusted either.
 const u=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100'});
 const req=u.L.client.request.bind(u.L.client);u.L.client.request=async q=>q.command==='account_lines'&&q.account===B?{result:{account:B,lines:[]}}:req(q);
 u.noTrust.add(B);await u.hour(0,{lp:'6000',base:null});
 assert.equal(xrpTo(u,B).length,0);assert.equal(sharesOf(u,B).length,0);
 // A line too small for the expected IMG is treated as missing.
 const t=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100'});t.L.lines.limit.set(B,'0.000001');
 await t.hour(0,{lp:'6000',base:null});
 assert.equal(xrpTo(t,B).length,1);assert.equal(sharesOf(t,B).length,0);assert.equal(imgTo(t,A).length,1);
}
{
 // Crash after the XRP payment was submitted (network error on submit): the journaled row is resumed with the
 // same signed tx on the next pass; never a second row or a second payment.
 const s=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100'});s.noTrust.add(B);
 const req=s.L.client.request.bind(s.L.client);let cut=false;
 s.L.client.request=async q=>{const r=await req(q);if(q.command==='submit'&&!cut){const tx=xrpl.decode(q.tx_blob);if(tx.Destination===B&&typeof tx.Amount==='string'){cut=true;throw Error('socket hang up');}}return r;};
 await assert.rejects(s.hour(0,{lp:'6000',base:null}));
 assert.equal(s.db.prepare("SELECT COUNT(*) n FROM estate_pollux_xrp_payments WHERE owner=? AND state='pending'").get(B).n,1);
 await s.ex.runPolluxXrp();await s.ex.runPolluxXrp();
 assert.equal(s.L.submits.filter(x=>x.tx.Destination===B).length,1,'submitted exactly once');
 const rows=s.db.prepare('SELECT * FROM estate_pollux_xrp_payments WHERE owner=?').all(B);assert.equal(rows.length,1);assert.equal(rows[0].state,'paid');
 assert.equal(imgTo(s,A).length,1,'A still paid IMG once');
}
{
 // Line removed between the check and the payment: tec -> held (old behaviour). Next hour the check routes the
 // new credit to XRP while the held IMG stays held (never converted back); once a line is added it is paid in IMG.
 const s=imgSetup({ESTATE_POLLUX_MIN_PAYOUT_DROPS:'100'});
 s.noTrust.add(B);s.L.lines.stale.add(B);await s.hour(0,{lp:'6000',base:null});
 const held=s.ex.polluxRewards(B).xrp.imgPayments[0];assert.equal(held.state,'held');assert(held.img_units>0);
 assert.equal(s.ex.polluxRewards(A).xrp.imgPayments[0].state,'paid');assert.equal(xrpTo(s,B).length,0);
 s.L.lines.stale.delete(B);await s.hour(1,{lp:'6000',base:null});
 assert.equal(xrpTo(s,B).length,1,'new credit paid in XRP');
 const hs=sharesOf(s,B);assert.equal(hs.length,1);assert.equal(hs[0].state,'held','held IMG preserved, not rolled or converted');
 const p1=s.db.prepare('SELECT gross_drops g FROM estate_pollux_xrp_payments WHERE owner=?').get(B).g;
 assert(p1<hs[0].gross_drops*2,'XRP covers only the new hour, not the held IMG');
 s.noTrust.delete(B);await s.hour(2,{lp:'6000',base:null});
 const again=s.ex.polluxRewards(B).xrp.imgPayments[0];assert.equal(again.state,'paid');assert(again.img_units>held.img_units,'held IMG carried into the IMG payment');
 assert.equal(s.ex.polluxRewards(B).xrp.imgPayments.filter(p=>p.state==='held').length,0);assert.equal(xrpTo(s,B).length,1);
}
// tec on the conversion (pool moved): batch failed, credit and burn share released, retried next hour. Base ignored by default.
 {
  const s=imgSetup({});
  const sub=s.L.client.request.bind(s.L.client);let moved=false;
  s.L.client.request=async q=>{if(q.command==='submit'&&!moved){moved=true;s.L.pool(IMG,{currency:'XRP'}).r['IMG.'+P.IMG_ISSUER]*=0.9;}return sub(q);};
  await s.hour(0,{lp:'50000',base:'150000'});
  assert.deepEqual(s.ex.polluxRewards().receivedByKind,{lp:'50000'},'base ignored by default');
  assert.equal(s.ex.polluxRewards().imgBatches.failed.count,1);
  assert.equal(s.ex.status().policyV4.polluxBurnHeld.xrpDropsAwaitingConversion,'1610','failed batch releases the burn share');
  await s.hour(1,{lp:null,base:null});
  assert.equal(s.ex.polluxRewards().imgBatches.paid.count,1);assert.equal(s.ex.polluxRewards(A).xrp.pendingDrops,'0');
  assert.equal(s.ex.status().policyV4.polluxBurnHeld.xrpDropsAwaitingConversion,'0');
 }
 // Service: off by default; when on, the fee harvest is skipped and v4 steps run.
 const pay={ledger:async()=>({request:async()=>({}),autofill:async q=>q})};
 const live={NETWORK:'mainnet',DRY_RUN:false,ESTATE_TREASURY:treasury,TREASURY_SEED:wallet.seed};
 const calls=[];const stub={processDeposits:async()=>{calls.push('dep');return {ok:true}},runMonthly:async()=>{calls.push('monthly');return {}},
  processV4Deposits:async()=>{calls.push('v4');return {}},runPolluxPayouts:async()=>{calls.push('pollux');return {}},queuedCount:()=>0,v4QueuedCount:()=>0,syncPurchases:()=>0,status:()=>({})};
 let svc=createEstateMonthlyService({db:s.db,pay,config:live,guard:{paused:()=>false,log:()=>{}},env:{ESTATE_MONTHLY_PLAN_ENABLED:'1',ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL},executor:stub});
 assert.deepEqual(svc.status().policyV4Blockers,['policy_v4_switch_off']);
 await svc.tick({monthly:true});assert.deepEqual(calls,['dep','monthly']);
 calls.length=0;
 svc=createEstateMonthlyService({db:s.db,pay,config:live,guard:{paused:()=>false,log:()=>{}},env:{ESTATE_MONTHLY_PLAN_ENABLED:'1',ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL,ESTATE_POLICY_V4_ENABLED:'1'},executor:stub});
 assert(svc.status().policyV4Blockers.includes('img_plx_pool_account_not_set'));
 svc=createEstateMonthlyService({db:s.db,pay,config:live,guard:{paused:()=>false,log:()=>{}},env:{ESTATE_MONTHLY_PLAN_ENABLED:'1',ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL,...ON},executor:stub});
 assert.deepEqual(svc.status().policyV4Blockers,[]);
 await svc.tick({monthly:true});assert.deepEqual(calls,['dep','v4','pollux'],'fee harvest skipped: auto-compound');
 // Upgrade payouts (ESTATE_UPGRADE_PAYOUTS_ENABLED): settled upgrade XRP routes like a new purchase (1% reserve, 90/5/5), once.
 {
  const prevUp=process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED;process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED='';
  const u=setup({env:ON});u.sell(H,'starter-05',B,75000000,Date.UTC(2026,10,16,3));
  require('./estate-tycoon').createEstateTycoonStore(u.db);
  const UTX='A'.repeat(64),at=Date.UTC(2026,10,16,4);
  u.db.prepare("INSERT INTO estate_tycoon_orders(order_id,property_id,buyer,item_id,price_drops,share_delta,before_upgrade_drops,created_at,expires_at,status,payment_tx,ledger_index,settled_at) VALUES(?,?,?,?,?,?,0,?,?,'settled',?,9,?)")
   .run('tycoon_'+'9'.repeat(40),'starter-05',B,'bunker-arcade',36000000,12,at,at+1,UTX,at);
  u.setNow(at+60000);u.ex.syncPurchases();
  assert(!u.db.prepare('SELECT 1 FROM estate_v4_splits WHERE purchase_tx=?').get(UTX),'flag off: upgrade XRP stays unallocated');
  const reserveOff=BigInt(require('./estate-liquidity-runtime').estateCashReserve(u.db));
  process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED='1';
  u.ex.syncPurchases();u.ex.syncPurchases();
  const route=u.db.prepare('SELECT * FROM estate_upgrade_payout_routes WHERE payment_tx=?').get(UTX);
  assert.equal(route.principal_drops,'35640000');assert.equal(route.reserve_drops,'360000');assert.equal(route.share_units,12);
  const us=u.db.prepare('SELECT * FROM estate_v4_splits WHERE purchase_tx=?').get(UTX);
  assert.equal(us.plx_drops,'32076000');assert.equal(us.xrp_drops,'1782000');assert.equal(us.rlusd_drops,'1782000');
  assert.equal(u.db.prepare('SELECT COUNT(*) n FROM estate_v4_splits WHERE purchase_tx=?').get(UTX).n,1,'never split twice');
  assert.equal(u.db.prepare("SELECT COUNT(*) n FROM estate_v4_deposits WHERE purchase_tx=?").get(UTX).n,2);
  assert.equal(u.db.prepare('SELECT xrp_drops FROM estate_mp_deposits WHERE source=?').get(UTX).xrp_drops,'1782000');
  assert.equal(BigInt(require('./estate-liquidity-runtime').estateCashReserve(u.db))-reserveOff,35640000n,'upgrade principal is earmarked as estate cash');
  const w=require('./estate-img-ownership-snapshots').createEstateImgOwnershipSnapshots(u.db).at(at+120000);
  assert.equal(w.find(h=>h.propertyId==='starter-05').weight,25+12,'36 XRP of upgrades = 12 more payout shares');
  process.env.ESTATE_UPGRADE_PAYOUTS_ENABLED=prevUp||'';
 }
 console.log('Estates policy v4: off by default, 90/5/5 split with folds, IMG/PLX + IMG/XRP two-sided deposits, no withdrawals, Pollux hourly IMG with 3.22% burn, no-trustline XRP payouts, XRP fallback and burn batching, carry, idempotency, reserve, harvest skipped');
})().catch(e=>{console.error(e);process.exit(1);});
