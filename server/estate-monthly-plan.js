'use strict';
// Estates IMG/RLUSD monthly plan (allocation policy v3, no PLX anywhere).
//  1. Purchase XRP -> small configurable XRP reserve; the rest is swapped ~half to RLUSD and
//     ~half to IMG, then deposited TWO-SIDED into the IMG/RLUSD AMM. The treasury keeps the LP.
//  2. Monthly: withdraw (proportionally, both assets) ONLY the LP value gained above principal.
//     Principal is tracked in constant-product invariant units (sqrt(IMG*RLUSD) per LP token),
//     which grow only from trading fees, never from price moves, so principal stays in the pool.
//  3. Realized monthly profit split by value: 10% IMG burn (sent to the IMG issuer),
//     10% two-sided redeposit (becomes principal), 80% to estate holders pro rata by share units.
//     A proportional withdrawal from a 50/50 pool is equal value per side, so per asset this is:
//     IMG  -> 20% burn, 10% redeposit, 70% holders;  RLUSD -> 0% burn, 10% redeposit, 90% holders.
//  4. Payouts are monthly. Per-holder amounts below the dust threshold carry forward.
// Pure math + SQLite ledger only. Nothing here signs or submits; see estate-monthly-executor.js.
const {N,value}=require('./estate-liquidity-ledger');
const POLICY=Object.freeze({version:3,pair:'IMG/RLUSD',imgPlxBps:0,imgXrpBps:0,plx:false,copytrading:false,
 cadence:'monthly',burnBps:1000,redepositBps:1000,holdersBps:8000,
 perAsset:Object.freeze({img:Object.freeze({burnBps:2000,redepositBps:1000,holdersBps:7000}),rlusd:Object.freeze({burnBps:0,redepositBps:1000,holdersBps:9000})})});
const IMG_ISSUER='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const RLUSD_ISSUER='rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const RLUSD_HEX='524C555344000000000000000000000000000000';
const IMG_RLUSD_POOL='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const ADDR=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const TF={partialPayment:0x00020000,lpToken:0x00010000,withdrawAll:0x00020000,oneAssetWithdrawAll:0x00040000,
 singleAsset:0x00080000,twoAsset:0x00100000,oneAssetLPToken:0x00200000,limitLPToken:0x00400000,twoAssetIfEmpty:0x00800000};
const DP=6; // IOU amounts are rounded DOWN to 6 decimals (micro units) everywhere.
const fx=n=>new N(n).decimalPlaces(DP,N.ROUND_DOWN);
const int=(v,d,min,max)=>{if(v===undefined||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_monthly_plan_setting');return n;};
function monthlyConfig(env=process.env){
 const pool=env.ESTATE_IMG_RLUSD_POOL_ACCOUNT||'';
 const dust=env.ESTATE_PAYOUT_DUST_RLUSD||'0.05';
 if(!/^\d+(\.\d{1,6})?$/.test(dust))throw Error('invalid_monthly_plan_setting');
 return Object.freeze({
  enabled:env.ESTATE_MONTHLY_PLAN_ENABLED==='1',
  poolAccount:ADDR.test(pool)?pool:'',
  imgIssuer:env.ESTATE_IMG_ISSUER||IMG_ISSUER,imgCurrency:env.ESTATE_IMG_CURRENCY||'IMG',
  rlusdIssuer:env.ESTATE_RLUSD_ISSUER||RLUSD_ISSUER,rlusdCurrency:env.ESTATE_RLUSD_CURRENCY||RLUSD_HEX,
  reserveBps:int(env.ESTATE_XRP_RESERVE_BPS,100,0,2000),            // kept as XRP for fees/reserves (1%)
  reserveMinDrops:int(env.ESTATE_XRP_RESERVE_MIN_DROPS,0,0,10e6),
  maxDepositDrops:int(env.ESTATE_MAX_DEPOSIT_DROPS,25e6,1e5,1e12), // per deposit; remainder stays queued
  maxPriceImpactBps:int(env.ESTATE_MAX_PRICE_IMPACT_BPS,100,1,1000),// per swap leg
  slippageBps:int(env.ESTATE_SWAP_SLIPPAGE_BPS,100,1,1000),         // delivered >= quote*(1-slippage)
  maxPoolDeviationBps:int(env.ESTATE_MAX_POOL_DEVIATION_BPS,300,1,5000),// pool price vs. reference market
  minSwapDrops:int(env.ESTATE_MIN_SWAP_DROPS,100000,1,1e9),
  dust,
 });
}
// ---- purchase capital ----
function splitPurchase(drops,cfg){
 if(typeof drops!=='string'||!/^[1-9]\d*$/.test(drops))throw TypeError('positive_purchase_drops_required');
 const total=BigInt(drops);
 let reserve=(total*BigInt(cfg.reserveBps)+9999n)/10000n;
 if(reserve<BigInt(cfg.reserveMinDrops))reserve=BigInt(cfg.reserveMinDrops);
 if(reserve>total)reserve=total;
 return Object.freeze({purchaseDrops:drops,operatingReserveDrops:reserve.toString(),imgRlusdDrops:(total-reserve).toString(),imgPlxDrops:'0',imgXrpDrops:'0'});
}
// One deposit run spends at most maxDepositDrops; anything above stays queued for a later run.
function depositLegs(remainingDrops,cfg){
 const r=BigInt(remainingDrops);const spend=r>BigInt(cfg.maxDepositDrops)?BigInt(cfg.maxDepositDrops):r;
 const rlusd=spend/2n;return {spendDrops:spend.toString(),rlusdLegDrops:rlusd.toString(),imgLegDrops:(spend-rlusd).toString(),queuedDrops:(r-spend).toString()};
}
// Constant-product quote with the pool's trading fee (units of 1/100000, XRPL TradingFee).
function quoteSwap({amountIn,poolIn,poolOut,tradingFee}){
 const a=new N(amountIn),x=new N(poolIn),y=new N(poolOut);
 if(!a.gt(0)||!x.gt(0)||!y.gt(0))throw Error('invalid_quote_input');
 const eff=a.times(new N(100000).minus(tradingFee||0)).div(100000);
 const out=y.times(eff).div(x.plus(eff));
 // Price impact vs. spot (fee excluded): eff/(x+eff).
 const impactBps=eff.div(x.plus(eff)).times(10000);
 return {out,impactBps:Number(impactBps.toFixed(4)),spot:y.div(x)};
}
function minOut(out,cfg){return new N(out).times(10000-cfg.slippageBps).div(10000);}
// Two-sided deposit amounts in the pool's exact ratio, never exceeding what is held.
function ratioDeposit({heldImg,heldRlusd,poolImg,poolRlusd}){
 const hi=new N(heldImg),hr=new N(heldRlusd),pi=new N(poolImg),pr=new N(poolRlusd);
 if(!hi.gt(0)||!hr.gt(0)||!pi.gt(0)||!pr.gt(0))throw Error('two_sided_deposit_requires_both_assets');
 let img=hi,rl=hi.times(pr).div(pi);
 if(rl.gt(hr)){rl=hr;img=hr.times(pi).div(pr);}
 img=fx(img);rl=fx(rl);
 if(!img.gt(0)||!rl.gt(0))throw Error('two_sided_deposit_requires_both_assets');
 return {img:img.toFixed(),rlusd:rl.toFixed()};
}
// |pool price / reference price - 1| in bps. Reference = IMG/XRP and XRP/RLUSD markets.
function poolDeviationBps(poolRlusdPerImg,refRlusdPerImg){
 const p=new N(poolRlusdPerImg),r=new N(refRlusdPerImg);if(!p.gt(0)||!r.gt(0))throw Error('invalid_price');
 return Number(p.div(r).minus(1).abs().times(10000).toFixed(4));
}
// ---- principal & harvest ----
const kPerLp=({poolImg,poolRlusd,lpSupply})=>new N(poolImg).times(poolRlusd).sqrt().div(lpSupply).precision(30,N.ROUND_DOWN);
function harvestPlan({trackedLp,onLedgerLp,principalK,pool}){
 const tracked=N.minimum(new N(trackedLp),new N(onLedgerLp));
 const k=kPerLp(pool);
 const gainK=tracked.times(k).minus(principalK);
 if(!tracked.gt(0)||!gainK.gt(0))return {lpToWithdraw:'0',gainK:'0',kPerLp:k.toFixed()};
 let lp=gainK.div(k).precision(15,N.ROUND_DOWN);if(lp.gt(tracked))lp=tracked;
 // Below one part per million of the position the gain stays in the pool and rolls into next month.
 if(lp.lt(tracked.times('0.000001')))return {lpToWithdraw:'0',gainK:'0',kPerLp:k.toFixed()};
 return {lpToWithdraw:lp.toFixed(),gainK:gainK.precision(30,N.ROUND_DOWN).toFixed(),kPerLp:k.toFixed()};
}
function splitHarvest({img,rlusd}){
 const i=fx(img),r=fx(rlusd),pa=POLICY.perAsset;
 const burnImg=fx(i.times(pa.img.burnBps).div(10000));
 const redImg=fx(i.times(pa.img.redepositBps).div(10000));
 const redRl=fx(r.times(pa.rlusd.redepositBps).div(10000));
 return {burnImg:burnImg.toFixed(),redepositImg:redImg.toFixed(),redepositRlusd:redRl.toFixed(),
  holdersImg:i.minus(burnImg).minus(redImg).toFixed(),holdersRlusd:r.minus(redRl).toFixed()};
}
// Pro rata by share units, plus each holder's carried balance. Values under dust carry forward.
// Rounding residue is carried under '__unallocated__' and joins next month's pot.
function allocateHolders({holdersImg,holdersRlusd,owners,carry={},rlusdPerImg,dust}){
 const units=new Map();for(const o of owners){if(!ADDR.test(o.acct)||!Number.isSafeInteger(o.shareUnits)||o.shareUnits<=0)throw Error('invalid_owner');units.set(o.acct,(units.get(o.acct)||0)+o.shareUnits);}
 const total=[...units.values()].reduce((a,b)=>a+b,0);
 const un=carry.__unallocated__||{img:'0',rlusd:'0'};
 const potI=fx(new N(holdersImg).plus(un.img)),potR=fx(new N(holdersRlusd).plus(un.rlusd));
 const pay=[],next={};let usedI=new N(0),usedR=new N(0);
 if(!total){next.__unallocated__={img:potI.toFixed(),rlusd:potR.toFixed()};return {payouts:pay,carry:next};}
 for(const [acct,u] of [...units].sort((a,b)=>a[0]<b[0]?-1:1)){
  const si=fx(potI.times(u).div(total)),sr=fx(potR.times(u).div(total));usedI=usedI.plus(si);usedR=usedR.plus(sr);
  const c=carry[acct]||{img:'0',rlusd:'0'};
  const img=fx(si.plus(c.img)),rl=fx(sr.plus(c.rlusd));
  const val=rl.plus(img.times(rlusdPerImg));
  if(val.lt(dust)||(!img.gt(0)&&!rl.gt(0)))next[acct]={img:img.toFixed(),rlusd:rl.toFixed()};
  else pay.push({acct,shareUnits:u,img:img.toFixed(),rlusd:rl.toFixed(),valueRlusd:fx(val).toFixed()});
 }
 for(const [acct,c] of Object.entries(carry))if(acct!=='__unallocated__'&&!units.has(acct))next[acct]=c; // sold-out holders keep their earned carry
 next.__unallocated__={img:potI.minus(usedI).toFixed(),rlusd:potR.minus(usedR).toFixed()};
 return {payouts:pay,carry:next};
}
// ---- monthly cadence ----
const periodOf=ms=>new Date(ms).toISOString().slice(0,7);
function duePeriod(lastPeriod,nowMs){
 const d=new Date(nowMs);const prev=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));
 const p=prev.toISOString().slice(0,7);
 return !lastPeriod||lastPeriod<p?p:null; // only completed months, once each
}
// ---- transaction guard: every tx the plan signs passes through here ----
function assertSafeTransaction(tx,ctx){
 const fail=e=>{throw Error('unsafe_tx:'+e);};
 if(!tx||tx.Account!==ctx.treasury)fail('account');
 if(tx.Destination&&tx.Destination===ctx.poolAccount)fail('payment_to_amm_forbidden');
 const sameIssue=(a,b)=>a&&b&&a.currency===b.currency&&a.issuer===b.issuer;
 const img={currency:ctx.imgCurrency,issuer:ctx.imgIssuer},rl={currency:ctx.rlusdCurrency,issuer:ctx.rlusdIssuer};
 const isPair=(a,b)=>(sameIssue(a,img)&&sameIssue(b,rl))||(sameIssue(a,rl)&&sameIssue(b,img));
 const flags=Number(tx.Flags||0);
 switch(tx.TransactionType){
  case 'AMMDeposit':
   if(!isPair(tx.Asset,tx.Asset2))fail('wrong_pool');
   if(flags!==TF.twoAsset)fail('single_sided_deposit_forbidden');
   if(typeof tx.Amount!=='object'||typeof tx.Amount2!=='object'||!isPair(tx.Amount,tx.Amount2))fail('single_sided_deposit_forbidden');
   if(!(+tx.Amount.value>0)||!(+tx.Amount2.value>0))fail('single_sided_deposit_forbidden');
   if(tx.EPrice)fail('single_sided_deposit_forbidden');
   return true;
  case 'AMMWithdraw':
   if(!isPair(tx.Asset,tx.Asset2))fail('wrong_pool');
   if(flags!==TF.lpToken||!tx.LPTokenIn||tx.LPTokenIn.issuer!==ctx.poolAccount||tx.Amount||tx.Amount2)fail('only_proportional_lp_withdraw');
   if(ctx.maxLpIn&&new N(tx.LPTokenIn.value).gt(ctx.maxLpIn))fail('withdraw_exceeds_profit');
   return true;
  case 'Payment':
   if(flags&TF.partialPayment)fail('partial_payment_forbidden');
   if(tx.Destination===ctx.treasury){ // self swap XRP -> IMG/RLUSD with capped input
    if(typeof tx.SendMax!=='string'||typeof tx.Amount!=='object'||!(sameIssue(tx.Amount,img)||sameIssue(tx.Amount,rl)))fail('swap_shape');
    return true;}
   if(tx.Destination===ctx.imgIssuer){if(!sameIssue(tx.Amount,img)||tx.SendMax)fail('burn_shape');return true;}
   if(ctx.holders&&ctx.holders.has(tx.Destination)){if(tx.SendMax||!(sameIssue(tx.Amount,img)||sameIssue(tx.Amount,rl)))fail('holder_payout_shape');return true;}
   return fail('destination_not_allowed');
  default:return fail('type_not_allowed');
 }
}
// ---- ledger ----
function createEstateMonthlyLedger(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_mp_deposits(
  id TEXT PRIMARY KEY,source TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('purchase','redeposit')),
  state TEXT NOT NULL CHECK(state IN ('queued','deposited')),
  xrp_drops TEXT NOT NULL DEFAULT '0',xrp_remaining_drops TEXT NOT NULL DEFAULT '0',
  held_img TEXT NOT NULL DEFAULT '0',held_rlusd TEXT NOT NULL DEFAULT '0',
  img_in TEXT NOT NULL DEFAULT '0',rlusd_in TEXT NOT NULL DEFAULT '0',lp_out TEXT NOT NULL DEFAULT '0',principal_k TEXT NOT NULL DEFAULT '0',
  chunk_json TEXT,note TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_mp_harvests(period TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('withdrawn','split','paid','nothing_to_harvest')),
  lp_in TEXT NOT NULL DEFAULT '0',img_out TEXT NOT NULL DEFAULT '0',rlusd_out TEXT NOT NULL DEFAULT '0',split_json TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_mp_payouts(period TEXT NOT NULL,acct TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency IN ('IMG','RLUSD')),amount TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','paid','carried')),tx_hash TEXT,PRIMARY KEY(period,acct,currency));
 CREATE TABLE IF NOT EXISTS estate_mp_carry(acct TEXT PRIMARY KEY,img TEXT NOT NULL,rlusd TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_mp_txs(step TEXT PRIMARY KEY,hash TEXT UNIQUE,blob TEXT,last_ledger INTEGER,
  state TEXT NOT NULL CHECK(state IN ('submitted','validated','failed')),result TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_mp_migrations(id TEXT PRIMARY KEY,data_json TEXT NOT NULL,at INTEGER NOT NULL);`);
 const now=()=>Date.now();
 const sum=(col,where='')=>db.prepare(`SELECT ${col} v FROM estate_mp_deposits ${where}`).all().reduce((n,r)=>n.plus(r.v||'0'),new N(0));
 return {
  db,
  enqueuePurchase({purchaseTx,investDrops}){
   db.prepare("INSERT OR IGNORE INTO estate_mp_deposits(id,source,kind,state,xrp_drops,xrp_remaining_drops,created,updated) VALUES(?,?,'purchase','queued',?,?,?,?)")
    .run('dep:'+purchaseTx,purchaseTx,investDrops,investDrops,now(),now());
   return db.prepare('SELECT * FROM estate_mp_deposits WHERE source=?').get(purchaseTx);
  },
  enqueueRedeposit({period,img,rlusd}){
   db.prepare("INSERT OR IGNORE INTO estate_mp_deposits(id,source,kind,state,held_img,held_rlusd,created,updated) VALUES(?,?,'redeposit','queued',?,?,?,?)")
    .run('dep:redeposit:'+period,'redeposit:'+period,img,rlusd,now(),now());
  },
  queued:()=>db.prepare("SELECT * FROM estate_mp_deposits WHERE state='queued' ORDER BY created,id").all(),
  update(id,f){const k=Object.keys(f);db.prepare(`UPDATE estate_mp_deposits SET ${k.map(x=>x+'=?').join(',')},updated=? WHERE id=?`).run(...k.map(x=>f[x]),now(),id);},
  principalK:()=>sum('principal_k').toFixed(),
  trackedLp(){const lpOut=sum('lp_out');const lpIn=db.prepare('SELECT lp_in v FROM estate_mp_harvests').all().reduce((n,r)=>n.plus(r.v),new N(0));return lpOut.minus(lpIn).toFixed();},
  lastPeriod:()=>db.prepare('SELECT MAX(period) p FROM estate_mp_harvests').get().p||null,
  harvest:p=>db.prepare('SELECT * FROM estate_mp_harvests WHERE period=?').get(p),
  carry(){const o={};for(const r of db.prepare('SELECT * FROM estate_mp_carry').all())o[r.acct]={img:r.img,rlusd:r.rlusd};return o;},
  setCarry(c){db.exec('DELETE FROM estate_mp_carry');const s=db.prepare('INSERT INTO estate_mp_carry(acct,img,rlusd,updated) VALUES(?,?,?,?)');for(const [a,v] of Object.entries(c))if(new N(v.img).gt(0)||new N(v.rlusd).gt(0))s.run(a,v.img,v.rlusd,now());},
  // XRP still owed to pending purchase deposits (protected from game payouts by guard.js).
  pendingXrpDrops:()=>db.prepare("SELECT xrp_remaining_drops v FROM estate_mp_deposits WHERE kind='purchase'").all().reduce((n,r)=>n+BigInt(r.v),0n).toString(),
  spentXrpDrops:()=>db.prepare("SELECT xrp_drops,xrp_remaining_drops FROM estate_mp_deposits WHERE kind='purchase'").all().reduce((n,r)=>n+BigInt(r.xrp_drops)-BigInt(r.xrp_remaining_drops),0n).toString(),
  hashes:()=>db.prepare('SELECT hash FROM estate_mp_txs WHERE hash IS NOT NULL').all().map(r=>r.hash),
 };
}
module.exports={POLICY,TF,IMG_ISSUER,RLUSD_ISSUER,RLUSD_HEX,IMG_RLUSD_POOL,monthlyConfig,splitPurchase,depositLegs,quoteSwap,minOut,ratioDeposit,
 poolDeviationBps,kPerLp,harvestPlan,splitHarvest,allocateHolders,periodOf,duePeriod,assertSafeTransaction,createEstateMonthlyLedger,fx};
