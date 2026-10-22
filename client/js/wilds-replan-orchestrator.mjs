import { assessRouteFreshness } from './wilds-route-invalidation.mjs';
import { getReplanDecision } from './wilds-replan-policy.mjs';
import { enqueueReplan } from './wilds-replan-queue.mjs';

// Pure coordinator: freshness -> retry policy -> bounded queue.
// It never executes pathfinding or applies entity movement.
export function coordinateRouteReplan({
  entityId,
  path,
  validatedRevision,
  currentRevision,
  isBlocked,
  isOutsidePlayableArea = () => false,
  sampleSpacing = 0.75,
  maxSamples = 5000,
  queue = [],
  maxQueueLength = 128,
  nowMs,
  lastAttemptMs = null,
  attempts = 0,
  cooldownMs = 1000,
  maxAttempts = 3,
  resetAfterMs = 10000,
} = {}) {
  if (typeof entityId !== 'string' || entityId.trim().length === 0 ||
      !Array.isArray(queue) || !Number.isFinite(nowMs)) return null;

  const freshness = assessRouteFreshness({
    path, validatedRevision, currentRevision, isBlocked,
    isOutsidePlayableArea, sampleSpacing, maxSamples,
  });
  if (!freshness) return null;

  if (!freshness.shouldReplan) {
    return {
      freshness,
      decision: { shouldReplan: false, reason: freshness.reason, attempts, waitMs: 0 },
      queue: queue.map(item => ({ ...item })),
      queued: false,
      queueReason: 'not-needed',
      validatedRevision: freshness.validatedRevision,
    };
  }

  const decision = getReplanDecision({
    blocked: true,
    nowMs,
    lastAttemptMs,
    cooldownMs,
    attempts,
    maxAttempts,
    resetAfterMs,
  });
  if (!decision) return null;

  if (!decision.shouldReplan) {
    return {
      freshness,
      decision,
      queue: queue.map(item => ({ ...item })),
      queued: false,
      queueReason: decision.reason,
      validatedRevision,
    };
  }

  const enqueued = enqueueReplan(queue, {
    entityId,
    reason: freshness.reason,
    requestedAtMs: nowMs,
  }, { maxQueueLength });

  if (!enqueued.queue) return null;
  return {
    freshness,
    decision,
    queue: enqueued.queue,
    queued: enqueued.accepted,
    queueReason: enqueued.reason,
    validatedRevision,
  };
}
