'use strict';const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{createRequire}=require('node:module'),req=createRequire('/data/gh/cur/package.json'),C=req('./server/config');
(async()=>{const db=new DatabaseSync(path.join(C.DATA_DIR,'shop.db'),{readOnly:true});db.exec('PRAGMA query_only=ON;PRAGMA busy_timeout=3000');try{
const p=db.prepare("SELECT acct FROM estate_property_ownership WHERE property_id='trailer-01'").get();
const version=await(await fetch('http://127.0.0.1:'+C.PORT+'/api/deploy-version')).json(),status=await(await fetch('http://127.0.0.1:'+C.PORT+'/api/estates/status')).json();
const exists=t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const tables=['estate_reward_settlements','estate_reward_xrp_credits','estate_reward_carryovers','estate_img_trustline_requests'];const schemasReady=tables.every(exists);
const payouts=db.prepare('SELECT currency,state,note,tx_hash FROM estate_hourly_payouts WHERE owner=? ORDER BY epoch_start_ms DESC LIMIT 12').all(p.acct).map(({tx_hash,...r})=>({...r,hasTransaction:!!tx_hash}));
const settlements=schemasReady?db.prepare("SELECT state,COUNT(*) n FROM estate_reward_settlements WHERE owner=? GROUP BY state").all(p.acct):[];
const unrecoveredFeeCount=schemasReady?db.prepare("SELECT COUNT(*) n FROM estate_reward_settlements WHERE unrecovered_fee_drops!='0'").get().n:null;
const pending=db.prepare("SELECT purpose,state,note FROM estate_treasury_transactions WHERE state!='applied' ORDER BY created_at DESC LIMIT 10").all();
const checkpoint=db.prepare('SELECT scanned_through_ms FROM estate_img_scan_watermarks WHERE id=1').get();
const ui=fs.readFileSync('/data/gh/cur/client/js/estate-purchase-ui.mjs','utf8'),portfolioUi=fs.readFileSync('/data/gh/cur/client/js/estate-portfolio-ui.mjs','utf8'),service=fs.readFileSync('/data/gh/cur/server/estate-hourly-service.js','utf8');
console.log(JSON.stringify({readOnly:true,checkedAt:new Date().toISOString(),version,status,schemasReady,trustlineOptionDeployed:ui.includes('Set up IMG trustline in Xaman')&&portfolioUi.includes('mountEstateImgTrustline'),netRewardExecutorActiveInService:service.includes('await netRewards.tick('),feePolicyConfigured:service.includes('deduct_from_earned_rewards_carry_small_amounts'),payouts,settlements,unrecoveredFeeCount,pendingTreasuryTransactions:pending,scannerLagMs:Date.now()-checkpoint.scanned_through_ms,privateAmountsNotLogged:true}));
}finally{db.close();}})().catch(e=>{console.log(JSON.stringify({readOnly:true,error:e.message}));process.exitCode=1;});