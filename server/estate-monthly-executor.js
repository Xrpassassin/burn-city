'use strict';
// Executes the Estates monthly plan (see estate-monthly-plan.js). OFF unless the caller passes
// enabled:true (server: ESTATE_MONTHLY_PLAN_ENABLED=1 plus mainnet/signer/pool checks).
// Every transaction is: built here -> assertSafeTransaction -> signed -> hash+blob persisted
// BEFORE submit -> resolved from the validated ledger. A restart resumes the same tx; it never
// re-signs a new one while an earlier one may still validate.
const {N,value,balanceDelta}=require('./estate-liquidity-ledger');
const P=require('./estate-monthly-plan');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function createEstateMonthlyExecutor({db,client,wallet,treasury,cfg,enabled=false,paused=()=>true,
 xrpRlusdAsset,xrpImgAsset,now=()=>Date.now(),pollMs=1000,pollTries=30,log=()=>{}}){
 const L=P.createEstateMonthlyLedger(db);
 const IMG={currency:cfg.imgCurrency,issuer:cfg.imgIssuer},RL={currency:cfg.rlusdCurrency,issuer:cfg.rlusdIssuer};
 const XRP={currency:'XRP'};
 const ctxBase={treasury,poolAccount:cfg.poolAccount,imgIssuer:cfg.imgIssuer,imgCurrency:cfg.imgCurrency,rlusdIssuer:cfg.rlusdIssuer,rlusdCurrency:cfg.rlusdCurrency};
 const iou=(a,v)=>({currency:a.currency,issuer:a.issuer,value:String(v)});
 const T=(sql,...a)=>db.prepare(sql).run(...a);
 async function ledgerIndex(){return (await client.request({command:'ledger',ledger_index:'validated'})).result.ledger_index;}
 async function lookup(hash){try{return (await client.request({command:'tx',transaction:hash})).result;}catch(e){if(e?.data?.error==='txnNotFound'||/txnNotFound/.test(e?.message||''))return null;throw e;}}
 async function send(step,tx,ctx={}){
  const prior=db.prepare('SELECT * FROM estate_mp_txs WHERE step=?').get(step);
  if(prior?.state==='validated')return await lookup(prior.hash);
  if(prior?.state==='failed')throw Error('step_failed:'+step+':'+prior.result);
  if(prior?.state==='submitted'){
   const r=await lookup(prior.hash);
   if(r?.validated)return settle(step,r);
   if((await ledgerIndex())>prior.last_ledger){T("UPDATE estate_mp_txs SET state='failed',result='expired',updated=? WHERE step=?",now(),step);throw Error('step_expired:'+step);}
   return wait(step,prior.hash);
  }
  const w=wallet();if(!w||w.classicAddress!==treasury)throw Error('treasury_signer_required');
  const filled=await client.autofill({...tx,Account:treasury});
  P.assertSafeTransaction(filled,{...ctxBase,...ctx});
  const signed=w.sign(filled);
  T("INSERT INTO estate_mp_txs(step,hash,blob,last_ledger,state,created,updated) VALUES(?,?,?,?,'submitted',?,?)",step,signed.hash,signed.tx_blob,filled.LastLedgerSequence,now(),now());
  const sub=(await client.request({command:'submit',tx_blob:signed.tx_blob})).result;
  log('submit',{step,hash:signed.hash,engine:sub.engine_result});
  if(/^(tem|tef)/.test(sub.engine_result||'')){T("UPDATE estate_mp_txs SET state='failed',result=?,updated=? WHERE step=?",sub.engine_result,now(),step);throw Error('step_rejected:'+step+':'+sub.engine_result);}
  return wait(step,signed.hash);
 }
 async function wait(step,hash){
  for(let i=0;i<pollTries;i++){const r=await lookup(hash);if(r?.validated)return settle(step,r);await sleep(pollMs);}
  throw Error('step_pending:'+step);
 }
 function settle(step,r){
  const res=r.meta?.TransactionResult;
  T('UPDATE estate_mp_txs SET state=?,result=?,updated=? WHERE step=?',res==='tesSUCCESS'?'validated':'failed',res,now(),step);
  if(res!=='tesSUCCESS'){const e=Error('step_failed:'+step+':'+res);e.result=res;throw e;}
  return r;
 }
 async function pool(){
  const r=(await client.request({command:'amm_info',asset:IMG,asset2:RL,ledger_index:'validated'})).result;
  const a=r.amm;if(!a||a.account!==cfg.poolAccount)throw Error('pool_account_mismatch');
  if(a.asset_frozen||a.asset2_frozen)throw Error('pool_frozen');
  const imgFirst=a.amount.currency===IMG.currency&&a.amount.issuer===IMG.issuer;
  return {account:a.account,poolImg:(imgFirst?a.amount:a.amount2).value,poolRlusd:(imgFirst?a.amount2:a.amount).value,
   lpSupply:a.lp_token.value,lpCurrency:a.lp_token.currency,tradingFee:a.trading_fee||0};
 }
 async function xrpPool(asset){
  const a=(await client.request({command:'amm_info',asset:XRP,asset2:asset,ledger_index:'validated'})).result.amm;
  const xrpFirst=typeof a.amount==='string';
  return {drops:xrpFirst?a.amount:a.amount2,tokens:(xrpFirst?a.amount2:a.amount).value,tradingFee:a.trading_fee||0};
 }
 async function lpBalance(lpCurrency){
  const lines=(await client.request({command:'account_lines',account:treasury,peer:cfg.poolAccount,ledger_index:'validated'})).result.lines||[];
  return lines.find(l=>l.currency===lpCurrency)?.balance||'0';
 }
 async function spendableDrops(){
  const [ai,ss]=await Promise.all([client.request({command:'account_info',account:treasury,ledger_index:'validated'}),client.request({command:'server_state'})]);
  const v=ss.result.state.validated_ledger,d=ai.result.account_data;
  return BigInt(d.Balance)-BigInt(v.reserve_base)-BigInt(v.reserve_inc)*BigInt(d.OwnerCount||0)-200000n; // + 0.2 XRP fee margin
 }
 const tokenDelta=(r,a)=>balanceDelta(r,treasury,a);
 // ---- purchase / redeposit deposits ----
 function syncPurchases(){
  // Every settled v3 allocation (and the #517 re-booked sale) becomes a queued two-sided deposit.
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_capital_allocations'").get())return 0;
  let n=0;for(const r of db.prepare('SELECT purchase_tx,img_rlusd_drops FROM estate_capital_allocations WHERE policy_version=3').all())
   if(BigInt(r.img_rlusd_drops||'0')>0n&&L.enqueuePurchase({purchaseTx:r.purchase_tx,investDrops:r.img_rlusd_drops}))n++;
  return n;
 }
 async function processDeposit(row){
  const chunk=row.chunk_json?JSON.parse(row.chunk_json):null;
  let c=chunk;
  if(!c){
   if(row.kind==='purchase'&&BigInt(row.xrp_remaining_drops)>0n){
    const legs=P.depositLegs(row.xrp_remaining_drops,cfg);
    if(BigInt(legs.rlusdLegDrops)<BigInt(cfg.minSwapDrops))return {id:row.id,held:'below_min_swap'};
    if(await spendableDrops()<BigInt(legs.spendDrops))return note(row,'insufficient_xrp');
    const [pl,xr,xi]=await Promise.all([pool(),xrpPool(xrpRlusdAsset),xrpPool(xrpImgAsset)]);
    const qr=P.quoteSwap({amountIn:legs.rlusdLegDrops,poolIn:xr.drops,poolOut:xr.tokens,tradingFee:xr.tradingFee});
    const qi=P.quoteSwap({amountIn:legs.imgLegDrops,poolIn:xi.drops,poolOut:xi.tokens,tradingFee:xi.tradingFee});
    if(qr.impactBps>cfg.maxPriceImpactBps)return note(row,'guard:price_impact_rlusd_leg');
    if(qi.impactBps>cfg.maxPriceImpactBps)return note(row,'guard:price_impact_img_leg');
    const ref=qr.spot.div(qi.spot),poolPx=new N(pl.poolRlusd).div(pl.poolImg);
    if(P.poolDeviationBps(poolPx,ref)>cfg.maxPoolDeviationBps)return note(row,'guard:pool_price_deviation');
    c={seq:Number(db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE ?").get(row.id+':%:amm').n),
     legs,rlMin:P.fx(P.minOut(qr.out,cfg)).toFixed(),imgMin:P.fx(P.minOut(qi.out,cfg)).toFixed(),done:{}};
   }else{
    if(!(new N(row.held_img).gt(0)&&new N(row.held_rlusd).gt(0)))return finish(row);
    c={seq:Number(db.prepare("SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE ?").get(row.id+':%:amm').n),legs:null,done:{rl:true,img:true}};
   }
   L.update(row.id,{chunk_json:JSON.stringify(c),note:null});
  }
  const id=row.id+':'+c.seq;
  let cur=db.prepare('SELECT * FROM estate_mp_deposits WHERE id=?').get(row.id);
  if(!c.done.rl){
   const r=await send(id+':rl',{TransactionType:'Payment',Destination:treasury,Amount:iou(RL,c.rlMin),SendMax:c.legs.rlusdLegDrops});
   const got=tokenDelta(r,RL);
   c.done.rl=true;L.update(row.id,{chunk_json:JSON.stringify(c),held_rlusd:new N(cur.held_rlusd).plus(got).toFixed(),
    xrp_remaining_drops:(BigInt(cur.xrp_remaining_drops)-BigInt(c.legs.rlusdLegDrops)).toString()});
   cur=db.prepare('SELECT * FROM estate_mp_deposits WHERE id=?').get(row.id);
  }
  if(!c.done.img){
   const r=await send(id+':img',{TransactionType:'Payment',Destination:treasury,Amount:iou(IMG,c.imgMin),SendMax:c.legs.imgLegDrops});
   const got=tokenDelta(r,IMG);
   c.done.img=true;L.update(row.id,{chunk_json:JSON.stringify(c),held_img:new N(cur.held_img).plus(got).toFixed(),
    xrp_remaining_drops:(BigInt(cur.xrp_remaining_drops)-BigInt(c.legs.imgLegDrops)).toString()});
   cur=db.prepare('SELECT * FROM estate_mp_deposits WHERE id=?').get(row.id);
  }
  if(!c.done.amm){
   if(paused())return note(cur,'treasury_paused');
   const pl=await pool();
   if(!c.amounts){c.amounts=P.ratioDeposit({heldImg:cur.held_img,heldRlusd:cur.held_rlusd,poolImg:pl.poolImg,poolRlusd:pl.poolRlusd});c.k=P.kPerLp(pl).toFixed();L.update(row.id,{chunk_json:JSON.stringify(c)});}
   const r=await send(id+':amm',{TransactionType:'AMMDeposit',Asset:IMG,Asset2:RL,Amount:iou(IMG,c.amounts.img),Amount2:iou(RL,c.amounts.rlusd),Flags:P.TF.twoAsset});
   const dImg=tokenDelta(r,IMG).negated(),dRl=tokenDelta(r,RL).negated(),lp=tokenDelta(r,{currency:pl.lpCurrency,issuer:cfg.poolAccount});
   if(!dImg.gt(0)||!dRl.gt(0)||!lp.gt(0))throw Error('deposit_not_two_sided');
   c.done.amm=true;
   L.update(row.id,{chunk_json:null,held_img:new N(cur.held_img).minus(dImg).toFixed(),held_rlusd:new N(cur.held_rlusd).minus(dRl).toFixed(),
    img_in:new N(cur.img_in).plus(dImg).toFixed(),rlusd_in:new N(cur.rlusd_in).plus(dRl).toFixed(),lp_out:new N(cur.lp_out).plus(lp).toFixed(),
    principal_k:new N(cur.principal_k).plus(lp.times(c.k)).toFixed()});
  }
  return finish(db.prepare('SELECT * FROM estate_mp_deposits WHERE id=?').get(row.id));
 }
 function note(row,n){L.update(row.id,{note:n});log('deposit_held',{id:row.id,note:n});return {id:row.id,held:n};}
 function finish(row){
  if(row.kind==='purchase'&&BigInt(row.xrp_remaining_drops)>=BigInt(cfg.minSwapDrops)*2n)return {id:row.id,state:'queued',remaining:row.xrp_remaining_drops};
  L.update(row.id,{state:'deposited',note:null});return {id:row.id,state:'deposited'};
 }
 async function processDeposits(){
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  syncPurchases();const out=[];
  for(const row of L.queued())out.push(await processDeposit(row));
  return {ok:true,results:out};
 }
 // ---- monthly harvest, split, burn, redeposit, payouts ----
 function owners(){
  return db.prepare('SELECT acct,share_units FROM estate_property_ownership').all().filter(r=>r.acct!==treasury).map(r=>({acct:r.acct,shareUnits:Number(r.share_units)}));
 }
 async function runMonthly(){
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  const open=db.prepare("SELECT period FROM estate_mp_harvests WHERE state IN ('withdrawn','split') ORDER BY period").get();
  // Never harvest a month that ended before the plan's first deposit existed.
  const first=db.prepare('SELECT MIN(created) t FROM estate_mp_deposits').get().t;
  if(!first)return {ok:true,state:'not_due'};
  const fp=new Date(first);const baseline=new Date(Date.UTC(fp.getUTCFullYear(),fp.getUTCMonth()-1,1)).toISOString().slice(0,7);
  const last=L.lastPeriod();
  const period=open?.period||P.duePeriod(last&&last>baseline?last:baseline,now());
  if(!period)return {ok:true,state:'not_due'};
  let h=L.harvest(period);
  if(!h){
   const pl=await pool();const onLedger=await lpBalance(pl.lpCurrency);
   const plan=P.harvestPlan({trackedLp:L.trackedLp(),onLedgerLp:onLedger,principalK:L.principalK(),pool:pl});
   if(!new N(plan.lpToWithdraw).gt(0)){T("INSERT INTO estate_mp_harvests(period,state,created,updated) VALUES(?,'nothing_to_harvest',?,?)",period,now(),now());return {ok:true,period,state:'nothing_to_harvest'};}
   const r=await send(`harvest:${period}:withdraw`,{TransactionType:'AMMWithdraw',Asset:IMG,Asset2:RL,
    LPTokenIn:{currency:pl.lpCurrency,issuer:cfg.poolAccount,value:plan.lpToWithdraw},Flags:P.TF.lpToken},{maxLpIn:plan.lpToWithdraw});
   const lpIn=tokenDelta(r,{currency:pl.lpCurrency,issuer:cfg.poolAccount}).negated();
   T("INSERT INTO estate_mp_harvests(period,state,lp_in,img_out,rlusd_out,split_json,created,updated) VALUES(?,'withdrawn',?,?,?,?,?,?)",
    period,lpIn.toFixed(),P.fx(tokenDelta(r,IMG)).toFixed(),P.fx(tokenDelta(r,RL)).toFixed(),JSON.stringify({plan,rlusdPerImg:new N(pl.poolRlusd).div(pl.poolImg).precision(20,N.ROUND_DOWN).toFixed()}),now(),now());
   h=L.harvest(period);
  }
  if(h.state==='withdrawn'){
   const split=P.splitHarvest({img:h.img_out,rlusd:h.rlusd_out});const meta=JSON.parse(h.split_json);
   if(new N(split.burnImg).gt(0))await send(`harvest:${period}:burn`,{TransactionType:'Payment',Destination:cfg.imgIssuer,Amount:iou(IMG,split.burnImg)});
   const alloc=P.allocateHolders({holdersImg:split.holdersImg,holdersRlusd:split.holdersRlusd,owners:owners(),carry:L.carry(),rlusdPerImg:meta.rlusdPerImg,dust:cfg.dust});
   db.exec('BEGIN');
   try{
    L.enqueueRedeposit({period,img:split.redepositImg,rlusd:split.redepositRlusd});
    const ins=db.prepare("INSERT OR IGNORE INTO estate_mp_payouts(period,acct,currency,amount,state) VALUES(?,?,?,?,'pending')");
    for(const p of alloc.payouts){if(new N(p.img).gt(0))ins.run(period,p.acct,'IMG',p.img);if(new N(p.rlusd).gt(0))ins.run(period,p.acct,'RLUSD',p.rlusd);}
    L.setCarry(alloc.carry);
    T("UPDATE estate_mp_harvests SET state='split',split_json=?,updated=? WHERE period=?",JSON.stringify({...meta,split,payouts:alloc.payouts}),now(),period);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   h=L.harvest(period);
  }
  if(h.state==='split'){
   const holders=new Set(db.prepare("SELECT acct FROM estate_mp_payouts WHERE period=?").all(period).map(r=>r.acct));
   for(const p of db.prepare("SELECT * FROM estate_mp_payouts WHERE period=? AND state='pending' ORDER BY acct,currency").all(period)){
    if(paused())return {ok:false,period,error:'treasury_paused'};
    try{
     const r=await send(`payout:${period}:${p.acct}:${p.currency}`,{TransactionType:'Payment',Destination:p.acct,Amount:iou(p.currency==='IMG'?IMG:RL,p.amount)},{holders});
     T("UPDATE estate_mp_payouts SET state='paid',tx_hash=? WHERE period=? AND acct=? AND currency=?",r.hash||r.tx_json?.hash,period,p.acct,p.currency);
    }catch(e){
     if(!/^tec/.test(e.result||''))throw e; // validated tec (e.g. no trust line): carry it forward to next month
     const c=L.carry(),k=p.currency==='IMG'?'img':'rlusd';c[p.acct]=c[p.acct]||{img:'0',rlusd:'0'};c[p.acct][k]=new N(c[p.acct][k]).plus(p.amount).toFixed();
     db.exec('BEGIN');L.setCarry(c);T("UPDATE estate_mp_payouts SET state='carried' WHERE period=? AND acct=? AND currency=?",period,p.acct,p.currency);db.exec('COMMIT');
    }
   }
   T("UPDATE estate_mp_harvests SET state='paid',updated=? WHERE period=?",now(),period);
  }
  return {ok:true,period,state:'paid',...JSON.parse(L.harvest(period).split_json||'{}')};
 }
 function status(){
  return {policy:P.POLICY,enabled,cadence:'monthly',poolAccount:cfg.poolAccount||null,principalK:L.principalK(),trackedLp:L.trackedLp(),
   queuedDeposits:L.queued().length,pendingXrpDrops:L.pendingXrpDrops(),lastHarvestPeriod:L.lastPeriod(),payoutCurrencies:['IMG','RLUSD'],dustRlusd:cfg.dust};
 }
 return {processDeposits,runMonthly,status,syncPurchases,ledger:L,_send:send};
}
module.exports={createEstateMonthlyExecutor};
