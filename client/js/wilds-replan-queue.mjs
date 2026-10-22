// Bounded, deterministic queue for future navigation replan requests.
// This module owns no timers, entities, route state, or movement.
function validRequest(request) {
  return !!request &&
    typeof request.entityId === 'string' &&
    request.entityId.trim().length > 0 &&
    typeof request.reason === 'string' &&
    request.reason.trim().length > 0 &&
    Number.isFinite(request.requestedAtMs);
}

export function enqueueReplan(queue = [], request, { maxQueueLength = 128 } = {}) {
  if (!Array.isArray(queue) ||
      !Number.isInteger(maxQueueLength) || maxQueueLength < 1 ||
      queue.some(item => !validRequest(item)) ||
      !validRequest(request)) return { queue: null, accepted: false, reason: 'invalid-input' };

  if (queue.some(item => item.entityId === request.entityId)) {
    return { queue: queue.slice(), accepted: false, reason: 'duplicate-entity' };
  }
  if (queue.length >= maxQueueLength) {
    return { queue: queue.slice(), accepted: false, reason: 'queue-full' };
  }

  return {
    queue: [...queue, {
      entityId: request.entityId,
      reason: request.reason,
      requestedAtMs: request.requestedAtMs,
    }],
    accepted: true,
    reason: 'queued',
  };
}

export function drainReplanQueue(queue = [], { maxRequests = 8 } = {}) {
  if (!Array.isArray(queue) ||
      !Number.isInteger(maxRequests) || maxRequests < 0 ||
      queue.some(item => !validRequest(item))) return null;

  const count = Math.min(maxRequests, queue.length);
  return {
    requests: queue.slice(0, count).map(item => ({ ...item })),
    remaining: queue.slice(count).map(item => ({ ...item })),
  };
}
