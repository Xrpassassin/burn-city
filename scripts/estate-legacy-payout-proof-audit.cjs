'use strict';
// Checks historic confirmed Estate reward payouts against validated XRPL
// transfers. Read-only production SQLite query + public XRPL tx RPC.
const {verifiedPayout}=require('../server/estate-legacy-payout-verification');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const ISSUER='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const CODE=`
'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const file=path.join(process.env.DATA_DIR||'/data','shop.db');
if(!fs.existsSync(file))throw Error('production_db_missing');
const db=new DatabaseSync(file,{readOnly:true});
db.exec('PRAGMA query_only=ON');
try{
 const rows=db.prepare("SELECT id,owner,state,tx_hash,tx_json,delivered,currency,img_units,spent_img_units,remainder_img_units FROM estate_hourly_payouts ORDER BY epoch_start_ms,id").all();
 if(rows.length>200)throw Error('unexpected_payout_inventory_size');
 console.log(JSON.stringify({readOnly:true,rows}));
}finally{db.close()}
`;
async function rpc(hash){
 const r=await fetch('https://s1.ripple.com:51234/',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({method:'tx',params:[{transaction:hash,binary:false}]}),
  signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('xrpl_rpc_http_'+r.status);
 const d=(await r.json()).result;
 if(!d||d.error)throw Error('xrpl_transaction_unavailable');
 return d;
}
async function records(){
 if(!process.env.FLY_API_TOKEN)throw Error('fly_audit_credential_missing');
 const r=await fetch('https://api.machines.dev/v1/apps/burn-city-game/machines/8d2909be270068/exec',{
  method:'POST',headers:{authorization:'Bearer '+process.env.FLY_API_TOKEN,'content-type':'application/json'},
  body:JSON.stringify({command:['node','-e',CODE],timeout:30}),
  signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error('fly_audit_http_'+r.status);
 const x=await r.json();
 if(x.exit_code!==0)throw Error('production_payout_inventory_unavailable');
 const data=JSON.parse(String(x.stdout||'').trim());
 if(data.readOnly!==true||!Array.isArray(data.rows))throw Error('unexpected_payout_inventory');
 return data.rows;
}
async function audit(){
 const rows=await records();
 if(rows.length===0)throw Error('historical_payout_records_not_found');
 const txIds=new Set(),results=[];
 for(const row of rows){
  if(row.state!=='confirmed')throw Error('historical_payout_not_confirmed');
  if(!/^[A-Fa-f0-9]{64}$/.test(row.tx_hash||''))throw Error('historical_payout_missing_tx_hash');
  if(txIds.has(row.tx_hash.toUpperCase()))throw Error('duplicate_historical_payout_hash');
  txIds.add(row.tx_hash.toUpperCase());
  const tx=await rpc(row.tx_hash);
  results.push(verifiedPayout(row,tx,{treasury:TREASURY,imgIssuer:ISSUER}));
 }
 const report={readOnly:true,historicalPayoutRows:rows.length,
  independentlyValidatedPayoutCount:results.length,
  verifiedPayouts:results.map(r=>({txHashTail:r.hash.slice(-8),ledgerIndex:r.ledgerIndex,
   currency:r.currency,sourceImgUnits:r.sourceImgUnits,unspentBudgetUnits:r.unspentBudgetUnits})),
  recordedCreditBalanceRequiresSeparateCheck:true,
  original3XrpCapitalReconciled:false,allOtherObligationsDischarged:false,
  purchaseActivationAuthorized:false,rewardActivationAuthorized:false,
  treasuryPauseReleaseAuthorized:false};
 console.log('ESTATES_HISTORIC_PAYOUT_PROOFS='+JSON.stringify(report));
 return report;
}
if(require.main===module)audit().catch(e=>{
 console.error('ESTATES_PAYOUT_PROOF_AUDIT_ERROR='+e.message);process.exitCode=1;
});
module.exports={audit,records};
