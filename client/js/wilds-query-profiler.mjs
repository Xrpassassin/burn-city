// Bounded profiling wrapper for caller-supplied world-query callbacks. No game state or timers are retained.
export function profileWorldQueries({
  points,
  isOutsidePlayableArea,
  isBlocked,
  maxPoints = 5000,
  now = () => performance.now(),
} = {}) {
  if (!Array.isArray(points) || !Number.isInteger(maxPoints) || maxPoints < 1 ||
      typeof isOutsidePlayableArea !== 'function' || typeof isBlocked !== 'function' ||
      typeof now !== 'function' || points.length > maxPoints) return null;
  if (!points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.z))) return null;

  let outsideCount = 0, blockedCount = 0, queryErrors = 0;
  const started = now();
  if (!Number.isFinite(started)) return null;
  for (const p of points) {
    try { if (isOutsidePlayableArea(p.x, p.z)) outsideCount++; } catch { queryErrors++; }
    try { if (isBlocked(p.x, p.z)) blockedCount++; } catch { queryErrors++; }
  }
  const ended = now();
  if (!Number.isFinite(ended) || ended < started) return null;
  const elapsedMs = ended - started;
  return {
    sampleCount: points.length,
    outsideCount,
    blockedCount,
    queryErrors,
    elapsedMs,
    averageMsPerPoint: points.length ? elapsedMs / points.length : 0,
    pointsPerSecond: elapsedMs > 0 ? points.length * 1000 / elapsedMs : null,
    maxPoints,
    scope: 'caller-supplied world-query callbacks; diagnostic only',
  };
}
