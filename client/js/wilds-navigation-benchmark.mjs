import { performance } from 'node:perf_hooks';
import { runNavigationLoadTest } from './wilds-navigation-load-test.mjs';

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function makeSyntheticPlanner({ pathSegments = 8, costUnits = 1 } = {}) {
  return async request => {
    const path = [];
    for (let i = 0; i <= pathSegments; i++) {
      path.push({ x: i, z: (request.requestedAtMs % 3) * 0.1 });
    }
    return { path, costUnits };
  };
}

// Measures this Node process running the synthetic harness. This is not a
// benchmark of the full game, renderer, network, or authoritative terrain.
export async function benchmarkNavigationHarness({
  scenarios = [
    { name: 'light', ticks: 10, arrivalsPerTick: 8, workerBudget: 8, maxQueueLength: 256, pathSegments: 4 },
    { name: 'medium', ticks: 20, arrivalsPerTick: 24, workerBudget: 24, maxQueueLength: 512, pathSegments: 12 },
    { name: 'heavy', ticks: 20, arrivalsPerTick: 64, workerBudget: 64, maxQueueLength: 1024, pathSegments: 24 },
  ],
  warmupRuns = 1,
  measuredRuns = 5,
  sampleSpacing = 0.75,
  maxSamples = 5000,
} = {}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0 ||
      !Number.isInteger(warmupRuns) || warmupRuns < 0 ||
      !Number.isInteger(measuredRuns) || measuredRuns < 1) return null;

  const reports = [];
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario.name !== 'string' || !scenario.name.trim() ||
        !Number.isInteger(scenario.ticks) || scenario.ticks < 1 ||
        !Number.isInteger(scenario.arrivalsPerTick) || scenario.arrivalsPerTick < 0 ||
        !Number.isInteger(scenario.workerBudget) || scenario.workerBudget < 0 ||
        !Number.isInteger(scenario.maxQueueLength) || scenario.maxQueueLength < 1 ||
        !Number.isInteger(scenario.pathSegments) || scenario.pathSegments < 1) return null;

    const options = {
      ticks: scenario.ticks,
      arrivalsPerTick: scenario.arrivalsPerTick,
      workerBudget: scenario.workerBudget,
      maxQueueLength: scenario.maxQueueLength,
      planRoute: makeSyntheticPlanner({ pathSegments: scenario.pathSegments }),
      isBlocked: () => false,
      sampleSpacing,
      maxSamples,
    };

    for (let i = 0; i < warmupRuns; i++) {
      if (!await runNavigationLoadTest(options)) return null;
    }

    const durationsMs = [];
    let lastResult = null;
    for (let i = 0; i < measuredRuns; i++) {
      const start = performance.now();
      lastResult = await runNavigationLoadTest(options);
      const elapsed = performance.now() - start;
      if (!lastResult || !Number.isFinite(elapsed) || elapsed < 0) return null;
      durationsMs.push(elapsed);
    }

    const totalRoutes = lastResult.metrics.processed;
    const meanMs = durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length;
    reports.push({
      name: scenario.name,
      config: {
        ticks: scenario.ticks,
        arrivalsPerTick: scenario.arrivalsPerTick,
        workerBudget: scenario.workerBudget,
        maxQueueLength: scenario.maxQueueLength,
        pathSegments: scenario.pathSegments,
        warmupRuns,
        measuredRuns,
      },
      timingMs: {
        min: Math.min(...durationsMs),
        mean: meanMs,
        p50: percentile(durationsMs, 0.50),
        p95: percentile(durationsMs, 0.95),
        max: Math.max(...durationsMs),
      },
      throughput: {
        processedRequestsPerSecond: meanMs > 0 ? totalRoutes / (meanMs / 1000) : null,
        routesProcessedPerRun: totalRoutes,
        validationSamplesPerRun: lastResult.metrics.validationSamples,
      },
      workload: lastResult.metrics,
    });
  }

  return {
    environment: {
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    methodology: 'Node synthetic harness wall-clock timing; not full-game or production-server performance',
    reports,
  };
}
