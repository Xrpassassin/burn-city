import assert from 'node:assert/strict';
import { coordinateRouteReplan } from './wilds-replan-orchestrator.mjs';

const path = [{ x: 0, z: 0 }, { x: 4, z: 0 }];
const base = {
  entityId: 'wolf-1',
  path,
  validatedRevision: 1,
  currentRevision: 2,
  isBlocked: () => false,
  nowMs: 1000,
};

let result = coordinateRouteReplan({
  ...base,
  validatedRevision: 2,
  currentRevision: 2,
});
assert.equal(result.queued, false);
assert.equal(result.queueReason, 'not-needed');
assert.equal(result.freshness.reason, 'world-revision-unchanged');

result = coordinateRouteReplan({
  ...base,
  isBlocked: x => x >= 1.9 && x <= 2.1,
});
assert.equal(result.freshness.shouldReplan, true);
assert.equal(result.decision.shouldReplan, true);
assert.equal(result.queued, true);
assert.equal(result.queue.length, 1);
assert.equal(result.queue[0].entityId, 'wolf-1');
assert.equal(result.queue[0].reason, 'route-invalid-blocked');

result = coordinateRouteReplan({
  ...base,
  isBlocked: x => x >= 1.9 && x <= 2.1,
  lastAttemptMs: 900,
  cooldownMs: 500,
  attempts: 1,
});
assert.equal(result.queued, false);
assert.equal(result.queueReason, 'cooldown');
assert.equal(result.queue.length, 0);

const queued = [{
  entityId: 'wolf-1', reason: 'previous-block', requestedAtMs: 950,
}];
result = coordinateRouteReplan({
  ...base,
  isBlocked: x => x >= 1.9 && x <= 2.1,
  queue: queued,
});
assert.equal(result.queued, false);
assert.equal(result.queueReason, 'duplicate-entity');
assert.equal(result.queue.length, 1);
assert.equal(result.queue[0].reason, 'previous-block');

result = coordinateRouteReplan({
  ...base,
  isBlocked: x => x >= 1.9 && x <= 2.1,
  queue: [{ entityId: 'wolf-2', reason: 'blocked', requestedAtMs: 900 }],
  maxQueueLength: 1,
});
assert.equal(result.queued, false);
assert.equal(result.queueReason, 'queue-full');
assert.equal(result.queue.length, 1);

result = coordinateRouteReplan({
  ...base,
  isBlocked: x => x >= 1.9 && x <= 2.1,
  sampleSpacing: 0.001,
  maxSamples: 2,
});
assert.equal(result.queued, true);
assert.equal(result.freshness.reason, 'route-invalid-sample-limit');

assert.equal(coordinateRouteReplan({ ...base, nowMs: NaN }), null);
assert.equal(coordinateRouteReplan({ ...base, entityId: '' }), null);
assert.equal(coordinateRouteReplan({ ...base, currentRevision: null }), null);

console.log('replan orchestrator tests passed');
