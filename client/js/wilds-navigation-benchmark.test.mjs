import assert from 'node:assert/strict';
import { benchmarkNavigationHarness } from './wilds-navigation-benchmark.mjs';

const report = await benchmarkNavigationHarness({
  scenarios: [{
    name: 'test-small',
    ticks: 2,
    arrivalsPerTick: 2,
    workerBudget: 2,
    maxQueueLength: 8,
    pathSegments: 2,
  }],
  warmupRuns: 0,
  measuredRuns: 2,
  sampleSpacing: 0.5,
  maxSamples: 100,
});
assert.equal(report.reports.length, 1);
const scenario = report.reports[0];
assert.equal(scenario.name, 'test-small');
assert.equal(scenario.workload.processed, 4);
assert.equal(scenario.throughput.routesProcessedPerRun, 4);
assert.ok(scenario.timingMs.min >= 0);
assert.ok(scenario.timingMs.mean >= 0);
assert.ok(scenario.timingMs.p50 >= 0);
assert.ok(scenario.timingMs.p95 >= 0);
assert.ok(scenario.timingMs.max >= scenario.timingMs.min);
assert.ok(Number.isFinite(scenario.throughput.processedRequestsPerSecond));
assert.equal(report.environment.runtime, process.version);
assert.match(report.methodology, /not full-game/);

assert.equal(await benchmarkNavigationHarness({ measuredRuns: 0 }), null);
assert.equal(await benchmarkNavigationHarness({ scenarios: [] }), null);
assert.equal(await benchmarkNavigationHarness({
  scenarios: [{ name: 'bad', ticks: 1, arrivalsPerTick: 1, workerBudget: -1, maxQueueLength: 2, pathSegments: 1 }],
}), null);

console.log('navigation benchmark tests passed');
