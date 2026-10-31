'use strict';const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{createRequire}=require('node:module'),req=createRequire('/data/gh/cur/package.json'),C=req('./server/config');
(async()=>{const db=new DatabaseSync(path.join(C.DATA_DIR,'shop.db'),{readOnly:true});db.exec('PRAGMA query_only=ON;PRAGMA busy_timeout=3000');try{
 const p=db.prepare("SELECT acct,purchased_at FROM estate_property_ownership WHERE property_id='trailer-01'").get();if(!p)throw Error('purchase_not_found');
 const exists=t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
 const status=await (await fetch('http://127.0.0.1:'+C.PORT+'/api/estates/status')).json();
 const preference=db.prepare('SELECT currency FROM estate_owner_payout_preferences WHERE acct=?').get(p.acct)||null;
 const checkpoint=db.prepare('SELECT * FROM estate_img_scan_watermarks WHERE id=1').get();
 const receipts=db.prepare('SELECT COUNT(*) n,MAX(received_at_ms) latest FROM estate_img_reward_receipts WHERE received_at_ms>=?').get(p.purchased_at);
 const allocations=db.prepare('SELECT COUNT(*) n,MAX(epoch_start_ms) latest FROM estate_img_hourly_allocations WHERE owner=?').get(p.acct);
 const payouts=db.prepare('SELECT epoch_start_ms,currency,state,note,tx_hash FROM estate_hourly_payouts WHERE owner=? ORDER BY epoch_start_ms DESC LIMIT 12').all(p.acct).map(({tx_hash,...r})=>({...r,hasTransaction:!!tx_hash}));
 const native=db.prepare('SELECT state,COUNT(*) n FROM estate_xrp_profit_payouts WHERE owner=? GROUP BY state').all(p.acct);
 const profit=db.prepare("SELECT COUNT(*) n FROM estate_xrp_profit_receipts WHERE realized_at_ms>=? AND CAST(distributable_drops AS INTEGER)>0").get(p.purchased_at);
 const jobs=db.prepare("SELECT pair,state,note,last_harvest_hour FROM estate_liquidity_jobs WHERE purchase_tx IN (SELECT purchase_tx FROM estate_property_ownership WHERE acct=?)").all(p.acct);
 const pending=db.prepare("SELECT purpose,state,note FROM estate_treasury_transactions WHERE state!='applied' ORDER BY created_at DESC LIMIT 10").all();
 const pause=JSON.parse(fs.readFileSync(path.join(C.DATA_DIR,'pause.json'),'utf8'));
 console.log(JSON.stringify({readOnly:true,checkedAt:new Date().toISOString(),status,preference,purchasedAt:p.purchased_at,checkpoint,scannerLagMs:Date.now()-checkpoint.scanned_through_ms,receiptsSincePurchase:receipts,ownerAllocations:allocations,ownerPayouts:payouts,nativePayoutCounts:native,positiveNativeProfitReceipts:profit.n,jobs,pendingTreasuryTransactions:pending,paused:pause.paused,pauseReason:pause.reason||null,privateAmountsNotLogged:true}));
}finally{db.close();}})().catch(e=>{console.log(JSON.stringify({readOnly:true,error:e.message}));process.exitCode=1;});