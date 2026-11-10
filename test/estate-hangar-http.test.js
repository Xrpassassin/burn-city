'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'estate-hangar-http-'));
Object.assign(process.env,{DATA_DIR:data,PORT:'0',DRY_RUN:'false',ESTATE_TYCOON_UPGRADES_ENABLED:'0',
 XRPL_NETWORK:'mainnet',XAMAN_API_KEY:'test-key',XAMAN_API_SECRET:'test-secret',
 BURN_JOB_IN_SERVER:'false',XRPL_WSS:'ws://127.0.0.1:1'});
const Pay=require('../server/payments');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',other='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const {server}=require('../server/server');
(async()=>{
 await new Promise(r=>server.listening?r():server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port,token=acct=>Pay.sign({acct,exp:Date.now()+60000});
 const call=async(p,body,acct=buyer)=>{const r=await fetch(base+'/api/estates'+p,{method:body?'POST':'GET',
  headers:{...(acct?{authorization:'Bearer '+token(acct)}:{}),'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})});return {code:r.status,data:await r.json()};};
 Pay.sdb.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('mansion-01',buyer,'E'.repeat(64),300000000,100,Date.now());
 assert.equal((await call('/tycoon/hangar?propertyId=mansion-01',null,null)).code,401);
 assert.equal((await call('/tycoon/hangar?propertyId=mansion-01')).code,403);
 const tycoon=require('../server/estate-tycoon').createEstateTycoonStore(Pay.sdb);
 const orderId='tycoon_'+'d'.repeat(40);
 tycoon.reserve({propertyId:'mansion-01',buyer,itemId:'estate-helicopter',orderId,now:Date.now()});
 tycoon.settle({orderId,buyer,txHash:'C'.repeat(64),ledgerIndex:282,now:Date.now()});
 const hangar=await call('/tycoon/hangar?propertyId=mansion-01');
 assert.equal(hangar.code,200);assert.equal(hangar.data.style.callsign,'BURN AIR');
 assert.equal(hangar.data.financialRewards,false);
 assert.equal((await call('/tycoon/hangar?propertyId=mansion-01',null,other)).code,403);
 const badStyle=await call('/tycoon/hangar/style',{propertyId:'mansion-01',paint:'invalid',trim:'brass',callsign:'BAD'});
 assert.equal(badStyle.code,400);
 const styled=await call('/tycoon/hangar/style',{propertyId:'mansion-01',paint:'ember',trim:'ice',callsign:'DRAGON ONE'});
 assert.equal(styled.code,200);assert.equal(styled.data.style.paint,'ember');
 const world=await call('/tycoon/world',null,null);
 assert.equal(world.code,200);
 assert(world.data.helicopterStyles.some(s=>s.propertyId==='mansion-01'&&s.paint==='ember'&&s.trim==='ice'));
 assert(!JSON.stringify(world.data).includes('DRAGON ONE'),'private aircraft callsign must never appear in public scene state');
 assert.equal((await call('/tycoon/hangar/style',{propertyId:'mansion-01',paint:'royal',trim:'brass',callsign:'TAKEN'},other)).code,403);
 const session=await call('/tycoon/hangar/flight/start',{propertyId:'mansion-01'});
 assert.equal(session.code,200);assert.match(session.data.sessionId,/^[0-9a-f]{32}$/);
 assert.equal((await call('/tycoon/hangar/flight/start',{propertyId:'mansion-01'},other)).code,403);
 assert.equal((await call('/tycoon/hangar/flight/finish',{propertyId:'mansion-01',sessionId:session.data.sessionId,
  durationSeconds:0,routeVisited:['bad'],landed:false})).code,400);
 const completed=await call('/tycoon/hangar/flight/finish',{propertyId:'mansion-01',sessionId:session.data.sessionId,
  durationSeconds:0,routeVisited:[],landed:false});
 assert.equal(completed.code,200);assert.equal(completed.data.totals.completedFlights,1);
 assert.equal(completed.data.milestones.firstLanding,false);
 assert.equal((await call('/tycoon/hangar/flight/finish',{propertyId:'mansion-01',sessionId:session.data.sessionId,
  durationSeconds:0,routeVisited:[],landed:false})).data.alreadyFinished,true);
 assert.equal(completed.data.financialRewards,false);
 assert.equal(tycoon.state('mansion-01').liveRewardShareUnits,100);
 console.log('Estate Hangar HTTP: auth, locked flight denial, approved cosmetics, invalid routes, idempotent landing and no financial impact passed');
 server.close();fs.rmSync(data,{recursive:true,force:true});process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
