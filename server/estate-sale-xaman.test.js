'use strict';
const assert=require('node:assert/strict');
const {createEstateXamanPaymentAdapter}=require('./estate-sale-xaman');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',treasury='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
let request;
const sdk={payload:{create:async p=>{request=p;return {uuid:'uuid-1',refs:{qr_png:'https://example.test/qr'},next:{always:'https://example.test/deep'}}},get:async()=>({meta:{signed:true},response:{account:buyer,txid:'A'.repeat(64)}})}};
const adapter=createEstateXamanPaymentAdapter({sdk,treasury});
async function main(){
 const r=await adapter.create({reservation_id:'reservation-00000001',buyer,price_drops:3000000,status:'reserved'});
 assert.equal(r.uuid,'uuid-1');assert.equal(request.txjson.Destination,treasury);assert.equal(request.txjson.Amount,'3000000');assert.equal(request.txjson.Account,buyer);
 assert.equal(Buffer.from(request.txjson.Memos[0].Memo.MemoData,'hex').toString(),'reservation-00000001');
 assert.equal(await adapter.signedTransactionHash('uuid-1',buyer),'A'.repeat(64));
 assert.equal(await adapter.signedTransactionHash('uuid-1','rOther'),null);
 await assert.rejects(adapter.create({reservation_id:'reservation-00000001',buyer,price_drops:3000000,status:'expired'}),/active_server_reservation_required/);
 console.log('Estate Xaman payload tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
