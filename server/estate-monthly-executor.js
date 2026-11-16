'use strict';
// Executes the Estates monthly plan (see estate-monthly-plan.js). OFF unless the caller passes
// enabled:true (server: ESTATE_MONTHLY_PLAN_ENABLED=1 plus mainnet/signer/pool checks).
// Every transaction is: built here -> assertSafeTransaction -> signed -> hash+blob persisted
// BEFORE submit -> resolved from the validated ledger. A restart resumes the same tx; it never
// re-signs a new one while an earlier one may still validate.
const {N,value,balanceDelta,xrpMovement}=require('./estate-liquidity-ledger');
const P=require('./estate-monthly-plan');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function createEstateMonthlyExecutor({db,client,wallet,treasury,cfg,enabled=false,paused=()=>true,
 xrpRlusdAsset,xrpImgAsset,now=()=>Date.now(),pollMs=1000,pollTries=30,log=()=>{},v4=null,mig=null}){
 const L=P.createEstateMonthlyLedger(db);
 const V=require('./estate-v4-plan');const VL=V.createEstateV4Ledger(db);
 const v4On=!!(v4&&v4.enabled);
 const M=require('./estate-plx-migration');const ML=M.createMigrationLedger(db);
 const IMG={currency:cfg.imgCurrency,issuer:cfg.imgIssuer},RL={currency:cfg.rlusdCurrency,issuer:cfg.rlusdIssuer};
 const polluxXrpModule=require('./estate-pollux-xrp');
 const polluxXrp=polluxXrpModule.createPolluxXrpRewards({
  db,client,treasury,pool:V.IMG_PLX_POOL,source:V.POLLUX_SOURCE,send,lookup,paused,now,
  availableDrops:async account=>await spendableDrops(account)-BigInt(require('./estate-liquidity-runtime').estateCashReserve(db))+polluxXrpModule.xrpRewardReserve(db)
 });
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
  const filled=ctx.polluxXrp?tx:await client.autofill({...tx,Account:treasury});
  if(ctx.polluxXrp){
   const row=ctx.polluxXrp;
   if(!filled||filled.TransactionType!=='Payment'||filled.Account!==treasury||filled.Destination!==row.owner||
      filled.Amount!==String(row.amount_drops)||filled.Fee!==String(row.fee_drops)||
      filled.SendMax!==undefined||filled.Paths!==undefined||filled.DeliverMin!==undefined||
      filled.DestinationTag!==undefined||Number(filled.Flags||0)!==0||
      !Number.isSafeInteger(filled.Sequence)||filled.Sequence<1||
      !Number.isSafeInteger(filled.LastLedgerSequence)||filled.LastLedgerSequence<1||
      [treasury,cfg.imgIssuer,V.IMG_PLX_POOL,V.IMG_XRP_POOL,cfg.poolAccount].includes(filled.Destination))
    throw Error('unsafe_pollux_xrp_payment');
   await ctx.beforeSign();
   if(paused())throw Error('treasury_paused');
  }else if(ctx.migration)M.assertSafeMigrationTransaction(filled,{treasury,imgIssuer:cfg.imgIssuer,plxIssuer:(mig&&mig.plxIssuer)||V.PLX_ISSUER,maxLpIn:ctx.maxLpIn});
  else if(ctx.v4)V.assertSafeV4Transaction(filled,{treasury,imgIssuer:cfg.imgIssuer,imgCurrency:cfg.imgCurrency,plxIssuer:v4.plxIssuer,rlusdPool:cfg.poolAccount,holders:ctx.holders});
  else P.assertSafeTransaction(filled,{...ctxBase,...ctx});
  if(ctx.polluxBurn){
   if(!/^[1-9]\d*$/.test(filled.Fee||'')||BigInt(filled.Fee)>100n||paused())throw Error('pollux_burn_fee_or_pause');
   if(!Number.isSafeInteger(filled.LastLedgerSequence)||filled.LastLedgerSequence<1||
      filled.Paths!==undefined||filled.DeliverMin!==undefined||
      filled.Destination!==tx.Destination||filled.SendMax!==tx.SendMax||
      JSON.stringify(filled.Amount)!==JSON.stringify(tx.Amount))throw Error('unsafe_pollux_burn');
  }
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
 async function spendableDrops(account){
  const [d,ss]=await Promise.all([account||client.request({command:'account_info',account:treasury,ledger_index:'validated'}).then(r=>r.result.account_data),client.request({command:'server_state'})]);
  const v=ss.result.state.validated_ledger;
  return BigInt(d.Balance)-BigInt(v.reserve_base)-BigInt(v.reserve_inc)*BigInt(d.OwnerCount||0)-200000n; // + 0.2 XRP fee margin
 }
 const tokenDelta=(r,a)=>balanceDelta(r,treasury,a);
 // ---- purchase / redeposit deposits ----
 let depositRunning=false;
 function syncPurchases(){
  // Every settled v3 allocation (and the #517 re-booked sale) becomes a queued two-sided deposit.
  // Policy v4 (flag): purchases settled after the v4 start snapshot are split 90/5/5 instead
  // (IMG/PLX, IMG/XRP, and IMG/RLUSD through this same queue). A split purchase is never re-queued whole.
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_capital_allocations'").get())return 0;
  if(v4On&&!VL.program())VL.start(v4,now());
  const prog=v4On?VL.program():null;
  let n=0;for(const r of db.prepare('SELECT purchase_tx,img_rlusd_drops,created_at FROM estate_capital_allocations WHERE policy_version=3').all()){
   if(!(BigInt(r.img_rlusd_drops||'0')>0n))continue;
   if(VL.split(r.purchase_tx))continue;
   if(prog&&Number(r.created_at)>=prog.started_ms&&!db.prepare('SELECT 1 FROM estate_mp_deposits WHERE source=?').get(r.purchase_tx)){splitV4Purchase(r);n++;continue;}
   if(L.enqueuePurchase({purchaseTx:r.purchase_tx,investDrops:r.img_rlusd_drops}))n++;
  }
  return n;
 }
 function splitV4Purchase(r){
  const sp=V.splitV4(r.img_rlusd_drops,v4,cfg.minSwapDrops);
  db.exec('BEGIN');
  try{
   db.prepare('INSERT INTO estate_v4_splits VALUES(?,?,?,?,?,?,?)').run(r.purchase_tx,r.img_rlusd_drops,sp.plxDrops,sp.xrpDrops,sp.rlusdDrops,JSON.stringify(sp.folded),now());
   const ins=db.prepare("INSERT INTO estate_v4_deposits(id,purchase_tx,pair,state,xrp_drops,xrp_remaining_drops,created,updated) VALUES(?,?,?,'queued',?,?,?,?)");
   if(BigInt(sp.plxDrops)>0n)ins.run('v4:'+r.purchase_tx+':img-plx',r.purchase_tx,'img-plx',sp.plxDrops,sp.plxDrops,now(),now());
   if(BigInt(sp.xrpDrops)>0n)ins.run('v4:'+r.purchase_tx+':img-xrp',r.purchase_tx,'img-xrp',sp.xrpDrops,sp.xrpDrops,now(),now());
   if(BigInt(sp.rlusdDrops)>0n)L.enqueuePurchase({purchaseTx:r.purchase_tx,investDrops:sp.rlusdDrops});
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  log('v4_split',{purchaseTx:r.purchase_tx,...sp});
 }
 async function processDeposit(row){
  const chunk=row.chunk_json?JSON.parse(row.chunk_json):null;
  let c=chunk;
  if(!c){
   if(row.kind==='purchase'&&BigInt(row.xrp_remaining_drops)>0n){
    if(BigInt(P.depositLegs(row.xrp_remaining_drops,cfg).rlusdLegDrops)<BigInt(cfg.minSwapDrops))return {id:row.id,held:'below_min_swap'};
    const [pl,xr,xi]=await Promise.all([pool(),xrpPool(xrpRlusdAsset),xrpPool(xrpImgAsset)]);
    // Chunk size: per-run cap (maxDepositDrops), halved while either leg would exceed the
    // price-impact cap. The impact guard below still applies to the final size unchanged.
    let cap=BigInt(cfg.maxDepositDrops),legs,qr,qi;
    for(;;){
     legs=P.depositLegs(row.xrp_remaining_drops,{...cfg,maxDepositDrops:cap.toString()});
     qr=P.quoteSwap({amountIn:legs.rlusdLegDrops,poolIn:xr.drops,poolOut:xr.tokens,tradingFee:xr.tradingFee});
     qi=P.quoteSwap({amountIn:legs.imgLegDrops,poolIn:xi.drops,poolOut:xi.tokens,tradingFee:xi.tradingFee});
     if((qr.impactBps<=cfg.maxPriceImpactBps&&qi.impactBps<=cfg.maxPriceImpactBps)||cap/2n<BigInt(cfg.minSwapDrops)*2n)break;
     cap/=2n;
    }
    if(await spendableDrops()<BigInt(legs.spendDrops))return note(row,'insufficient_xrp');
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
  // Single-flight: a second caller (instant kick + timer) never runs a concurrent deposit pass.
  if(depositRunning)return {ok:false,error:'deposit_run_in_progress'};
  depositRunning=true;
  try{for(const row of L.queued())out.push(await processDeposit(row));}finally{depositRunning=false;}
  return {ok:true,results:out};
 }
 // ---- harvest, split, burn, redeposit, payouts (monthly default, or daily when configured) ----
 function owners(){
  // Snapshot at split time: current share_units, not time-weighted mid-period ownership.
  return db.prepare('SELECT acct,share_units FROM estate_property_ownership').all().filter(r=>r.acct!==treasury).map(r=>({acct:r.acct,shareUnits:Number(r.share_units)}));
 }
 async function runMonthly(){
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  const cadence=cfg.harvestCadence||'monthly';
  const open=db.prepare("SELECT period FROM estate_mp_harvests WHERE state IN ('withdrawn','split') ORDER BY period").get();
  // Never harvest a period that ended before the plan's first deposit existed.
  const first=db.prepare('SELECT MIN(created) t FROM estate_mp_deposits').get().t;
  if(!first)return {ok:true,state:'not_due'};
  const baseline=P.periodBaseline(first,cadence);
  const last=L.lastPeriod();
  const effective=last&&P.periodEndUtc(last).getTime()>P.periodEndUtc(baseline).getTime()?last:baseline;
  const period=open?.period||P.duePeriod(effective,now(),cadence);
  if(!period)return {ok:true,state:'not_due'};
  let h=L.harvest(period);
  if(!h){
   const pl=await pool();const onLedger=await lpBalance(pl.lpCurrency);
   const plan=P.harvestPlan({trackedLp:L.trackedLp(),onLedgerLp:onLedger,principalK:L.principalK(),pool:pl,
    minValueRlusd:cadence==='daily'?cfg.dust:undefined});
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
     if(!/^tec/.test(e.result||''))throw e; // validated tec (e.g. no trust line): carry it forward to the next period
     const c=L.carry(),k=p.currency==='IMG'?'img':'rlusd';c[p.acct]=c[p.acct]||{img:'0',rlusd:'0'};c[p.acct][k]=new N(c[p.acct][k]).plus(p.amount).toFixed();
     db.exec('BEGIN');L.setCarry(c);T("UPDATE estate_mp_payouts SET state='carried' WHERE period=? AND acct=? AND currency=?",period,p.acct,p.currency);db.exec('COMMIT');
    }
   }
   T("UPDATE estate_mp_harvests SET state='paid',updated=? WHERE period=?",now(),period);
  }
  return {ok:true,period,state:'paid',...JSON.parse(L.harvest(period).split_json||'{}')};
 }
 // ---- policy v4: IMG/PLX and IMG/XRP two-sided deposits (auto-compounding, never withdrawn) ----
 const PLX=v4?{currency:v4.plxCurrency,issuer:v4.plxIssuer}:null;
 async function ammPair(other,expected){
  const a=(await client.request({command:'amm_info',asset:IMG,asset2:other,ledger_index:'validated'})).result.amm;
  if(!a||a.account!==expected)throw Error('pool_account_mismatch');if(a.asset_frozen||a.asset2_frozen)throw Error('pool_frozen');
  const imgFirst=typeof a.amount==='object'&&a.amount.currency===IMG.currency&&a.amount.issuer===IMG.issuer;
  const o=imgFirst?a.amount2:a.amount,i=imgFirst?a.amount:a.amount2;
  return {poolImg:i.value,poolOther:typeof o==='string'?new N(o).div(1e6).toFixed():o.value,lpCurrency:a.lp_token.currency,account:a.account};
 }
 const v4Fee=r=>BigInt((r.tx_json||r).Fee||'0');
 async function processV4Deposit(row){
  const isPlx=row.pair==='img-plx',poolAcct=isPlx?V.IMG_PLX_POOL:V.IMG_XRP_POOL,other=isPlx?PLX:XRP;
  let c=row.chunk_json?JSON.parse(row.chunk_json):null;
  if(!c){
   if(BigInt(row.xrp_remaining_drops)>0n){
    const [xi,xo,pl]=await Promise.all([xrpPool(xrpImgAsset),isPlx?xrpPool(PLX):null,ammPair(other,poolAcct)]);
    let cap=BigInt(cfg.maxDepositDrops),legs,qi,qo;
    for(;;){
     legs=P.depositLegs(row.xrp_remaining_drops,{...cfg,maxDepositDrops:cap.toString()});
     qi=P.quoteSwap({amountIn:legs.imgLegDrops,poolIn:xi.drops,poolOut:xi.tokens,tradingFee:xi.tradingFee});
     qo=isPlx?P.quoteSwap({amountIn:legs.rlusdLegDrops,poolIn:xo.drops,poolOut:xo.tokens,tradingFee:xo.tradingFee}):null;
     if((qi.impactBps<=cfg.maxPriceImpactBps&&(!qo||qo.impactBps<=cfg.maxPriceImpactBps))||cap/2n<BigInt(cfg.minSwapDrops)*2n)break;
     cap/=2n;
    }
    if(BigInt(legs.imgLegDrops)<BigInt(cfg.minSwapDrops))return v4Note(row,'below_min_swap');
    if(await spendableDrops()<BigInt(legs.spendDrops))return v4Note(row,'insufficient_xrp');
    if(qi.impactBps>cfg.maxPriceImpactBps)return v4Note(row,'guard:price_impact_img_leg');
    if(qo&&qo.impactBps>cfg.maxPriceImpactBps)return v4Note(row,'guard:price_impact_plx_leg');
    // Pool price (other per IMG) vs. the XRP-market reference.
    const ref=isPlx?qo.spot.div(qi.spot):new N(1).div(qi.spot).div(1e6),poolPx=new N(pl.poolOther).div(pl.poolImg);
    if(P.poolDeviationBps(poolPx,ref)>cfg.maxPoolDeviationBps)return v4Note(row,'guard:pool_price_deviation');
    c={seq:Number(db.prepare('SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE ?').get(row.id+':%:amm').n),legs,
     imgMin:P.fx(P.minOut(qi.out,cfg)).toFixed(),plxMin:qo?P.fx(P.minOut(qo.out,cfg)).toFixed():null,done:{}};
   }else{
    if(!(new N(row.held_img).gt(0)&&(isPlx?new N(row.held_plx).gt(0):BigInt(row.held_xrp_drops)>0n)))return v4Finish(row);
    c={seq:Number(db.prepare('SELECT COUNT(*) n FROM estate_mp_txs WHERE step LIKE ?').get(row.id+':%:amm').n),legs:null,done:{img:true,other:true}};
   }
   VL.update(row.id,{chunk_json:JSON.stringify(c),note:null});
  }
  const id=row.id+':'+c.seq;let cur=VL.get(row.id);
  if(!c.done.other){
   if(isPlx){
    const r=await send(id+':plx',{TransactionType:'Payment',Destination:treasury,Amount:iou(PLX,c.plxMin),SendMax:c.legs.rlusdLegDrops},{v4:true});
    VL.update(row.id,{held_plx:new N(cur.held_plx).plus(tokenDelta(r,PLX)).toFixed(),xrp_remaining_drops:(BigInt(cur.xrp_remaining_drops)-BigInt(c.legs.rlusdLegDrops)).toString()});
   }else{ // IMG/XRP: the XRP half is kept (still protected cash) for the deposit
    VL.update(row.id,{held_xrp_drops:(BigInt(cur.held_xrp_drops)+BigInt(c.legs.rlusdLegDrops)).toString(),xrp_remaining_drops:(BigInt(cur.xrp_remaining_drops)-BigInt(c.legs.rlusdLegDrops)).toString()});
   }
   c.done.other=true;VL.update(row.id,{chunk_json:JSON.stringify(c)});cur=VL.get(row.id);
  }
  if(!c.done.img){
   const r=await send(id+':img',{TransactionType:'Payment',Destination:treasury,Amount:iou(IMG,c.imgMin),SendMax:c.legs.imgLegDrops},{v4:true});
   c.done.img=true;VL.update(row.id,{chunk_json:JSON.stringify(c),held_img:new N(cur.held_img).plus(tokenDelta(r,IMG)).toFixed(),
    xrp_remaining_drops:(BigInt(cur.xrp_remaining_drops)-BigInt(c.legs.imgLegDrops)).toString()});
   cur=VL.get(row.id);
  }
  if(!c.done.amm){
   if(paused())return v4Note(cur,'treasury_paused');
   const pl=await ammPair(other,poolAcct);
   if(!c.amounts){
    const heldOther=isPlx?cur.held_plx:new N(cur.held_xrp_drops).div(1e6).toFixed();
    const a=P.ratioDeposit({heldImg:cur.held_img,heldRlusd:heldOther,poolImg:pl.poolImg,poolRlusd:pl.poolOther});
    c.amounts={img:a.img,other:isPlx?a.rlusd:new N(a.rlusd).times(1e6).integerValue(N.ROUND_DOWN).toFixed()};
    VL.update(row.id,{chunk_json:JSON.stringify(c)});
   }
   const r=await send(id+':amm',{TransactionType:'AMMDeposit',Asset:IMG,Asset2:isPlx?PLX:XRP,Amount:iou(IMG,c.amounts.img),
    Amount2:isPlx?iou(PLX,c.amounts.other):c.amounts.other,Flags:P.TF.twoAsset},{v4:true});
   const dImg=tokenDelta(r,IMG).negated(),lp=tokenDelta(r,{currency:pl.lpCurrency,issuer:poolAcct});
   const dOther=isPlx?tokenDelta(r,PLX).negated():tokenDelta(r,XRP).negated().minus(v4Fee(r).toString()); // XRP delta includes the fee
   if(!dImg.gt(0)||!dOther.gt(0)||!lp.gt(0))throw Error('deposit_not_two_sided');
   c.done.amm=true;
   VL.update(row.id,{chunk_json:null,held_img:new N(cur.held_img).minus(dImg).toFixed(),
    ...(isPlx?{held_plx:new N(cur.held_plx).minus(dOther).toFixed()}:{held_xrp_drops:(BigInt(cur.held_xrp_drops)-BigInt(dOther.toFixed(0))).toString()}),
    img_in:new N(cur.img_in).plus(dImg).toFixed(),counter_in:new N(cur.counter_in).plus(isPlx?dOther:dOther.div(1e6)).toFixed(),lp_out:new N(cur.lp_out).plus(lp).toFixed()});
  }
  return v4Finish(VL.get(row.id));
 }
 function v4Note(row,n){VL.update(row.id,{note:n});log('v4_deposit_held',{id:row.id,note:n});return {id:row.id,held:n};}
 function v4Finish(row){
  if(BigInt(row.xrp_remaining_drops)>=BigInt(cfg.minSwapDrops)*2n)return {id:row.id,state:'queued',remaining:row.xrp_remaining_drops};
  VL.update(row.id,{state:'deposited',note:null});return {id:row.id,state:'deposited'};
 }
 let v4Running=false;
 async function processV4Deposits(){
  if(!v4On)return {ok:false,error:'policy_v4_disabled'};
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  syncPurchases();if(v4Running)return {ok:false,error:'deposit_run_in_progress'};
  v4Running=true;const out=[];
  try{for(const row of VL.queued())out.push(await processV4Deposit(row));}finally{v4Running=false;}
  return {ok:true,results:out};
 }
 // ---- policy v4: Pollux hourly IMG rewards -> 3.22% burn -> holders ----
 // Source of truth: the existing validated-ledger scanner's closed hourly batches and per-owner
 // entitlements (ownership at receipt time). Only hours at or after the v4 start are paid here.
 function polluxStart(){
  return Math.min(VL.program()?.started_ms??Infinity,ML.get()?.completed||Infinity);
 }
 async function runPolluxXrp(){
  if(!enabled||!v4On||!v4.polluxPayoutsEnabled)return;
  const from=polluxStart();
  if(Number.isFinite(from))await polluxXrp.run(from,v4.maxPayoutsPerRun,v4.burnBps);
 }
 function polluxRewards(owner){
  if(!owner)return polluxXrp.status();
  return {
   imgCreditUnits:VL.carry(owner).toString(),
   imgPayments:db.prepare('SELECT epoch_start_ms,amount_units,state,tx_hash FROM estate_px_payouts WHERE acct=? ORDER BY epoch_start_ms DESC LIMIT 20').all(owner),
   xrp:polluxXrp.status(owner)
  };
 }
 async function runPolluxPayouts(){
  if(!v4On||!v4.polluxPayoutsEnabled)return {ok:false,error:'pollux_payouts_disabled'};
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  const from=polluxStart();
  if(!Number.isFinite(from))return {ok:false,error:'policy_v4_not_started'};
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_img_hourly_batches'").get())return {ok:false,error:'pollux_accounting_missing'};
  let h=db.prepare("SELECT * FROM estate_px_hours WHERE state='split' ORDER BY epoch_start_ms").get();
  if(!h){
   const b=db.prepare('SELECT epoch_start_ms,total_units FROM estate_img_hourly_batches b WHERE epoch_start_ms>=? AND NOT EXISTS(SELECT 1 FROM estate_px_hours p WHERE p.epoch_start_ms=b.epoch_start_ms) ORDER BY epoch_start_ms LIMIT 1').get(Math.floor(from/3600e3)*3600e3);
   if(!b)return {ok:true,state:'not_due'};
   const ent=db.prepare('SELECT owner,amount_units FROM estate_img_hourly_entitlements WHERE epoch_start_ms=? ORDER BY owner').all(b.epoch_start_ms);
   const sp=V.splitPolluxHour({entitlements:ent,burnBps:v4.burnBps});
   if(sp.totalUnits!==BigInt(b.total_units))throw Error('pollux_entitlement_total_mismatch');
   const dust=BigInt(new N(v4.dustImg).times(1e6).toFixed(0));
   db.exec('BEGIN');
   try{
    db.prepare("INSERT INTO estate_px_hours VALUES(?,?,?,'split',?,?)").run(b.epoch_start_ms,sp.totalUnits.toString(),sp.burnUnits.toString(),now(),now());
    for(const p of sp.payouts){
     if(p.acct===treasury||p.acct===cfg.imgIssuer)continue;
     const amt=p.units+VL.carry(p.acct);
     if(amt<dust){VL.setCarry(p.acct,amt);continue;}
     VL.setCarry(p.acct,0n);db.prepare("INSERT INTO estate_px_payouts VALUES(?,?,?,'pending',NULL)").run(b.epoch_start_ms,p.acct,amt.toString());
    }
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   h=db.prepare('SELECT * FROM estate_px_hours WHERE epoch_start_ms=?').get(b.epoch_start_ms);
  }
  const hour=h.epoch_start_ms;
  if(db.prepare('SELECT 1 FROM estate_mp_txs WHERE step=?').get(`px:${hour}:burn`))await send(`px:${hour}:burn`,{TransactionType:'Payment',Destination:cfg.imgIssuer,Amount:iou(IMG,V.micro(h.burn_units))},{v4:true});
  const holders=new Set(db.prepare('SELECT acct FROM estate_px_payouts WHERE epoch_start_ms=?').all(hour).map(r=>r.acct));
  let sent=0;
  for(const p of db.prepare("SELECT * FROM estate_px_payouts WHERE epoch_start_ms=? AND state='pending' ORDER BY acct").all(hour)){
   if(paused())return {ok:false,error:'treasury_paused'};
   if(sent++>=v4.maxPayoutsPerRun)return {ok:true,hour,state:'paying'};
   try{
    const r=await send(`px:${hour}:pay:${p.acct}`,{TransactionType:'Payment',Destination:p.acct,Amount:iou(IMG,V.micro(p.amount_units))},{v4:true,holders});
    const proof=r.meta?.delivered_amount;
    if(proof&&(proof.currency!==IMG.currency||proof.issuer!==IMG.issuer||!value(proof.value).eq(V.micro(p.amount_units))))throw Error('pollux_img_delivery_proof');
    db.prepare("UPDATE estate_px_payouts SET state='paid',tx_hash=? WHERE epoch_start_ms=? AND acct=?").run(r.hash||r.tx_json?.hash,hour,p.acct);
   }catch(e){
    if(!/^tec/.test(e.result||''))throw e; // e.g. no IMG trust line: carry to a later hour
    db.exec('BEGIN');VL.setCarry(p.acct,VL.carry(p.acct)+BigInt(p.amount_units));db.prepare("UPDATE estate_px_payouts SET state='carried' WHERE epoch_start_ms=? AND acct=?").run(hour,p.acct);db.exec('COMMIT');
   }
  }
  db.prepare("UPDATE estate_px_hours SET state='paid',updated=? WHERE epoch_start_ms=?").run(now(),hour);
  return {ok:true,hour,state:'paid',burnUnits:h.burn_units,totalUnits:h.total_units};
 }
 // Reserve IMG as hours settle. XRP fallback receipts reserve the same percentage in drops.
 // Convert only the XRP earmarked for the burn, then retire the IMG actually delivered.
 async function runPolluxBurns(){
  if(!enabled||!v4On||!v4.polluxPayoutsEnabled||paused())return;
  const reserved=()=>BigInt(require('./estate-liquidity-runtime').estateCashReserve(db));
  const burnSend=async(step,tx)=>{
   try{return await send(step,tx,{v4:true,polluxBurn:true});}
   catch(e){
    const job=db.prepare('SELECT state,result FROM estate_mp_txs WHERE step=?').get(step);
    if(job?.state==='failed'&&/^(expired|tefPAST_SEQ|tefMAX_LEDGER)$/.test(job.result)){
     db.prepare("DELETE FROM estate_mp_txs WHERE step=? AND state='failed'").run(step);
    }
    throw e;
   }
  };
  for(const asset of ['IMG','XRP']){
   if(paused())return;
   let batch=db.prepare("SELECT * FROM estate_pollux_burn_batches WHERE asset=? AND state='pending'").get(asset);
   if(!batch){
    const completed=db.prepare("SELECT budget,xrp_spent FROM estate_pollux_burn_batches WHERE asset=? AND state!='pending'").all(asset);
    let budget;
    if(asset==='IMG'){
     const due=db.prepare(`SELECT h.burn_units FROM estate_px_hours h WHERE NOT EXISTS (
      SELECT 1 FROM estate_mp_txs t WHERE t.step='px:'||h.epoch_start_ms||':burn')`).all();
     budget=due.reduce((n,r)=>n+BigInt(r.burn_units),0n)-completed.reduce((n,r)=>n+BigInt(r.budget),0n);
     if(budget<1000000n)continue;
     const ref=await xrpPool(IMG);
     const proceeds=P.quoteSwap({amountIn:V.micro(budget),poolIn:ref.tokens,poolOut:ref.drops,tradingFee:ref.tradingFee});
     if(proceeds.out.lt(1000))continue; // at least ten times the maximum signed fee
     const id=T("INSERT INTO estate_pollux_burn_batches(asset,budget,img_units,state) VALUES(?,?,?,'pending')",asset,String(budget),String(budget)).lastInsertRowid;
     batch=db.prepare('SELECT * FROM estate_pollux_burn_batches WHERE id=?').get(id);
    }else{
     const credit=db.prepare('SELECT fractional_bps FROM estate_pollux_xrp_burn_credit WHERE id=1').get()?.fractional_bps||'0';
     budget=BigInt(credit)/10000n-completed.reduce((n,r)=>n+BigInt(r.xrp_spent),0n);
     if(budget<10000n)continue;
     const ref=await xrpPool(IMG);
     let cap=budget-200n,quote;
     for(;;){
      quote=P.quoteSwap({amountIn:String(cap),poolIn:ref.drops,poolOut:ref.tokens,tradingFee:ref.tradingFee});
      if(quote.impactBps<=cfg.maxPriceImpactBps||cap<9800n)break;
      cap/=2n;
     }
     const minimum=V.fx(P.minOut(quote.out,cfg));
     if(cap<9800n||minimum.lt(1))continue;
     const id=T("INSERT INTO estate_pollux_burn_batches(asset,budget,min_img,spend_max,state) VALUES(?,?,?,?,'pending')",
      asset,String(cap+200n),minimum.toFixed(),String(cap)).lastInsertRowid;
     batch=db.prepare('SELECT * FROM estate_pollux_burn_batches WHERE id=?').get(id);
    }
   }
   const step='px-burn:'+batch.id;
   if(asset==='XRP'&&!batch.img_units){
    if(!db.prepare('SELECT 1 FROM estate_mp_txs WHERE step=?').get(step+':convert')&&await spendableDrops()<reserved())return;
    let r;
    try{
     r=await burnSend(step+':convert',{TransactionType:'Payment',Destination:treasury,Amount:iou(IMG,batch.min_img),SendMax:batch.spend_max});
    }catch(e){
     const job=db.prepare('SELECT hash,result FROM estate_mp_txs WHERE step=?').get(step+':convert');
     if(!/^tec/.test(job?.result||''))throw e;
     const proof=await lookup(job.hash),fee=BigInt((proof?.tx_json||proof)?.Fee||0);
     if(!proof?.validated||proof.meta?.TransactionResult!==job.result||fee<1n||fee>100n)throw e;
     T("UPDATE estate_pollux_burn_batches SET state='failed',xrp_spent=? WHERE id=?",String(fee),batch.id);
     return; // Requote the remaining burn reserve on the next pass.
    }
    const fee=BigInt((r.tx_json||r).Fee);
    const spend=BigInt(xrpMovement(r,treasury).negated().toFixed(0));
    const delivered=r.meta?.delivered_amount;
    if(spend<=0n||spend>BigInt(batch.spend_max)||!delivered||delivered.currency!==IMG.currency||delivered.issuer!==IMG.issuer||
       value(delivered.value).lt(batch.min_img)||fee<1n||fee>100n)throw Error('pollux_burn_swap_proof');
    const units=BigInt(V.fx(delivered.value).times(1e6).toFixed(0));
    T('UPDATE estate_pollux_burn_batches SET img_units=?,xrp_spent=? WHERE id=?',String(units),String(spend+fee),batch.id);
    batch=db.prepare('SELECT * FROM estate_pollux_burn_batches WHERE id=?').get(batch.id);
   }
   if(!db.prepare('SELECT 1 FROM estate_mp_txs WHERE step=?').get(step+':retire')&&
      await spendableDrops()<reserved()+(asset==='IMG'?100n:0n))return;
   const r=await burnSend(step+':retire',{TransactionType:'Payment',Destination:cfg.imgIssuer,Amount:iou(IMG,V.micro(batch.img_units))});
   const fee=BigInt((r.tx_json||r).Fee),delivery=r.meta?.delivered_amount;
   if(fee<1n||fee>100n||delivery?.currency!==IMG.currency||delivery.issuer!==IMG.issuer||
      !value(delivery.value).eq(V.micro(batch.img_units)))throw Error('pollux_burn_delivery_proof');
   const spent=BigInt(batch.xrp_spent)+(asset==='XRP'?fee:0n);
   T("UPDATE estate_pollux_burn_batches SET state='burned',xrp_spent=? WHERE id=?",String(spent),batch.id);
  }
 }
 // ---- one-shot IMG/RLUSD -> IMG/PLX migration (operator decision t422s1646; OFF unless mig.enabled + confirm) ----
 // A tef* rejection never applies on ledger (e.g. another treasury tx took the sequence), so that
 // single step may be re-signed; every other failure stops for operator review.
 async function migSend(step,tx,ctx){
  for(let i=0;;i++){
   try{return await send(step,tx,{...ctx,migration:true});}
   catch(e){const m=/^step_(rejected|failed):.*:(tefPAST_SEQ|tefMAX_LEDGER|terPRE_SEQ)$/.exec(e.message||'');
    if(!m||i>=3)throw e;
    db.prepare("DELETE FROM estate_mp_txs WHERE step=? AND state='failed' AND result IN ('tefPAST_SEQ','tefMAX_LEDGER','terPRE_SEQ')").run(step);}
  }
 }
 async function runPlxMigration({confirm}={}){
  if(!mig||!mig.enabled)return {ok:false,error:'migration_disabled'};
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  const PLXA={currency:'PLX',issuer:mig.plxIssuer||V.PLX_ISSUER};
  let st=await M.readLiveState(client,treasury,{imgIssuer:cfg.imgIssuer,plxIssuer:PLXA.issuer});
  let row=ML.get();
  if(row?.state==='completed')return {ok:true,state:'completed',lpOut:row.lp_out};
  if(st.treasury.plx===null)return {ok:false,error:'plx_trustline_required'};
  if(!row){
   const lp=M.targetLp(st.treasury.imgRlusdLp,mig),expected=M.confirmToken(lp);
   if(confirm!==expected)return {ok:false,error:'confirm_mismatch',expected};
   ML.start({confirm,lpTarget:lp,onLedgerLp:st.treasury.imgRlusdLp,trackedLp:L.trackedLp(),principalK:L.principalK()},now());
   log('migration_started',{lp,onLedgerLp:st.treasury.imgRlusdLp});row=ML.get();
  }else if(confirm!==row.confirm)return {ok:false,error:'confirm_mismatch',expected:row.confirm};
  if(row.state==='planned'){
   const r=await migSend('mig:v1:withdraw',{TransactionType:'AMMWithdraw',Asset:IMG,Asset2:RL,
    LPTokenIn:{currency:st.imgRl.lpCurrency,issuer:cfg.poolAccount,value:row.lp_target},Flags:P.TF.lpToken},{maxLpIn:row.lp_target});
   const img=P.fx(tokenDelta(r,IMG)),rl=P.fx(tokenDelta(r,RL));
   ML.update({state:'withdrawn',lp_in:tokenDelta(r,{currency:st.imgRl.lpCurrency,issuer:cfg.poolAccount}).negated().toFixed(),img_out:img.toFixed(),rlusd_out:rl.toFixed(),
    rlusd_left:rl.toFixed(),img_held:img.toFixed()},now());
   row=ML.get();st=await M.readLiveState(client,treasury,{imgIssuer:cfg.imgIssuer,plxIssuer:PLXA.issuer});
  }
  if(row.state==='withdrawn'){
   const chunks=JSON.parse(row.chunks_json);
   for(let guard=0;guard<200;guard++){
    if(paused())return {ok:false,error:'treasury_paused'};
    row=ML.get();
    let c=chunks.find(x=>!x.done&&!x.failed);
    if(!c){
     if(new N(row.rlusd_left).lt(mig.minRlusd)&&BigInt(row.xrp_held_drops)<200000n)break;
     if(new N(row.rlusd_left).lt(mig.minRlusd)){ // leftover mid-route XRP -> PLX
      const x=new N(row.xrp_held_drops).div(1e6),qq=P.quoteSwap({amountIn:x.toFixed(),poolIn:st.plxXrp.XRP,poolOut:st.plxXrp.PLX,tradingFee:st.plxXrp.fee});
      c={i:chunks.length,route:'xrp_rest',rlusdIn:'0',xrpMin:null,plxMin:P.fx(P.minOut(qq.out,cfg)).toFixed(),sendXrp:row.xrp_held_drops,done:false};
     }else{
      const {rl,quote}=M.chunkFor(row.rlusd_left,st,cfg,mig);
      if(quote.impactBps>cfg.maxPriceImpactBps)return {ok:false,error:'guard:conversion_price_impact',impactBps:quote.impactBps};
      c={i:chunks.length,route:quote.route,rlusdIn:rl,xrpMin:quote.xrpMin?quote.xrpMin.toFixed():null,plxMin:quote.plxMin.toFixed(),done:false};
     }
     chunks.push(c);ML.update({chunks_json:JSON.stringify(chunks)},now());
    }
    try{
     if(c.route==='direct'){
      const r=await migSend(`mig:v1:conv:${c.i}:plx`,{TransactionType:'Payment',Destination:treasury,Amount:iou(PLXA,c.plxMin),SendMax:iou(RL,c.rlusdIn)},{});
      const spent=tokenDelta(r,RL).negated(),got=tokenDelta(r,PLXA);
      c.done=true;c.rlusdSpent=spent.toFixed();c.plxGot=got.toFixed();
      ML.update({chunks_json:JSON.stringify(chunks),rlusd_left:new N(row.rlusd_left).minus(spent).toFixed(),plx_held:new N(row.plx_held).plus(got).toFixed(),plx_bought:new N(row.plx_bought).plus(got).toFixed()},now());
     }else{
      if(c.route==='via_xrp'&&!c.hop1){
       const xrpDrops=new N(c.xrpMin).times(1e6).integerValue(N.ROUND_DOWN).toFixed();
       const r=await migSend(`mig:v1:conv:${c.i}:xrp`,{TransactionType:'Payment',Destination:treasury,Amount:xrpDrops,SendMax:iou(RL,c.rlusdIn)},{});
       const spent=tokenDelta(r,RL).negated();c.hop1=true;c.rlusdSpent=spent.toFixed();c.xrpGotDrops=xrpDrops;
       ML.update({chunks_json:JSON.stringify(chunks),rlusd_left:new N(row.rlusd_left).minus(spent).toFixed(),xrp_held_drops:(BigInt(row.xrp_held_drops)+BigInt(xrpDrops)).toString()},now());
       row=ML.get();st=await M.readLiveState(client,treasury,{imgIssuer:cfg.imgIssuer,plxIssuer:PLXA.issuer});
       const qq=P.quoteSwap({amountIn:new N(row.xrp_held_drops).div(1e6).toFixed(),poolIn:st.plxXrp.XRP,poolOut:st.plxXrp.PLX,tradingFee:st.plxXrp.fee});
       c.sendXrp=row.xrp_held_drops;c.plxMin=P.fx(P.minOut(qq.out,cfg)).toFixed();ML.update({chunks_json:JSON.stringify(chunks)},now());
      }
      const r=await migSend(`mig:v1:conv:${c.i}:plx`,{TransactionType:'Payment',Destination:treasury,Amount:iou(PLXA,c.plxMin),SendMax:c.sendXrp},{});
      const fee=BigInt((r.tx_json||r).Fee||'12'),spentDrops=BigInt(tokenDelta(r,XRP).negated().toFixed(0))-fee,got=tokenDelta(r,PLXA);
      row=ML.get();c.done=true;c.plxGot=got.toFixed();c.xrpSpentDrops=spentDrops.toString();
      const left=BigInt(row.xrp_held_drops)-spentDrops;
      ML.update({chunks_json:JSON.stringify(chunks),xrp_held_drops:(left>0n?left:0n).toString(),plx_held:new N(row.plx_held).plus(got).toFixed(),plx_bought:new N(row.plx_bought).plus(got).toFixed()},now());
     }
    }catch(e){
     if(!/^tec/.test(e.result||''))throw e; // validated tec (price moved past the floor): nothing spent; requote a new chunk
     c.failed=e.result;ML.update({chunks_json:JSON.stringify(chunks),note:'chunk_'+c.i+':'+e.result},now());
     if(chunks.filter(x=>x.failed).length>=3)return {ok:false,error:'conversion_failed_repeatedly'};
    }
    st=await M.readLiveState(client,treasury,{imgIssuer:cfg.imgIssuer,plxIssuer:PLXA.issuer});
   }
   row=ML.get();
   if(new N(row.rlusd_left).gte(mig.minRlusd))return {ok:true,state:'converting',rlusdLeft:row.rlusd_left};
   ML.update({state:'converted'},now());row=ML.get();
  }
  if(row.state==='converted'){
   st=await M.readLiveState(client,treasury,{imgIssuer:cfg.imgIssuer,plxIssuer:PLXA.issuer});
   const ref=M.refPlxPerImg(st),poolPx=new N(st.imgPlx.PLX).div(st.imgPlx.IMG),dev=P.poolDeviationBps(poolPx,ref);
   if(dev>cfg.maxPoolDeviationBps){ML.update({note:'guard:pool_price_deviation:'+dev},now());return {ok:false,error:'guard:pool_price_deviation',deviationBps:dev};}
   const a=P.ratioDeposit({heldImg:row.img_held,heldRlusd:row.plx_held,poolImg:st.imgPlx.IMG,poolRlusd:st.imgPlx.PLX});
   const r=await migSend('mig:v1:deposit',{TransactionType:'AMMDeposit',Asset:IMG,Asset2:PLXA,Amount:iou(IMG,a.img),Amount2:iou(PLXA,a.rlusd),Flags:P.TF.twoAsset},{});
   const dImg=tokenDelta(r,IMG).negated(),dPlx=tokenDelta(r,PLXA).negated(),lp=tokenDelta(r,{currency:st.imgPlx.lpCurrency,issuer:V.IMG_PLX_POOL});
   if(!dImg.gt(0)||!dPlx.gt(0)||!lp.gt(0))throw Error('deposit_not_two_sided');
   ML.update({state:'completed',img_dep:dImg.toFixed(),plx_dep:dPlx.toFixed(),lp_out:lp.toFixed(),img_held:new N(row.img_held).minus(dImg).toFixed(),
    plx_held:new N(row.plx_held).minus(dPlx).toFixed(),completed:now(),note:null},now());
   log('migration_completed',{lpOut:lp.toFixed(),img:dImg.toFixed(),plx:dPlx.toFixed()});
  }
  const f=ML.get();
  return {ok:true,state:f.state,lpIn:f.lp_in,imgOut:f.img_out,rlusdOut:f.rlusd_out,plxBought:f.plx_bought,imgDeposited:f.img_dep,plxDeposited:f.plx_dep,lpOut:f.lp_out,
   residual:{img:f.img_held,plx:f.plx_held,rlusd:f.rlusd_left,xrpDrops:f.xrp_held_drops}};
 }
 function migrationStatus(){const f=ML.get();return f?{state:f.state,lpIn:f.lp_in,imgPlxLp:f.lp_out,completedMs:f.completed||null,
  residual:{img:f.img_held,plx:f.plx_held,rlusd:f.rlusd_left}}:null;}
 function v4Status(){const p=VL.program();return {enabled:v4On,polluxPayoutsEnabled:!!(v4On&&v4.polluxPayoutsEnabled),
  polluxXrp:polluxXrp.status(),
  splitBps:v4?{imgPlx:v4.plxBps,imgXrp:v4.xrpBps,imgRlusd:v4.rlusdBps}:null,burnBps:v4?.burnBps??null,autoCompound:true,startedMs:p?.started_ms||null,totals:VL.totals()};}
 function status(){
  return {policyV4:v4Status(),plxMigration:migrationStatus(),policy:P.POLICY,enabled,cadence:cfg.harvestCadence||'monthly',poolAccount:cfg.poolAccount||null,principalK:L.principalK(),trackedLp:L.trackedLp(),
   queuedDeposits:L.queued().length,pendingXrpDrops:L.pendingXrpDrops(),lastHarvestPeriod:L.lastPeriod(),payoutCurrencies:['IMG','RLUSD'],dustRlusd:cfg.dust};
 }
 return {processDeposits,runMonthly,runPlxMigration,processV4Deposits,runPolluxPayouts,runPolluxXrp,runPolluxBurns,polluxRewards,v4QueuedCount:()=>VL.queued().length,status,syncPurchases,queuedCount:()=>L.queued().length,ledger:L,_send:send};
}
module.exports={createEstateMonthlyExecutor};
