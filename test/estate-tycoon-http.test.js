'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'estate-tycoon-http-'));
Object.assign(process.env,{DATA_DIR:data,PORT:'0',DRY_RUN:'false',ESTATE_TYCOON_UPGRADES_ENABLED:'1',XRPL_NETWORK:'mainnet',XAMAN_API_KEY:'test-key',XAMAN_API_SECRET:'test-secret',BURN_JOB_IN_SERVER:'false',XRPL_WSS:'ws://127.0.0.1:1'});
const Pay=require('../server/payments');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',other='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',hash='A'.repeat(64);
let tx,signed=false,createdAt=Date.now();
Pay._sdk=()=>({payload:{create:async p=>{tx=p.txjson;createdAt=Date.now();return {uuid:'tycoon-http-test',next:{always:'https://example.com/sign'}};},
 get:async()=>({meta:{signed},response:{account:buyer,txid:hash},next:{always:'https://example.com/sign'}})}});
Pay._ledger=async()=>({request:async()=>({result:{validated:true,hash,ledger_index:123,
 tx_json:{...tx,date:Math.floor(createdAt/1000)-946684800},
 meta:{TransactionResult:'tesSUCCESS',delivered_amount:tx?.Amount}}})});
const {server}=require('../server/server');
Pay.sdb.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,Date.now());
(async()=>{
 await new Promise(r=>server.listening?r():server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port,token=acct=>Pay.sign({acct,exp:Date.now()+60000});
 const call=async(p,body,acct=buyer)=>{const r=await fetch(url+'/api/estates'+p,{method:body?'POST':'GET',
  headers:{...(acct?{authorization:'Bearer '+token(acct)}:{}),'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})});return {code:r.status,data:await r.json()};};
 const publicWorld=await call('/tycoon/world',null,null);
 assert.equal(publicWorld.code,200);
 assert(publicWorld.data.catalog.length>=15);
 assert(!JSON.stringify(publicWorld.data).includes(buyer));
 for(const p of ['/tycoon/state?propertyId=trailer-01','/tycoon/quote?propertyId=trailer-01&itemId=porch-lights','/tycoon/portfolio'])
  assert.equal((await call(p,null,null)).code,401);
 assert.equal((await call('/tycoon/start',{propertyId:'trailer-01',itemId:'porch-lights'},null)).code,401);
 assert.equal((await call('/tycoon/confirm',{orderId:'bad'},null)).code,401);
 assert.equal((await call('/tycoon/interior-options?propertyId=trailer-01',null,null)).code,401);
 assert.equal((await call('/tycoon/interior-access?propertyId=trailer-01&roomId=bunker',null,null)).code,401);
 assert.equal((await call('/tycoon/interior-options?propertyId=trailer-01',null,other)).code,403);
 assert.equal((await call('/tycoon/helicopter-access?propertyId=trailer-01',null,null)).code,401);
 assert.equal((await call('/tycoon/helicopter-access?propertyId=trailer-01',null,other)).code,403);
 assert.equal((await call('/tycoon/helicopter-access?propertyId=trailer-01')).code,403,'3 XRP trailer is never permitted to fly');
 const options=await call('/tycoon/interior-options?propertyId=trailer-01');
 assert.equal(options.code,200);assert.deepEqual(options.data.rooms.map(x=>x.id),['home'],'Every owned home is free to enter; no paid bonus rooms unlocked yet');
 assert(!JSON.stringify(options.data).includes(buyer));
 assert.equal((await call('/tycoon/interior-access?propertyId=trailer-01&roomId=bunker')).code,403,'Hatch/bunker cannot be entered without entitlement');
 const state=(await call('/tycoon/state?propertyId=trailer-01')).data;
 assert.equal(state.ownerAuthorized,true);
 assert.equal(state.recordedValueDrops,3000000);
 assert.equal(state.recordedShareUnits,1);
 const unauthorized=await call('/tycoon/state?propertyId=trailer-01',null,other);
 assert.equal(unauthorized.data.ownerAuthorized,false);
 const quote=await call('/tycoon/quote?propertyId=trailer-01&itemId=porch-lights');
 assert.equal(quote.code,200);assert.equal(quote.data.item.priceDrops,3000000);
 const forged=await call('/tycoon/start',{propertyId:'trailer-01',itemId:'porch-lights',priceDrops:1,buyer},other);
 assert.equal(forged.code,409);assert(!tx);
 const started=await call('/tycoon/start',{propertyId:'trailer-01',itemId:'porch-lights',priceDrops:1,shareUnitsDelta:50000},buyer);
 assert.equal(started.code,200);assert.equal(tx.Amount,'3000000');
 assert.equal((await call('/tycoon/confirm',{orderId:started.data.orderId,txHash:hash},other)).code,409);
 assert.equal((await call('/tycoon/confirm',{orderId:started.data.orderId,txHash:hash})).code,202);
 signed=true;
 const settled=await call('/tycoon/confirm',{orderId:started.data.orderId,txHash:'F'.repeat(64)});
 assert.equal(settled.code,200);
 assert.equal(settled.data.property.recordedValueDrops,6000000);
 assert.equal(settled.data.property.recordedShareUnits,2);
 assert.equal(settled.data.property.liveRewardShareUnits,1);
 const portfolio=await call('/portfolio');
 assert.equal(portfolio.code,200);assert.equal(portfolio.data.tycoon.recordedShareUnits,2);
 assert.equal(portfolio.data.portfolio.portfolioShareUnits,1,'active reward weight must not change');
 assert.equal((await call('/tycoon/confirm',{orderId:started.data.orderId})).data.alreadySettled,true);
 console.log('Estate Tycoon HTTP: public privacy, auth, forged amount rejection, validated purchase, updated portfolio and separate payout weight passed');
 server.close();fs.rmSync(data,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
