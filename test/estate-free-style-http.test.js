'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'estate-free-style-http-'));
Object.assign(process.env,{DATA_DIR:data,PORT:'0',DRY_RUN:'true',ESTATE_TYCOON_UPGRADES_ENABLED:'0',
 XRPL_NETWORK:'testnet',XAMAN_API_KEY:'test-key',XAMAN_API_SECRET:'test-secret',
 BURN_JOB_IN_SERVER:'false',XRPL_WSS:'ws://127.0.0.1:1'});
const Pay=require('../server/payments');
const owner='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',other='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const {server}=require('../server/server');
(async()=>{
 await new Promise(r=>server.listening?r():server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,token=acct=>Pay.sign({acct,exp:Date.now()+60000});
 const call=async(p,body,acct=owner)=>{
  const r=await fetch(base+'/api/estates'+p,{method:body?'POST':'GET',
   headers:{...(acct?{authorization:'Bearer '+token(acct)}:{}),'content-type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{})});return {code:r.status,data:await r.json()};
 };
 Pay.sdb.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',owner,'E'.repeat(64),3000000,1,Date.now());
 const pub=await call('/free-styles',null,null);assert.equal(pub.code,200);
 assert.equal(pub.data.costXrp,0);assert.equal(pub.data.properties.length,0);
 assert.equal((await call('/free-style?propertyId=trailer-01',null,null)).code,401);
 assert.equal((await call('/free-style?propertyId=trailer-01',null,other)).code,403);
 const initial=await call('/free-style?propertyId=trailer-01');
 assert.equal(initial.code,200);assert.equal(initial.data.style.architecture,'classic');
 const wrong=await call('/free-style',{propertyId:'trailer-01',architecture:'hack',palette:'coastal'});
 assert.equal(wrong.code,400);
 assert.equal((await call('/free-style',{propertyId:'trailer-01',architecture:'modern',palette:'coastal'},other)).code,403);
 const changed=await call('/free-style',{propertyId:'trailer-01',architecture:'modern',palette:'coastal'});
 assert.equal(changed.code,200);assert.equal(changed.data.costXrp,0);
 const world=await call('/free-styles',null,null);
 assert.equal(world.code,200);assert(world.data.properties.some(p=>p.propertyId==='trailer-01'&&p.architecture==='modern'&&p.palette==='coastal'));
 assert(!JSON.stringify(world.data).includes(owner),'public finishes must not leak wallet address');
 assert.equal((await call('/free-style?propertyId=trailer-01')).data.style.palette,'coastal');
 Pay.sdb.prepare('UPDATE estate_property_ownership SET acct=? WHERE property_id=?').run(other,'trailer-01');
 assert.equal((await call('/free-style',{propertyId:'trailer-01',architecture:'rustic',palette:'forest'})).code,403,'former owner cannot change style');
 assert.equal((await call('/free-style?propertyId=trailer-01',null,other)).data.style.architecture,'modern','style follows property after resale');
 assert.equal((await call('/free-style',{propertyId:'trailer-01',architecture:'rustic',palette:'forest'},other)).code,200);
 assert.equal((await call('/free-styles',null,null)).data.properties[0].architecture,'rustic');
 assert.equal(Pay.sdb.prepare('SELECT COUNT(*) AS n FROM estate_free_styles').get().n,1);
 console.log('Estate free-style HTTP: public visibility, Xaman owner auth, zero-XRP save, validation and resale passed');
 server.close();fs.rmSync(data,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
