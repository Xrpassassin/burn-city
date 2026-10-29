'use strict';
const {createAmmHistoryCheckpointStore}=require('./estate-amm-history-checkpoints');
// Read-only resumable account_tx scan; every page is committed before next fetch.
// Exhaustion means no next marker, NOT proof of complete historical accounting.
async function resumeTreasuryAccountTx(client,db,{scanId,treasury,ledgerMin,ledgerMax,maxPages=25,pageLimit=200}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100||!Number.isSafeInteger(pageLimit)||pageLimit<1||pageLimit>400)throw new TypeError('invalid_scan_limits');
 const store=createAmmHistoryCheckpointStore(db);
 let checkpoint=store.begin({scanId,treasury,ledgerMin,ledgerMax});
 if(checkpoint.exhausted)return Object.freeze({scanId,pagesProcessed:0,exhaustedPagination:true,historyComplete:false,distributable:false});
 let pagesProcessed=0;
 for(let i=0;i<maxPages;i++){
  const request={command:'account_tx',account:treasury,ledger_index_min:ledgerMin,ledger_index_max:ledgerMax,limit:pageLimit,forward:true};
  if(checkpoint.marker_json!==null)request.marker=JSON.parse(checkpoint.marker_json);
  const response=(await client.request(request))?.result;
  if(!response||response.account!==treasury||!Array.isArray(response.transactions))throw new Error('invalid_account_tx_response');
  if(response.ledger_index_min!==undefined&&response.ledger_index_min>ledgerMin)throw new Error('account_tx_range_truncated');
  if(response.ledger_index_max!==undefined&&response.ledger_index_max<ledgerMax)throw new Error('account_tx_range_truncated');
  const transactions=response.transactions.map(item=>{
   const tx=item?.tx||item?.tx_json;
   return {hash:tx?.hash||item?.hash,ledgerIndex:item?.ledger_index??tx?.ledger_index,validated:item?.validated===true,transactionType:tx?.TransactionType||null};
  });
  checkpoint=store.recordPage({scanId,expectedPageCount:checkpoint.page_count,transactions,nextMarker:response.marker});
  pagesProcessed++;
  if(checkpoint.exhausted)break;
 }
 return Object.freeze({scanId,pagesProcessed,exhaustedPagination:checkpoint.exhausted===1,historyComplete:false,accountingReady:false,distributable:false});
}
module.exports={resumeTreasuryAccountTx};
