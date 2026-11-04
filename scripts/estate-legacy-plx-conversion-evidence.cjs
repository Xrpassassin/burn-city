'use strict';
// Public, validated XRPL metadata evidence for the historic PLX conversion.
// This is a forensic report, NOT proof the conversion was for an Estate owner.
const {balanceDelta,xrpMovement}=require('../server/estate-liquidity-ledger');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const HASH='2762310505CB5C6B4F556C77CACDDD114281331F90F6964BCBBB5B5297D82F3C';
const ASSETS={
 IMG:{currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'},
 PLX:{currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'},
 RLUSD:{currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'}
};
const safeDelta=(tx,asset)=>{
 try{return balanceDelta(tx,TREASURY,asset).toFixed();}
 catch(e){if(e.message==='unique_asset_delta_required')return '0';throw e;}
};
function inspect(tx){
 const body=tx?.tx_json||tx;
 if(tx?.validated!==true||tx?.meta?.TransactionResult!=='tesSUCCESS'||
  !Array.isArray(tx?.meta?.AffectedNodes)||
  (tx.hash||body?.hash)?.toUpperCase()!==HASH||
  body?.TransactionType!=='Payment'||body.Account!==TREASURY||body.Destination!==TREASURY)
  throw Error('validated_self_payment_required');
 const deltas=Object.fromEntries(Object.entries(ASSETS).map(([k,a])=>[k,safeDelta(tx,a)]));
 if(Number(deltas.PLX)>=0)throw Error('plx_debit_missing');
 const xrp=xrpMovement(tx,TREASURY);
 const outputAsset=Object.entries(deltas).filter(([k,n])=>k!=='PLX'&&Number(n)>0)
  .map(([asset,received])=>({asset,received}));
 if(xrp.gt(0))outputAsset.push({asset:'XRP',receivedDrops:xrp.toFixed()});
 return Object.freeze({readOnly:true,hash:HASH,ledgerIndex:tx.ledger_index,
  transactionType:body.TransactionType,treasurySelfPayment:true,
  ledgerBalanceChanges:deltas,xrpTransferDeltaDrops:xrp.toFixed(),
  networkFeeDrops:body.Fee||null,
  tokenOutputsObserved:outputAsset,
  estimatedPurchaseCapitalReplaced:false,customerOwnershipAttributionVerified:false,
  realisedNetProfitVerified:false,treasuryPauseReleaseAuthorized:false});
}
async function main(){
 const r=await fetch('https://s1.ripple.com:51234/',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({method:'tx',params:[{transaction:HASH,binary:false}]}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('xrpl_http_'+r.status);
 const tx=(await r.json()).result;
 if(tx?.error)throw Error('validated_transaction_unavailable');
 const report=inspect(tx);
 console.log('ESTATES_HISTORIC_PLX_CONVERSION='+JSON.stringify(report));
 return report;
}
if(require.main===module)main().catch(e=>{console.error('ESTATES_PLX_CONVERSION_ERROR='+e.message);process.exitCode=1});
module.exports={inspect,main};
