// Bounded, renderer-free route validator. Callbacks must be wired to authoritative world data by the caller.
const validPoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

export function validateWorldRoute({
  path,
  isBlocked,
  isOutsidePlayableArea = () => false,
  sampleSpacing = 0.75,
  maxSamples = 5000,
} = {}) {
  if (!Array.isArray(path) || path.length < 2 || !path.every(validPoint) ||
      typeof isBlocked !== 'function' || typeof isOutsidePlayableArea !== 'function' ||
      !Number.isFinite(sampleSpacing) || sampleSpacing <= 0 ||
      !Number.isInteger(maxSamples) || maxSamples < 1) return null;

  let samplesChecked = 0;
  const checkPoint = (point, segmentIndex, t) => {
    if (samplesChecked >= maxSamples) return { valid: false, reason: 'sample-limit', segmentIndex, t, samplesChecked };
    samplesChecked++;
    try {
      if (isOutsidePlayableArea(point.x, point.z)) {
        return { valid: false, reason: 'outside-playable-area', segmentIndex, t, point: { x: point.x, z: point.z }, samplesChecked };
      }
      if (isBlocked(point.x, point.z)) {
        return { valid: false, reason: 'blocked', segmentIndex, t, point: { x: point.x, z: point.z }, samplesChecked };
      }
    } catch {
      return { valid: false, reason: 'world-query-error', segmentIndex, t, point: { x: point.x, z: point.z }, samplesChecked };
    }
    return null;
  };

  const firstFailure = checkPoint(path[0], 0, 0);
  if (firstFailure) return firstFailure;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / sampleSpacing));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const failure = checkPoint({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, i, t);
      if (failure) return failure;
    }
  }

  return { valid: true, reason: 'clear-at-sampled-points', segmentCount: path.length - 1, samplesChecked };
}
