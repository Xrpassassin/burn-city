'use strict';
const assert = require('node:assert/strict');
const { createEstatesInstanceManager } = require('./estates-instance');

let nextTimer = 0;
const timers = new Map();
const events = [];
const manager = createEstatesInstanceManager({
  idleMs: 1000,
  leaseMs: 2000,
  setTimer(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
  clearTimer(id) { timers.delete(id); },
  onState: event => events.push(event.state)
});

assert.equal(manager.enter('bad').error, 'invalid_client_session');
const alice = manager.enter('browser_session_alice_01');
const bob = manager.enter('browser_session_bob__02');
assert.equal(alice.ok, true);
assert.equal(bob.ok, true);
assert.equal(alice.instanceId, bob.instanceId, 'all visitors join one shared logical instance');
assert.notEqual(alice.leaseToken, bob.leaseToken, 'each browser receives its own unguessable lease');
assert.equal(manager.snapshot().activeVisitors, 2);
assert.equal(manager.enter('browser_session_alice_01').leaseToken, alice.leaseToken, 'duplicate entry is idempotent');
assert.equal(manager.heartbeat(alice.leaseToken).ok, true, 'heartbeat refreshes the lease');
assert.equal(manager.snapshot().activeVisitors, 2);
assert.equal(manager.leave('bad').error, 'invalid_lease');
assert.equal(manager.leave(alice.leaseToken).released, true);
assert.equal(manager.leave(alice.leaseToken).released, false, 'release is idempotent');
assert.equal(manager.snapshot().activeVisitors, 1);
assert.equal(manager.leave(bob.leaseToken).activeVisitors, 0);
assert.equal(manager.snapshot().state, 'idle');
assert.equal([...timers.values()].filter(timer => timer.ms === 1000).length, 1, 'only idle disposal is scheduled when final lease leaves');
const carol = manager.enter('browser_session_carol_003');
assert.equal(carol.instanceId, alice.instanceId, 'new arrival during grace period reuses the instance');
assert.equal([...timers.values()].some(timer => timer.ms === 1000), false, 'new arrival cancels idle disposal');
manager.leave(carol.leaseToken);
const [timerId, idleTimer] = [...timers.entries()].find(([, timer]) => timer.ms === 1000);
timers.delete(timerId);
idleTimer.fn();
assert.equal(manager.snapshot().state, 'absent');
const dave = manager.enter('browser_session_dave___04');
assert.notEqual(dave.instanceId, alice.instanceId, 'a disposed instance gets a new generation');
assert.ok(events.includes('created') && events.includes('joined') && events.includes('disposed'));
console.log('estates-instance: shared admission lifecycle tests passed');
