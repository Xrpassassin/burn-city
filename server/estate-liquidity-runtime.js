'use strict';
const crypto=require('node:crypto');
const {N,value,token,drops,ceil,sameAmount,balanceDelta,boundedTokenDebit,verifiedTokenCredit,verifiedLpBurn,xrpMovement,inspectPool,buyQuote,liquidationQuote}=require('./estate-liquidity-ledger');
const {createEstateTreasuryTransactions}=require('./estate-treasury-transactions');
const {createEstateImgOwnershipSnapshots}=require('./estate-img-ownership-snapshots');
const {allocateProfit}=require('./estate-economy');
const POOL='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const zero=()=>({cash:'0',img:'0',plx:'0',imgCost:'0',plxCost:'0',fees:'0',lp:'0',basis:'0',generation:0,carryBasis:null});
function integer(s){if(typeof s!=='string'||!/^\d+$/.test(s))throw Error('integer_drops_required');return BigInt(s);}
function reserveExists(db,name){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
// Also used by standalone guarded jobs. Does not create or mutate any schema.
function estateCashReserve(db){
 let n=db.prepare('SELECT purchase_drops FROM estate_capital_allocations').all().reduce((n,r)=>n+integer(r.purchase_drops),0n);
 if(reserveExists(db,'estate_liquidity_jobs'))for(const r of db.prepare('SELECT initial_budget_drops,data_json FROM estate_liquidity_jobs').all()){
  const d=JSON.parse(r.data_json);n-=integer(r.initial_budget_drops);n+=integer(d.cash);
  if(d.harvestXrp)n+=BigInt(N.maximum(0,value(d.harvestXrp).minus(d.harvestFees||'0')).toFixed(0));
 }
 if(reserveExists(db,'estate_xrp_profit_payouts'))for(const r of db.prepare("SELECT amount_drops FROM estate_xrp_profit_payouts WHERE state!='confirmed'").all())n+=integer(r.amount_drops);
 if(n<0n)throw Error('capital_reserve_underflow');return n.toString();
}
function estateGuardReserve(db){
 if(reserveExists(db,'estate_hourly_payouts')&&db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted')").get())throw Error('estate_payment_reconciliation_pending');
 if(reserveExists(db,'estate_treasury_transactions')&&db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state IN ('preparing','submitted','validated','held')").get())throw Error('estate_treasury_reconciliation_pending');
 return estateCashReserve(db);
}
function createEstateLiquidityRuntime({db,client,wallet,treasury,imgIssuer,plxIssuer,guard,imgPlxPoolAccount=POOL,fundingEnabled=false,harvestEnabled=false,payoutsEnabled=false,maxFeeDrops=100,maxNativePayoutDrops='1000000',maxNativeDailyDrops='10000000',slippageBps=300,now=()=>Date.now()}={}){
 if(!Number.isSafeInteger(maxFeeDrops)||maxFeeDrops<1||maxFeeDrops>1000||!Number.isSafeInteger(slippageBps)||slippageBps<0||slippageBps>1000)throw Error('invalid_liquidity_limits');
 if(integer(maxNativePayoutDrops)<1n||integer(maxNativeDailyDrops)<1n)throw Error('invalid_native_profit_limits');
 const XRP={currency:'XRP'},IMG={currency:'IMG',issuer:imgIssuer},PLX={currency:'PLX',issuer:plxIssuer};
 db.exec(`CREATE TABLE IF NOT EXISTS estate_liquidity_jobs(
  id TEXT PRIMARY KEY,purchase_tx TEXT NOT NULL,pair TEXT NOT NULL CHECK(pair IN ('img-plx','img-xrp')),
  initial_budget_drops TEXT NOT NULL,state TEXT NOT NULL,data_json TEXT NOT NULL,note TEXT,last_harvest_hour INTEGER,
  UNIQUE(purchase_tx,pair));
 CREATE TABLE IF NOT EXISTS estate_xrp_profit_receipts(
  source_id TEXT PRIMARY KEY,job_id TEXT NOT NULL,realized_at_ms INTEGER NOT NULL,available_after_ms INTEGER NOT NULL,
  gross_drops TEXT NOT NULL,basis_drops TEXT NOT NULL,cost_drops TEXT NOT NULL,distributable_drops TEXT NOT NULL,loss_carry_drops TEXT NOT NULL DEFAULT '0'
 );
 CREATE TABLE IF NOT EXISTS estate_xrp_realized_loss_carry(id INTEGER PRIMARY KEY CHECK(id=1),drops TEXT NOT NULL);
 INSERT OR IGNORE INTO estate_xrp_realized_loss_carry VALUES(1,'0');
 CREATE TABLE IF NOT EXISTS estate_xrp_profit_payouts(
  id TEXT PRIMARY KEY,source_id TEXT NOT NULL,owner TEXT NOT NULL,amount_drops TEXT NOT NULL,
  available_after_ms INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','confirmed')),tx_hash TEXT,
  UNIQUE(source_id,owner));`);
 if(!db.prepare('PRAGMA table_info(estate_xrp_profit_receipts)').all().some(r=>r.name==='loss_carry_drops'))db.exec("ALTER TABLE estate_xrp_profit_receipts ADD COLUMN loss_carry_drops TEXT NOT NULL DEFAULT '0'");
 const ownership=createEstateImgOwnershipSnapshots(db);
 const executor=createEstateTreasuryTransactions({db,client,wallet,treasury,guard,enabled:fundingEnabled||harvestEnabled||payoutsEnabled,maxFeeDrops,
  purposeEnabled:p=>p==='xrp_profit_payout'?payoutsEnabled:p.startsWith('profit_')?harvestEnabled:fundingEnabled});
 let busy=false,lastBlock=null,lastError=null;
 const jobs=()=>db.prepare('SELECT * FROM estate_liquidity_jobs ORDER BY id').all();
 const get=id=>db.prepare('SELECT * FROM estate_liquidity_jobs WHERE id=?').get(id);
 function save(row,d,state=row.state){db.prepare('UPDATE estate_liquidity_jobs SET data_json=?,state=?,note=NULL WHERE id=?').run(JSON.stringify(d),state,row.id);}
 function canPlan(){
  if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state!='applied'").get())return false;
  return !reserveExists(db,'estate_hourly_payouts')||!db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted')").get();
 }
 function note(row,message){db.prepare('UPDATE estate_liquidity_jobs SET note=? WHERE id=?').run(message,row.id);lastBlock=message;}
 function seed(){
  for(const a of db.prepare('SELECT * FROM estate_capital_allocations ORDER BY created_at,purchase_tx').all())for(const [pair,budget] of [['img-plx',a.img_plx_drops],['img-xrp',a.img_xrp_drops]]){
   const id=hash(a.purchase_tx+':'+pair),d={...zero(),cash:budget};
   db.prepare("INSERT OR IGNORE INTO estate_liquidity_jobs(id,purchase_tx,pair,initial_budget_drops,state,data_json) VALUES(?,?,?,?,'buy_img',?)").run(id,a.purchase_tx,pair,budget,JSON.stringify(d));
   const prior=get(id);if(prior.initial_budget_drops!==budget||prior.purchase_tx!==a.purchase_tx||prior.pair!==pair)throw Error('liquidity_job_identity_conflict');
  }
 }
 async function head(){
  const r=(await client.request({command:'ledger',ledger_index:'validated'})).result;
  const index=Number(r?.ledger_index??r?.ledger?.ledger_index),ledgerHash=r?.ledger_hash||r?.ledger?.ledger_hash;
  if(r?.validated!==true||!Number.isSafeInteger(index)||!/^[A-Fa-f0-9]{64}$/.test(ledgerHash||''))throw Error('validated_quote_ledger_required');
  return {index,hash:ledgerHash};
 }
 async function pool(asset,other,h,poolAccount){
  const r=(await client.request({command:'amm_info',asset,asset2:other,ledger_hash:h.hash})).result;
  if(r?.ledger_hash!==h.hash)throw Error('pool_ledger_mismatch');return inspectPool(r,{asset,other,poolAccount});
 }
 async function lines(issue,h){
  const all=[];let marker;
  for(let i=0;i<10;i++){
   const r=(await client.request({command:'account_lines',account:treasury,peer:issue.issuer,ledger_hash:h.hash,limit:400,...(marker?{marker}:{})})).result;
   if(r?.validated!==true||r.ledger_hash!==h.hash||!Array.isArray(r.lines))throw Error('validated_inventory_required');
   all.push(...r.lines);marker=r.marker;if(!marker)return all;
  }throw Error('incomplete_inventory');
 }
 async function issuer(issue,h){
  const r=(await client.request({command:'account_info',account:issue.issuer,ledger_hash:h.hash})).result;
  if(r?.validated!==true||r.ledger_hash!==h.hash||r.account_data?.Account!==issue.issuer||(r.account_data.TransferRate||1000000000)!==1000000000||(r.account_data.Flags&0x00400000))throw Error('unsupported_issuer_state');
  return r.account_data.Flags||0;
 }
 function rewardImgLiabilities(){
  if(!reserveExists(db,'estate_hourly_payouts'))return new N(0);
  let units=db.prepare("SELECT img_units FROM estate_hourly_payouts WHERE state!='confirmed'").all().reduce((n,r)=>n+integer(r.img_units),0n);
  for(const r of db.prepare('SELECT units FROM estate_payout_credits').all())units+=integer(r.units);
  return new N(units.toString()).div(1000000);
 }
 async function inventory(issue,h,{increase='0',spend='0'}={}){
  const flags=await issuer(issue,h),ls=await lines(issue,h),l=ls.find(l=>l.account===issue.issuer&&l.currency===issue.currency);
  if(!l||l.freeze||l.freeze_peer||((flags&0x00040000)&&l.peer_authorized!==true))throw Error('treasury_asset_trustline_unavailable');
  if(value(increase).gt(0)&&value(l.limit).minus(value(l.balance)).lt(value(increase)))throw Error('treasury_asset_limit_insufficient');
  let reserved=issue.currency==='IMG'?rewardImgLiabilities():new N(0);
  for(const j of jobs()){const d=JSON.parse(j.data_json),k=issue.currency.toLowerCase();reserved=reserved.plus(value(d[k]||'0')).plus(value(d[k==='img'?'residualImg':'residualPlx']||'0'));}
  if(value(l.balance).lt(reserved)||value(l.balance).lt(value(spend)))throw Error('encumbered_token_inventory_missing');
 }
 async function lpInventory(identity,h){
  const l=(await lines(identity.lp,h)).find(l=>l.account===identity.account&&l.currency===identity.lp.currency);
  let total=new N(0);for(const j of jobs()){const d=JSON.parse(j.data_json);if(d.lpAccount===identity.account)total=total.plus(value(d.lp));}
  if(!l||l.freeze||l.freeze_peer||value(l.balance).lt(total))throw Error('tracked_lp_inventory_missing');
 }
 function id(row,d,step){return row.id+':'+d.generation+':'+step;}
 function pending(row,d,step){return executor.get(id(row,d,step));}
 function ensure(row,d,step,purpose,draft,ctx,h){return executor.ensure(id(row,d,step),purpose,{Account:treasury,...draft},{jobId:row.id,generation:d.generation,step,quoteLedger:h.index,...ctx});}
 function subtract(d,field,n){const next=value(d[field]).minus(n);if(next.lt(0))throw Error('liquidity_budget_underflow');d[field]=next.toFixed();}
 function assertPoolAssets(result,row,d,sign){
  const lp={currency:d.lpCurrency,issuer:d.lpAccount};const delta=balanceDelta(result,treasury,lp);
  if(sign==='mint'&&!delta.gt(0)||sign==='burn'&&!delta.lt(0))throw Error('unexpected_lp_movement');return delta;
 }
 function applyConfirmed(row,d,step,fn){
  const tx=pending(row,d,step);if(!tx)return false;
  if(tx.state==='validated')executor.apply(tx,(result,ctx,proof)=>{
   const current=get(row.id),data=JSON.parse(current.data_json);
   if(data.generation!==ctx.generation||ctx.jobId!==current.id)throw Error('liquidity_application_identity_mismatch');
   fn(result,ctx,proof,current,data);
  });
  if(tx.state==='held')note(row,'treasury_transaction_held_for_review');
  return true;
 }
 async function buy(row,d,kind){
  const step='buy_'+kind;
  if(applyConfirmed(row,d,step,(r,c,p,j,data)=>{
   const issue=kind==='img'?IMG:PLX,delivered=r.meta.delivered_amount;
   if(!sameAmount(delivered,{...issue,value:c.output}))throw Error('acquisition_delivery_proof_mismatch');
   const received=verifiedTokenCredit(r,treasury,issue,c.output);
   const spent=xrpMovement(r,treasury).negated();if(!spent.gt(0)||spent.gt(value(c.budget)))throw Error('acquisition_budget_mismatch');
   subtract(data,'cash',spent);data[kind]=value(data[kind]).plus(received).toFixed();data[kind+'Cost']=spent.toFixed();data.fees=value(data.fees).plus(p.fee_drops).toFixed();
   save(j,data,kind==='img'&&j.pair==='img-plx'?'buy_plx':'deposit');
  }))return;
  if(!canPlan())return;
  const budget=kind==='img'?drops(value(d.cash).div(2)):d.cash;
  if(integer(budget)<1n)throw Error('capital_below_conversion_minimum');
  const h=await head(),issue=kind==='img'?IMG:PLX,p=await pool(XRP,issue,h),output=buyQuote(p,budget,slippageBps);
  await inventory(issue,h,{increase:output});
  ensure(row,d,step,'capital_buy',{TransactionType:'Payment',Destination:treasury,Amount:{...issue,value:output},SendMax:budget,Flags:0},{budget,output},h);
 }
 async function deposit(row,d){
  if(applyConfirmed(row,d,'deposit',(r,c,p,j,data)=>{
   const observedLp=balanceDelta(r,treasury,c.lp),lp=value(token(observedLp)),img=boundedTokenDebit(r,treasury,IMG,data.img),other=j.pair==='img-plx'?boundedTokenDebit(r,treasury,PLX,data.plx):xrpMovement(r,treasury).negated();
   if(!lp.gte(value(c.minimumLp))||!img.gt(0)||img.gt(value(data.img))||!other.gt(0)||other.gt(value(j.pair==='img-plx'?data.plx:data.cash)))throw Error('deposit_movement_proof_mismatch');
   const imgBasis=ceil(value(data.imgCost).times(img).div(value(data.img))),otherBasis=j.pair==='img-plx'?ceil(value(data.plxCost).times(other).div(value(data.plx))):other.toFixed();
   data.basis=value(imgBasis).plus(otherBasis).plus(data.fees).plus(p.fee_drops).toFixed();
   subtract(data,'img',img);subtract(data,'imgCost',value(imgBasis));
   if(j.pair==='img-plx'){subtract(data,'plx',other);subtract(data,'plxCost',value(otherBasis));}else subtract(data,'cash',other);
   data.lp=lp.toFixed();data.lpAccount=c.lp.issuer;data.lpCurrency=c.lp.currency;data.fees='0';data.carryBasis=null;
   for(const [k,extra,cost] of [['img','residualImg','imgCost'],['plx','residualPlx','plxCost']]){data[extra]=value(data[extra]||'0').plus(data[k]).toFixed();data[extra+'Cost']=value(data[extra+'Cost']||'0').plus(data[cost]).toFixed();data[k]='0';data[cost]='0';}
   db.prepare('UPDATE estate_liquidity_jobs SET last_harvest_hour=? WHERE id=?').run(Math.floor(p.close_ms/3600000)*3600000,j.id);
   save(j,data,'invested');
  }))return;
  if(!canPlan())return;
  const h=await head(),other=row.pair==='img-plx'?PLX:XRP,p=await pool(IMG,other,h,row.pair==='img-plx'?imgPlxPoolAccount:undefined),otherAmount=row.pair==='img-plx'?d.plx:d.cash;
  await inventory(IMG,h,{spend:d.img});if(row.pair==='img-plx')await inventory(PLX,h,{spend:d.plx});
  const minimumLp=token(N.minimum(value(d.img).div(p.a),value(otherAmount).div(p.b)).times(p.supply).times(10000-slippageBps).div(10000));
  ensure(row,d,'deposit','capital_deposit',{TransactionType:'AMMDeposit',Asset:IMG,Asset2:other,Amount:{...IMG,value:token(d.img)},Amount2:row.pair==='img-plx'?{...PLX,value:token(d.plx)}:otherAmount,LPTokenOut:{...p.lp,value:minimumLp},Flags:0x00100000},{lp:p.lp,minimumLp},h);
 }
 async function harvest(row,d){
  if(!canPlan()||!harvestEnabled||row.pair!=='img-xrp'||!value(d.lp).gt(0))return;
  const hour=now()-now()%3600000;if(row.last_harvest_hour===hour)return;
  const holders=ownership.at(now());if(!holders.length)return;
  const h=await head(),p=await pool(XRP,IMG,h);
  if(p.account!==d.lpAccount||p.lp.currency!==d.lpCurrency)throw Error('harvest_position_identity_mismatch');
  await lpInventory(p,h);
  const quoted=value(liquidationQuote(p,d.lp)).times(10000-slippageBps).div(10000);
  const ownerCount=new Set(holders.map(h=>h.acct)).size;
  // Do not churn liquidity for proceeds that cannot cover costs and payments.
  const fees=new N(maxFeeDrops).times(4+ownerCount);
  if(quoted.lte(value(d.basis).plus(fees))){db.prepare('UPDATE estate_liquidity_jobs SET last_harvest_hour=? WHERE id=?').run(hour,row.id);return;}
  ensure(row,d,'withdraw','profit_withdraw',{TransactionType:'AMMWithdraw',Asset:XRP,Asset2:IMG,LPTokenIn:{...p.lp,value:token(d.lp)},Flags:0x00010000},{lp:p.lp,positionLp:d.lp,basis:d.basis,harvestHour:hour},h);
  save(row,d,'withdraw');
 }
 async function withdrawal(row,d){
  if(!applyConfirmed(row,d,'withdraw',(r,c,p,j,data)=>{
   verifiedLpBurn(r,treasury,c.lp,c.positionLp);const img=value(token(balanceDelta(r,treasury,IMG))),xrp=xrpMovement(r,treasury);
   if(!img.gt(0)||!xrp.gt(0)||data.lp!==c.positionLp||data.basis!==c.basis)throw Error('withdrawal_principal_proof_mismatch');
   data.lp='0';data.harvestImg=img.toFixed();data.harvestXrp=xrp.toFixed();data.harvestFees=p.fee_drops;data.harvestBasis=c.basis;data.harvestSource=p.tx_hash;data.harvestHour=c.harvestHour;
   data.img=value(data.img).plus(img).toFixed();save(j,data,'convert_profit');
  }))throw Error('withdrawal_intent_missing');
 }
 async function convert(row,d){
  if(applyConfirmed(row,d,'convert',(r,c,p,j,data)=>{
   const debit=boundedTokenDebit(r,treasury,IMG,data.harvestImg),xrp=xrpMovement(r,treasury);
   if(!debit.gt(0)||debit.gt(value(data.harvestImg))||!xrp.eq(value(c.output))||r.meta.delivered_amount!==c.output)throw Error('profit_conversion_proof_mismatch');
   subtract(data,'img',debit);data.harvestFees=value(data.harvestFees).plus(p.fee_drops).toFixed();data.harvestXrp=value(data.harvestXrp).plus(xrp).toFixed();
   const residual=value(data.harvestImg).minus(debit);
   data.residualImg=value(data.residualImg||'0').plus(residual).toFixed();subtract(data,'img',residual);
   // Undebited IMG is retained as position residual, never counted as XRP profit.
   const net=value(data.harvestXrp).minus(data.harvestFees),basis=value(data.harvestBasis),priorLoss=value(db.prepare('SELECT drops FROM estate_xrp_realized_loss_carry WHERE id=1').get().drops),change=net.minus(basis),profit=N.maximum(0,change.minus(priorLoss));
   db.prepare('UPDATE estate_xrp_realized_loss_carry SET drops=? WHERE id=1').run(N.maximum(0,priorLoss.minus(change)).toFixed());
   if(net.lt(0))throw Error('negative_realized_proceeds');
   const holders=ownership.at(p.close_ms),owners=new Set(holders.map(h=>h.acct)),feeBudget=new N(maxFeeDrops).times(owners.size),distributable=holders.length&&profit.gt(feeBudget)?drops(profit.minus(feeBudget)):'0';
   const availableAfter=Math.floor(p.close_ms/3600000)*3600000+3600000,source=p.tx_hash;
   db.prepare('INSERT INTO estate_xrp_profit_receipts(source_id,job_id,realized_at_ms,available_after_ms,gross_drops,basis_drops,cost_drops,distributable_drops,loss_carry_drops) VALUES(?,?,?,?,?,?,?,?,?)').run(source,j.id,p.close_ms,availableAfter,data.harvestXrp,data.harvestBasis,data.harvestFees,distributable,priorLoss.toFixed());
   if(integer(distributable)>0n){
    if(integer(distributable)>BigInt(Number.MAX_SAFE_INTEGER))throw Error('profit_allocation_exceeds_safe_range');
    const combined=new Map();for(const a of allocateProfit(Number(distributable),holders))combined.set(a.acct,(combined.get(a.acct)||0)+a.amountDrops);
    for(const [owner,amount] of combined){if(!amount)continue;db.prepare("INSERT INTO estate_xrp_profit_payouts VALUES(?,?,?,?,?,'queued',NULL)").run(hash(source+':'+owner),source,owner,String(amount),availableAfter);}
   }
   const capital=net.minus(distributable).minus(integer(distributable)>0n?feeBudget:0);
   const previousCash=value(data.cash);data.cash=previousCash.plus(capital).toFixed();data.carryBasis=null;data.generation++;data.fees='0';data.lp='0';
   for(const k of ['harvestImg','harvestXrp','harvestFees','harvestBasis','harvestSource','harvestHour'])delete data[k];
   db.prepare('UPDATE estate_liquidity_jobs SET last_harvest_hour=? WHERE id=?').run(Math.floor(p.close_ms/3600000)*3600000,j.id);
   save(j,data,'buy_img');
  }))return;
  if(!canPlan())return;
  const h=await head(),p=await pool(XRP,IMG,h),budget=value(d.harvestImg),net=100000-p.fee;
  const output=drops(p.a.times(budget).times(net).div(p.b.times(100000).plus(budget.times(net))).times(10000-slippageBps).div(10000));
  if(integer(output)<1n)throw Error('profit_conversion_below_one_drop');
  await inventory(IMG,h,{spend:d.harvestImg});
  ensure(row,d,'convert','profit_convert',{TransactionType:'Payment',Destination:treasury,Amount:output,SendMax:{...IMG,value:token(d.harvestImg)},Flags:0},{output},h);
 }
 async function payouts(){
  for(const row of db.prepare("SELECT * FROM estate_xrp_profit_payouts WHERE state='queued' ORDER BY available_after_ms,id").all()){
   const key='profit:'+row.id,prior=executor.get(key);
   if(prior?.state==='validated')executor.apply(prior,(r,c,proof)=>{
    if(r.meta.delivered_amount!==row.amount_drops||!xrpMovement(r,treasury).eq(value(row.amount_drops).negated()))throw Error('native_payout_delivery_mismatch');
    db.prepare("UPDATE estate_xrp_profit_payouts SET state='confirmed',tx_hash=? WHERE id=? AND state='queued'").run(proof.tx_hash,row.id);
   });
   if(prior)continue;
   if(!payoutsEnabled||guard.paused()||!canPlan())continue;
   const through=reserveExists(db,'estate_img_scan_watermarks')?db.prepare('SELECT scanned_through_ms FROM estate_img_scan_watermarks WHERE id=1').get()?.scanned_through_ms:0;
   if(!through||through<row.available_after_ms)continue;
   if(row.owner===treasury||row.owner===imgIssuer||row.owner===plxIssuer){lastBlock='self_or_issuer_profit_payout_review';continue;}
   if(integer(row.amount_drops)>integer(maxNativePayoutDrops)){lastBlock='native_profit_payment_budget_limit';continue;}
   const today=now()-now()%86400000,used=db.prepare("SELECT draft_json FROM estate_treasury_transactions WHERE purpose='xrp_profit_payout' AND submitted_at>=? AND tx_hash IS NOT NULL").all(today).reduce((n,r)=>n+integer(JSON.parse(r.draft_json).Amount),0n);
   if(used+integer(row.amount_drops)>integer(maxNativeDailyDrops)){lastBlock='native_profit_daily_budget_limit';continue;}
   const h=await head(),r=(await client.request({command:'account_info',account:row.owner,ledger_hash:h.hash})).result;
   if(r?.validated!==true||r.ledger_hash!==h.hash||r.account_data?.Account!==row.owner||(r.account_data.Flags&0x00020000)){lastBlock='profit_recipient_unavailable';continue;}
   executor.ensure(key,'xrp_profit_payout',{Account:treasury,TransactionType:'Payment',Destination:row.owner,Amount:row.amount_drops,Flags:0},{payoutId:row.id,amountDrops:row.amount_drops});
  }
 }
 async function tick(){
  if(busy)return {blocked:'busy'};busy=true;lastBlock=null;
  try{
   if(fundingEnabled)seed();
   for(const row of jobs()){
    const d=JSON.parse(row.data_json);
    try{
     if(row.state==='buy_img'&&(fundingEnabled||pending(row,d,'buy_img')))await buy(row,d,'img');
     else if(row.state==='buy_plx'&&(fundingEnabled||pending(row,d,'buy_plx')))await buy(row,d,'plx');
     else if(row.state==='deposit'&&(fundingEnabled||pending(row,d,'deposit')))await deposit(row,d);
     else if(row.state==='invested'&&harvestEnabled&&!guard.paused())await harvest(row,d);
     else if(row.state==='withdraw')await withdrawal(row,d);
     else if(row.state==='convert_profit'&&(harvestEnabled||pending(row,d,'convert')))await convert(row,d);
    }catch(e){note(row,e.message);}
   }
   await payouts();const result=await executor.tick();if(result.blocked)lastBlock=result.blocked;lastError=null;return result;
  }catch(e){lastError=e.message;return {blocked:e.message};}finally{busy=false;}
 }
 function status(owner){return {capitalFundingEnabled:fundingEnabled,xrpProfitHarvestEnabled:harvestEnabled,imgXrpProfitDistributionsEnabled:harvestEnabled&&payoutsEnabled,
  liquidityStatus:lastError||lastBlock||(!fundingEnabled?'disabled':guard.paused()?'treasury_paused':'enabled'),
  xrpProfitPayouts:owner?db.prepare('SELECT amount_drops,available_after_ms,state,tx_hash FROM estate_xrp_profit_payouts WHERE owner=? ORDER BY available_after_ms DESC LIMIT 100').all(owner):[]};}
 return {tick,status,reservedDrops:()=>estateCashReserve(db),executor};
}
module.exports={createEstateLiquidityRuntime,estateCashReserve,estateGuardReserve};
