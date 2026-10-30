'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),xrpl=require('xrpl');
const {N,value,token,drops,balanceDelta,liquidationQuote}=require('./estate-liquidity-ledger');
const {createEstateCapitalAllocation}=require('./estate-capital-allocation');
const {createEstateLiquidityRuntime,estateCashReserve}=require('./estate-liquidity-runtime');
const POOL='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
function fixture(){
 const w=xrpl.Wallet.generate(),treasury=w.classicAddress,imgIssuer=xrpl.Wallet.generate().classicAddress,plxIssuer=xrpl.Wallet.generate().classicAddress,owner=xrpl.Wallet.generate().classicAddress;
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER); CREATE TABLE estate_img_scan_watermarks(id INTEGER PRIMARY KEY,scanned_through_ms INTEGER);`);
 const hour=1700000000000-1700000000000%3600000;let clock=hour,index=100,sequence=0,paused=false,unknown=false,badProof=false;
 const IMG={currency:'IMG',issuer:imgIssuer},PLX={currency:'PLX',issuer:plxIssuer};
 const key=a=>a.currency==='XRP'?'XRP':a.currency+':'+a.issuer;
 const balances=new Map([['XRP',new N('10000000000')],[key(IMG),new N('1000000')],[key(PLX),new N('1000000')]]);
 const xrpPool={a:{currency:'XRP'},b:IMG,x:new N('100000000'),y:new N('1000000'),lp:new N('10000'),account:xrpl.Wallet.generate().classicAddress,currency:'03'+'1'.repeat(38)};
 const plxXrp={a:{currency:'XRP'},b:PLX,x:new N('100000000'),y:new N('1000000'),lp:new N('10000'),account:xrpl.Wallet.generate().classicAddress,currency:'03'+'2'.repeat(38)};
 const plxPool={a:IMG,b:PLX,x:new N('1000000'),y:new N('1000000'),lp:new N('10000'),account:POOL,currency:'03'+'3'.repeat(38)};
 const pools=[xrpPool,plxXrp,plxPool],transactions=new Map(),sent=[];
 const ledgerHash=()=>index.toString(16).padStart(64,'A').toUpperCase();
 const issueValue=(a,n)=>a.currency==='XRP'?drops(n):({...a,value:token(n)});
 function getPool(a,b){const p=pools.find(p=>(key(p.a)===key(a)&&key(p.b)===key(b))||(key(p.a)===key(b)&&key(p.b)===key(a)));assert.ok(p,'fixture pool exists');return p;}
 function poolResult(p){return {validated:true,ledger_hash:ledgerHash(),ledger_index:index,amm:{account:p.account,amount:issueValue(p.a,p.x),amount2:issueValue(p.b,p.y),lp_token:{currency:p.currency,issuer:p.account,value:token(p.lp)},trading_fee:300}};}
 function send(tx,txHash){
  const before=new Map([...balances].map(([k,v])=>[k,new N(v)])),fee=value(tx.Fee);let delivered;
  const add=(a,n)=>balances.set(key(a),(balances.get(key(a))||new N(0)).plus(n));
  if(tx.TransactionType==='Payment'&&tx.Destination===treasury&&typeof tx.SendMax==='string'){
   const issue={currency:tx.Amount.currency,issuer:tx.Amount.issuer},spent=value(tx.SendMax).times('.99').integerValue(N.ROUND_UP);
   add({currency:'XRP'},spent.negated());add(issue,value(tx.Amount.value));delivered=tx.Amount;
   const pool=getPool({currency:'XRP'},issue);pool.x=pool.x.plus(spent);pool.y=pool.y.minus(value(tx.Amount.value));
  }else if(tx.TransactionType==='Payment'&&tx.Destination===treasury){
   const input={currency:tx.SendMax.currency,issuer:tx.SendMax.issuer},spent=value(tx.SendMax.value).times('.99');
   add(input,spent.negated());add({currency:'XRP'},value(tx.Amount));delivered=tx.Amount;
   const pool=getPool({currency:'XRP'},input);pool.x=pool.x.minus(tx.Amount);pool.y=pool.y.plus(spent);
  }else if(tx.TransactionType==='Payment'){
   add({currency:'XRP'},value(tx.Amount).negated());delivered=tx.Amount;
  }else if(tx.TransactionType==='AMMDeposit'){
   const p=getPool(tx.Asset,tx.Asset2),one=typeof tx.Amount==='string'?value(tx.Amount):value(tx.Amount.value),two=typeof tx.Amount2==='string'?value(tx.Amount2):value(tx.Amount2.value),a=key(p.a)===key(tx.Asset)?one:two,b=key(p.b)===key(tx.Asset2)?two:one;
   let ratio=N.minimum(a.div(p.x),b.div(p.y));
   // Real two-sided deposits use proportional amounts. XRP rounds to drops.
   let ax=p.x.times(ratio),by=p.y.times(ratio);if(p.a.currency==='XRP')ax=value(drops(ax));if(p.b.currency==='XRP')by=value(drops(by));
   ratio=N.minimum(ax.div(p.x),by.div(p.y));ax=p.x.times(ratio);by=p.y.times(ratio);
   if(p.a.currency==='XRP')ax=value(drops(ax));if(p.b.currency==='XRP')by=value(drops(by));
   const minted=value(token(p.lp.times(N.minimum(ax.div(p.x),by.div(p.y)))));assert.ok(minted.gte(value(tx.LPTokenOut.value)));
   add(p.a,ax.negated());add(p.b,by.negated());add({currency:p.currency,issuer:p.account},minted);p.x=p.x.plus(ax);p.y=p.y.plus(by);p.lp=p.lp.plus(minted);
  }else if(tx.TransactionType==='AMMWithdraw'){
   const p=getPool(tx.Asset,tx.Asset2),lp=value(tx.LPTokenIn.value),ratio=lp.div(p.lp),x=value(drops(p.x.times(ratio))),y=value(token(p.y.times(ratio)));
   add(p.a,x);add(p.b,y);add({currency:p.currency,issuer:p.account},lp.negated());p.x=p.x.minus(x);p.y=p.y.minus(y);p.lp=p.lp.minus(lp);
  }else throw Error('unexpected_fixture_transaction');
  add({currency:'XRP'},fee.negated());
  const nodes=[];
  for(const [k,after] of balances){const old=before.get(k)||new N(0);if(old.eq(after))continue;
   assert.ok(after.gte(0),'fixture treasury stays funded');
   if(k==='XRP'){nodes.push({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:drops(after)},PreviousFields:{Balance:drops(old)}}});continue;}
   const [currency,issuer]=k.split(':');const final={LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency,value:after.toFixed()}};
   nodes.push(old.isZero()?{CreatedNode:{LedgerEntryType:'RippleState',NewFields:final}}:{ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:final,PreviousFields:{Balance:{currency,value:old.toFixed()}}}});
  }
  index++;sequence++;clock+=4000;
  const result={validated:true,hash:txHash,ledger_index:index,date:clock/1000-946684800,tx_json:tx,meta:{TransactionResult:'tesSUCCESS',AffectedNodes:nodes,...(delivered?{delivered_amount:delivered}:{})}};
  transactions.set(txHash,result);sent.push(tx);
 }
 const client={autofill:async tx=>({...tx,Fee:'12',Sequence:sequence+1,LastLedgerSequence:index+20}),request:async q=>{
  if(q.command==='ledger')return {result:{validated:true,ledger_index:index,ledger_hash:ledgerHash()}};
  if(q.command==='amm_info')return {result:poolResult(getPool(q.asset,q.asset2))};
  if(q.command==='account_info')return {result:{validated:true,ledger_hash:ledgerHash(),account_data:{Account:q.account,Flags:0,TransferRate:1000000000}}};
  if(q.command==='account_lines'){
   const lines=[];for(const [k,n] of balances){if(k==='XRP')continue;const [currency,issuer]=k.split(':');if(issuer===q.peer)lines.push({account:issuer,currency,balance:n.toFixed(),limit:'1000000000000'});}
   return {result:{validated:true,ledger_hash:ledgerHash(),lines}};
  }
  if(q.command==='submit'){const tx=xrpl.decode(q.tx_blob),h=xrpl.hashes.hashSignedTx(q.tx_blob);assert.equal(db.prepare('SELECT state FROM estate_treasury_transactions WHERE tx_hash=?').get(h).state,'submitted','signed blob must be durable before network submission');try{send(tx,h);}catch(e){console.error('Fixture submit failed',e.message,tx.TransactionType);throw e;}if(unknown)throw Error('unknown_outcome');return {result:{engine_result:'tesSUCCESS'}};}
  if(q.command==='tx'){const r=structuredClone(transactions.get(q.transaction));if(badProof)r.meta.AffectedNodes=r.meta.AffectedNodes.filter(n=>(n.ModifiedNode||n.CreatedNode)?.LedgerEntryType!=='RippleState');return {result:r};}
  throw Error('unexpected_fixture_request:'+q.command);
 }};
 const capital=createEstateCapitalAllocation(db);
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',owner,'B'.repeat(64),3000000,1,hour-1000);
 capital.record(db.prepare('SELECT * FROM estate_property_ownership').get());
 const guard={paused:()=>paused,check:async()=>null};
 const options={db,client,wallet:()=>w,treasury,imgIssuer,plxIssuer,guard,fundingEnabled:true,harvestEnabled:false,payoutsEnabled:true,maxNativePayoutDrops:'100000000',maxNativeDailyDrops:'1000000000',now:()=>clock};
 const make=overrides=>createEstateLiquidityRuntime({...options,...overrides});
 return {db,treasury,owner,capital,make,sent,balances,xrpPool,get clock(){return clock;},set clock(v){clock=v;},set paused(v){paused=v;},set unknown(v){unknown=v;},set badProof(v){badProof=v;}};
}
async function until(f,runtime,predicate,limit=50){for(let i=0;i<limit;i++){if(predicate())return;await runtime.tick();}assert.ok(predicate(),JSON.stringify(runtime.status(f.owner))+' '+JSON.stringify(f.db.prepare('SELECT pair,state,note FROM estate_liquidity_jobs').all())+' '+JSON.stringify(f.db.prepare('SELECT id,state,note FROM estate_treasury_transactions').all()));}
(async()=>{
 const f=fixture();let r=f.make();
 assert.equal(estateCashReserve(f.db),'3000000');
 f.paused=true;await r.tick();assert.equal(f.sent.length,0);f.paused=false;
 f.unknown=true;
 await until(f,r,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_liquidity_jobs WHERE state='invested'").get().n===2);
 assert.equal(f.sent.filter(t=>t.TransactionType==='AMMDeposit').length,2);
 assert.equal(f.sent.filter(t=>t.TransactionType==='Payment').length,3);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0,'investment principal creates no rewards');
 const before=f.sent.length;r=f.make();for(let i=0;i<5;i++)await r.tick();assert.equal(f.sent.length,before,'restart does not repeat swaps/deposits');
 assert.ok(BigInt(estateCashReserve(f.db))<3000000n,'only validated actual investment expenses release XRP reserve');
 const positions=f.db.prepare('SELECT * FROM estate_liquidity_jobs').all();
 for(const p of positions){const d=JSON.parse(p.data_json);assert.ok(value(d.lp).gt(0));assert.ok(value(d.basis).gt(0));assert.ok(value(d.residualImg||'0').gte(0));}
 // Price loss is not a reason to manufacture payouts or redeem principal.
 const hour=f.clock-f.clock%3600000;f.clock=hour+3600000;
 f.xrpPool.x=f.xrpPool.x.times('.5');r=f.make({harvestEnabled:true});await r.tick();assert.equal(f.sent.length,before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 // A profitable position is actually withdrawn and converted; only the excess
 // over independently recorded LP basis and transaction costs funds XRP payouts.
 f.clock+=3600000;f.xrpPool.x=f.xrpPool.x.times('5');r=f.make({harvestEnabled:true});
 await until(f,r,()=>f.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_receipts').get().n===1,80);
 const receipt=f.db.prepare('SELECT * FROM estate_xrp_profit_receipts').get();assert.ok(BigInt(receipt.distributable_drops)>0n);
 const earned=f.db.prepare('SELECT * FROM estate_xrp_profit_payouts').all();assert.equal(earned.length,1);assert.equal(earned[0].owner,f.owner);assert.equal(earned[0].amount_drops,receipt.distributable_drops);
 assert.equal(f.sent.filter(t=>t.TransactionType==='Payment'&&t.Destination===f.owner).length,0,'hourly rewards cannot settle before the scanner closes the hour');
 f.db.prepare('INSERT INTO estate_img_scan_watermarks VALUES(1,?)').run(receipt.available_after_ms);
 await until(f,r,()=>f.db.prepare("SELECT COUNT(*) n FROM estate_xrp_profit_payouts WHERE state='confirmed'").get().n===1,80);
 const pays=f.sent.filter(t=>t.TransactionType==='Payment'&&t.Destination===f.owner);assert.equal(pays.length,1);assert.equal(pays[0].Amount,receipt.distributable_drops);
 const after=f.sent.length;r=f.make({harvestEnabled:true});for(let i=0;i<4;i++)await r.tick();assert.equal(f.sent.filter(t=>t.Destination===f.owner).length,1,'restart does not duplicate native XRP payouts');
 // Corrupt or incomplete ledger proof must never release principal reservations.
 const bad=fixture(),br=bad.make();bad.badProof=true;await br.tick();const heldReserve=estateCashReserve(bad.db);for(let i=0;i<4;i++)await br.tick();assert.equal(estateCashReserve(bad.db),heldReserve);assert.equal(bad.sent.length,1);assert.equal(bad.db.prepare('SELECT COUNT(*) n FROM estate_xrp_profit_payouts').get().n,0);
 console.log('Liquidity integration: 70/30 funding, two-sided LP, persisted signing, ambiguous submit, restart, loss/no rewards, realized net XRP, closed hours, direct wallet delivery, reinvestment and corrupt proof passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
