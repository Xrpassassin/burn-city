'use strict';
// Multi-upgrade cart over HTTP: one POST quote, one start(itemIds), one exact Xaman Payment.
// Ledger validation is required before any item is installed; a second start reuses the payload
// (no duplicate charge). Missing itemIds must not create a payment.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'estate-tycoon-cart-http-'));
Object.assign(process.env,{DATA_DIR:data,PORT:'0',DRY_RUN:'false',ESTATE_TYCOON_UPGRADES_ENABLED:'1',XRPL_NETWORK:'mainnet',XAMAN_API_KEY:'test-key',XAMAN_API_SECRET:'test-secret',BURN_JOB_IN_SERVER:'false',XRPL_WSS:'ws://127.0.0.1:1'});
const Pay=require('../server/payments');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV';
let hash='C'.repeat(64),tx,signed=false,createdAt=Date.now(),created=null;
const UUID='b3f1c6a0-2d5e-4a7b-9c11-88e24d0a1c77';
const LINK='https://xumm.app/sign/'+UUID;
Pay._sdk=()=>({payload:{create:async p=>{created=p;tx=p.txjson;createdAt=Date.now();return {uuid:UUID,next:{always:LINK}};},
 get:async()=>({meta:{signed},response:{account:buyer,txid:hash},next:{always:LINK}})}});
Pay._ledger=async()=>({request:async()=>({result:{validated:true,hash,ledger_index:456,
 tx_json:{...tx,date:Math.floor(createdAt/1000)-946684800},
 meta:{TransactionResult:'tesSUCCESS',delivered_amount:tx?.Amount}}})});
const {server}=require('../server/server');
Pay.sdb.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,Date.now());
(async()=>{
 await new Promise(r=>server.listening?r():server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port,token=Pay.sign({acct:buyer,exp:Date.now()+60000});
 const call=async(p,body)=>{const r=await fetch(url+'/api/estates'+p,{method:body?'POST':'GET',
  headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})});return {code:r.status,data:await r.json()};};

 const getQuote=await call('/tycoon/quote?propertyId=trailer-01&itemIds=flower-garden,garden-pond');
 assert.equal(getQuote.code,200);assert.equal(getQuote.data.itemId,'cart:flower-garden+garden-pond');assert.equal(getQuote.data.item.priceDrops,12000000);assert.equal(getQuote.data.canPurchase,true);
 const postQuote=await call('/tycoon/quote',{propertyId:'trailer-01',itemIds:['garden-pond','flower-garden']});
 assert.equal(postQuote.code,200);assert.equal(postQuote.data.itemId,'cart:flower-garden+garden-pond');assert.equal(postQuote.data.canPurchase,true);

 const empty=await call('/tycoon/start',{propertyId:'trailer-01'});
 assert.equal(empty.code,409);assert.equal(empty.data.error,'unknown_upgrade_item');assert.equal(created,null);

 const started=await call('/tycoon/start',{propertyId:'trailer-01',itemIds:'flower-garden,garden-pond'});
 assert.equal(started.code,200,JSON.stringify(started.data));
 assert.equal(tx.TransactionType,'Payment');assert.equal(tx.Account,buyer);assert.equal(tx.Amount,'12000000');
 assert.equal(created.custom_meta.identifier.length,40);
 assert.ok(created.custom_meta.instruction.length<=280);
 assert.equal(started.data.deeplink,LINK);
 assert.equal(started.data.qr,LINK+'_q.png');

 const reused=await call('/tycoon/start',{propertyId:'trailer-01',itemIds:['garden-pond','flower-garden']});
 assert.equal(reused.code,200);assert.equal(reused.data.reused,true);assert.equal(reused.data.orderId,started.data.orderId);

 signed=true;
 const settled=await call('/tycoon/confirm',{orderId:started.data.orderId});
 assert.equal(settled.code,200);
 assert.deepEqual([...settled.data.property.unlockedItemIds].sort(),['flower-garden','garden-pond']);
 assert.equal(settled.data.property.recordedValueDrops,15000000);
 assert.equal(settled.data.property.recordedShareUnits,5);
 assert.equal((await call('/tycoon/confirm',{orderId:started.data.orderId})).data.alreadySettled,true);

 console.log('Estate Tycoon cart HTTP: POST quote, string itemIds, one Payment for the sum, reuse (no second payload), ledger-validated install passed');
 server.close();fs.rmSync(data,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
