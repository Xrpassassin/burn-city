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
const manager = createEstatesInstanceManager({ idleMs: 10_000 });
const oneLease = manager.enter('presence_client_session_01');
const twoLease = manager.enter('presence_client_session_02');
assert.equal(oneLease.instanceId, twoLease.instanceId);
const first = new FakeSocket();
const second = new FakeSocket();
attach(first, new URL('ws://local/?mode=estates&lease='+oneLease.leaseToken), manager);
attach(second, new URL('ws://local/?mode=estates&lease='+twoLease.leaseToken), manager);
assert.equal(first.sent[0].t, 'w');
assert.equal(second.sent[0].peers.length, 1, 'new visitor receives the current peer snapshot');
assert.equal(first.sent.at(-1).t, 'j', 'existing visitors are told when a peer joins');
second.message({t:'p',x:7,y:0,z:-11,r:1.25});
assert.deepEqual(first.sent.at(-1), {t:'p',id:2,x:7,y:0,z:-11,r:1.25});
second.message({t:'p',x:1e99,y:0,z:0,r:0});
assert.equal(first.sent.at(-1).x, 7, 'non-finite position payload is ignored');
assert.deepEqual(cleanPosition({x:999,y:-20,z:-999,r:9}), {x:240,y:-2,z:-240,r:Math.PI});
assert.equal(cleanPosition({x:NaN,y:0,z:0,r:0}), null, 'non-finite client coordinates are rejected');
assert.equal(isPlausibleStep({x:0,y:0,z:0},{x:5,y:0,z:0},100), false, 'large position jumps are rejected');
assert.equal(isPlausibleStep({x:0,y:0,z:0},{x:5,y:0,z:0},500), true, 'normal movement during a delayed update is tolerated');
second.close(1000,'done');
assert.deepEqual(first.sent.at(-1), {t:'l',id:2}, 'departing visitor is removed from peers');
const invalid = new FakeSocket();
attach(invalid, new URL('ws://local/?mode=estates&lease='+'0'.repeat(48)), manager);
assert.equal(invalid.closeInfo.code,1008,'invalid lease is rejected');
manager.leave(oneLease.leaseToken);
first.message({t:'p',x:1,y:0,z:1,r:0});
assert.equal(first.closeInfo.code,1008,'socket cannot send after its lease is revoked');
manager.leave(twoLease.leaseToken);
console.log('estates-presence: shared peer snapshots, bounded positions, leave and lease checks passed');
