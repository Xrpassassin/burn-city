// Pure retry/cooldown policy for future navigation callers.
// It makes decisions only; it owns no timers, entities, or world state.
export function getReplanDecision({
  blocked = false,
  routeMissing = false,
  nowMs,
  lastAttemptMs = null,
  cooldownMs = 1000,
  attempts = 0,
  maxAttempts = 3,
  resetAfterMs = 10000,
} = {}) {
  if (!Number.isFinite(nowMs) ||
      (lastAttemptMs !== null && !Number.isFinite(lastAttemptMs)) ||
      !Number.isFinite(cooldownMs) || cooldownMs < 0 ||
      !Number.isInteger(attempts) || attempts < 0 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 ||
      !Number.isFinite(resetAfterMs) || resetAfterMs < 0 ||
      typeof blocked !== 'boolean' || typeof routeMissing !== 'boolean') return null;

  const shouldRequest = blocked || routeMissing;
  if (!shouldRequest) {
    const reset = lastAttemptMs !== null && nowMs - lastAttemptMs >= resetAfterMs;
    return { shouldReplan: false, reason: 'route-usable', attempts: reset ? 0 : attempts, waitMs: 0 };
  }

  const priorWindowExpired = lastAttemptMs !== null && nowMs - lastAttemptMs >= resetAfterMs;
  if (attempts >= maxAttempts && !priorWindowExpired) {
    return { shouldReplan: false, reason: 'attempt-limit', attempts, waitMs: 0 };
  }

  if (lastAttemptMs !== null && !priorWindowExpired) {
    const elapsed = Math.max(0, nowMs - lastAttemptMs);
    if (elapsed < cooldownMs) {
      return { shouldReplan: false, reason: 'cooldown', attempts, waitMs: cooldownMs - elapsed };
    }
  }

  return {
    shouldReplan: true,
    reason: priorWindowExpired ? 'retry-window-reset' : blocked ? 'blocked' : 'route-missing',
    attempts: priorWindowExpired ? 0 : attempts,
    waitMs: 0,
  };
}
