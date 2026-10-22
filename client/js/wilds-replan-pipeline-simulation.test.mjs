import assert from 'node:assert/strict';
import { simulateReplanPipeline } from './wilds-replan-pipeline-simulation.mjs';

const request = (entityId, requestedAtMs = 0) => ({
  entityId, reason: 'route-invalid-blocked', requestedAtMs,
});
const queue = [request('clear'), request('blocked'), request('throws'), request('pending')];
const inputCopy = structuredClone(queue);

const result = await simulateReplanPipeline({
  queue,
  maxRequests: 3,
  nowMs: 5000,
  cooldownMs: 1000,
  retryStateByEntity: { blocked: { attempts: 1, lastAttemptMs: 0 } },
  isBlocked: (x, z) => x > 2.4 && x < 2.6,
  isOutsidePlayableArea: (x, z) => x < 0 || x > 10 || z < 0 || z > 10,
  planRoute: async request => {
    if (request.entityId === 'throws') throw new Error('synthetic planner failure');
    if (request.entityId === 'clear') return {
      path: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }],
      costUnits: 4,
    };
    return { path: [{ x: 0, z: 0 }, { x: 3, z: 0 }], costUnits: 7 };
  },
});
assert.deepEqual(queue, inputCopy, 'input queue remains unchanged');
assert.deepEqual(result.outcomes.map(x => x.status), [
  'route-validated', 'route-invalid', 'planner-error',
]);
assert.equal(result.outcomes[1].validation.reason, 'blocked');
assert.equal(result.outcomes[1].retry.shouldReplan, true);
assert.equal(result.outcomes[1].nextRetryState.attempts, 2);
assert.equal(result.outcomes[2].status, 'planner-error');
assert.equal(result.outcomes[2].nextRetryState.lastAttemptMs, 5000);
assert.deepEqual(result.remaining, [request('pending')]);
assert.equal(result.metrics.requested, 3);
assert.equal(result.metrics.validatedRoutes, 1);
assert.equal(result.metrics.invalidRoutes, 1);
assert.equal(result.metrics.plannerErrors, 1);
assert.equal(result.metrics.estimatedCostUnits, 11);
assert.ok(result.metrics.validationSamples > 0);
assert.equal(result.metrics.costMetric, 'deterministic-estimated-units-not-wall-clock');

const outside = await simulateReplanPipeline({
  queue: [request('outside')], nowMs: 10,
  isBlocked: () => false,
  isOutsidePlayableArea: (x, z) => x > 1,
  planRoute: () => ({ path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] }),
});
assert.equal(outside.outcomes[0].status, 'route-invalid');
assert.equal(outside.outcomes[0].validation.reason, 'outside-playable-area');

const capped = await simulateReplanPipeline({
  queue: [request('long')], nowMs: 10, maxSamples: 1,
  isBlocked: () => false,
  planRoute: () => ({ path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] }),
});
assert.equal(capped.outcomes[0].status, 'route-invalid');
assert.equal(capped.outcomes[0].validation.reason, 'sample-limit');

const invalidCost = await simulateReplanPipeline({
  queue: [request('bad-cost')], nowMs: 10,
  isBlocked: () => false,
  planRoute: () => ({ path: [{ x: 0, z: 0 }, { x: 1, z: 0 }], costUnits: -1 }),
});
assert.equal(invalidCost.outcomes[0].status, 'invalid-cost-estimate');
assert.equal(await simulateReplanPipeline({ queue, nowMs: 0, planRoute: () => ({}), isBlocked: null }), null);

console.log('replan pipeline simulation tests passed');
