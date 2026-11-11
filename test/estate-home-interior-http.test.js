'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'estate-home-interior-http-'));
Object.assign(process.env,{DATA_DIR:data,PORT:'0',DRY_RUN:'true',ESTATE_TYCOON_UPGRADES_ENABLED:'0',
 XRPL_NETWORK:'testnet',XAMAN_API_KEY:'test-key',XAMAN_API_SECRET:'test-secret',
 BURN_JOB_IN_SERVER:'false',XRPL_WSS:'ws://127.0.0.1:1'});
const Pay=require('../server/payments');
const owner='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',guest='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const {server}=require('../server/server');
(async()=>{
 await new Promise(r=>server.listening?r():server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,token=acct=>Pay.sign({acct,exp:Date.now()+60000});
 const call=async(p,body,acct=owner)=>{
  const response=await fetch(base+'/api/estates'+p,{method:body?'POST':'GET',
   headers:{...(acct?{authorization:'Bearer '+token(acct)}:{}),'content-type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {code:response.status,data:await response.json()};
 };
 Pay.sdb.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',owner,'B'.repeat(64),3000000,1,Date.now());
 Pay.sdb.prepare('INSERT OR IGNORE INTO registered_wallets(acct,first_seen,last_seen) VALUES(?,?,?)').run(guest,Date.now(),Date.now());
 Pay.sdb.prepare('INSERT INTO estate_property_invites(property_id,guest_acct,invited_by,created_at) VALUES(?,?,?,?)').run('trailer-01',guest,owner,Date.now());
 assert.equal((await call('/home/state?propertyId=trailer-01',null,null)).code,401,'interior state never public');
 assert.equal((await call('/home/state?propertyId=trailer-01')).data.layoutId,'cozy');
 assert.equal((await call('/home/state?propertyId=trailer-01',null,guest)).data.editable,false);
 const room=await call('/tycoon/interior-options?propertyId=trailer-01');
 assert(room.data.rooms.some(x=>x.id==='home'&&x.free),'free owner home appears without Tycoon purchases');
 assert.equal((await call('/tycoon/interior-access?propertyId=trailer-01&roomId=home')).code,200);
 assert.equal((await call('/tycoon/interior-access?propertyId=trailer-01&roomId=home',null,guest)).code,200);
 assert.equal((await call('/home/state',{propertyId:'trailer-01',layoutId:'split',furniture:[]},guest)).code,403,'guest cannot edit');
 assert.equal((await call('/home/state',{propertyId:'trailer-01',layoutId:'bunker-suite',furniture:[]})).code,400,'no paid unlock spoofing');
 assert.equal((await call('/home/state',{propertyId:'trailer-01',layoutId:'cozy',furniture:[{id:'hack',type:'sofa',x:300,z:0,rotation:0}]})).code,400);
 const furniture=[{id:'floor-lamp-1',type:'floor-lamp',x:1.5,z:-1,rotation:0}];
 const changed=await call('/home/state',{propertyId:'trailer-01',layoutId:'open',furniture});
 assert.equal(changed.code,200);assert.equal(changed.data.costXrp,0);
 assert.equal(changed.data.layoutId,'open');assert.deepEqual(changed.data.furniture,furniture);
 assert.equal((await call('/home/state?propertyId=trailer-01',null,guest)).data.layoutId,'open');
 assert.equal(Pay.sdb.prepare('SELECT COUNT(*) AS n FROM estate_tycoon_orders').get().n,0,'free interior edit never creates XRP invoices');
 assert.equal(Pay.sdb.prepare('SELECT share_units FROM estate_property_ownership WHERE property_id=?').get('trailer-01').share_units,1,'payout share unchanged');
 Pay.sdb.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=?').run(guest,'trailer-01');
 assert.equal((await call('/home/state',{propertyId:'trailer-01',layoutId:'cozy',furniture:[]})).code,403,'former owner cannot edit');
 assert.equal((await call('/home/state?propertyId=trailer-01',null,guest)).data.layoutId,'open','home follows resale');
 console.log('Estate home HTTP: authentication, invited guests, free walk-in, 0 XRP saved furniture, no share change and resale passed');
 server.close();fs.rmSync(data,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
