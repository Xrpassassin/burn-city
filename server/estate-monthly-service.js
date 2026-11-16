'use strict';
// Server wiring for the Estates monthly plan. OFF unless ALL of:
//  ESTATE_MONTHLY_PLAN_ENABLED=1, mainnet, DRY_RUN=false, ESTATE_IMG_RLUSD_POOL_ACCOUNT equals the
//  verified IMG/RLUSD AMM, TREASURY_SEED signs for ESTATE_TREASURY_ADDRESS, and the treasury is not paused.
// Each tick: queued two-sided deposits (every ~5 min while queued, else hourly), then at most hourly
// the harvest check (once per completed UTC month, or once per completed UTC day when cadence is daily).
const P=require('./estate-monthly-plan');
const {createEstateMonthlyExecutor}=require('./estate-monthly-executor');
const RLUSD_XRP_REF={currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER};
function polluxXrpFailure(error){
 const msg=String(error?.message||'');
 const rpc=String(error?.data?.error||'');
 let reason='unexpected_processing_error';
 if(/quota|rate.?limit|slowDown|tooBusy|too many|429|ECONNRESET|NotConnected|DisconnectedError|timeout/i.test(msg+' '+rpc))reason='xrpl_temporarily_unavailable';
 else if(['pollux_xrp_reserve_required','capital_reserve_underflow','invalid_reward_reserve','treasury_signer_required','treasury_paused',
  'unsafe_pollux_xrp_payment','pollux_xrp_payment_proof_required','pollux_xrp_payment_proof_mismatch',
  'pollux_history_incomplete','pollux_history_entry_invalid','pollux_history_backfill_incomplete','pollux_history_start_unavailable',
  'pollux_validated_head_required'].includes(msg))reason=msg;
 else if(/^step_(pending|expired|rejected|failed):/.test(msg))reason=msg.split(':',1)[0];
 else if(/^ERR_SQLITE/.test(String(error?.code||'')))reason='accounting_database_error';
 return {stage:error?.polluxStage==='scan'?'scan':'payout',reason};
}
function createEstateMonthlyService({db,pay,config,guard,env=process.env,timers=null,executor=null}){
 const cfg=P.monthlyConfig(env);
 // Policy v4 (OFF unless ESTATE_POLICY_V4_ENABLED=1): 90/5/5 IMG/PLX, IMG/XRP, IMG/RLUSD for new
 // purchases, auto-compound (fee harvest skipped), Pollux hourly IMG to holders with an IMG burn.
 const v4=require('./estate-v4-plan').v4Config(env);
 const accountingEnabled=env.ESTATE_ACCOUNTING_ENABLED==='1';
 const live=config.NETWORK==='mainnet'&&config.DRY_RUN===false;
 let signerMatches=false;try{signerMatches=!!config.TREASURY_SEED&&require('xrpl').Wallet.fromSeed(config.TREASURY_SEED).classicAddress===config.ESTATE_TREASURY;}catch{}
 const poolOk=cfg.poolAccount===P.IMG_RLUSD_POOL&&cfg.imgIssuer===P.IMG_ISSUER&&cfg.rlusdIssuer===P.RLUSD_ISSUER;
 const blockers=[!cfg.enabled&&'monthly_plan_switch_off',!live&&'not_mainnet_live',!poolOk&&'pool_account_not_set',!signerMatches&&'treasury_signer_mismatch'].filter(Boolean);
 const enabled=blockers.length===0;
 const v4Blockers=v4.enabled?[...blockers,!v4.poolOk&&'img_plx_pool_account_not_set'].filter(Boolean):['policy_v4_switch_off'];
 const v4On=v4.enabled&&v4Blockers.length===0;
 const client={request:async q=>(await pay.ledger()).request(q),autofill:async q=>(await pay.ledger()).autofill(q)};
 const ex=executor||createEstateMonthlyExecutor({db,client,treasury:config.ESTATE_TREASURY,cfg,enabled,paused:()=>guard.paused(),
  xrpRlusdAsset:RLUSD_XRP_REF,xrpImgAsset:{currency:cfg.imgCurrency,issuer:cfg.imgIssuer},
  wallet:()=>{try{return require('xrpl').Wallet.fromSeed(config.TREASURY_SEED);}catch{return null;}},
  log:(k,o)=>guard.log('estate-monthly-'+k,o),v4:{...v4,enabled:v4On}});
 // Scheduler: deposit chunks every depositChunkIntervalMs while deposits are queued, hourly when
 // the queue is empty. The harvest is checked at most hourly (timing unchanged). A settled
 // purchase calls kick() to queue and start its deposit immediately. Single-flight: never two passes.
 const T={setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:t=>clearTimeout(t),now:()=>Date.now(),...(timers||{})};
 const FAST=cfg.depositChunkIntervalMs,IDLE=cfg.idleIntervalMs||3600e3,V4_WAKE=15*60e3;
 let timer=null,busy=false,again=false,started=false,lastError=null,polluxXrpError=null,polluxXrpDiagnostic=null,polluxBurnError=null,last=null,lastMonthlyAt=0,rateLimitStreak=0,nextRunAt=null,mode='idle';
 const isRateLimit=e=>/quota|rate.?limit|slowDown|tooBusy|too many|429|ECONNRESET|NotConnected|DisconnectedError|timeout/i.test(String(e?.message||'')+' '+String(e?.data?.error||''));
 function schedule(ms){if(timer)T.clearTimeout(timer);nextRunAt=T.now()+ms;timer=T.setTimeout(()=>{timer=null;void tick();},ms);timer?.unref?.();}
 function nextDelay(){
  if(rateLimitStreak>0)return Math.min(IDLE,FAST*2**Math.min(rateLimitStreak,4)); // 10,20,40,60 min backoff
  if(/^step_(failed|rejected|expired)/.test(lastError||''))return IDLE; // ledger step failure: no fast retries
  let queued=0;try{queued=ex.queuedCount()+(v4On&&ex.v4QueuedCount?ex.v4QueuedCount():0);}catch{}
  mode=queued>0?'fast':'idle';
  // v4 on: wake at least every 15 min so each closed Pollux hour is paid promptly.
  return queued>0?FAST:(v4On?Math.min(IDLE,V4_WAKE):IDLE);
 }
 async function tick({monthly}={}){
  if(busy){again=true;return {ok:false,error:'tick_in_progress'};}
  busy=true;
  try{
   const deposits=await ex.processDeposits();
   const dueMonthly=monthly===true||T.now()-lastMonthlyAt>=IDLE-1000;
   // v4 auto-compounds every pool: the fee harvest is skipped while v4 is on.
   last={deposits,...(dueMonthly&&!v4On?{monthly:await ex.runMonthly()}:{}),at:T.now()};
   if(v4On&&ex.processV4Deposits){
    if(accountingEnabled&&ex.runPolluxXrp){
     try{await ex.runPolluxXrp();polluxXrpError=null;polluxXrpDiagnostic=null;}
     catch(e){
      polluxXrpError='pollux_xrp_processing_delayed';
      polluxXrpDiagnostic=polluxXrpFailure(e);
      console.error('[estate-pollux-xrp]',e.message);
     }
    }
    last.v4Deposits=await ex.processV4Deposits();
    last.pollux=await ex.runPolluxPayouts();
    if(ex.runPolluxBurns){
     try{await ex.runPolluxBurns();polluxBurnError=null;}
     catch(e){polluxBurnError='pollux_burn_processing_delayed';console.error('[estate-pollux-burn]',e.message);}
    }
   }
   if(dueMonthly)lastMonthlyAt=T.now();
   lastError=null;rateLimitStreak=0;
  }catch(e){lastError=e.message;rateLimitStreak=isRateLimit(e)?rateLimitStreak+1:0;console.error('[estate-monthly]',e.message);}
  finally{busy=false;}
  if(started){if(again&&rateLimitStreak===0){again=false;schedule(1000);}else{again=false;schedule(nextDelay());}}
  return last;
 }
 // Instant deposit on settlement: queue now (DB only) and run the next pass right away.
 function kick(){
  if(!enabled||guard.paused())return false;
  try{ex.syncPurchases();}catch(e){lastError=e.message;}
  if(!started)return false;
  if(busy){again=true;return true;}
  if(rateLimitStreak>0)return true; // keep the backoff; the queued deposit runs at the next slot
  schedule(0);return true;
 }
 function start(){if(!enabled||started)return false;started=true;schedule(30e3);return true;}
 function stop(){started=false;if(timer)T.clearTimeout(timer);timer=null;}
 const status=()=>({...ex.status(),enabled:enabled&&!guard.paused(),depositCadence:{mode,chunkIntervalMs:FAST,idleIntervalMs:IDLE,nextRunAt,rateLimitBackoff:rateLimitStreak>0},blockers:guard.paused()?[...blockers,'treasury_paused']:blockers,policyV4Blockers:v4Blockers,polluxXrpError,polluxXrpDiagnostic,polluxBurnError,lastError,rewardsGuaranteed:false});
 return {start,stop,tick,kick,status,polluxRewards:owner=>ex.polluxRewards(owner),executor:ex};
}
module.exports={createEstateMonthlyService};
