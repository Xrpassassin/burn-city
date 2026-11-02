'use strict';
// Validated, read-only account history after the manual IMG/PLX withdrawal.
// Demonstrates token balance changes, NOT beneficial capital ownership.
const {balanceDelta}=require('../server/estate-liquidity-ledger');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const FROM=108015969;
const img={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const plx={currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'};
async function rpc(method,params){
 const r=await fetch('https://s1.ripple.com:51234/',{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('xrpl_history_http_'+r.status);
 const d=(await r.json()).result;
 if(!d||d.error)throw Error('xrpl_history_unavailable_'+String(d?.error||'empty'));
 return d;
}
function delta(entry,issue){
 try{return balanceDelta(entry,TREASURY,issue).toFixed()}
 catch(e){if(e.message==='unique_asset_delta_required')return null;throw e}
}
async function main(){
 const h=await rpc('ledger',{ledger_index:'validated'});
 const max=Number(h.ledger_index??h.ledger?.ledger_index);
 if(h.validated!==true||!Number.isSafeInteger(max))throw Error('validated_snapshot_missing');
 let marker,scanned=0,pages=0;const seen=new Set(),events=[];
 do{
  if(pages>=10)throw Error('history_incomplete');
  const batch=await rpc('account_tx',{account:TREASURY,ledger_index_min:FROM,
   ledger_index_max:max,limit:200,forward:true,...(marker?{marker}:{})});
  if(!Array.isArray(batch.transactions)||Number(batch.ledger_index_min)>FROM||
    Number(batch.ledger_index_max)<max)throw Error('historical_range_unavailable');
  for(const e of batch.transactions){
   const tx=e.tx_json||e.tx||{};
   if(e.validated!==true)throw Error('unvalidated_history_entry');
   const hash=e.hash||tx.hash;
   if(!/^[A-Fa-f0-9]{64}$/.test(hash||''))throw Error('missing_transaction_hash');
   if(seen.has(hash))throw Error('duplicate_account_history');
   seen.add(hash);scanned++;
   if(e.meta?.TransactionResult!=='tesSUCCESS')continue;
   const dimg=delta(e,img),dplx=delta(e,plx);
   if(dimg===null&&dplx===null)continue;
   events.push({ledgerIndex:e.ledger_index,hash,kind:tx.TransactionType,
    imgDelta:dimg,plxDelta:dplx,
    destination:tx.TransactionType==='Payment'&&tx.Account===TREASURY?tx.Destination:null});
  }
  pages++;marker=batch.marker;
 }while(marker);
 const result={readOnly:true,fromLedger:FROM,toLedger:max,fullHistory:true,
  pages,transactionsScanned:scanned,relevantValidatedAssetMovements:events,
  remainingProceedsAttributedToCustomer:false,capitalStatus:'requires_reconciliation',
  treasuryPauseReleaseAuthorized:false};
 console.log('ESTATES_MANUAL_WITHDRAWAL_FOLLOWON_FLOW='+JSON.stringify(result));
 return result;
}
if(require.main===module)main().catch(e=>{console.error('ESTATES_WITHDRAWAL_FLOW_ERROR='+e.message);process.exitCode=1});
module.exports={main};
