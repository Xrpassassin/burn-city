'use strict';
const {createEstateHourlyRuntime}=require('./estate-hourly-runtime');
const {createEstateLiquidityRuntime}=require('./estate-liquidity-runtime');
const {createEstateNetRewardExecutor}=require('./estate-net-reward-executor');
const {POLICY}=require('./estate-capital-allocation');
const {createEstatePayoutExecutor}=require('./estate-payout-executor');
const {inspectEstateForwardRewardReadiness}=require('./estate-rlusd-forward-readiness');
const {createEstateRlusdHourScanner}=require('./estate-rlusd-validated-hour-scanner');
function createEstateHourlyService({db,pay,config,guard,env=process.env}={}){
 const live=config.NETWORK==='mainnet'&&config.DRY_RUN===false;
 const accountingEnabled=live&&env.ESTATE_ACCOUNTING_ENABLED==='1';
 // The hourly payout/funding/harvest cadence is retired (policy v3 pays monthly via
 // estate-monthly-service.js). It can only be re-enabled with an explicit legacy switch.
 const legacyHourly=env.ESTATE_LEGACY_HOURLY_ENGINE==='1';
 const payoutsEnabled=accountingEnabled&&legacyHourly&&env.ESTATE_DISTRIBUTIONS_ENABLED==='1';
 const client={request:async q=>(await pay.ledger()).request(q),autofill:async q=>(await pay.ledger()).autofill(q)};
 const accounting=createEstateHourlyRuntime({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,enabled:accountingEnabled});
 const executor=createEstatePayoutExecutor({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,guard,enabled:payoutsEnabled,
  wallet:()=>{try{return config.TREASURY_SEED?require('xrpl').Wallet.fromSeed(config.TREASURY_SEED):null;}catch{return null;}}});
 const fundingEnabled=live&&legacyHourly&&env.ESTATE_LIQUIDITY_ENABLED==='1';
 const harvestEnabled=accountingEnabled&&legacyHourly&&env.ESTATE_XRP_PROFIT_HARVEST_ENABLED==='1';
 const liquidity=createEstateLiquidityRuntime({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,plxIssuer:config.PLX_ISSUER,legacyTradingEnabled:false,rlusdEnabled:env.ESTATE_RLUSD_ENABLED==='1',rlusdPoolAccount:env.ESTATE_IMG_RLUSD_POOL_ACCOUNT||'',guard,fundingEnabled,harvestEnabled,payoutsEnabled,wallet:()=>{try{return config.TREASURY_SEED?require('xrpl').Wallet.fromSeed(config.TREASURY_SEED):null;}catch{return null;}}});
 const netRewards=createEstateNetRewardExecutor({db,client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,guard,enabled:payoutsEnabled,wallet:()=>{try{return config.TREASURY_SEED?require('xrpl').Wallet.fromSeed(config.TREASURY_SEED):null;}catch{return null;}}});
 // Explicitly opt-in, scanner-only: no payments, credits, signer, or
 // automatic start staging. An absent immutable start fails closed.
 const forwardScannerEnabled=env.ESTATE_FORWARD_RLUSD_SCAN_ENABLED==='1';
 const forwardScanner=forwardScannerEnabled
  ?createEstateRlusdHourScanner({db,client,treasury:config.ESTATE_TREASURY,maxLedgers:120})
  :null;
 let forwardScanError=null,forwardLastStatus=null;
 let timer=null,busy=false,lastError=null,lastBlock=null;
 let signerMatches=false;try{signerMatches=!!config.TREASURY_SEED&&require('xrpl').Wallet.fromSeed(config.TREASURY_SEED).classicAddress===config.ESTATE_TREASURY;}catch{}
 async function tick(){
  if(busy)return;busy=true;
  try{
   if(forwardScanner){
    try{
     forwardLastStatus=await forwardScanner.scan();
     forwardScanError=null;
    }catch(e){
     // An unavailable public XRPL RPC must NEVER move the forward
     // checkpoint or block legacy payment reconciliation.
     forwardScanError='validated_hour_scan_retry_required';
     console.error('[estates-forward-hour-scan]',e.message);
    }
   }
   const accountingResult=await accounting.tick();
   await liquidity.tick();
   await executor.tick({reconcileOnly:true});
   const result=await netRewards.tick({reconcileOnly:!!accountingResult?.blocked||!accountingEnabled});
   lastBlock=accountingResult?.blocked||result?.blocked||null;lastError=null;
  }catch(e){lastError='processing_delayed';console.error('[estates-hourly]',e.message);}
  finally{busy=false;}
 }
 function status(owner){
  const a=accounting.state(owner);
  // Do not misrepresent legacy IMG hourly payouts as IMG/RLUSD AMM
  // reward distributions. A draft or staged start cannot pay an owner.
  let forward;
  try{forward=inspectEstateForwardRewardReadiness(db,{owner});}
  catch{forward={pool:'IMG/RLUSD',status:'forward_accounting_review_required',
   settlementEngineConnected:false,verifiedRealizationIngestionConnected:false,
   livePaymentsEnabled:false,noGuaranteedHourlyPayment:true};}
  return {...a,...liquidity.status(owner),
   forwardImgRlusdRewards:{...forward,
    validatedHourScannerEnabled:forwardScannerEnabled,
    validatedHourScannerCheckpointLedger:forwardScanner?.checkpoint()?.ledger_index??null,
    validatedHourScannerStatus:forwardScanError||forwardLastStatus?.blocked||
     (forwardLastStatus?.checkpointLedger!==undefined?'verified_hour_observations_only':
      forwardScanner?'not_started':'disabled'),
    // Scanner observations are NEVER profit receipts or payment approvals.
    verifiedRealizationIngestionConnected:false,livePaymentsEnabled:false},
   legacyImgRewardPipeline:{accountingEnabled,payoutExecutionConfigured:payoutsEnabled,
    distinctFromForwardImgRlusd:true},capitalAllocationPolicy:{...POLICY,automaticDepositsEnabled:fundingEnabled&&env.ESTATE_RLUSD_ENABLED==='1'&&!!env.ESTATE_IMG_RLUSD_POOL_ACCOUNT&&signerMatches&&!guard.paused()},rewardFeePolicy:'deduct_from_earned_rewards_carry_small_amounts',rewardXrpCreditDrops:owner?db.prepare('SELECT drops FROM estate_reward_xrp_credits WHERE owner=?').get(owner)?.drops||'0':'0',rewardImgCreditUnits:owner?db.prepare('SELECT units FROM estate_payout_credits WHERE owner=?').get(owner)?.units||'0':'0',rewardsGuaranteed:false,imgXrpProfitDistributionsEnabled:harvestEnabled&&payoutsEnabled&&a.bootstrapped&&signerMatches&&!guard.paused()&&!lastError,accountingEnabled,distributionsEnabled:payoutsEnabled&&a.bootstrapped&&signerMatches&&!guard.paused()&&!lastError&&!lastBlock,distributionStatus:!payoutsEnabled?'disabled':!a.bootstrapped?'bootstrap_required':!signerMatches?'treasury_signer_unavailable':guard.paused()?'treasury_paused':lastError||lastBlock||'enabled',distributionSchedule:'hourly'};}
 function start(){if(timer||(!accountingEnabled&&!fundingEnabled&&!harvestEnabled&&!forwardScannerEnabled&&!db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state='submitted'").get()&&!db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state IN ('submitted','validated')").get()))return false;timer=setInterval(()=>void tick(),15000);timer.unref?.();void tick();return true;}
 return {status,start,tick};
}
module.exports={createEstateHourlyService};
