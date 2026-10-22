import { drainReplanQueue } from './wilds-replan-queue.mjs';

// Runs a bounded FIFO batch of caller-supplied route-planning jobs.
// It never applies movement or mutates world/entity state.
export async function processReplanBatch(queue = [], {
  maxRequests = 8,
  planRoute,
} = {}) {
  if (typeof planRoute !== 'function') return null;
  const batch = drainReplanQueue(queue, { maxRequests });
  if (!batch) return null;

  const outcomes = [];
  for (const request of batch.requests) {
    try {
      const result = await planRoute({ ...request });
      outcomes.push({
        entityId: request.entityId,
        reason: request.reason,
        status: result == null ? 'no-route-result' : 'completed',
        result: result == null ? null : result,
      });
    } catch (error) {
      outcomes.push({
        entityId: request.entityId,
        reason: request.reason,
        status: 'planner-error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    outcomes,
    remaining: batch.remaining,
    processedCount: outcomes.length,
    budget: maxRequests,
  };
}
