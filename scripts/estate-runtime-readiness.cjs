'use strict';
// Read-only production diagnostic. Do not import server modules: store.load can
// rename corrupt files and write pause.json. Never print secret values or blobs.
const fs=require('node:fs'),path=require('node:path');
const root=process.env.DATA_DIR||'/data';
const report={checkedAt:new Date().toISOString(),readOnly:true,
 dryRun:process.env.DRY_RUN!=='false',
 estateSalesEnabled:process.env.ESTATE_SALES_ENABLED==='1',
 estateAccountingEnabled:process.env.ESTATE_ACCOUNTING_ENABLED==='1',
 estateDistributionsEnabled:process.env.ESTATE_DISTRIBUTIONS_ENABLED==='1',
 estateLiquidityEnabled:process.env.ESTATE_LIQUIDITY_ENABLED==='1',
 estateXrpProfitHarvestEnabled:process.env.ESTATE_XRP_PROFIT_HARVEST_ENABLED==='1',pauseEnvironment:process.env.PAYOUTS_PAUSED==='true',
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
  const reason=typeof pause.reason==='string'&&/^(?:unexpected_outgoing_tx|store_corrupt:[a-zA-Z0-9_.-]{1,100})$/.test(pause.reason)?pause.reason:'operator_or_other_reason';
  report.pauseFile={exists:true,paused:pause.paused===true,reason,transactions:Array.isArray(pause.unknown)?pause.unknown.slice(0,30).filter(x=>/^[A-Fa-f0-9]{64}$/.test(x.hash||'')).map(x=>({hash:x.hash,type:typeof x.type==='string'&&/^[A-Za-z]{1,40}$/.test(x.type)?x.type:'unknown'})):[]};
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
  const names=['estate_property_ownership','estate_img_scan_bootstrap','estate_img_scan_watermarks','estate_img_reward_receipts','estate_img_hourly_allocations','estate_img_hourly_batches','estate_img_hourly_entitlements','estate_img_reward_intents','estate_hourly_payouts','estate_capital_allocations','estate_liquidity_jobs','estate_treasury_transactions','estate_xrp_profit_receipts','estate_xrp_profit_payouts'];
  report.database.tables={};
  for(const name of names){
   const exists=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
   report.database.tables[name]={exists,rows:exists?db.prepare('SELECT COUNT(*) n FROM '+name).get().n:0};
  }
  if(report.database.tables.estate_img_scan_bootstrap.exists)report.database.bootstrap=db.prepare('SELECT start_ledger_index,start_ledger_hash FROM estate_img_scan_bootstrap WHERE id=1').get()||null;
 }catch{report.database.readFailed=true;}finally{db?.close();}
}
async function inspectPublicRewards(){
 let client;
 try{
  const {createRequire}=require('node:module');
  const xrpl=createRequire('/app/package.json')('xrpl');
  client=new xrpl.Client(process.env.XRPL_WSS||'wss://xrplcluster.com',{connectionTimeout:6000,timeout:6000});
  await client.connect();
  const treasury=process.env.ESTATE_TREASURY_ADDRESS||'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
  const issuer=process.env.IMG_ISSUER||'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
  const source='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V',pool='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
  const response=await client.request({command:'account_tx',account:treasury,ledger_index_min:-1,ledger_index_max:-1,limit:100,forward:false});
  const data=response.result;
  report.rewardProbe={historyComplete:!data.marker,entriesExamined:data.transactions?.length||0,receipts:[]};
  for(const entry of data.transactions||[]){
   const tx=entry.tx_json||entry.tx||entry,meta=entry.meta;
   if(entry.validated!==true||tx.TransactionType!=='Payment'||tx.Account!==source||tx.Destination!==treasury)continue;
   const delivered=meta?.delivered_amount;
   if(!delivered||typeof delivered!=='object'||delivered.currency!=='IMG'||delivered.issuer!==issuer)continue;
   const memos=(tx.Memos||[]).slice(0,5).map(m=>{try{return Buffer.from(m.Memo.MemoData,'hex').toString('utf8').slice(0,1024);}catch{return '';}});
   const matches=memos.filter(s=>{try{const d=JSON.parse(s);return d.payoutType==='lp'&&d.poolAccount===pool&&d.rewardAsset==='IMG'&&typeof d.roundId==='string'&&d.roundId.length>0;}catch{return false;}});
   report.rewardProbe.receipts.push({hash:entry.hash||tx.hash,ledgerIndex:entry.ledger_index||tx.ledger_index,success:meta.TransactionResult==='tesSUCCESS',deliveredImg:delivered.value,recognizedByCurrentMemoPolicy:matches.length===1,publicMemos:memos});
   if(report.rewardProbe.receipts.length>=5)break;
  }
 }catch{report.rewardProbe={available:false,reason:'public_ledger_probe_unavailable'};}finally{try{await client?.disconnect();}catch{}}
}
inspectPublicRewards().then(()=>console.log(JSON.stringify(report))).catch(()=>{report.rewardProbe={available:false};console.log(JSON.stringify(report));});
