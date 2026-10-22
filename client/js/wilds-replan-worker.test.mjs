import assert from 'node:assert/strict';
import { processReplanBatch } from './wilds-replan-worker.mjs';

const req = (entityId, requestedAtMs) => ({
  entityId, reason: 'route-invalid-blocked', requestedAtMs,
});
const queue = [req('wolf-1', 1), req('wolf-2', 2), req('wolf-3', 3)];
const called = [];

const result = await processReplanBatch(queue, {
  maxRequests: 2,
  planRoute: async request => {
    called.push(request.entityId);
    return { path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] };
  },
});
assert.deepEqual(called, ['wolf-1', 'wolf-2'], 'planner calls must be sequential FIFO');
assert.equal(result.processedCount, 2);
assert.equal(result.budget, 2);
assert.deepEqual(result.outcomes.map(item => item.status), ['completed', 'completed']);
assert.deepEqual(result.remaining, [req('wolf-3', 3)]);
assert.equal(queue.length, 3, 'input queue must not be mutated');

const mixed = await processReplanBatch(queue, {
  maxRequests: 3,
  planRoute: async request => {
    if (request.entityId === 'wolf-1') return null;
    if (request.entityId === 'wolf-2') throw new Error('planner offline');
    return { path: [] };
  },
});
assert.deepEqual(mixed.outcomes.map(item => item.status), [
  'no-route-result', 'planner-error', 'completed',
]);
assert.equal(mixed.outcomes[1].error, 'planner offline');
assert.deepEqual(mixed.remaining, []);

const none = await processReplanBatch(queue, {
  maxRequests: 0,
  planRoute: async () => { throw new Error('must not be called'); },
});
assert.equal(none.processedCount, 0);
assert.deepEqual(none.remaining, queue);

assert.equal(await processReplanBatch(queue, { maxRequests: 1 }), null);
assert.equal(await processReplanBatch(queue, { maxRequests: -1, planRoute: async () => ({}) }), null);
assert.equal(await processReplanBatch([{ entityId: 'bad' }], { planRoute: async () => ({}) }), null);

console.log('replan worker tests passed');
