// Exercise the REAL Homefront engine through the disposable guest wrapper.
// No wallet, network, persistent storage, or production world is involved.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createGuestHandler}=require('../server/homefront-guest.js');
const Homefront=require('../server/homefront.js');
const HFStore=require('../server/homefront-store.js');

function harness(handler=createGuestHandler()) {
  async function ask(path,method='GET',token='',payload=null) {
    const req={method,headers:{'x-homefront-guest':token}};
    const res={status:null,data:null};
    const ctx={
      json(_res,status,data){res.status=status;res.data=data;},
      gate:()=>false,ip:'127.0.0.1',
      body:async()=>payload||{}
    };
    const handled=await handler.handle(req,res,new URL(path,'http://localhost'),ctx);
    assert.equal(handled,true);
    assert(Number.isInteger(res.status),'route must always return an HTTP response');
    return res;
  }
  return {ask};
}
const h=harness();
assert.equal((await h.ask('/api/homefront/guest/start')).status,405);
const first=(await h.ask('/api/homefront/guest/start','POST')).data.token;
assert.match(first,/^[a-f0-9]{64}$/);
const second=(await h.ask('/api/homefront/guest/start','POST')).data.token;
assert.notEqual(first,second,'every new guest is independently isolated');
assert.equal((await h.ask('/api/homefront/guest')).status,401);
assert.equal((await h.ask('/api/homefront/guest','GET','f'.repeat(64))).status,401);
assert.equal((await h.ask('/api/homefront/guest/estates','GET',first)).status,404);
assert.equal((await h.ask('/api/homefront/guest/jetpack','GET',first)).status,404);
assert.equal((await h.ask('/api/homefront/guest/world','GET',first)).status,200);

// Guest actions must never read or write real saves, even indirectly.
const oldLoad=HFStore.shared.load,oldSave=HFStore.shared.save;
HFStore.shared.load=()=>{throw Error('production_store_read');};
HFStore.shared.save=()=>{throw Error('production_store_write');};
try {
  const a=await h.ask('/api/homefront/guest','GET',first);
  const b=await h.ask('/api/homefront/guest','GET',second);
  assert.equal(a.status,200);
  assert.equal(b.status,200);
  assert(a.data.base.owner.startsWith('guest_'));
  assert.notEqual(a.data.base.owner,b.data.base.owner);
  const day=a.data.base.day;
  const work=await h.ask('/api/homefront/guest/action','POST',first,{action:{type:'workday'}});
  assert.equal(work.status,200,JSON.stringify(work.data));
  assert(work.data.base.day>day,'guest can actually play and progress in RAM');
  const after=await h.ask('/api/homefront/guest','GET',first);
  const other=await h.ask('/api/homefront/guest','GET',second);
  assert.equal(after.data.base.day,work.data.base.day);
  assert.equal(other.data.base.day,b.data.base.day,'second guest cannot see first progress');
  const entry=await h.ask('/api/homefront/guest/world/enter','POST',first,{});
  assert.equal(entry.status,200,JSON.stringify(entry.data));
  assert(entry.data.self,'guest can explore their isolated Graveyard');
  const isolated=await h.ask('/api/homefront/guest/world','GET',second);
  assert.equal(isolated.status,200);
  assert(!isolated.data.self,'guest B does not inherit guest A world player');
} finally {
  HFStore.shared.load=oldLoad;
  HFStore.shared.save=oldSave;
}
// A guest header is never a valid wallet bearer token on the saved API.
let status;
await Homefront.handle({method:'GET'}, {}, new URL('http://localhost/api/homefront'),{
  json(_res,code){status=code;},who:()=>null,gate:()=>false,ip:'127.0.0.1',
  body:async()=>({})
});
assert.equal(status,401,'guest token cannot unlock wallet save route');

// The same authoritative engine must keep wallet sessions persisted through
// separate requests while guest actions remain isolated. This is a synthetic
// wallet identity and isolated test store — no real Xaman or disk writes.
const walletFiles=new Map();
const savedStore={
  load(name,fallback){return structuredClone(walletFiles.has(name)?walletFiles.get(name):fallback);},
  save(name,value){walletFiles.set(name,structuredClone(value));}
};
async function walletAsk(path,method='GET',payload=null){
  const result={status:null,data:null};
  const req={method,headers:{}};
  const served=await Homefront.handle(req,result,new URL(path,'http://localhost'),{
    json(_res,code,data){result.status=code;result.data=data},
    who:()=>({acct:'rSyntheticWalletHomefrontCheck'}),store:savedStore,
    gate:()=>false,ip:'127.0.0.1',body:async()=>payload||{}
  });
  assert.equal(served,true);
  return result;
}
const walletStart=await walletAsk('/api/homefront');
assert.equal(walletStart.status,200);
const walletOwner=walletStart.data.base.owner;
const walletUpdated=await walletAsk('/api/homefront/action','POST',{action:{type:'workday'}});
assert.equal(walletUpdated.status,200);
assert(walletUpdated.data.base.day>walletStart.data.base.day,
  'a wallet-linked account saves its actual gameplay changes');
const savedDay=walletUpdated.data.base.day;
const freshGuest=(await h.ask('/api/homefront/guest/start','POST')).data.token;
assert.equal((await h.ask('/api/homefront/guest/action','POST',freshGuest,
  {action:{type:'workday'}})).status,200);
const walletAgain=await walletAsk('/api/homefront');
assert.equal(walletAgain.data.base.owner,walletOwner,
  'guest actions cannot replace a wallet-backed account');
assert.equal(walletAgain.data.base.day,savedDay,
  'guest progress is not imported into or allowed to overwrite wallet saves');
assert.equal(walletFiles.has('homefront.json'),true,
  'wallet-connected actions use the dedicated saved game store');
// A fresh server process cannot restore the old token (no disk persistence).
assert.equal((await harness(createGuestHandler()).ask('/api/homefront/guest','GET',first)).status,401);
// Idle expiry and maximum in-memory guest count are enforced.
let time=100;
const ttl=harness(createGuestHandler({now:()=>time,maxSessions:1}));
const t=(await ttl.ask('/api/homefront/guest/start','POST')).data.token;
assert.equal((await ttl.ask('/api/homefront/guest/start','POST')).status,503);
time+=90*60*1000+1;
assert.equal((await ttl.ask('/api/homefront/guest','GET',t)).status,401);
assert.equal((await ttl.ask('/api/homefront/guest/start','POST')).status,200);
console.log('HOMEFRONT GUEST ISOLATION AND WALLET-SAVE BOUNDARY PASSED');
