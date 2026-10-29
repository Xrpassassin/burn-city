'use strict';
// Bounded, read-only treasury account_tx collection. An exhausted marker is
// necessary but insufficient to certify historical completeness or profit.
async function collectTreasuryAccountTx(client,{treasury,ledgerMin,ledgerMax,maxPages=25,pageLimit=200}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 if(typeof treasury!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(treasury))throw new TypeError('valid_treasury_required');
 if(!Number.isSafeInteger(ledgerMin)||!Number.isSafeInteger(ledgerMax)||ledgerMin<1||ledgerMax<ledgerMin)throw new TypeError('valid_ledger_range_required');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100||!Number.isSafeInteger(pageLimit)||pageLimit<1||pageLimit>400)throw new TypeError('invalid_pagination_limits');
 let marker,exhausted=false;const markers=new Set(),transactions=[],hashes=new Set();
 for(let page=0;page<maxPages;page++){
  const request={command:'account_tx',account:treasury,ledger_index_min:ledgerMin,ledger_index_max:ledgerMax,limit:pageLimit,forward:true};
  if(marker!==undefined)request.marker=marker;
  const response=(await client.request(request))?.result;
  if(!response||!Array.isArray(response.transactions)||response.account!==treasury)throw new Error('invalid_account_tx_response');
  if(response.ledger_index_min!==undefined&&response.ledger_index_min>ledgerMin)throw new Error('account_tx_range_truncated');
  if(response.ledger_index_max!==undefined&&response.ledger_index_max<ledgerMax)throw new Error('account_tx_range_truncated');
  for(const item of response.transactions){
   const tx=item?.tx||item?.tx_json;
   const hash=tx?.hash||item?.hash;
   const index=item?.ledger_index??tx?.ledger_index;
   if(typeof hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(index)||index<ledgerMin||index>ledgerMax)throw new Error('invalid_account_tx_entry');
   const key=hash.toUpperCase();
   if(hashes.has(key))throw new Error('duplicate_account_tx_hash');
   hashes.add(key);
   transactions.push({hash:key,ledgerIndex:index,validated:item.validated===true,transactionType:tx?.TransactionType||null});
  }
  if(response.marker===undefined||response.marker===null){exhausted=true;break;}
  const next=JSON.stringify(response.marker);
  if(markers.has(next))throw new Error('repeated_account_tx_marker');
  markers.add(next);marker=response.marker;
 }
 return Object.freeze({treasury,ledgerMin,ledgerMax,transactions,exhaustedPagination:exhausted,historyComplete:false,accountingReady:false,distributable:false});
}
module.exports={collectTreasuryAccountTx};
