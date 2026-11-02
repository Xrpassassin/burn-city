'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./estate-liquidity-runtime.test');
const {createEstateHourlyService}=require('./estate-hourly-service');
const make=(enabled)=>{
 const f=fixture({policyVersion:2});
 const service=createEstateHourlyService({
  db:f.db,pay:{ledger:async()=>f.client},
  config:{NETWORK:'testnet',DRY_RUN:true,ESTATE_TREASURY:f.treasury,
   IMG_ISSUER:f.IMG.issuer,PLX_ISSUER:f.options.plxIssuer,TREASURY_SEED:''},
  guard:{paused:()=>true,check:async()=>null},
  env:{ESTATE_FORWARD_RLUSD_SCAN_ENABLED:enabled?'1':'0'}
 });
 return {f,service};
};
(async()=>{
 const stopped=make(false);
 const initial=stopped.service.status(stopped.f.owner).forwardImgRlusdRewards;
 assert.equal(initial.validatedHourScannerEnabled,false);
 assert.equal(initial.validatedHourScannerStatus,'disabled');
 assert.equal(initial.livePaymentsEnabled,false);
 assert.equal(stopped.f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='estate_rlusd_hour_scan_checkpoint'").get().n,0);
 assert.equal(stopped.service.start(),false,'default-off should not start any timer');
 const active=make(true);
 const prior=active.service.status(active.f.owner).forwardImgRlusdRewards;
 assert.equal(prior.validatedHourScannerEnabled,true);
 assert.equal(prior.validatedHourScannerStatus,'not_started');
 assert.equal(prior.livePaymentsEnabled,false);
 await active.service.tick();
 const after=active.service.status(active.f.owner).forwardImgRlusdRewards;
 assert.equal(after.validatedHourScannerStatus,'immutable_forward_start_required');
 assert.equal(after.validatedHourScannerCheckpointLedger,null);
 assert.equal(after.settlementEngineConnected,false);
 assert.equal(after.verifiedRealizationIngestionConnected,false);
 assert.equal(after.livePaymentsEnabled,false);
 assert.equal(active.f.db.prepare('SELECT COUNT(*) n FROM estate_rlusd_hour_scan_checkpoint').get().n,0);
 assert.equal(active.f.sent.length,0);
 assert.equal(active.f.db.prepare('SELECT COUNT(*) n FROM estate_hourly_payouts').get().n,0);
 console.log('Future scanner: default-off, explicit opt-in, no start fail-closed, no signing, no payout passed');
})().catch(e=>{console.error(e);process.exitCode=1});
