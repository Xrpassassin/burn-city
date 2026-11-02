'use strict';
// Read-only observation of the manual legacy IMG/PLX liquidity withdrawal.
const {balanceDelta}=require('../server/estate-liquidity-ledger');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const pool='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const hash='581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2';
const img={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const plx={currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'};
async function rpc(method,params){
 const r=await fetch('https://s1.ripple.com:51234/',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({method,params:[params]}),
  signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('ledger_read_http_'+r.status);
 const d=(await r.json()).result;
 if(!d||d.error)throw Error('ledger_read_failed');
 return d;
}
async function main(){
 const [tx,amm]=await Promise.all([
  rpc('tx',{transaction:hash,binary:false}),
  rpc('amm_info',{amm_account:pool,ledger_index:'validated'})
 ]);
 const body=tx.tx_json||tx;
 if(tx.validated!==true||tx.meta?.TransactionResult!=='tesSUCCESS'||body.Account!==treasury||body.TransactionType!=='AMMWithdraw')
  throw Error('verified_legacy_withdrawal_required');
 if(amm.amm?.account!==pool||amm.amm?.lp_token?.issuer!==pool)throw Error('legacy_pool_identity_mismatch');
 const lp={currency:amm.amm.lp_token.currency,issuer:pool};
 const imgReceived=balanceDelta(tx,treasury,img);
 const plxReceived=balanceDelta(tx,treasury,plx);
 const lpChange=balanceDelta(tx,treasury,lp);
 const report={readOnly:true,hash,ledger:tx.ledger_index||body.ledger_index,
  imgDelta:imgReceived.toFixed(),plxDelta:plxReceived.toFixed(),
  legacyLpDelta:lpChange.toFixed(),feeDrops:body.Fee,
  originalCustomerPrincipalReconciled:false,accountingChangeAuthorized:false};
 console.log('ESTATES_LEGACY_WITHDRAWAL_DELTAS='+JSON.stringify(report));
 if(!imgReceived.gt(0)||!plxReceived.gt(0)||!lpChange.lt(0))throw Error('unexpected_legacy_withdrawal_balances');
}
if(require.main===module)main().catch(e=>{console.error('ESTATES_LEGACY_DELTA_ERROR='+e.message);process.exitCode=1});
