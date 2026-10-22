import { enqueueReplan } from './wilds-replan-queue.mjs';
import { simulateReplanPipeline } from './wilds-replan-pipeline-simulation.mjs';

// Deterministic load harness: logical ticks only; it does not use timers,
// wall-clock timing, real entities, networking, or live movement.
export async function runNavigationLoadTest({
  ticks = 20,
  arrivalsPerTick = 4,
  workerBudget = 4,
  maxQueueLength = 128,
  planRoute,
  isBlocked = () => false,
  isOutsidePlayableArea = () => false,
  sampleSpacing = 0.75,
  maxSamples = 5000,
  cooldownMs = 1000,
  maxAttempts = 3,
  resetAfterMs = 10000,
  entityIdFactory = (tick, index) => `sim-${tick}-${index}`,
} = {}) {
  if (!Number.isInteger(ticks) || ticks < 1 ||
      !Number.isInteger(arrivalsPerTick) || arrivalsPerTick < 0 ||
      !Number.isInteger(workerBudget) || workerBudget < 0 ||
      !Number.isInteger(maxQueueLength) || maxQueueLength < 1 ||
      typeof planRoute !== 'function' ||
      typeof isBlocked !== 'function' ||
      typeof isOutsidePlayableArea !== 'function' ||
      typeof entityIdFactory !== 'function') return null;

  let queue = [];
  let queuePeak = 0;
  let accepted = 0;
  let rejectedFull = 0;
  let rejectedDuplicate = 0;
  let processed = 0;
  let validatedRoutes = 0;
  let invalidRoutes = 0;
  let plannerErrors = 0;
  let validationSamples = 0;
  let estimatedCostUnits = 0;
  let maxQueueAgeTicks = 0;
  const retryStateByEntity = {};
  const perTick = [];

  for (let tick = 0; tick < ticks; tick++) {
    let tickAccepted = 0;
    let tickRejectedFull = 0;
    let tickRejectedDuplicate = 0;

    for (let i = 0; i < arrivalsPerTick; i++) {
      const entityId = entityIdFactory(tick, i);
      if (typeof entityId !== 'string' || entityId.trim().length === 0) return null;
      const result = enqueueReplan(queue, {
        entityId,
        reason: 'load-test-arrival',
        requestedAtMs: tick,
      }, { maxQueueLength });
      if (!result.queue) return null;
      queue = result.queue;
      if (result.accepted) {
        accepted++;
        tickAccepted++;
      } else if (result.reason === 'queue-full') {
        rejectedFull++;
        tickRejectedFull++;
      } else if (result.reason === 'duplicate-entity') {
        rejectedDuplicate++;
        tickRejectedDuplicate++;
      } else {
        return null;
      }
    }

    queuePeak = Math.max(queuePeak, queue.length);
    const oldest = queue.reduce((age, item) => Math.max(age, tick - item.requestedAtMs), 0);
    maxQueueAgeTicks = Math.max(maxQueueAgeTicks, oldest);

    const result = await simulateReplanPipeline({
      queue,
      maxRequests: workerBudget,
      planRoute: request => planRoute({ ...request, tick }),
      isBlocked,
      isOutsidePlayableArea,
      sampleSpacing,
      maxSamples,
      nowMs: tick,
      retryStateByEntity,
      cooldownMs,
      maxAttempts,
      resetAfterMs,
    });
    if (!result) return null;
    queue = result.remaining;
    processed += result.metrics.requested;
    validatedRoutes += result.metrics.validatedRoutes;
    invalidRoutes += result.metrics.invalidRoutes;
    plannerErrors += result.metrics.plannerErrors;
    validationSamples += result.metrics.validationSamples;
    estimatedCostUnits += result.metrics.estimatedCostUnits;

    for (const outcome of result.outcomes) {
      if (outcome.nextRetryState) retryStateByEntity[outcome.entityId] = outcome.nextRetryState;
    }

    perTick.push({
      tick,
      arrivals: arrivalsPerTick,
      accepted: tickAccepted,
      rejectedFull: tickRejectedFull,
      rejectedDuplicate: tickRejectedDuplicate,
      processed: result.metrics.requested,
      queueDepth: queue.length,
      queueAgeTicks: oldest,
      validatedRoutes: result.metrics.validatedRoutes,
      invalidRoutes: result.metrics.invalidRoutes,
      plannerErrors: result.metrics.plannerErrors,
      validationSamples: result.metrics.validationSamples,
      estimatedCostUnits: result.metrics.estimatedCostUnits,
    });
  }

  const finalOldestAge = queue.reduce((age, item) => Math.max(age, ticks - 1 - item.requestedAtMs), 0);
  maxQueueAgeTicks = Math.max(maxQueueAgeTicks, finalOldestAge);
  return {
    config: { ticks, arrivalsPerTick, workerBudget, maxQueueLength },
    metrics: {
      offered: ticks * arrivalsPerTick,
      accepted,
      rejectedFull,
      rejectedDuplicate,
      processed,
      validatedRoutes,
      invalidRoutes,
      plannerErrors,
      validationSamples,
      estimatedCostUnits,
      queuePeak,
      queueRemaining: queue.length,
      maxQueueAgeTicks,
      costMetric: 'deterministic-estimated-units-not-wall-clock',
    },
    remaining: queue,
    perTick,
  };
}
