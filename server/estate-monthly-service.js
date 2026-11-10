'use strict';
// Server wiring for the Estates monthly plan. OFF unless ALL of:
//  ESTATE_MONTHLY_PLAN_ENABLED=1, mainnet, DRY_RUN=false, ESTATE_IMG_RLUSD_POOL_ACCOUNT equals the
//  verified IMG/RLUSD AMM, TREASURY_SEED signs for ESTATE_TREASURY_ADDRESS, and the treasury is not paused.
// Each tick: queued two-sided deposits, then (only once per completed UTC month) the harvest/split/payout.
const P=require('./estate-monthly-plan');
const {createEstateMonthlyExecutor}=require('./estate-monthly-executor');
const RLUSD_XRP_REF={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER};
function createEstateMonthlyService({db,pay,config,guard,env=process.env}){
 const cfg=P.monthlyConfig(env);
 const live=config.NETWORK==='mainnet'&&config.DRY_RUN===false;
 let signerMatches=false;try{signerMatches=!!config.TREASURY_SEED&&require('xrpl').Wallet.fromSeed(config.TREASURY_SEED).classicAddress===config.ESTATE_TREASURY;}catch{}
 const poolOk=cfg.poolAccount===P.IMG_RLUSD_POOL&&cfg.imgIssuer===P.IMG_ISSUER&&cfg.rlusdIssuer===P.RLUSD_ISSUER;
 const blockers=[!cfg.enabled&&'monthly_plan_switch_off',!live&&'not_mainnet_live',!poolOk&&'pool_account_not_set',!signerMatches&&'treasury_signer_mismatch'].filter(Boolean);
 const enabled=blockers.length===0;
 const client={request:async q=>(await pay.ledger()).request(q),autofill:async q=>(await pay.ledger()).autofill(q)};
 const ex=createEstateMonthlyExecutor({db,client,treasury:config.ESTATE_TREASURY,cfg,enabled,paused:()=>guard.paused(),
  xrpRlusdAsset:RLUSD_XRP_REF,xrpImgAsset:{currency:cfg.imgCurrency,issuer:cfg.imgIssuer},
  wallet:()=>{try{return require('xrpl').Wallet.fromSeed(config.TREASURY_SEED);}catch{return null;}},
  log:(k,o)=>guard.log('estate-monthly-'+k,o)});
 let timer=null,busy=false,lastError=null,last=null;
 async function tick(){if(busy)return;busy=true;try{last={deposits:await ex.processDeposits(),monthly:await ex.runMonthly()};lastError=null;}catch(e){lastError=e.message;console.error('[estate-monthly]',e.message);}finally{busy=false;}}
 function start(){if(!enabled||timer)return false;timer=setInterval(()=>void tick(),3600e3);timer.unref?.();setTimeout(()=>void tick(),30e3).unref?.();return true;}
 const status=()=>({...ex.status(),enabled:enabled&&!guard.paused(),blockers:guard.paused()?[...blockers,'treasury_paused']:blockers,lastError,rewardsGuaranteed:false});
 return {start,tick,status,executor:ex};
}
module.exports={createEstateMonthlyService};
