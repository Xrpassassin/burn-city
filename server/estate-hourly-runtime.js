'use strict';
// Accounting runner: source-scoped scanning -> historical ownership -> closed
// hourly entitlements -> durable settlement intents. No signing in this module.
const crypto=require('node:crypto');
const {createImgHistoricalBootstrap}=require('./estate-img-historical-bootstrap');
const {createImgValidatedLedgerScanner}=require('./estate-img-validated-ledger-scanner');
const {createImgHourlyRewardLedger}=require('./estate-img-hourly-rewards');
const {createEstateImgOwnershipSnapshots}=require('./estate-img-ownership-snapshots');
const {createImgHourlyBatchReconciler}=require('./estate-img-hourly-batches');
const POOL='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const SOURCE='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V';
function createEstateHourlyRuntime({db,client,treasury,imgIssuer,enabled=false,maxLedgers=25}={}){
 if(!Number.isSafeInteger(maxLedgers)||maxLedgers<1||maxLedgers>100)throw Error('invalid_scan_budget');
 const config={treasury,imgIssuer,allowedSources:[SOURCE],rewardPoolAccount:POOL};
 const bootstrap=createImgHistoricalBootstrap(db),ledger=createImgHourlyRewardLedger(db,config);
 const batches=createImgHourlyBatchReconciler(db),owners=createEstateImgOwnershipSnapshots(db);
 const scanner=createImgValidatedLedgerScanner({db,client,...config});
 db.exec(`CREATE TABLE IF NOT EXISTS estate_hourly_payouts(
 id TEXT PRIMARY KEY,epoch_start_ms INTEGER NOT NULL,owner TEXT NOT NULL,
 img_units TEXT NOT NULL,base_img_units TEXT NOT NULL,currency TEXT CHECK(currency IN ('IMG','XRP') OR currency IS NULL),
 state TEXT NOT NULL CHECK(state IN ('queued','preparing','submitted','confirmed','held')),
 tx_hash TEXT UNIQUE,tx_blob TEXT,tx_json TEXT,note TEXT,delivered TEXT,spent_img_units TEXT,remainder_img_units TEXT,checked_at_ms INTEGER NOT NULL DEFAULT 0,submitted_at_ms INTEGER,
 UNIQUE(epoch_start_ms,owner));
 CREATE TABLE IF NOT EXISTS estate_payout_credits(owner TEXT PRIMARY KEY,units TEXT NOT NULL);`);
 let busy=false;
 function enqueue(hour){
  db.exec('BEGIN IMMEDIATE');try{
   const batch=db.prepare('SELECT total_units FROM estate_img_hourly_batches WHERE epoch_start_ms=?').get(hour);
   if(!batch)throw Error('closed_hour_required');
   const rows=db.prepare('SELECT owner,amount_units FROM estate_img_hourly_entitlements WHERE epoch_start_ms=? ORDER BY owner').all(hour);
   if(rows.reduce((s,r)=>s+BigInt(r.amount_units),0n)!==BigInt(batch.total_units))throw Error('entitlement_total_mismatch');
   for(const r of rows){if(BigInt(r.amount_units)<=0n)continue;
    const preference=db.prepare('SELECT currency FROM estate_owner_payout_preferences WHERE acct=?').get(r.owner)?.currency||null;
    const id=crypto.createHash('sha256').update(hour+':'+r.owner).digest('hex');
    const prior=db.prepare('SELECT base_img_units FROM estate_hourly_payouts WHERE id=?').get(id);
    if(prior){if(prior.base_img_units!==r.amount_units)throw Error('frozen_payout_conflict');continue;}
    const credit=db.prepare('SELECT units FROM estate_payout_credits WHERE owner=?').get(r.owner)?.units||'0';
    db.prepare("INSERT INTO estate_hourly_payouts(id,epoch_start_ms,owner,img_units,base_img_units,currency,state) VALUES(?,?,?,?,?,?,'queued')").run(id,hour,r.owner,String(BigInt(r.amount_units)+BigInt(credit)),r.amount_units,preference);
    db.prepare("INSERT INTO estate_payout_credits VALUES(?,'0') ON CONFLICT(owner) DO UPDATE SET units='0'").run(r.owner);
   }
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 async function tick(){
  if(!enabled)return {skipped:'disabled'};if(busy)return {skipped:'busy'};busy=true;
  try{
   const cfg=bootstrap.current();if(!cfg)return {blocked:'historical_bootstrap_required'};
   const latest=(await client.request({command:'ledger',ledger_index:'validated'})).result;
   const index=Number(latest?.ledger_index??latest?.ledger?.ledger_index);
   if(latest?.validated!==true||!Number.isSafeInteger(index))throw Error('validated_head_required');
   let next=(scanner.current()?.ledger_index??(cfg.start_ledger_index-1))+1,scanned=0;
   while(next<=index&&scanned<maxLedgers){await scanner.scan(next++);scanned++;}
   const pending=db.prepare(`SELECT r.* FROM estate_img_reward_receipts r WHERE NOT EXISTS(SELECT 1 FROM estate_img_hourly_allocations a WHERE a.tx_hash=r.tx_hash) AND NOT EXISTS(SELECT 1 FROM estate_img_retained_receipts t WHERE t.tx_hash=r.tx_hash) ORDER BY r.ledger_index LIMIT 100`).all();
   for(const r of pending){const holdings=owners.at(r.received_at_ms);if(!holdings.length)db.prepare("INSERT INTO estate_img_retained_receipts VALUES(?,'no_eligible_owners')").run(r.tx_hash);else ledger.allocate({txHash:r.tx_hash,holdings});}
   const through=scanner.current()?.scanned_through_ms||0;
   const hours=db.prepare('SELECT DISTINCT epoch_start_ms FROM estate_img_reward_receipts WHERE epoch_start_ms+3600000<=? ORDER BY epoch_start_ms').all(through);
   for(const {epoch_start_ms:hour} of hours){if(!db.prepare('SELECT 1 FROM estate_img_hourly_batches WHERE epoch_start_ms=?').get(hour))batches.close(hour);enqueue(hour);}
   return {scanned,throughLedger:scanner.current()?.ledger_index||null};
  }finally{busy=false;}
 }
 function state(owner){return {enabled,bootstrapped:!!bootstrap.current(),checkpoint:scanner.current(),payouts:owner?db.prepare('SELECT id,epoch_start_ms,img_units,currency,state,tx_hash,note,delivered,spent_img_units,remainder_img_units FROM estate_hourly_payouts WHERE owner=? ORDER BY epoch_start_ms DESC LIMIT 100').all(owner):[]};}
 return {tick,state,enqueue};
}
module.exports={createEstateHourlyRuntime,POOL,SOURCE};
