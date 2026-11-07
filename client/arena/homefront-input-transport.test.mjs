import assert from 'node:assert/strict';
import { createHomefrontMoveTransport, HOMEFRONT_INPUT_TIMEOUT_MS } from './homefront-input-transport.mjs';

assert.equal(HOMEFRONT_INPUT_TIMEOUT_MS,1800);
const request = { sequence: 12, x: 0.6, z: -0.8, sprint: true };
let urlSeen, optionsSeen;
const transport=createHomefrontMoveTransport({
  api:'https://burn-city-game.fly.dev',token:()=>'disposable-test-token',
  fetchImpl:async(url,options)=>{
    urlSeen=url; optionsSeen=options;
    return {ok:true,json:async()=>({inputAck:{sequence:12,x:8,z:9}})};
  }
});
assert.deepEqual(await transport(request),{inputAck:{sequence:12,x:8,z:9}});
assert.equal(urlSeen,'https://burn-city-game.fly.dev/api/homefront/world/move-input');
assert.equal(optionsSeen.method,'POST');
assert.equal(optionsSeen.headers.authorization,'Bearer disposable-test-token');
assert.deepEqual(JSON.parse(optionsSeen.body),request);
assert(optionsSeen.signal instanceof AbortSignal);
assert.equal(optionsSeen.signal.aborted,false);
assert.equal(createHomefrontMoveTransport({api:'/',token:()=>'x',fetchImpl:async()=>({ok:true,json:async()=>({inputAck:{sequence:1,x:0,z:0}})})}) instanceof Function,true);
assert.equal(typeof createHomefrontMoveTransport({api:'http://localhost:3000',token:()=>'x',fetchImpl:async()=>({ok:true,json:async()=>({inputAck:{sequence:1,x:0,z:0}})})}),'function');
for(const bad of ['http://example.org','https://attacker.example','https://user:pass@evil.example','javascript:alert(1)','file:///root','https://x.test/path?secret=1','//evil.example',null]){
  assert.throws(()=>createHomefrontMoveTransport({api:bad,token:()=>'',fetchImpl:()=>{}}),/invalid_homefront_api_base/);
}
assert.throws(()=>createHomefrontMoveTransport({api:'/',token:()=>'x',fetchImpl:()=>{},timeoutMs:9000}),/invalid_homefront_movement_timeout/);
const missing=createHomefrontMoveTransport({api:'/',token:()=>'',fetchImpl:()=>{throw new Error('must_not_fetch');}});
await assert.rejects(missing(request),/sign_in_with_xaman/);

const fail=createHomefrontMoveTransport({api:'/',token:()=>'x',fetchImpl:async()=>({
 ok:false,json:async()=>({error:'move_cooldown'})
})});
await assert.rejects(fail(request),/move_cooldown/);
const invalidAck=createHomefrontMoveTransport({api:'/',token:()=>'x',fetchImpl:async()=>({
 ok:true,json:async()=>({inputAck:{sequence:12,x:Infinity,z:0}})
})});
await assert.rejects(invalidAck(request),/movement_ack_mismatch/);
const malformed=createHomefrontMoveTransport({api:'/',token:()=>'x',fetchImpl:async()=>({
 ok:true,json:async()=>({wrong:'shape'})
})});
await assert.rejects(malformed(request),/movement_ack_mismatch/);

let aborted=false;
const stalled=createHomefrontMoveTransport({api:'/',token:()=>'x',timeoutMs:250,
 fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>{
  signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(new Error('AbortError'),{name:'AbortError'}));},{once:true});
 })
});
const start=Date.now();
await assert.rejects(stalled(request),/movement_network_timeout/);
assert.equal(aborted,true,'hung browser fetch must be aborted');
assert(Date.now()-start>=220,'timeout was actually applied');
assert(Date.now()-start<1300,'client does not hang indefinitely');
const network=createHomefrontMoveTransport({api:'/',token:()=>'x',fetchImpl:()=>Promise.reject(new Error('offline'))});
await assert.rejects(network(request),/offline/);
console.log('Homefront guarded movement transport: authorization, ack, validation, server errors, offline, 250ms abort and timeout passed');
const {createHomefrontResyncTransport}=await import('./homefront-input-transport.mjs');
let getOptions;
const read=createHomefrontResyncTransport({api:'/',token:()=>'test-token',fetchImpl:async(url,options)=>{
 assert.equal(url,'/api/homefront/world');getOptions=options;
 return {ok:true,json:async()=>({self:{x:1,z:2},inputProtocol:{enabled:true,nextSequence:5}})};
}});
assert.equal((await read()).inputProtocol.nextSequence,5);
assert.equal(getOptions.method,'GET');assert.equal(getOptions.body,undefined);
assert.equal(getOptions.headers.authorization,'Bearer test-token');
let credential='old';
const rotated=createHomefrontResyncTransport({api:'/',token:()=>credential,fetchImpl:async()=>{
 credential='new';return {ok:true,json:async()=>({self:{x:9,z:9},inputProtocol:{enabled:true,nextSequence:9}})};
}});
await assert.rejects(rotated(),/sign_in_with_xaman/,'a response for an abandoned credential cannot restore movement');
console.log('Homefront movement resync transport: read-only GET, authorization and credential rotation passed');
