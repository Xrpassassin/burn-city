'use strict';
// Read-only, validated XRP Ledger LP history reconstruction. Never signs or writes.
const {N,value}=require('../server/estate-liquidity-ledger');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const POOL='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const LP='0383CE00506A32900ADE91477C8761466F8D1D65';
function lpDelta(entry,treasury=TREASURY,pool=POOL,currency=LP){
 if(entry?.validated!==true||!entry.meta||!Array.isArray(entry.meta.AffectedNodes))
  throw Error('validated_metadata_required');
 let delta=new N(0),hits=0;
 for(const wrapper of entry.meta.AffectedNodes){
  const type=Object.keys(wrapper)[0],n=wrapper[type];
  if(n?.LedgerEntryType!=='RippleState')continue;
  const f=n.FinalFields||n.NewFields||{};
  if(f.Balance?.currency!==currency)continue;
  const low=f.LowLimit?.issuer,high=f.HighLimit?.issuer;
  if(!((low===treasury&&high===pool)||(high===treasury&&low===pool)))continue;
  let before,after;
  if(type==='CreatedNode'){before='0';after=f.Balance.value;}
  else if(type==='DeletedNode'){before=f.Balance.value;after='0';}
  else if(type==='ModifiedNode'){
   if(!n.PreviousFields?.Balance)continue; // Flag-only edit.
   before=n.PreviousFields.Balance.value;after=f.Balance.value;
  }else throw Error('unknown_affected_node');
  delta=delta.plus(value(after).minus(value(before)).times(low===treasury?1:-1));
  hits++;
 }
 if(hits>1)throw Error('ambiguous_lp_balance_delta');
 return hits===1?delta:null;
}
async function rpc(method,params){
 const r=await fetch('https://s1.ripple.com:51234/',{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('xrpl_read_http_'+r.status);
 const out=(await r.json()).result;
 if(!out||out.error)throw Error('xrpl_read_result_'+String(out?.error||'missing'));
 return out;
}
async function audit(){
 const snapshot=await rpc('ledger',{ledger_index:'validated'});
 const height=Number(snapshot.ledger_index??snapshot.ledger?.ledger_index);
 if(!Number.isSafeInteger(height)||height<=0||snapshot.validated!==true)throw Error('validated_snapshot_missing');
 const lines=await rpc('account_lines',{account:TREASURY,peer:POOL,ledger_index:height,limit:400});
 if(lines.marker||lines.validated!==true||Number(lines.ledger_index)!==height)throw Error('incomplete_lp_snapshot');
 const matched=(lines.lines||[]).filter(l=>l.account===POOL&&l.currency===LP);
 if(matched.length!==1)throw Error('unique_lp_trustline_required');
 const current=value(matched[0].balance);
 let marker,seen=0,pages=0,total=new N(0);const events=[],types={};
 do{
  if(pages>=20)throw Error('history_pagination_incomplete');
  const batch=await rpc('account_tx',{account:TREASURY,ledger_index_min:-1,
    ledger_index_max:height,limit:200,forward:true,...(marker?{marker}:{})});
  if(!Array.isArray(batch.transactions))throw Error('history_data_missing');
  for(const entry of batch.transactions){
   const tx=entry.tx_json||entry.tx||{};
   types[tx.TransactionType||'unknown']=(types[tx.TransactionType||'unknown']||0)+1;
   seen++;
   const change=lpDelta(entry);
   if(change!==null){
    total=total.plus(change);
    events.push({hash:entry.hash||tx.hash||null,ledger:entry.ledger_index,
      type:tx.TransactionType||'unknown',result:entry.meta.TransactionResult,
      lpDelta:change.toFixed()});
   }
  }
  pages++;marker=batch.marker;
 }while(marker);
 const sumMatches=total.eq(current);
 const results={readOnly:true,snapshotLedger:height,historyPages:pages,
  transactionsExamined:seen,transactionTypes:types,completePagination:true,
  matchingLpEvents:events,netHistoricalLpDelta:total.toFixed(),
  validatedTreasuryLpBalance:current.toFixed(),
  lpBalanceReconciled:sumMatches,
  initialCostBasisEstablished:false,
  rewardsApproved:false};
 console.log('ESTATES_LP_HISTORY_RECONSTRUCTION='+JSON.stringify(results));
 if(!sumMatches)throw Error('lp_history_balance_mismatch');
 return results;
}
if(require.main===module)audit().catch(e=>{console.error('ESTATES_LP_AUDIT_ERROR='+e.message);process.exitCode=1});
module.exports={lpDelta,audit};
