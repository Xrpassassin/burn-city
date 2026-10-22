import assert from 'node:assert/strict';
import { getReplanDecision } from './wilds-replan-policy.mjs';

assert.deepEqual(getReplanDecision({ blocked: false, routeMissing: false, nowMs: 100 }), {
  shouldReplan: false, reason: 'route-usable', attempts: 0, waitMs: 0,
});

assert.deepEqual(getReplanDecision({ blocked: true, nowMs: 1000, lastAttemptMs: null, attempts: 0 }), {
  shouldReplan: true, reason: 'blocked', attempts: 0, waitMs: 0,
});

assert.deepEqual(getReplanDecision({
  routeMissing: true, nowMs: 1500, lastAttemptMs: 1000, cooldownMs: 1000, attempts: 1,
}), {
  shouldReplan: false, reason: 'cooldown', attempts: 1, waitMs: 500,
});

assert.deepEqual(getReplanDecision({
  blocked: true, nowMs: 2500, lastAttemptMs: 1000, cooldownMs: 1000, attempts: 3, maxAttempts: 3,
}), {
  shouldReplan: false, reason: 'attempt-limit', attempts: 3, waitMs: 0,
});

assert.deepEqual(getReplanDecision({
  blocked: true, nowMs: 12000, lastAttemptMs: 1000, cooldownMs: 1000,
  attempts: 3, maxAttempts: 3, resetAfterMs: 10000,
}), {
  shouldReplan: true, reason: 'retry-window-reset', attempts: 0, waitMs: 0,
});

assert.equal(getReplanDecision({ blocked: true, nowMs: NaN }), null);
assert.equal(getReplanDecision({ blocked: true, nowMs: 0, cooldownMs: -1 }), null);

console.log('replan policy tests passed');
