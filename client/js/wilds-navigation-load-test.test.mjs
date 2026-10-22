import assert from 'node:assert/strict';
import { runNavigationLoadTest } from './wilds-navigation-load-test.mjs';

const routePlanner = async () => ({
  path: [{ x: 0, z: 0 }, { x: 1, z: 0 }],
  costUnits: 2,
});
const result = await runNavigationLoadTest({
  ticks: 3,
  arrivalsPerTick: 3,
  workerBudget: 2,
  maxQueueLength: 4,
  planRoute: routePlanner,
  isBlocked: () => false,
});
assert.deepEqual(result.metrics, {
  offered: 9,
  accepted: 8,
  rejectedFull: 1,
  rejectedDuplicate: 0,
  processed: 6,
  validatedRoutes: 6,
  invalidRoutes: 0,
  plannerErrors: 0,
  validationSamples: 18,
  estimatedCostUnits: 12,
  queuePeak: 4,
  queueRemaining: 2,
  maxQueueAgeTicks: 1,
  costMetric: 'deterministic-estimated-units-not-wall-clock',
});
assert.equal(result.perTick.length, 3);
assert.deepEqual(result.perTick.map(t => t.processed), [2, 2, 2]);
assert.deepEqual(result.remaining.map(x => x.entityId), ['sim-2-1', 'sim-2-2']);

const overload = await runNavigationLoadTest({
  ticks: 3,
  arrivalsPerTick: 2,
  workerBudget: 0,
  maxQueueLength: 2,
  planRoute: routePlanner,
});
assert.equal(overload.metrics.offered, 6);
assert.equal(overload.metrics.accepted, 2);
assert.equal(overload.metrics.rejectedFull, 4);
assert.equal(overload.metrics.processed, 0);
assert.equal(overload.metrics.queuePeak, 2);
assert.equal(overload.metrics.queueRemaining, 2);

const duplicates = await runNavigationLoadTest({
  ticks: 2,
  arrivalsPerTick: 3,
  workerBudget: 0,
  maxQueueLength: 5,
  entityIdFactory: () => 'same-creature',
  planRoute: routePlanner,
});
assert.equal(duplicates.metrics.accepted, 1);
assert.equal(duplicates.metrics.rejectedDuplicate, 5);
assert.equal(duplicates.metrics.rejectedFull, 0);

const invalidPath = await runNavigationLoadTest({
  ticks: 1,
  arrivalsPerTick: 1,
  workerBudget: 1,
  planRoute: async () => ({ path: [{ x: 0, z: 0 }, { x: 2, z: 0 }] }),
  isBlocked: x => x > 0.5 && x < 1.5,
});
assert.equal(invalidPath.metrics.invalidRoutes, 1);
assert.equal(invalidPath.metrics.validatedRoutes, 0);

const errors = await runNavigationLoadTest({
  ticks: 1, arrivalsPerTick: 2, workerBudget: 2,
  planRoute: async request => {
    if (request.entityId === 'sim-0-0') throw new Error('synthetic failure');
    return { path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] };
  },
});
assert.equal(errors.metrics.plannerErrors, 1);
assert.equal(errors.metrics.validatedRoutes, 1);

assert.equal(await runNavigationLoadTest({ ticks: 0, planRoute: routePlanner }), null);
assert.equal(await runNavigationLoadTest({ ticks: 1, planRoute: null }), null);

console.log('navigation load test harness tests passed');
