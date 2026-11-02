'use strict';
// Public XRPL queries only; reports validated AMM withdrawal asset movements.
// No yield inference, signing, production DB mutation or fund transfer.
const {isRlusdPoolWithdrawal,inspectValidatedRlusdWithdrawal}
 =require('../server/estate-rlusd-realized-withdrawal-evidence');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
async function rpc(method,params){
 const response=await fetch('https://s1.ripple.com:51234/',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({method,params:[params]}),
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('ledger_http_'+response.status);
 const result=(await response.json()).result;
 if(!result||result.error)throw Error('ledger_rpc_'+String(result?.error||'empty'));
 return result;
}
async function inspect(){
 const head=await rpc('ledger',{ledger_index:'validated'});
 const snapshotLedger=Number(head.ledger_index??head.ledger?.ledger_index);
 if(head.validated!==true||!Number.isSafeInteger(snapshotLedger)||snapshotLedger<1)
  throw Error('validated_snapshot_required');
 const events=[],markers=new Set();
 let marker,scanned=0,pages=0;
 do{
  if(pages>=20)throw Error('incomplete_treasury_history');
  const batch=await rpc('account_tx',{account:TREASURY,
   ledger_index_min:-1,ledger_index_max:snapshotLedger,limit:200,forward:true,
   ...(marker?{marker}:{})});
  if(!Array.isArray(batch.transactions))throw Error('unavailable_treasury_history');
  for(const item of batch.transactions){
   const tx=item.tx_json||item.tx||{};
   scanned++;
   if(tx.TransactionType!=='AMMWithdraw')continue;
   if(item.validated!==true)throw Error('unvalidated_withdrawal_in_history');
   const candidate={...item,hash:item.hash||tx.hash};
   if(!isRlusdPoolWithdrawal(candidate))continue;
   if(!/^[A-Fa-f0-9]{64}$/.test(candidate.hash||''))throw Error('missing_candidate_hash');
   // Independently re-fetch the exact validated transaction; account_tx
   // history response variants need not contain the full tx ledger metadata.
   const verified=await rpc('tx',{transaction:candidate.hash,binary:false});
   if(verified.validated!==true||Number(verified.ledger_index)>snapshotLedger)
    throw Error('unvalidated_or_future_withdrawal');
   events.push(inspectValidatedRlusdWithdrawal({...verified,hash:candidate.hash}));
  }
  pages++;
  marker=batch.marker;
  if(marker){
   const key=JSON.stringify(marker);
   if(markers.has(key))throw Error('repeated_history_cursor');
   markers.add(key);
  }
 }while(marker);
 const result={readOnly:true,snapshotLedger,historyComplete:true,
  pages,transactionsExamined:scanned,validatedImgRlusdWithdrawals:events,
  withdrawalCount:events.length,
  // A withdraw is not an independently verified profit receipt.
  independentlyVerifiedDistributableProfitUnits:'0',
  newRewardEntitlementsCreated:0,financialActivationAuthorized:false};
 console.log('ESTATES_RLUSD_REALIZATION_EVIDENCE='+JSON.stringify(result));
 return result;
}
if(require.main===module)inspect().catch(e=>{
 console.error('ESTATES_RLUSD_REALIZATION_AUDIT_ERROR='+e.message);process.exitCode=1;
});
module.exports={inspect};
