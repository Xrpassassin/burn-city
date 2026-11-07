import assert from 'node:assert/strict';
import { createContinuousInput, INPUT_SEND_INTERVAL_MS, MAX_PREDICTION_LEAD } from './homefront-continuous-input.mjs';

const sent = [], observed = [], errors = [];
let answer;
const driver = createContinuousInput({
  send: command => { sent.push(command); return new Promise(resolve => { answer = resolve; }); },
  onSnapshot: data => observed.push(data.inputAck.sequence),
  onUnavailable: reason => errors.push(reason)
});
driver.sync({ enabled: false, nextSequence: 0 }, { x: 10, z: 20 });
assert.equal(driver.enabled, false);
driver.sync({ enabled: true, nextSequence: 42 }, { x: 10, z: 20 });
assert.equal(driver.enabled, true);
driver.step({ x: 1, z: 0 }, false, 100, 0.05);
await Promise.resolve();
assert.deepEqual(sent[0], { sequence: 42, x: 1, z: 0, sprint: false });
assert.ok(driver.position().x > 10, 'local avatar responds before server reply');
for (let i = 0; i < 50; i++) driver.step({ x: 1, z: 0 }, false, 110, 0.05);
assert.ok(driver.position().x <= 10 + MAX_PREDICTION_LEAD + 1e-9, 'unacknowledged travel lead is bounded');
assert.equal(sent.length, 1, 'single in-flight request');
answer({ inputAck: { sequence: 42, x: 10.8, z: 20 } });
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(observed, [42]);
assert.equal(driver.pending, false);
driver.step(null, false, 100 + INPUT_SEND_INTERVAL_MS, 0.016);
await Promise.resolve();
assert.equal(sent[1].sequence, 43, 'a neutral release packet is sent');
assert.equal(sent[1].x, 0);
assert.equal(sent[1].z, 0);
answer({ inputAck: { sequence: 43, x: 10.8, z: 20 } });
await new Promise(resolve => setImmediate(resolve));
driver.step(null, false, 500, 0.016);
assert.equal(sent.length, 2, 'idle movement emits no additional packets');
driver.sync({ enabled: true, nextSequence: 46 }, { x: 10.8, z: 20 }, 500);
assert.equal(driver.nextSequence, 46, 'reload sequence can advance without replay');
driver.disable('test');
assert.equal(driver.enabled, false);
assert.deepEqual(errors, ['test']);

const rejected = [];
const mismatch = createContinuousInput({
  send: cmd => ({ inputAck: { sequence: cmd.sequence + 1, x: 1, z: 1 } }),
  onUnavailable: reason => rejected.push(reason)
});
mismatch.sync({ enabled: true, nextSequence: 0 }, { x: 0, z: 0 });
mismatch.step({ x: 1, z: 1 }, false, 100, 0.05);
await new Promise(resolve => setImmediate(resolve));
assert.equal(mismatch.enabled, false, 'unexpected server acknowledgement disables the opt-in mode');
assert.deepEqual(rejected, ['movement_ack_mismatch']);
mismatch.sync({ enabled: true, nextSequence: 10 }, { x: 0, z: 0 }, 400);
assert.equal(mismatch.enabled, false, 'fatal acknowledgement mismatch is not rearmed by a polling GET');

const denied = [];
const serverOff = createContinuousInput({
  send: () => { throw new Error('continuous_movement_unavailable'); },
  onUnavailable: reason => denied.push(reason)
});
serverOff.sync({ enabled: true, nextSequence: 0 }, { x: 0, z: 0 });
serverOff.step({ x: 0, z: 1 }, false, 100, 0.02);
await new Promise(resolve => setImmediate(resolve));
assert.equal(serverOff.enabled, false);
assert.deepEqual(denied, ['continuous_movement_unavailable']);

const waitingSends = [];
const waiting = createContinuousInput({ send: command => {
  waitingSends.push(command);
  return { inputAck: { sequence: command.sequence, x: 1, z: 0 } };
} });
waiting.sync({ enabled: true, nextSequence: 11, readyInMs: 600 }, { x: 0, z: 0 }, 1000);
waiting.step({ x: 1, z: 0 }, false, 1300, 0.05);
assert.equal(waitingSends.length, 0, 'spawn cooldown does not send premature input');
assert.deepEqual(waiting.position(), { x: 0, z: 0 }, 'spawn cooldown does not predict server-rejected movement');
waiting.step({ x: 1, z: 0 }, false, 1600, 0.05);
await new Promise(resolve => setImmediate(resolve));
assert.equal(waitingSends.length, 1);
assert.equal(waitingSends[0].sequence, 11);

let rejectedCooldown = 0;
const cooldown = createContinuousInput({ send: () => {
  rejectedCooldown++;
  throw new Error('move_cooldown');
} });
cooldown.sync({ enabled: true, nextSequence: 0 }, { x: 0, z: 0 });
cooldown.step({ x: 1, z: 0 }, false, 100, 0.05);
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(cooldown.position(), { x: 0, z: 0 }, 'cooldown rejection rolls back prediction');
cooldown.step({ x: 1, z: 0 }, false, 250, 0.05);
await new Promise(resolve => setImmediate(resolve));
assert.equal(rejectedCooldown, 1, 'cooldown rejection backs off before sending another command');
cooldown.step({ x: 1, z: 0 }, false, 350, 0.05);
await new Promise(resolve => setImmediate(resolve));
assert.equal(rejectedCooldown, 2, 'cooldown backoff expires and movement retries');


const failures=[];
let delayedFail;
let delayedAttempts=0;
const delayed=createContinuousInput({
  send:()=>{delayedAttempts++;return new Promise((_resolve,reject)=>{delayedFail=reject;});},
  onUnavailable:reason=>failures.push(reason)
});
delayed.sync({enabled:true,nextSequence:0},{x:0,z:0});
delayed.step({x:1,z:0},false,100,0.05);
await Promise.resolve();
delayed.step({x:1,z:0},false,1900,0.05);
assert.equal(delayedAttempts,1,'only one request is in flight even during high-latency frames');
delayedFail(new Error('offline'));
await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(delayed.position(),{x:0,z:0},'failed request rolls visual prediction back to verified position');
delayed.step({x:1,z:0},false,2100,0.05);
await Promise.resolve();
assert.equal(delayedAttempts,1,'network retry delay is based on latest frame, not stale send timestamp');
delayed.step({x:1,z:0},false,2251,0.05);
await Promise.resolve();
assert.equal(delayedAttempts,2,'network retry resumes only after the bounded delay');
delayed.disable('test_end');
assert.deepEqual(failures,['test_end']);

const repeated=[];
let requests=0;
const offline=createContinuousInput({
  send:()=>{requests++;throw new Error('offline');},
  onUnavailable:reason=>repeated.push(reason)
});
offline.sync({enabled:true,nextSequence:0},{x:0,z:0});
for(const at of [100,500,1300,2800,5800]){
  offline.step({x:1,z:0},false,at,0.05);
  await new Promise(resolve=>setImmediate(resolve));
}
assert.equal(requests,5,'exponential backoff avoids a retry storm');
assert.equal(offline.enabled,false,'five failed transfers fall back instead of freezing movement indefinitely');
assert.deepEqual(repeated,['movement_network_unavailable']);
offline.sync({enabled:true,nextSequence:100},{x:0,z:0});
assert.equal(offline.enabled,false,'fatal network fallback needs an explicit page reload to re-enable preview');

console.log('Homefront continuous client input prediction tests passed.');

// A timed-out POST may commit or may be lost. A fresh GET determines the next
// sequence; no client replay or invented movement is allowed during recovery.
for(const committed of [false,true]){
 const commands=[];let reads=0;
 const recovered=createContinuousInput({
  send:command=>{commands.push(command);if(commands.length===1)throw Error('movement_network_timeout');
   return {inputAck:{sequence:command.sequence,x:3,z:4}};},
  onResync:async()=>{reads++;return {self:{x:2,z:4},inputProtocol:{enabled:true,nextSequence:committed?1:0}};}
 });
 recovered.sync({enabled:true,nextSequence:0},{x:0,z:0});
 recovered.step({x:1,z:0},false,100,0.05);await new Promise(r=>setImmediate(r));
 assert.equal(recovered.recovering,true);assert.deepEqual(recovered.position(),{x:0,z:0});
 recovered.step({x:1,z:0},false,300,0.05);await new Promise(r=>setImmediate(r));
 assert.equal(reads,0,'recovery respects backoff');
 recovered.step({x:1,z:0},false,500,0.05);await new Promise(r=>setImmediate(r));
 assert.equal(commands.length,1,'recovery sends no new intent or replay');
 assert.equal(recovered.recovering,false);assert.deepEqual(recovered.position(),{x:2,z:4});
 recovered.step({x:1,z:0},false,700,0.05);await new Promise(r=>setImmediate(r));
 assert.equal(commands[1].sequence,committed?1:0,'server alone decides whether the lost intent committed');
 assert.equal(recovered.enabled,true);
}
let endRecovery;
const abandoned=createContinuousInput({send:()=>{throw Error('invalid_movement_sequence');},
 onResync:()=>new Promise(resolve=>{endRecovery=resolve;})});
abandoned.sync({enabled:true,nextSequence:0},{x:0,z:0});
abandoned.step({x:1,z:0},false,100,0.05);await new Promise(r=>setImmediate(r));
abandoned.step(null,false,500,0.05);await new Promise(r=>setImmediate(r));
abandoned.disable('returned_to_refuge');
endRecovery({self:{x:99,z:99},inputProtocol:{enabled:true,nextSequence:10}});await new Promise(r=>setImmediate(r));
assert.equal(abandoned.enabled,false,'a late recovery cannot re-enter an abandoned expedition');
console.log('Homefront walking resync: committed/lost inputs, bounded recovery and abandoned sessions passed');
let attempts=0;
const reconnecting=createContinuousInput({send:()=>{throw Error('offline');},onResync:()=>{attempts++;throw Error('offline');}});
reconnecting.sync({enabled:true,nextSequence:0},{x:0,z:0});
reconnecting.step({x:1,z:0},false,100,0.05);await new Promise(r=>setImmediate(r));
for(const at of [500,900,1700,3200,6200,10200]){
 reconnecting.step({x:1,z:0},false,at,0.05);await new Promise(r=>setImmediate(r));
}
assert.equal(attempts,6,'failed resync reads use bounded exponential backoff');
assert.equal(reconnecting.recovering,true,'a sustained outage stays recoverable without a mandatory page reload');
assert.deepEqual(reconnecting.position(),{x:0,z:0},'offline recovery cannot invent distance');
const offRecovery=createContinuousInput({send:()=>{throw Error('invalid_movement_sequence');},
 onResync:()=>({self:{x:0,z:0},inputProtocol:{enabled:false,nextSequence:0}})});
offRecovery.sync({enabled:true,nextSequence:0},{x:0,z:0});
offRecovery.step({x:1,z:0},false,100,0.05);await new Promise(r=>setImmediate(r));
offRecovery.step(null,false,500,0.05);await new Promise(r=>setImmediate(r));
assert.equal(offRecovery.enabled,false,'authoritative recovery never enables a disabled server movement flag');
