'use strict';
// Evidence-only snapshot: public balances following the externally executed
// IMG/PLX withdrawal. Never equates current fungible balances to the legacy
// customer's 3-XRP capital, and never signs.
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const ISSUERS={
 img:{currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'},
 plx:{currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'}
};
const WITHDRAWAL='581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2';
async function rpc(method,params){
 const r=await fetch('https://s1.ripple.com:51234/',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('xrpl_rpc_http_'+r.status);
 const d=(await r.json()).result;
 if(!d||d.error)throw Error('xrpl_rpc_unavailable');
 return d;
}
async function main(){
 const l=await rpc('ledger',{ledger_index:'validated'});
 const index=Number(l.ledger_index??l.ledger?.ledger_index);
 if(l.validated!==true||!Number.isSafeInteger(index))throw Error('validated_ledger_required');
 const [a,im,plx,t]=await Promise.all([
  rpc('account_info',{account:TREASURY,ledger_index:index}),
  rpc('account_lines',{account:TREASURY,peer:ISSUERS.img.issuer,ledger_index:index,limit:400}),
  rpc('account_lines',{account:TREASURY,peer:ISSUERS.plx.issuer,ledger_index:index,limit:400}),
  rpc('tx',{transaction:WITHDRAWAL,binary:false})
 ]);
 for(const d of [a,im,plx])if(d.validated!==true||Number(d.ledger_index)!==index||d.marker)
  throw Error('incomplete_validated_inventory');
 if(t.validated!==true||t.meta?.TransactionResult!=='tesSUCCESS')throw Error('withdrawal_not_validated');
 const selected=(result,issue)=>{
  const rows=(result.lines||[]).filter(x=>x.account===issue.issuer&&x.currency===issue.currency);
  if(rows.length>1)throw Error('nonunique_asset_trustline');
  return rows.length?rows[0].balance:'0';
 };
 const balances={xrpDrops:a.account_data?.Balance,img:selected(im,ISSUERS.img),
  plx:selected(plx,ISSUERS.plx)};
 const result={readOnly:true,treasury:TREASURY,ledgerIndex:index,currentBalanceEvidence:balances,
  treasuryOwnerCount:a.account_data?.OwnerCount,
  manualWithdrawalHash:WITHDRAWAL,withdrawalLedger:t.ledger_index,
  previousWithdrawalProceeds:{img:'1598.741351076311',plx:'13172.413752276136'},
  proceedsRemainUnspent:'not_established', // cannot trace fungible provenance from balances
  currentAssetsAssignedToCustomerPrincipal:false,
  customerLiabilitiesReconciled:false,pauseClearanceAuthorized:false};
 console.log('ESTATES_LEGACY_WITHDRAWAL_CURRENT_BALANCES='+JSON.stringify(result));
}
if(require.main===module)main().catch(e=>{console.error('ESTATES_LEGACY_BALANCE_ERROR='+e.message);process.exitCode=1});
module.exports={main};
