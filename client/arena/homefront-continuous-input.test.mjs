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
console.log('Homefront continuous client input prediction tests passed.');
