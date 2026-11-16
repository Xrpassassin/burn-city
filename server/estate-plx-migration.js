'use strict';
// One-shot Estates migration: 90% of the treasury's IMG/RLUSD LP -> IMG/PLX (operator decision,
// Nov 15, 2026). OFF unless ESTATE_PLX_MIGRATION_ENABLED=1 AND an explicit confirm token that pins
// the LP amount (MIGRATE-<lp>). Steps, each journaled in estate_mp_txs before submit and resumable:
//  1. withdraw: proportional AMMWithdraw (tfLPToken) of ESTATE_PLX_MIGRATION_BPS (default 9000) of
//     the on-ledger IMG/RLUSD LP (optional hard cap ESTATE_PLX_MIGRATION_MAX_LP) -> IMG + RLUSD.
//  2. convert: RLUSD -> PLX in chunks (<= ESTATE_PLX_MIGRATION_CHUNK_RLUSD, halved while a hop would
//     exceed the price-impact cap), each by the better quote of the direct PLX/RLUSD AMM or the
//     two-hop RLUSD -> XRP -> PLX route. Self-payments with an exact minimum delivery, capped
//     SendMax and no partial-payment flag.
//  3. deposit: two-sided AMMDeposit into IMG/PLX at the pool's exact ratio, only while the pool is
//     within ESTATE_MAX_POOL_DEVIATION_BPS of the XRP-market reference. Leftover IMG/PLX stays in
//     the treasury and is ledgered as estate residual (never single-sided).
//  4. The IMG/PLX LP is ledgered as estate holder-pool LP; Pollux rewards on it are split hourly by
//     the v4 Pollux payout (3.22% IMG burn). The monthly plan's tracked principal is reduced pro rata.
const {N}=require('./estate-liquidity-ledger');
const P=require('./estate-monthly-plan');
const V=require('./estate-v4-plan');
const XRP_RLUSD_POOL='rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',PLX_XRP_POOL='rGQGMpTSSCk82iMWwaAtaSkuVW5UzenVBS',PLX_RLUSD_POOL='rwR9aY23R4Mg2uRaN8LdHzg7FDxjURXsdW';
const TF_LP=0x00010000,TF_TWO=0x00100000,TF_PARTIAL=0x00020000;
const int=(v,d,min,max)=>{if(v===undefined||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_migration_setting');return n;};
const dec=(v,d)=>{const x=v===undefined||v===''?d:String(v);if(x!==''&&!/^\d+(\.\d{1,15})?$/.test(x))throw Error('invalid_migration_setting');return x;};
function migConfig(env=process.env){
 return Object.freeze({enabled:env.ESTATE_PLX_MIGRATION_ENABLED==='1',bps:int(env.ESTATE_PLX_MIGRATION_BPS,9000,1,10000),
  maxLp:dec(env.ESTATE_PLX_MIGRATION_MAX_LP,''),chunkRlusd:dec(env.ESTATE_PLX_MIGRATION_CHUNK_RLUSD,'10'),minRlusd:'0.01'});
}
const lpfx=n=>new N(n).decimalPlaces(12,N.ROUND_DOWN);
function targetLp(onLedgerLp,cfg){
 let lp=lpfx(new N(onLedgerLp).times(cfg.bps).div(10000));
 if(cfg.maxLp&&lp.gt(cfg.maxLp))lp=lpfx(cfg.maxLp);
 return lp.toFixed();
}
const confirmToken=lp=>'MIGRATE-'+lp;
// ---- live ledger snapshot (read-only) ----
async function readLiveState(client,treasury,{imgIssuer=P.IMG_ISSUER,plxIssuer=V.PLX_ISSUER}={}){
 const IMG={currency:'IMG',issuer:imgIssuer},RL={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},PLX={currency:'PLX',issuer:plxIssuer},XRP={currency:'XRP'};
 const amm=async(a,b,acct)=>{const x=(await client.request({command:'amm_info',asset:a,asset2:b,ledger_index:'validated'})).result.amm;
  if(!x||x.account!==acct)throw Error('pool_account_mismatch:'+acct);if(x.asset_frozen||x.asset2_frozen)throw Error('pool_frozen:'+acct);
  const val=v=>typeof v==='string'?new N(v).div(1e6).toFixed():v.value,k=v=>typeof v==='string'?'XRP':v.currency==='IMG'?'IMG':v.currency==='PLX'?'PLX':'RLUSD';
  return {account:x.account,[k(x.amount)]:val(x.amount),[k(x.amount2)]:val(x.amount2),lp:x.lp_token.value,lpCurrency:x.lp_token.currency,fee:x.trading_fee||0};};
 const [imgRl,xrpRl,plxXrp,plxRl,imgPlx,imgXrp]=await Promise.all([amm(IMG,RL,P.IMG_RLUSD_POOL),amm(XRP,RL,XRP_RLUSD_POOL),amm(PLX,XRP,PLX_XRP_POOL),
  amm(PLX,RL,PLX_RLUSD_POOL),amm(IMG,PLX,V.IMG_PLX_POOL),amm(IMG,XRP,V.IMG_XRP_POOL)]);
 const [ai,ss,lines]=await Promise.all([client.request({command:'account_info',account:treasury,ledger_index:'validated'}),client.request({command:'server_state'}),
  client.request({command:'account_lines',account:treasury,ledger_index:'validated',limit:400})]);
 const L=lines.result.lines||[],bal=(cur,iss)=>L.find(l=>l.currency===cur&&l.account===iss)?.balance;
 const v=ss.result.state.validated_ledger;
 return {ledger:ai.result.ledger_index,imgRl,xrpRl,plxXrp,plxRl,imgPlx,imgXrp,
  treasury:{xrpDrops:ai.result.account_data.Balance,ownerCount:ai.result.account_data.OwnerCount||0,
   imgRlusdLp:bal(imgRl.lpCurrency,P.IMG_RLUSD_POOL)||'0',imgPlxLp:bal(imgPlx.lpCurrency,V.IMG_PLX_POOL)??null,plx:bal('PLX',plxIssuer)??null,img:bal('IMG',imgIssuer)||'0',rlusd:bal(P.RLUSD_HEX,P.RLUSD_ISSUER)||'0'},
  reserveBaseDrops:String(v.reserve_base??Math.round(Number(v.reserve_base_xrp)*1e6)),reserveIncDrops:String(v.reserve_inc??Math.round(Number(v.reserve_inc_xrp)*1e6))};
}
// ---- quotes (decimal units; XRP in XRP) ----
const q=(amountIn,poolIn,poolOut,fee)=>P.quoteSwap({amountIn,poolIn,poolOut,tradingFee:fee});
function routeQuote(rl,st,cfg){
 const d=q(rl,st.plxRl.RLUSD,st.plxRl.PLX,st.plxRl.fee);
 const h1=q(rl,st.xrpRl.RLUSD,st.xrpRl.XRP,st.xrpRl.fee);
 const xrpMin=P.fx(P.minOut(h1.out,cfg));
 const h2=q(xrpMin,st.plxXrp.XRP,st.plxXrp.PLX,st.plxXrp.fee);
 const direct={route:'direct',plxOut:d.out,plxMin:P.fx(P.minOut(d.out,cfg)),impactBps:d.impactBps};
 const twoHop={route:'via_xrp',xrpOut:h1.out,xrpMin,plxOut:h2.out,plxMin:P.fx(P.minOut(h2.out,cfg)),impactBps:Math.max(h1.impactBps,h2.impactBps)};
 return direct.plxMin.gt(twoHop.plxMin)?{...direct,alt:twoHop}:{...twoHop,alt:direct};
}
// Chunk size: <= chunkRlusd, halved while the chosen route's worst hop exceeds the impact cap.
function chunkFor(remaining,st,cfg,mc){
 let c=N.minimum(new N(remaining),new N(mc.chunkRlusd));
 for(;;){const r=routeQuote(P.fx(c).toFixed(),st,cfg);if(r.impactBps<=cfg.maxPriceImpactBps||c.div(2).lt(mc.minRlusd))return {rl:P.fx(c).toFixed(),quote:r};c=c.div(2);}
}
// Reference PLX per IMG from the deep XRP markets.
const refPlxPerImg=st=>new N(st.plxXrp.PLX).div(st.plxXrp.XRP).div(new N(st.imgXrp.IMG).div(st.imgXrp.XRP));
// ---- dry-run planner: simulates every step on a copy of the live state ----
function planMigration(st0,cfg,mc){
 const st=structuredClone(st0),out={ledger:st.ledger,steps:[],warnings:[]};
 const lp=targetLp(st.treasury.imgRlusdLp,mc);
 const img=P.fx(new N(st.imgRl.IMG).times(lp).div(st.imgRl.lp)),rl=P.fx(new N(st.imgRl.RLUSD).times(lp).div(st.imgRl.lp));
 out.confirm=confirmToken(lp);
 out.steps.push({step:'1 withdraw IMG/RLUSD (tfLPToken)',lpIn:lp,ofTreasuryLp:st.treasury.imgRlusdLp,imgOut:img.toFixed(),rlusdOut:rl.toFixed(),
  poolShareBefore:pct(st.treasury.imgRlusdLp,st.imgRl.lp),poolShareAfter:pct(new N(st.treasury.imgRlusdLp).minus(lp),new N(st.imgRl.lp).minus(lp))});
 st.imgRl.IMG=new N(st.imgRl.IMG).minus(img).toFixed();st.imgRl.RLUSD=new N(st.imgRl.RLUSD).minus(rl).toFixed();st.imgRl.lp=new N(st.imgRl.lp).minus(lp).toFixed();
 let rem=rl,plx=new N(0),xrpLeft=new N(0),i=0;const chunks=[];
 while(rem.gte(mc.minRlusd)&&i<200){
  const {rl:c,quote:r}=chunkFor(rem.toFixed(),st,cfg,mc);
  if(new N(c).lt(mc.minRlusd))break;
  if(r.impactBps>cfg.maxPriceImpactBps){out.warnings.push('conversion_impact_above_cap');break;}
  // Exact-minimum delivery: assume the expected quote (spend scales to the minimum delivery).
  const spent=new N(c).times(r.plxMin).div(r.plxOut);
  if(r.route==='direct'){st.plxRl.RLUSD=new N(st.plxRl.RLUSD).plus(spent).toFixed();st.plxRl.PLX=new N(st.plxRl.PLX).minus(r.plxMin).toFixed();}
  else{const sx=new N(c).times(r.xrpMin).div(r.xrpOut);st.xrpRl.RLUSD=new N(st.xrpRl.RLUSD).plus(sx).toFixed();st.xrpRl.XRP=new N(st.xrpRl.XRP).minus(r.xrpMin).toFixed();
   st.plxXrp.XRP=new N(st.plxXrp.XRP).plus(r.xrpMin).toFixed();st.plxXrp.PLX=new N(st.plxXrp.PLX).minus(r.plxMin).toFixed();}
  chunks.push({i,route:r.route,rlusdIn:P.fx(spent).toFixed(),xrpMid:r.route==='via_xrp'?r.xrpMin.toFixed():null,plxMin:r.plxMin.toFixed(),impactBps:r.impactBps,
   altRoute:r.alt.route,altPlxMin:r.alt.plxMin.toFixed()});
  plx=plx.plus(r.plxMin);rem=rem.minus(spent);i++;
  if(spent.lt(new N(c).times('0.5')))break;
 }
 out.steps.push({step:'2 convert RLUSD -> PLX',chunks:chunks.length,route:chunks[0]?.route,rlusdSpent:P.fx(rl.minus(rem)).toFixed(),plxReceived:P.fx(plx).toFixed(),
  rlusdLeft:P.fx(rem).toFixed(),slippageFloorBps:cfg.slippageBps,worstHopImpactBps:Math.max(0,...chunks.map(c=>c.impactBps)),detail:chunks});
 const ref=refPlxPerImg(st),poolPx=new N(st.imgPlx.PLX).div(st.imgPlx.IMG),dev=P.poolDeviationBps(poolPx,ref);
 if(dev>cfg.maxPoolDeviationBps)out.warnings.push('img_plx_pool_off_market_deposit_would_hold');
 const a=P.ratioDeposit({heldImg:img.toFixed(),heldRlusd:P.fx(plx).toFixed(),poolImg:st.imgPlx.IMG,poolRlusd:st.imgPlx.PLX});
 const lpOut=new N(st.imgPlx.lp).times(N.minimum(new N(a.img).div(st.imgPlx.IMG),new N(a.rlusd).div(st.imgPlx.PLX)));
 const ownedBefore=new N(st.treasury.imgPlxLp||'0');
 out.steps.push({step:'3 deposit IMG+PLX two-sided into IMG/PLX',img:a.img,plx:a.rlusd,poolBefore:{IMG:st.imgPlx.IMG,PLX:st.imgPlx.PLX,lp:st.imgPlx.lp},
  poolPlxPerImg:poolPx.toFixed(6),marketPlxPerImg:ref.toFixed(6),deviationBps:dev,lpOut:lpOut.toFixed(6),
  treasuryShareAfter:pct(ownedBefore.plus(lpOut),new N(st.imgPlx.lp).plus(lpOut)),poolAfter:{IMG:new N(st.imgPlx.IMG).plus(a.img).toFixed(6),PLX:new N(st.imgPlx.PLX).plus(a.rlusd).toFixed(6)}});
 out.residual={img:P.fx(img.minus(a.img)).toFixed(),plx:P.fx(plx.minus(a.rlusd)).toFixed(),rlusd:P.fx(rem).toFixed()};
 const keepLp=new N(st.treasury.imgRlusdLp).minus(lp);
 out.keptInImgRlusd={lp:keepLp.toFixed(),img:P.fx(new N(st.imgRl.IMG).times(keepLp).div(st.imgRl.lp)).toFixed(),rlusd:P.fx(new N(st.imgRl.RLUSD).times(keepLp).div(st.imgRl.lp)).toFixed()};
 const newLines=(st.treasury.plx===null?1:0)+(st.treasury.imgPlxLp===null?1:0);
 const reserveNow=BigInt(st.reserveBaseDrops)+BigInt(st.reserveIncDrops)*BigInt(st.treasury.ownerCount);
 const reserveAfter=reserveNow+BigInt(st.reserveIncDrops)*BigInt(newLines);
 const fees=BigInt(12*(2+2*chunks.length+1));
 out.reserve={xrpBalanceDrops:st.treasury.xrpDrops,ownerCount:st.treasury.ownerCount,reserveNowDrops:reserveNow.toString(),newObjects:newLines,
  plxTrustLineMissing:st.treasury.plx===null,imgPlxLpLineMissing:st.treasury.imgPlxLp===null,reserveAfterDrops:reserveAfter.toString(),
  feesDrops:fees.toString(),spendableAfterDrops:(BigInt(st.treasury.xrpDrops)-reserveAfter-fees).toString()};
 if(BigInt(out.reserve.spendableAfterDrops)<500000n)out.warnings.push('treasury_xrp_margin_below_0.5');
 return out;
}
const pct=(a,b)=>new N(a).div(b).times(100).toFixed(2)+'%';
// ---- transaction guard for migration steps ----
function assertSafeMigrationTransaction(tx,ctx){
 const fail=e=>{throw Error('unsafe_migration_tx:'+e);};
 if(!tx||tx.Account!==ctx.treasury)fail('account');
 const same=(a,b)=>a&&b&&typeof a==='object'&&a.currency===b.currency&&a.issuer===b.issuer;
 const img={currency:'IMG',issuer:ctx.imgIssuer},plx={currency:'PLX',issuer:ctx.plxIssuer},rl={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER};
 const drops=a=>typeof a==='string'&&/^[1-9]\d*$/.test(a);
 const flags=Number(tx.Flags||0);
 switch(tx.TransactionType){
  case 'AMMWithdraw':
   if(!((same(tx.Asset,img)&&same(tx.Asset2,rl))||(same(tx.Asset,rl)&&same(tx.Asset2,img))))fail('wrong_pool');
   if(flags!==TF_LP||!tx.LPTokenIn||tx.LPTokenIn.issuer!==P.IMG_RLUSD_POOL||tx.Amount||tx.Amount2)fail('only_proportional_lp_withdraw');
   if(!ctx.maxLpIn||new N(tx.LPTokenIn.value).gt(ctx.maxLpIn))fail('withdraw_exceeds_confirmed_lp');
   return true;
  case 'Payment':
   if(flags&TF_PARTIAL)fail('partial_payment_forbidden');
   if(tx.Destination!==ctx.treasury)fail('destination_not_allowed');
   if(tx.Paths)fail('explicit_paths_forbidden');
   if(drops(tx.Amount)&&same(tx.SendMax,rl))return true;                     // RLUSD -> XRP
   if(same(tx.Amount,plx)&&(drops(tx.SendMax)||same(tx.SendMax,rl)))return true; // XRP/RLUSD -> PLX
   return fail('swap_shape');
  case 'AMMDeposit':{
   const pair=(same(tx.Asset,img)&&same(tx.Asset2,plx))||(same(tx.Asset,plx)&&same(tx.Asset2,img));
   if(!pair)fail('wrong_pool');if(flags!==TF_TWO||tx.EPrice||tx.LPTokenOut)fail('two_sided_only');
   const am=[tx.Amount,tx.Amount2];if(!am.some(a=>same(a,img)&&+a.value>0)||!am.some(a=>same(a,plx)&&+a.value>0))fail('two_sided_only');
   return true;}
  default:return fail('type_not_allowed');
 }
}
// ---- ledger ----
function createMigrationLedger(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_plx_migration(id TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('planned','withdrawn','converted','completed')),
  confirm TEXT NOT NULL,lp_target TEXT NOT NULL,onledger_lp_at_start TEXT NOT NULL,tracked_lp_at_start TEXT NOT NULL,principal_k_at_start TEXT NOT NULL,
  lp_in TEXT NOT NULL DEFAULT '0',img_out TEXT NOT NULL DEFAULT '0',rlusd_out TEXT NOT NULL DEFAULT '0',
  rlusd_left TEXT NOT NULL DEFAULT '0',xrp_held_drops TEXT NOT NULL DEFAULT '0',img_held TEXT NOT NULL DEFAULT '0',plx_held TEXT NOT NULL DEFAULT '0',
  plx_bought TEXT NOT NULL DEFAULT '0',img_dep TEXT NOT NULL DEFAULT '0',plx_dep TEXT NOT NULL DEFAULT '0',lp_out TEXT NOT NULL DEFAULT '0',
  chunks_json TEXT NOT NULL DEFAULT '[]',note TEXT,started INTEGER NOT NULL,completed INTEGER,updated INTEGER NOT NULL);`);
 return {
  get:()=>db.prepare("SELECT * FROM estate_plx_migration WHERE id='v1'").get()||null,
  start(r,ms){db.prepare("INSERT INTO estate_plx_migration(id,state,confirm,lp_target,onledger_lp_at_start,tracked_lp_at_start,principal_k_at_start,started,updated) VALUES('v1','planned',?,?,?,?,?,?,?)")
   .run(r.confirm,r.lpTarget,r.onLedgerLp,r.trackedLp,r.principalK,ms,ms);},
  update(f,ms){const k=Object.keys(f);db.prepare(`UPDATE estate_plx_migration SET ${k.map(x=>x+'=?').join(',')},updated=? WHERE id='v1'`).run(...k.map(x=>f[x]),ms);},
 };
}
function migrationPlanAdjustment(db){
 const zero={trackedLp:new N(0),principalK:new N(0)};
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_plx_migration'").get())return zero;
 const r=db.prepare("SELECT * FROM estate_plx_migration WHERE id='v1'").get();
 if(!r||!new N(r.lp_in).gt(0)||!new N(r.onledger_lp_at_start).gt(0))return zero;
 const f=new N(r.lp_in).div(r.onledger_lp_at_start);
 return {trackedLp:f.times(r.tracked_lp_at_start),principalK:f.times(r.principal_k_at_start)};
}
// XRP held mid-route (RLUSD -> XRP -> PLX) is estate cash: protected from game payouts.
function migrationHeldXrpDrops(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_plx_migration'").get())return 0n;
 return BigInt(db.prepare("SELECT xrp_held_drops v FROM estate_plx_migration WHERE id='v1'").get()?.v||'0');
}
module.exports={XRP_RLUSD_POOL,PLX_XRP_POOL,PLX_RLUSD_POOL,migConfig,targetLp,confirmToken,readLiveState,routeQuote,chunkFor,refPlxPerImg,planMigration,
 assertSafeMigrationTransaction,createMigrationLedger,migrationPlanAdjustment,migrationHeldXrpDrops};
