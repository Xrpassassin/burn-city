'use strict';
const {createEstateHourlyRuntime}=require('./estate-hourly-runtime');
const {createEstateLiquidityRuntime}=require('./estate-liquidity-runtime');
const {POLICY}=require('./estate-capital-allocation');
const {createEstatePayoutExecutor}=require('./estate-payout-executor');
function createEstateHourlyService({db,pay,config,guard,env=process.env}={}){
 const live=config.NETWORK==='mainnet'&&config.DRY_RUN===false;
 const accountingEnabled=live&&env.ESTATE_ACCOUNTING_ENABLED==='1';
 const payoutsEnabled=accountingEnabled&&env.ESTATE_DISTRIBUTIONS_ENABLED==='1';
 const client={request:async q=>(await pay.ledger()).request(q),autofill:async q=>(await pay.ledger()).autofill(q)};
 const accounting=createEstateHourlyRuntime({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,enabled:accountingEnabled});
 const executor=createEstatePayoutExecutor({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,guard,enabled:payoutsEnabled,
  wallet:()=>{try{return config.TREASURY_SEED?require('xrpl').Wallet.fromSeed(config.TREASURY_SEED):null;}catch{return null;}}});
 const fundingEnabled=live&&env.ESTATE_LIQUIDITY_ENABLED==='1';
 const harvestEnabled=accountingEnabled&&env.ESTATE_XRP_PROFIT_HARVEST_ENABLED==='1';
 const liquidity=createEstateLiquidityRuntime({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,plxIssuer:config.PLX_ISSUER,guard,fundingEnabled,harvestEnabled,payoutsEnabled,wallet:()=>{try{return config.TREASURY_SEED?require('xrpl').Wallet.fromSeed(config.TREASURY_SEED):null;}catch{return null;}}});
 let timer=null,busy=false,lastError=null,lastBlock=null;
 let signerMatches=false;try{signerMatches=!!config.TREASURY_SEED&&require('xrpl').Wallet.fromSeed(config.TREASURY_SEED).classicAddress===config.ESTATE_TREASURY;}catch{}
 async function tick(){if(busy)return;busy=true;try{const accountingResult=await accounting.tick();await liquidity.tick();const result=await executor.tick({reconcileOnly:!!accountingResult?.blocked||!accountingEnabled});lastBlock=accountingResult?.blocked||result?.blocked||null;lastError=null;}catch(e){lastError='processing_delayed';console.error('[estates-hourly]',e.message);}finally{busy=false;}}
 function status(owner){const a=accounting.state(owner);return {...a,...liquidity.status(owner),capitalAllocationPolicy:{...POLICY,automaticDepositsEnabled:fundingEnabled&&signerMatches&&!guard.paused()},rewardsGuaranteed:false,accountingEnabled,distributionsEnabled:payoutsEnabled&&a.bootstrapped&&signerMatches&&!guard.paused()&&!lastError&&!lastBlock,distributionStatus:!payoutsEnabled?'disabled':!a.bootstrapped?'bootstrap_required':!signerMatches?'treasury_signer_unavailable':guard.paused()?'treasury_paused':lastError||lastBlock||'enabled',distributionSchedule:'hourly'};}
 function start(){if(timer||(!accountingEnabled&&!fundingEnabled&&!harvestEnabled&&!db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state='submitted'").get()&&!db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state IN ('submitted','validated')").get()))return false;timer=setInterval(()=>void tick(),15000);timer.unref?.();void tick();return true;}
 return {status,start,tick};
}
module.exports={createEstateHourlyService};
