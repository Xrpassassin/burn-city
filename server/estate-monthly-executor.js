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
 xrpRlusdAsset,xrpImgAsset,now=()=>Date.now(),pollMs=1000,pollTries=30,log=()=>{},drip=null,v4=null}){
 const L=P.createEstateMonthlyLedger(db);
 const D=require('./estate-hourly-drip');const HL=D.createEstateHourlyDripLedger(db);
 const V=require('./estate-v4-plan');const VL=V.createEstateV4Ledger(db);
 const v4On=!!(v4&&v4.enabled);
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
  if(ctx.v4)V.assertSafeV4Transaction(filled,{treasury,imgIssuer:cfg.imgIssuer,imgCurrency:cfg.imgCurrency,plxIssuer:v4.plxIssuer,rlusdPool:cfg.poolAccount,holders:ctx.holders});
  else P.assertSafeTransaction(filled,{...ctxBase,...ctx});
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
 async function runPolluxPayouts(){
  if(!v4On||!v4.polluxPayoutsEnabled)return {ok:false,error:'pollux_payouts_disabled'};
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  const prog=VL.program();if(!prog)return {ok:false,error:'policy_v4_not_started'};
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_img_hourly_batches'").get())return {ok:false,error:'pollux_accounting_missing'};
  let h=db.prepare("SELECT * FROM estate_px_hours WHERE state='split' ORDER BY epoch_start_ms").get();
  if(!h){
   const b=db.prepare('SELECT epoch_start_ms,total_units FROM estate_img_hourly_batches b WHERE epoch_start_ms>=? AND NOT EXISTS(SELECT 1 FROM estate_px_hours p WHERE p.epoch_start_ms=b.epoch_start_ms) ORDER BY epoch_start_ms LIMIT 1').get(Math.floor(prog.started_ms/3600e3)*3600e3);
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
  if(BigInt(h.burn_units)>0n)await send(`px:${hour}:burn`,{TransactionType:'Payment',Destination:cfg.imgIssuer,Amount:iou(IMG,V.micro(h.burn_units))},{v4:true});
  const holders=new Set(db.prepare('SELECT acct FROM estate_px_payouts WHERE epoch_start_ms=?').all(hour).map(r=>r.acct));
  let sent=0;
  for(const p of db.prepare("SELECT * FROM estate_px_payouts WHERE epoch_start_ms=? AND state='pending' ORDER BY acct").all(hour)){
   if(paused())return {ok:false,error:'treasury_paused'};
   if(sent++>=v4.maxPayoutsPerRun)return {ok:true,hour,state:'paying'};
   try{
    const r=await send(`px:${hour}:pay:${p.acct}`,{TransactionType:'Payment',Destination:p.acct,Amount:iou(IMG,V.micro(p.amount_units))},{v4:true,holders});
    db.prepare("UPDATE estate_px_payouts SET state='paid',tx_hash=? WHERE epoch_start_ms=? AND acct=?").run(r.hash||r.tx_json?.hash,hour,p.acct);
   }catch(e){
    if(!/^tec/.test(e.result||''))throw e; // e.g. no IMG trust line: carry to a later hour
    db.exec('BEGIN');VL.setCarry(p.acct,VL.carry(p.acct)+BigInt(p.amount_units));db.prepare("UPDATE estate_px_payouts SET state='carried' WHERE epoch_start_ms=? AND acct=?").run(hour,p.acct);db.exec('COMMIT');
   }
  }
  db.prepare("UPDATE estate_px_hours SET state='paid',updated=? WHERE epoch_start_ms=?").run(now(),hour);
  return {ok:true,hour,state:'paid',burnUnits:h.burn_units,totalUnits:h.total_units};
 }
 // ---- hourly holder drip (operator decision Nov 15, 2026; OFF unless drip.enabled) ----
 // One slice per UTC hour from a fixed LP budget: withdraw (proportional) -> burn IMG -> pay holders.
 // Same journal (estate_mp_txs), guard (assertSafeTransaction), pause and single-flight tick as the plan.
 async function runHourlyDrip(){
  if(!drip||!drip.enabled)return {ok:false,error:'hourly_drip_disabled'};
  if(!enabled)return {ok:false,error:'monthly_plan_disabled'};
  if(paused())return {ok:false,error:'treasury_paused'};
  let program=HL.program();
  if(!program){
   if(!drip.maxLp)return {ok:false,error:'hourly_drip_max_lp_required'};
   const pl=await pool();const onLedger=await lpBalance(pl.lpCurrency);
   const budgetLp=D.budgetFor({onLedgerLp:onLedger,budgetBps:drip.budgetBps,maxLp:drip.maxLp});
   if(!new N(budgetLp).gt(0))return {ok:false,error:'hourly_drip_no_lp'};
   HL.start({budgetLp,hours:drip.hours,burnBps:drip.burnBps,budgetBps:drip.budgetBps,maxLp:drip.maxLp,onLedgerLp:onLedger,
    trackedLp:L.trackedLp(),principalK:L.principalK(),rlusdPerImg:new N(pl.poolRlusd).div(pl.poolImg).precision(20,N.ROUND_DOWN).toFixed(),startedMs:now()});
   program=HL.program();log('drip_started',{budgetLp,hours:drip.hours,burnBps:drip.burnBps,onLedgerLp:onLedger});
  }
  let run=HL.open();
  if(!run){
   if(program.completed_ms)return {ok:true,state:'completed'};
   const hour=D.hourKey(now());
   if(HL.run(hour))return {ok:true,hour,state:'not_due'};
   const lp=D.sliceLp({budgetLp:program.budget_lp,hours:program.hours,withdrawnLp:HL.withdrawnLp(),slicesDone:HL.slicesDone()});
   if(!new N(lp).gt(0)){HL.complete(now());log('drip_completed',HL.totals());return {ok:true,state:'completed'};}
   const pl=await pool();const onLedger=await lpBalance(pl.lpCurrency);
   if(new N(lp).gt(onLedger))return {ok:false,hour,error:'hourly_drip_lp_short'};
   const r=await send(`hd:${hour}:withdraw`,{TransactionType:'AMMWithdraw',Asset:IMG,Asset2:RL,
    LPTokenIn:{currency:pl.lpCurrency,issuer:cfg.poolAccount,value:lp},Flags:P.TF.lpToken},{maxLpIn:lp});
   const lpIn=tokenDelta(r,{currency:pl.lpCurrency,issuer:cfg.poolAccount}).negated();
   T("INSERT INTO estate_hd_runs(hour,slice,state,lp_in,img_out,rlusd_out,split_json,created,updated) VALUES(?,?,'withdrawn',?,?,?,?,?,?)",
    hour,HL.slicesDone()+1,lpIn.toFixed(),P.fx(tokenDelta(r,IMG)).toFixed(),P.fx(tokenDelta(r,RL)).toFixed(),
    JSON.stringify({lp,rlusdPerImg:new N(pl.poolRlusd).div(pl.poolImg).precision(20,N.ROUND_DOWN).toFixed()}),now(),now());
   run=HL.run(hour);
  }
  const hour=run.hour;
  if(run.state==='withdrawn'){
   const split=D.splitSlice({img:run.img_out,rlusd:run.rlusd_out,burnBps:program.burn_bps});const meta=JSON.parse(run.split_json);
   if(new N(split.burnImg).gt(0))await send(`hd:${hour}:burn`,{TransactionType:'Payment',Destination:cfg.imgIssuer,Amount:iou(IMG,split.burnImg)});
   const alloc=P.allocateHolders({holdersImg:split.holdersImg,holdersRlusd:split.holdersRlusd,owners:owners(),carry:HL.carry(),rlusdPerImg:meta.rlusdPerImg,dust:drip.dust});
   db.exec('BEGIN');
   try{
    const ins=db.prepare("INSERT OR IGNORE INTO estate_hd_payouts(hour,acct,currency,amount,state) VALUES(?,?,?,?,'pending')");
    for(const p of alloc.payouts){if(new N(p.img).gt(0))ins.run(hour,p.acct,'IMG',p.img);if(new N(p.rlusd).gt(0))ins.run(hour,p.acct,'RLUSD',p.rlusd);}
    HL.setCarry(alloc.carry);
    T("UPDATE estate_hd_runs SET state='split',burn_img=?,split_json=?,updated=? WHERE hour=?",split.burnImg,JSON.stringify({...meta,split,payouts:alloc.payouts}),now(),hour);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   run=HL.run(hour);
  }
  if(run.state==='split'){
   const holders=new Set(db.prepare('SELECT acct FROM estate_hd_payouts WHERE hour=?').all(hour).map(r=>r.acct));
   let sent=0;
   for(const p of db.prepare("SELECT * FROM estate_hd_payouts WHERE hour=? AND state='pending' ORDER BY acct,currency").all(hour)){
    if(paused())return {ok:false,hour,error:'treasury_paused'};
    if(sent++>=drip.maxPayoutsPerRun)return {ok:true,hour,state:'paying'}; // per-run cap; the rest go next tick
    try{
     const r=await send(`hd:${hour}:pay:${p.acct}:${p.currency}`,{TransactionType:'Payment',Destination:p.acct,Amount:iou(p.currency==='IMG'?IMG:RL,p.amount)},{holders});
     T("UPDATE estate_hd_payouts SET state='paid',tx_hash=? WHERE hour=? AND acct=? AND currency=?",r.hash||r.tx_json?.hash,hour,p.acct,p.currency);
    }catch(e){
     if(!/^tec/.test(e.result||''))throw e; // validated tec (e.g. no trust line): carry to a later hour
     const c=HL.carry(),k=p.currency==='IMG'?'img':'rlusd';c[p.acct]=c[p.acct]||{img:'0',rlusd:'0'};c[p.acct][k]=new N(c[p.acct][k]).plus(p.amount).toFixed();
     db.exec('BEGIN');HL.setCarry(c);T("UPDATE estate_hd_payouts SET state='carried' WHERE hour=? AND acct=? AND currency=?",hour,p.acct,p.currency);db.exec('COMMIT');
    }
   }
   T("UPDATE estate_hd_runs SET state='paid',updated=? WHERE hour=?",now(),hour);
  }
  const done=HL.program();
  if(new N(done.budget_lp).minus(HL.withdrawnLp()).lte(0))HL.complete(now());
  return {ok:true,hour,state:'paid',...JSON.parse(HL.run(hour).split_json||'{}').split};
 }
 function dripStatus(){
  const p=HL.program();
  return {enabled:!!drip?.enabled,hoursConfigured:drip?.hours??null,burnBps:drip?.burnBps??null,budgetBps:drip?.budgetBps??null,dustRlusd:drip?.dust??null,
   program:p?{budgetLp:p.budget_lp,hours:p.hours,burnBps:p.burn_bps,startedMs:p.started_ms,completedMs:p.completed_ms||null,
    slicesDone:HL.slicesDone(),lpRemaining:new N(p.budget_lp).minus(HL.withdrawnLp()).toFixed()}:null,
   totals:HL.totals(),lastHour:db.prepare('SELECT MAX(hour) h FROM estate_hd_runs').get().h||null};
 }
 function v4Status(){const p=VL.program();return {enabled:v4On,polluxPayoutsEnabled:!!(v4On&&v4.polluxPayoutsEnabled),
  splitBps:v4?{imgPlx:v4.plxBps,imgXrp:v4.xrpBps,imgRlusd:v4.rlusdBps}:null,burnBps:v4?.burnBps??null,autoCompound:true,startedMs:p?.started_ms||null,totals:VL.totals()};}
 function status(){
  return {policyV4:v4Status(),hourlyDrip:dripStatus(),policy:P.POLICY,enabled,cadence:cfg.harvestCadence||'monthly',poolAccount:cfg.poolAccount||null,principalK:L.principalK(),trackedLp:L.trackedLp(),
   queuedDeposits:L.queued().length,pendingXrpDrops:L.pendingXrpDrops(),lastHarvestPeriod:L.lastPeriod(),payoutCurrencies:['IMG','RLUSD'],dustRlusd:cfg.dust};
 }
 return {processDeposits,runMonthly,runHourlyDrip,processV4Deposits,runPolluxPayouts,v4QueuedCount:()=>VL.queued().length,status,syncPurchases,queuedCount:()=>L.queued().length,ledger:L,_send:send};
}
module.exports={createEstateMonthlyExecutor};
