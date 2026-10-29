'use strict';
// Read-only production diagnostic. Do not import server modules: store.load can
// rename corrupt files and write pause.json. Never print secret values or blobs.
const fs=require('node:fs'),path=require('node:path');
const root=process.env.DATA_DIR||'/data';
const report={checkedAt:new Date().toISOString(),readOnly:true,
 dryRun:process.env.DRY_RUN!=='false',pauseEnvironment:process.env.PAYOUTS_PAUSED==='true',
 signerConfigured:!!process.env.TREASURY_SEED,xamanConfigured:!!((process.env.XAMAN_API_KEY||process.env.XUMM_API_KEY)&&(process.env.XAMAN_API_SECRET||process.env.XUMM_API_SECRET)),
 signerMatchesEstateTreasury:null,pauseFile:{exists:false},database:{exists:false}};
if(report.signerConfigured){
 try{
  const {createRequire}=require('node:module');
  const xrpl=createRequire('/app/package.json')('xrpl');
  report.signerMatchesEstateTreasury=xrpl.Wallet.fromSeed(process.env.TREASURY_SEED).classicAddress===(process.env.ESTATE_TREASURY_ADDRESS||'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb');
 }catch{report.signerMatchesEstateTreasury=false;}
}
const pausePath=path.join(root,'pause.json');
if(fs.existsSync(pausePath)){
 report.pauseFile.exists=true;
 try{
  const pause=JSON.parse(fs.readFileSync(pausePath,'utf8'));
  const reason=typeof pause.reason==='string'&&/^store_corrupt:[a-zA-Z0-9_.-]{1,100}$/.test(pause.reason)?pause.reason:'operator_or_other_reason';
  report.pauseFile={exists:true,paused:pause.paused===true,reason};
 }catch{report.pauseFile={exists:true,unreadable:true};}
}
const dbPath=path.join(root,'shop.db');
if(fs.existsSync(dbPath)){
 report.database.exists=true;
 let db;
 try{
  const {DatabaseSync}=require('node:sqlite');
  db=new DatabaseSync(dbPath,{readOnly:true});
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
  const names=['estate_property_ownership','estate_img_scan_bootstrap','estate_img_scan_watermarks','estate_img_reward_receipts','estate_img_hourly_allocations','estate_img_hourly_batches','estate_img_hourly_entitlements','estate_img_reward_intents'];
  report.database.tables={};
  for(const name of names){
   const exists=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
   report.database.tables[name]={exists,rows:exists?db.prepare('SELECT COUNT(*) n FROM '+name).get().n:0};
  }
  if(report.database.tables.estate_img_scan_bootstrap.exists)report.database.bootstrap=db.prepare('SELECT start_ledger_index,start_ledger_hash FROM estate_img_scan_bootstrap WHERE id=1').get()||null;
 }catch{report.database.readFailed=true;}finally{db?.close();}
}
console.log(JSON.stringify(report));
