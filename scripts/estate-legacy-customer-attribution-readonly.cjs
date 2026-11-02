'use strict';
// Read-only operator audit of legacy Estates pool custody and liabilities.
// Intended to run on the Fly machine with its persisted DATA_DIR.
// No signer, secrets, trustlines, payment authorizations or DB mutation.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const dbPath=path.join(process.env.DATA_DIR||'/data','shop.db');
if(!fs.existsSync(dbPath))throw Error('treasury_accounting_database_missing');
const db=new DatabaseSync(dbPath,{readOnly:true});
db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
const integer=s=>{if(!/^(?:0|[1-9][0-9]*)$/.test(String(s)))throw Error('invalid_stored_integer');return BigInt(s)};
const name=/^[a-z][a-z0-9_]{1,70}$/;
const table=x=>{
 if(!name.test(x))throw Error('invalid_table');
 return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(x)
};
const report={readOnly:true,accountsRedacted:true,assetMovementsReconciled:false,
 customerLiabilitiesReconciled:false,treasuryPauseReleaseAuthorized:false,sections:{}};
try{
 const names=['estate_capital_allocations','estate_liquidity_jobs',
  'estate_treasury_transactions','estate_xrp_profit_receipts',
  'estate_xrp_profit_payouts','estate_img_hourly_entitlements','estate_hourly_payouts',
  'estate_payout_credits','estate_reward_xrp_credits','estate_xrp_profit_credits',
  'estate_late_payment_reviews','estate_rlusd_forward_owner_drafts'];
 report.tableCounts=Object.fromEntries(names.map(n=>[n,table(n)?db.prepare('SELECT COUNT(*) n FROM '+n).get().n:null]));
 if(!table('estate_capital_allocations')||!table('estate_liquidity_jobs')||
   !table('estate_treasury_transactions'))throw Error('required_capital_journal_missing');
 const allocations=db.prepare('SELECT * FROM estate_capital_allocations ORDER BY created_at,purchase_tx').all();
 report.sections.customerCapital=allocations.map(a=>({
  purchaseRefTail:String(a.purchase_tx||'').slice(-8),policyVersion:a.policy_version,
  priceDrops:String(a.purchase_drops),imgPlxDrops:String(a.img_plx_drops),
  imgXrpDrops:String(a.img_xrp_drops),imgRlusdDrops:String(a.img_rlusd_drops||'0'),
  operatingReserveDrops:String(a.operating_reserve_drops||'0'),state:a.state,
  txValidatedHere:false}));
 const jobs=db.prepare('SELECT * FROM estate_liquidity_jobs ORDER BY pair,id').all();
 report.sections.legacyPositions=jobs.map(row=>{
  let d;try{d=JSON.parse(row.data_json)}catch{throw Error('invalid_position_json')}
  const fields=['cash','img','plx','rlusd','lp','basis','fees','imgCost',
   'plxCost','rlusdCost','residualImgCost','residualPlxCost','residualRlusdCost','harvestBasis'];
  const values=Object.fromEntries(fields.filter(k=>d[k]!==undefined).map(k=>[k,String(d[k])]));
  return {pair:row.pair,state:row.state,note:typeof row.note==='string'?row.note.slice(0,110):null,
   purchaseRefTail:String(row.purchase_tx||'').slice(-8),budgetDrops:String(row.initial_budget_drops),
   poolAccount:d.lpAccount||null,lpCurrency:d.lpCurrency||null,values};
 });
 const allocationIds=new Set(allocations.map(a=>a.purchase_tx));
 report.sections.positionsWithoutPurchase=jobs.filter(r=>!allocationIds.has(r.purchase_tx)).length;
 report.sections.expectedLegacyBudgetDrops=allocations.filter(a=>a.policy_version===1)
  .reduce((sum,a)=>sum+integer(a.img_plx_drops)+integer(a.img_xrp_drops),0n).toString();
 report.sections.legacyJobBudgetDrops=jobs.filter(j=>j.pair==='img-plx'||j.pair==='img-xrp')
  .reduce((sum,r)=>sum+integer(r.initial_budget_drops),0n).toString();
 const j= db.prepare('SELECT * FROM estate_treasury_transactions').all();
 const hash='581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2';
 report.sections.treasuryJournal={total:j.length,states:j.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{}),
  flaggedWithdrawalFound:j.some(r=>Object.values(r).some(v=>typeof v==='string'&&v.toUpperCase().includes(hash)))};
 for(const name of ['estate_xrp_profit_payouts','estate_img_hourly_entitlements','estate_hourly_payouts','estate_payout_credits','estate_reward_xrp_credits']){
  if(!table(name))continue;
  const cols=db.prepare('PRAGMA table_info('+name+')').all().map(r=>r.name);
  const state=cols.includes('state')?db.prepare('SELECT state,COUNT(*) n FROM '+name+' GROUP BY state').all():null;
  report.sections[name]={rows:report.tableCounts[name],states:state};
 }
 console.log(JSON.stringify(report));
}finally{db.close()}
