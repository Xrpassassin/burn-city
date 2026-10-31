'use strict';
// Exercise actual authenticated API routes, not just pure reward helpers.
// The claiming ledger and pack must be saved together in homefront-world.json.
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');
const Inventory = require('../server/homefront-inventory');
const Surveys = require('../server/homefront-field-surveys');
const files = new Map();
const store = {
  load(name, fallback) { return files.has(name) ? JSON.parse(JSON.stringify(files.get(name))) : fallback; },
  save(name, value) { files.set(name, JSON.parse(JSON.stringify(value))); }
};
async function call(method, path, acct, payload={}) {
  const response={};
  await handle({method},response,new URL('http://localhost'+path),{
    json:(_res,status,data)=>Object.assign(response,{status,data}),
    body:async()=>payload,gate:()=>false,ip:'127.0.0.1',
    who:()=>acct?{acct}:null,store
  });
  return response;
}
function place(acct,x,z) {
  const w=files.get('homefront-world.json');
  w.players[acct].x=x;w.players[acct].z=z;w.players[acct].lastSeen=Date.now();
}
const W='/api/homefront/world', EXP=W+'/exploration';
(async()=>{
  const a='scout-alpha', b='scout-bravo';
  assert.equal((await call('POST',EXP+'/claim',null,{contractId:'evacuation_survey'})).status,401);
  assert.equal((await call('POST',W+'/enter',a)).status,200);
  assert.equal((await call('POST',W+'/enter',b)).status,200);
  const contract=Surveys.CONTRACTS.find(c=>c.id==='evacuation_survey');
  let res=await call('GET',EXP,a);
  assert.equal(res.status,200);
  assert.equal(res.data.surveys.find(c=>c.id===contract.id).status,'incomplete');
  assert.equal((await call('POST',EXP+'/claim',a,{contractId:contract.id,sites:contract.sites,amount:999999})).data.error,
    'field_survey_incomplete','the client cannot forge location visits or supply amounts');
  for(const siteId of contract.sites) {
    const site=require('../client/arena/homefront-exploration-content.mjs').LANDMARKS.find(c=>c.id===siteId);
    place(a,site.x,site.z);
    const discovery=await call('POST',EXP+'/discover',a,{landmarkId:siteId});
    assert.equal(discovery.status,200,siteId+' is a real server-confirmed discovery');
  }
  res=await call('GET',EXP,a);
  assert.equal(res.data.surveys.find(c=>c.id===contract.id).status,'ready');
  assert.equal((await call('GET',EXP,b)).data.surveys.find(c=>c.id===contract.id).status,'incomplete',
    'one account surveying a landmark does not mark others as completed');
  const before=files.get('homefront-world.json').players[a].inventory;
  const earned=await call('POST',EXP+'/claim',a,{contractId:contract.id,amount:9999,item:'ammo'});
  assert.equal(earned.status,200,JSON.stringify(earned.data));
  assert.equal(earned.data.claimed.id,contract.id);
  assert.deepEqual(earned.data.supplies,[{item:'food',amount:1},{item:'water',amount:1}]);
  const saved=files.get('homefront-world.json');
  assert.ok(saved.fieldSurveyClaims[a][contract.id]>0);
  assert.equal(saved.players[a].inventory.food,(before.food||0)+1);
  assert.equal(saved.players[a].inventory.water,(before.water||0)+1);
  assert.equal((await call('POST',EXP+'/claim',a,{contractId:contract.id})).data.error,
    'field_survey_already_claimed','API replays cannot duplicate inventory');
  assert.equal((await call('GET',EXP,a)).data.surveys.find(c=>c.id===contract.id).status,'claimed');
  assert.equal((await call('POST',EXP+'/claim',b,{contractId:contract.id})).data.error,
    'field_survey_incomplete','the second player must independently explore all three sites');
  // A full bag fails atomically, then can be claimed after making space.
  const w=files.get('homefront-world.json');
  w.players[b].inventory=Inventory.normalize({scrap:8,wood:4});
  w.players[b].lastSeen=Date.now();
  const progress=files.get('homefront-exploration.json');
  progress[b]={discovered:contract.sites.slice(),firstDiscoveredAt:Object.fromEntries(contract.sites.map(id=>[id,Date.now()])),intel:[],updatedAt:Date.now()};
  const noRoom=await call('POST',EXP+'/claim',b,{contractId:contract.id});
  assert.equal(noRoom.data.error,'inventory_full','full pack must not consume the milestone');
  assert.equal(files.get('homefront-world.json').fieldSurveyClaims[b],undefined);
  const reopened=files.get('homefront-world.json');
  reopened.players[b].inventory=Inventory.normalize({});
  assert.equal((await call('POST',EXP+'/claim',b,{contractId:contract.id})).status,200,
    'player can claim after freeing space');
  assert.equal(files.get('homefront-world.json').fieldSurveyClaims[a][contract.id]>0,true);
  assert.equal(files.get('homefront-world.json').fieldSurveyClaims[b][contract.id]>0,true);
  // No rewards reference wallet addresses, tradable XRP, or treasury data.
  assert.equal(JSON.stringify(earned.data).includes('XRP'),false);
  console.log('Homefront two-account field survey API reward / replay / capacity tests passed.');
})().catch(err=>{console.error(err);process.exitCode=1;});
