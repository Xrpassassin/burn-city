'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateSalesRuntime}=require('./estate-sales-runtime');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',treasury='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
function database(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');return db;}
const config={DRY_RUN:false,NETWORK:'mainnet',XUMM_KEY:'test-key',XUMM_SECRET:'test-secret',ESTATE_TREASURY:treasury};
(async()=>{
 for(const [env,cfg] of [[{},config],[{ESTATE_SALES_ENABLED:'true'},config],[{ESTATE_SALES_ENABLED:'1'},{...config,DRY_RUN:true}],[{ESTATE_SALES_ENABLED:'1'},{...config,NETWORK:'testnet'}],[{ESTATE_SALES_ENABLED:'1'},{...config,XUMM_SECRET:''}]]){
  const db=database();const r=createEstateSalesRuntime({db,config:cfg,env,paused:()=>false,pay:{sdk(){throw Error('unexpected_sdk_access');}}});
  assert.equal(r.status().salesEnabled,false);
  assert.equal(r.reserve({buyer,propertyId:'trailer-01'}).error,'estate_sales_disabled');
  assert.equal((await r.start({})).error,'estate_sales_disabled');
  assert.equal((await r.finalize({})).error,'estate_sales_disabled');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_sale_reservations').get().n,0);
 }
 const db=database(),now=Date.now(),hash='A'.repeat(64);let paused=false,signed=false,validated=false,requestCount=0,createdTx;
 const sdk={payload:{create:async p=>{createdTx=p.txjson;return {uuid:'test-uuid',refs:{qr_png:'https://example.com/qr'},next:{always:'https://example.com/sign'}};},get:async()=>({meta:{signed},response:{account:buyer,txid:hash}})}};
 const pay={sdk:()=>sdk,ledger:async()=>({request:async q=>{requestCount++;assert.equal(q.transaction,hash);return {result:{hash,validated,ledger_index:123,date:Math.floor(now/1000)-946684800+5,tx_json:{...createdTx},meta:{TransactionResult:'tesSUCCESS',delivered_amount:'3000000'}}};}})};
 const build=()=>createEstateSalesRuntime({db,pay,config,env:{ESTATE_SALES_ENABLED:'1'},paused:()=>paused});
 let r=build();assert.equal(r.status().salesEnabled,true);
 assert.equal(r.reserve({buyer:treasury,propertyId:'trailer-01',now}).error,'estate_treasury_cannot_purchase');
 assert.equal(r.quote({buyer:treasury,propertyId:'trailer-01',now}).error,'estate_treasury_cannot_purchase');
 assert.equal((await r.start({buyer:treasury})).error,'estate_treasury_cannot_purchase');assert.equal(r.status().distributionsEnabled,false);
 const quote=r.quote({buyer,propertyId:'trailer-01'});assert.equal(quote.priceDrops,3000000);assert.equal(quote.salesEnabled,true);
 const reservation=r.reserve({buyer,propertyId:'trailer-01',now});assert.equal(reservation.ok,true);
 const input={buyer,reservationId:reservation.reservationId,now:now+10000};
 assert.equal((await r.start({...input,buyer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'})).error,'reservation_not_found');
 const payment=await r.start(input);assert.equal(payment.ok,true);assert.equal(createdTx.Amount,'3000000');assert.equal(createdTx.Account,buyer);assert.equal(createdTx.Destination,treasury);
 assert.equal((await r.finalize(input)).error,'payment_not_signed_or_submitted');
 signed=true;assert.equal((await r.finalize(input)).pending,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,0);
 paused=true;assert.equal(r.status().salesEnabled,false);assert.equal(r.reserve({buyer,propertyId:'trailer-02'}).error,'estate_treasury_paused');assert.equal((await r.start(input)).error,'estate_treasury_paused');
 validated=true;r=build();assert.equal(r.recover(input).payloadUuid,'test-uuid');assert.equal((await r.finalize(input)).ownershipAssigned,true);
 assert.equal((await r.finalize(input)).status,'already_settled');assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_property_ownership').get().n,1);assert.equal(requestCount,2);
 assert.equal(r.recover(input).paymentTx,hash);
 console.log('Estates runtime opt-in, pause, Xaman, pending validation, restart and ownership replay tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
