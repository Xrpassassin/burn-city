'use strict';
// Read-only public-ledger trace of treasury movements from the retired
// IMG/PLX withdrawal to the IMG/RLUSD AMM creation. No inferred customer
// funding attribution, signing, payment creation, or production DB updates.
const {N,value}=require('../server/estate-liquidity-ledger');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const WITHDRAW=108015969,CREATE=108016045;
const tokenAssets={
 IMG:{currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'},
 PLX:{currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'},
 RLUSD:{currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'}
};
const HASH=/^[A-Fa-f0-9]{64}$/;
function tokenDelta(result,asset,account=TREASURY){
 if(result?.validated!==true||result.meta?.TransactionResult!=='tesSUCCESS'||
  !Array.isArray(result.meta.AffectedNodes))throw Error('validated_token_metadata_required');
 let change=new N(0),matched=0;
 for(const w of result.meta.AffectedNodes){
  const kind=Object.keys(w)[0],n=w[kind],f=n?.FinalFields||n?.NewFields||{},p=n?.PreviousFields||{};
  if(n?.LedgerEntryType!=='RippleState'||f?.Balance?.currency!==asset.currency)continue;
  const low=f.LowLimit?.issuer,high=f.HighLimit?.issuer;
  if(!((low===account&&high===asset.issuer)||(high===account&&low===asset.issuer)))continue;
  let before,after;
  if(kind==='CreatedNode'){before='0';after=f.Balance.value;}
  else if(kind==='DeletedNode'){before=f.Balance.value;after='0';}
  else if(kind==='ModifiedNode'){
   if(!p.Balance)continue; // A trustline flag/limit modification is not an asset movement.
   before=p.Balance.value;after=f.Balance.value;
  }else throw Error('unsupported_trustline_node');
  change=change.plus(value(after).minus(value(before)).times(low===account?1:-1));
  matched++;
 }
 if(matched>1)throw Error('ambiguous_token_delta');
 return change.toFixed();
}
function xrpNetDelta(result,account=TREASURY){
 if(result?.validated!==true||result.meta?.TransactionResult!=='tesSUCCESS')
  throw Error('validated_xrp_metadata_required');
 const tx=result.tx_json||result,fee=tx?.Fee;
 if(!/^(0|[1-9][0-9]*)$/.test(fee||''))throw Error('invalid_tx_fee');
 let matched=0,delta=new N(0);
 for(const wrapper of result.meta.AffectedNodes||[]){
  const kind=Object.keys(wrapper)[0],n=wrapper[kind],f=n?.FinalFields||{},p=n?.PreviousFields||{};
  if(n?.LedgerEntryType!=='AccountRoot'||f.Account!==account)continue;
  if(kind!=='ModifiedNode'||!/^\d+$/.test(f.Balance||'')||!/^\d+$/.test(p.Balance||''))
   throw Error('incomplete_xrp_state');
  matched++;delta=delta.plus(value(f.Balance).minus(value(p.Balance)));
 }
 if(matched!==1)throw Error('unique_treasury_xrp_delta_required');
 return delta.plus(value(fee)).toFixed();
}
function inspect(tx){
 const body=tx?.tx_json||tx;
 const hash=tx?.hash||body?.hash;
 if(tx?.validated!==true||tx?.meta?.TransactionResult!=='tesSUCCESS'||
  !HASH.test(hash||'')||body?.Account!==TREASURY)
  throw Error('validated_treasury_transaction_required');
 const ledgerIndex=Number(tx.ledger_index);
 if(!Number.isSafeInteger(ledgerIndex)||ledgerIndex<WITHDRAW||ledgerIndex>CREATE)
  throw Error('outside_conversion_window');
 const changes=Object.fromEntries(Object.entries(tokenAssets).map(([name,asset])=>[
  name,tokenDelta(tx,asset)]));
 const xrpDrops=xrpNetDelta(tx);
 const evidence={
  hash:hash.toUpperCase(),ledgerIndex,transactionType:body.TransactionType,
  changes:{...changes,xrpDrops},feeDrops:body.Fee,
  candidateXrpToRlusdPurchase:body.TransactionType==='Payment'&&
    new N(changes.RLUSD).gt(0)&&new N(xrpDrops).lt(0),
  independentlyAllocatedToEstate:false
 };
 return Object.freeze(evidence);
}
async function rpc(method,params){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetch('https://s1.ripple.com:51234/',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(18000)});
   if(!r.ok)throw Error('xrpl_http_'+r.status);
   const data=(await r.json()).result;
   if(!data||data.error)throw Error('xrpl_rpc_'+String(data?.error||'empty'));
   return data;
  }catch(e){
   if(attempt===2)throw e;
   await new Promise(done=>setTimeout(done,350*(attempt+1)));
  }
 }
}
async function main(){
 let marker,seenMarkers=new Set(),pages=0;
 const entries=new Map();
 do{
  if(pages>=8)throw Error('treasury_window_incomplete');
  const batch=await rpc('account_tx',{account:TREASURY,ledger_index_min:WITHDRAW,
   ledger_index_max:CREATE,limit:200,forward:true,...marker?{marker}:{}});
  if(!Array.isArray(batch.transactions))throw Error('account_history_unavailable');
  for(const row of batch.transactions){
   if(row.validated!==true)throw Error('unvalidated_account_history');
   const body=row.tx_json||row.tx||{};
   if(body.Account!==TREASURY)continue;
   const hash=row.hash||body.hash;
   if(!HASH.test(hash||''))throw Error('account_history_hash_missing');
   entries.set(hash.toUpperCase(),hash.toUpperCase());
  }
  marker=batch.marker;pages++;
  if(marker){
   const key=JSON.stringify(marker);
   if(seenMarkers.has(key))throw Error('repeated_account_history_cursor');
   seenMarkers.add(key);
  }
 }while(marker);
 const events=[];
 for(const hash of entries.keys()){
  const raw=await rpc('tx',{transaction:hash,binary:false});
  if(raw.validated!==true)throw Error('unvalidated_retrieved_transaction');
  if(raw.meta?.TransactionResult!=='tesSUCCESS')continue;
  const e=inspect({...raw,hash});
  const meaningful=Object.entries(e.changes).some(([_,v])=>v!=='0');
  if(meaningful||['AMMCreate','AMMWithdraw'].includes(e.transactionType))events.push(e);
 }
 events.sort((a,b)=>a.ledgerIndex-b.ledgerIndex||a.hash.localeCompare(b.hash));
 if(!events.some(e=>e.ledgerIndex===WITHDRAW&&e.transactionType==='AMMWithdraw')||
    !events.some(e=>e.ledgerIndex===CREATE&&e.transactionType==='AMMCreate'))
  throw Error('historical_boundary_transactions_missing');
 const purchases=events.filter(e=>e.candidateXrpToRlusdPurchase);
 const result={readOnly:true,window:[WITHDRAW,CREATE],transactionsExamined:entries.size,
  events,rlusdPurchaseCandidates:purchases.map(x=>x.hash),
  operatorIntentAttestedExternally:true,
  exactEconomicCostAttributionUnverified:true,
  customerCapitalTransferNotBooked:true,plxRailReactivationRequired:false,
  customerPurchasesAuthorized:false,treasuryPauseReleaseAuthorized:false};
 console.log('ESTATES_OPERATOR_MIGRATION_TRACE='+JSON.stringify(result));
 return result;
}
if(require.main===module)main().catch(e=>{console.error('ESTATES_OPERATOR_MIGRATION_TRACE_ERROR='+e.message);process.exitCode=1;});
module.exports={tokenDelta,xrpNetDelta,inspect,main};
