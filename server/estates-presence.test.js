'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createEstatesInstanceManager } = require('./estates-instance');
const { attach, cleanPosition, isPlausibleStep } = require('./estates-presence');

class FakeSocket extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.bufferedAmount = 0; this.sent = []; this.closeInfo = null; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close(code, reason) { this.closeInfo = { code, reason }; this.readyState = 3; this.emit('close'); }
  message(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
}
let nextTimer = 0;
const fakeTimers = new Map();
const manager = createEstatesInstanceManager({
  idleMs: 10_000,
  leaseMs: 90_000,
  setTimer(fn, ms) { const id = ++nextTimer; fakeTimers.set(id, {fn,ms}); return id; },
  clearTimer(id) { fakeTimers.delete(id); }
});
const oneLease = manager.enter('presence_client_session_01');
const twoLease = manager.enter('presence_client_session_02');
assert.equal(oneLease.instanceId, twoLease.instanceId);
const first = new FakeSocket();
const second = new FakeSocket();
attach(first, new URL('ws://local/?mode=estates&lease='+oneLease.leaseToken), manager);
attach(second, new URL('ws://local/?mode=estates&lease='+twoLease.leaseToken), manager);
assert.equal(first.sent[0].t, 'w');
assert.equal(second.sent[0].peers.length, 0, 'new visitor does not receive an uninitialized peer at the origin');
assert.equal(first.sent.at(-1).t, 'w', 'uninitialized peers are not announced at the origin');
second.message({t:'p',x:7,y:0,z:-11,r:1.25});
assert.deepEqual(first.sent.at(-1), {t:'j',id:2,x:7,y:0,z:-11,r:1.25}, 'first valid position announces the peer');
second.message({t:'p',x:1e99,y:0,z:0,r:0});
assert.equal(first.sent.at(-1).x, 7, 'non-finite position payload is ignored');
assert.equal(cleanPosition({x:239,y:0,z:-239,r:9}).r, Math.PI, 'heading is normalized to the supported range');
assert.equal(cleanPosition({x:241,y:0,z:0,r:0}), null, 'out-of-world coordinates are rejected instead of silently clamped');
assert.equal(cleanPosition({x:0,y:-3,z:0,r:0}), null, 'out-of-range vertical coordinates are rejected');
assert.equal(cleanPosition({x:NaN,y:0,z:0,r:0}), null, 'non-finite client coordinates are rejected');
assert.equal(cleanPosition({x:'7',y:0,z:0,r:0}), null, 'string coordinates are rejected rather than coerced');
assert.equal(cleanPosition({x:null,y:0,z:0,r:0}), null, 'null coordinates are rejected rather than coerced');
assert.equal(isPlausibleStep({x:0,y:0,z:0},{x:5,y:0,z:0},100), false, 'large position jumps are rejected');
assert.equal(isPlausibleStep({x:0,y:0,z:0},{x:5,y:0,z:0},600), true, 'normal movement during a delayed update is tolerated');
assert.equal(isPlausibleStep({x:0,y:0,z:0},{x:2.6,y:1,z:0},100), true, 'jetpack and board speeds can be relayed');
assert.equal(cleanPosition({x:0,y:180,z:0,r:0}).y,180,'jetpack altitude remains within presence bounds');
assert.equal(isPlausibleStep({x:0,y:0,z:0},{x:0,y:3,z:0},1000), false, 'grounded movement cannot spoof a vertical climb');
const thirdLease = manager.enter('presence_client_session_03');
const third = new FakeSocket();
attach(third, new URL('ws://local/?mode=estates&lease='+thirdLease.leaseToken), manager);
assert.equal(third.sent[0].peers.length, 1, 'snapshot includes initialized peers only');
const beforeSilentExit = first.sent.length;
third.close(1000,'done');
assert.equal(first.sent.length, beforeSilentExit, 'disconnecting an uninitialized peer emits no phantom leave');
manager.leave(thirdLease.leaseToken);
second.close(1000,'done');
assert.deepEqual(first.sent.at(-1), {t:'l',id:2}, 'departing visitor is removed from peers');
const invalid = new FakeSocket();
attach(invalid, new URL('ws://local/?mode=estates&lease='+'0'.repeat(48)), manager);
assert.equal(invalid.closeInfo.code,1008,'invalid lease is rejected');
manager.leave(oneLease.leaseToken);
first.message({t:'p',x:1,y:0,z:1,r:0});
assert.equal(first.closeInfo.code,1008,'socket cannot send after its lease is revoked');
manager.leave(twoLease.leaseToken);
console.log('estates-presence: shared peer snapshots, strict world bounds, movement envelope, leave and lease checks passed');
