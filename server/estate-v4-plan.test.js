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
 const pools={},bal={XRP:200e6},paid={},submits=[],txs=new Map(),history=[];
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
   if(noTrust.has(tx.Destination))result='tecPATH_DRY';else if(amt>b(k)+1e-9)result='tecUNFUNDED_PAYMENT';
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
    case 'account_lines':{const p=Object.values(pools).find(x=>x.acct===q.peer);return {result:{lines:p?[{currency:p.lpc,balance:String(b(p.lpc+'.'+p.acct))}]:[]}};}
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
 return {client,bal,paid,submits,pools,pool,incoming,setClose:ms=>{closeTime=ms/1000-946684800;seq++;}};
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
 console.log('Estates policy v4: off by default, 90/5/5 split with folds, IMG/PLX + IMG/XRP two-sided deposits, no withdrawals, Pollux hourly IMG with 3.22% burn, XRP fallback and burn batching, carry, idempotency, reserve, harvest skipped');
})().catch(e=>{console.error(e);process.exit(1);});
