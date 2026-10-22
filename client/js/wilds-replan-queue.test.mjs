import assert from 'node:assert/strict';
import { enqueueReplan, drainReplanQueue } from './wilds-replan-queue.mjs';

const request = (entityId, requestedAtMs = 100) => ({
  entityId, reason: 'blocked', requestedAtMs,
});

let result = enqueueReplan([], request('wolf-1'));
assert.equal(result.accepted, true);
assert.equal(result.reason, 'queued');
assert.deepEqual(result.queue, [request('wolf-1')]);

result = enqueueReplan(result.queue, request('wolf-1', 120));
assert.equal(result.accepted, false);
assert.equal(result.reason, 'duplicate-entity');
assert.equal(result.queue.length, 1);
assert.equal(result.queue[0].requestedAtMs, 100);

result = enqueueReplan(result.queue, request('wolf-2', 130));
assert.equal(result.accepted, true);
result = enqueueReplan(result.queue, request('wolf-3', 140), { maxQueueLength: 2 });
assert.equal(result.accepted, false);
assert.equal(result.reason, 'queue-full');
assert.equal(result.queue.length, 2);

let drained = drainReplanQueue(result.queue, { maxRequests: 1 });
assert.deepEqual(drained.requests, [request('wolf-1')]);
assert.deepEqual(drained.remaining, [request('wolf-2', 130)]);

drained = drainReplanQueue(result.queue, { maxRequests: 0 });
assert.deepEqual(drained.requests, []);
assert.equal(drained.remaining.length, 2);

drained = drainReplanQueue(result.queue, { maxRequests: 99 });
assert.equal(drained.requests.length, 2);
assert.deepEqual(drained.remaining, []);

assert.equal(enqueueReplan([], request('', 1)).reason, 'invalid-input');
assert.equal(enqueueReplan([], request('wolf', NaN)).reason, 'invalid-input');
assert.equal(enqueueReplan([], request('wolf'), { maxQueueLength: 0 }).reason, 'invalid-input');
assert.equal(drainReplanQueue([], { maxRequests: -1 }), null);
assert.equal(drainReplanQueue([request('bad', Infinity)]), null);

console.log('replan queue tests passed');
