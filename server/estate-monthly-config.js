'use strict';
// Dependency-free part of the Estates monthly plan (policy v3): constants, env config and the
// purchase split. Kept free of npm packages so settlement/production-gate jobs can load it bare.
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
const int=(v,d,min,max)=>{if(v===undefined||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_monthly_plan_setting');return n;};
const cadenceOf=v=>{if(v===undefined||v==='')return 'monthly';const c=String(v).trim().toLowerCase();if(c!=='monthly'&&c!=='daily')throw Error('invalid_monthly_plan_setting');return c;};
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
  maxDepositDrops:int(env.ESTATE_MAX_DEPOSIT_DROPS,8e6,1e5,1e12), // per deposit run; remainder stays queued (IMG/XRP depth ~437 XRP => ~1% impact per 4 XRP leg)
  maxPriceImpactBps:int(env.ESTATE_MAX_PRICE_IMPACT_BPS,100,1,1000),// per swap leg
  slippageBps:int(env.ESTATE_SWAP_SLIPPAGE_BPS,100,1,1000),         // delivered >= quote*(1-slippage)
  maxPoolDeviationBps:int(env.ESTATE_MAX_POOL_DEVIATION_BPS,300,1,5000),// pool price vs. reference market
  minSwapDrops:int(env.ESTATE_MIN_SWAP_DROPS,100000,1,1e9),
  depositChunkIntervalMs:int(env.ESTATE_DEPOSIT_CHUNK_INTERVAL_MS,300000,60000,3600000),// cadence while deposits are queued
  idleIntervalMs:3600000,                                            // hourly when the queue is empty (harvest check at most hourly)
  harvestCadence:cadenceOf(env.ESTATE_HARVEST_CADENCE),              // monthly (default) or daily; nothing changes until set
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
module.exports={POLICY,TF,IMG_ISSUER,RLUSD_ISSUER,RLUSD_HEX,IMG_RLUSD_POOL,ADDR,monthlyConfig,splitPurchase};
