'use strict';
const {createEstateHourlyRuntime}=require('./estate-hourly-runtime');
const {createEstatePayoutExecutor}=require('./estate-payout-executor');
function createEstateHourlyService({db,pay,config,guard,env=process.env}={}){
 const live=config.NETWORK==='mainnet'&&config.DRY_RUN===false;
 const accountingEnabled=live&&env.ESTATE_ACCOUNTING_ENABLED==='1';
 const payoutsEnabled=accountingEnabled&&env.ESTATE_DISTRIBUTIONS_ENABLED==='1';
 const client={request:async q=>(await pay.ledger()).request(q),autofill:async q=>(await pay.ledger()).autofill(q)};
 const accounting=createEstateHourlyRuntime({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,enabled:accountingEnabled});
 const executor=createEstatePayoutExecutor({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,guard,enabled:payoutsEnabled,
  wallet:()=>{try{return config.TREASURY_SEED?require('xrpl').Wallet.fromSeed(config.TREASURY_SEED):null;}catch{return null;}}});
 let timer=null,busy=false,lastError=null,lastBlock=null;
 let signerMatches=false;try{signerMatches=!!config.TREASURY_SEED&&require('xrpl').Wallet.fromSeed(config.TREASURY_SEED).classicAddress===config.ESTATE_TREASURY;}catch{}
 async function tick(){if(busy)return;busy=true;try{await accounting.tick();const result=await executor.tick();lastBlock=result?.blocked||null;lastError=null;}catch(e){lastError='processing_delayed';console.error('[estates-hourly]',e.message);}finally{busy=false;}}
 function status(owner){const a=accounting.state(owner);return {...a,accountingEnabled,distributionsEnabled:payoutsEnabled&&a.bootstrapped&&signerMatches&&!guard.paused()&&!lastError&&!lastBlock,distributionStatus:!payoutsEnabled?'disabled':!a.bootstrapped?'bootstrap_required':!signerMatches?'treasury_signer_unavailable':guard.paused()?'treasury_paused':lastError||lastBlock||'enabled',distributionSchedule:'hourly'};}
 function start(){if(!accountingEnabled||timer)return false;timer=setInterval(()=>void tick(),15000);timer.unref?.();void tick();return true;}
 return {status,start,tick};
}
module.exports={createEstateHourlyService};
