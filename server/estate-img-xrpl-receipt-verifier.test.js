'use strict';
const assert=require('node:assert/strict');
const {createImgRewardVerifier,canonicalUnits}=require('./estate-img-xrpl-receipt-verifier');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',source='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',issuer=source,hash='A'.repeat(64);
const tx={result:{validated:true,hash,ledger_index:100,date:900000000,TransactionType:'Payment',Account:source,Destination:treasury,meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:'IMG',issuer,value:'1.000001'}}}};
const verifier=createImgRewardVerifier({request:async request=>{assert.deepEqual(request,{command:'tx',transaction:hash,binary:false});return tx;}},{treasury,imgIssuer:issuer,allowedSources:[source]});
(async()=>{
 const receipt=await verifier(hash);
 assert.equal(receipt.verified,true);assert.equal(receipt.amount,'1.000001');
 assert.equal(receipt.receivedAtMs,(900000000+946684800)*1000);
 assert.equal(canonicalUnits('1.0000000'),'1');
 const nested=createImgRewardVerifier({request:async()=>({result:{validated:true,hash,ledger_index:100,close_time_iso:new Date((900000000+946684800)*1000).toISOString(),tx_json:{TransactionType:'Payment',Account:source,Destination:treasury},meta:tx.result.meta}})},{treasury,imgIssuer:issuer,allowedSources:[source]});
 assert.equal((await nested(hash)).amount,'1.000001');
 for(const altered of [
  {validated:false},{TransactionType:'AMMDeposit'},{Account:treasury},{Destination:source},{hash:'B'.repeat(64)},
  {meta:{...tx.result.meta,TransactionResult:'tecFAILED'}},
  {meta:{...tx.result.meta,delivered_amount:{currency:'PLX',issuer,value:'1'}}},
  {meta:{...tx.result.meta,delivered_amount:'1000000'}},
  {date:undefined}
 ]){
  const bad=createImgRewardVerifier({request:async()=>({result:{...tx.result,...altered}})},{treasury,imgIssuer:issuer,allowedSources:[source]});
  await assert.rejects(()=>bad(hash));
 }
 for(const amount of ['0','-1','unavailable','1e999','NaN'])assert.throws(()=>canonicalUnits(amount));
 assert.equal(canonicalUnits('0.31949269804787'),'0.31949269804787');
 assert.equal(canonicalUnits('1e-7'),'0.0000001');
 const pollux='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V',pool='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
 const nativeFloor={roundId:'PLX-FLOOR-2026-11-21T08:00Z',payoutType:'lp_floor',
  rewardAsset:'IMG',floorKey:'IMG:'+issuer,pools:['PLX/IMG'],via:'xrp_buy'};
 const memo=x=>({Memo:{MemoData:Buffer.from(JSON.stringify(x)).toString('hex')}});
 const direct=({ledgerIndex=108470737,memos=[memo(nativeFloor)],delivered=tx.result.meta.delivered_amount}={})=>
  createImgRewardVerifier({request:async()=>({result:{...tx.result,Account:pollux,ledger_index:ledgerIndex,Memos:memos,
   meta:{...tx.result.meta,delivered_amount:delivered}}})},
   {treasury,imgIssuer:issuer,allowedSources:[pollux],rewardPoolAccount:pool,skipNonImgPayments:true})(hash);
 assert.equal((await direct()).verified,true);
 assert.equal((await direct({ledgerIndex:108470736})).ignored,true,'no recognition of earlier native floor receipts');
 assert.equal((await direct({memos:[memo({...nativeFloor,floorKey:'IMG:wrong'})]})).ignored,true);
 assert.equal((await direct({memos:[memo({...nativeFloor,poolAccount:treasury})]})).ignored,true);
 assert.equal((await direct({memos:[memo({...nativeFloor,pools:['PLX/IMG','PLX/OTHER']})]})).ignored,true);
 assert.equal((await direct({memos:[memo({...nativeFloor,roundId:'PLX-HOLDER-2026-11-21T08:00Z'})]})).ignored,true);
 assert.equal((await direct({memos:[memo(nativeFloor),memo(nativeFloor)]})).ignored,true);
 assert.equal((await direct({delivered:'82'})).ignored,true,'XRP belongs to the separate scanner');
 console.log('Validated IMG XRPL receipt verifier tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
