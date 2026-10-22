import { validateWorldRoute } from './wilds-route-validation.mjs';

// Revalidate only when the caller's world/obstacle revision changes.
// This is a decision helper: it does not schedule or execute replans.
export function assessRouteFreshness({
  path,
  validatedRevision,
  currentRevision,
  isBlocked,
  isOutsidePlayableArea = () => false,
  sampleSpacing = 0.75,
  maxSamples = 5000,
} = {}) {
  if (!Array.isArray(path) ||
      (typeof validatedRevision !== 'string' && !Number.isFinite(validatedRevision)) ||
      (typeof currentRevision !== 'string' && !Number.isFinite(currentRevision)) ||
      typeof isBlocked !== 'function' ||
      typeof isOutsidePlayableArea !== 'function' ||
      !Number.isFinite(sampleSpacing) || sampleSpacing <= 0 ||
      !Number.isInteger(maxSamples) || maxSamples < 1) return null;

  if (validatedRevision === currentRevision) {
    return {
      stale: false,
      shouldReplan: false,
      reason: 'world-revision-unchanged',
      validatedRevision,
      currentRevision,
      validation: null,
    };
  }

  const validation = validateWorldRoute({
    path,
    isBlocked,
    isOutsidePlayableArea,
    sampleSpacing,
    maxSamples,
  });

  if (!validation) {
    return {
      stale: true,
      shouldReplan: true,
      reason: 'route-validation-invalid-input',
      validatedRevision,
      currentRevision,
      validation: null,
    };
  }

  if (!validation.valid) {
    return {
      stale: true,
      shouldReplan: true,
      reason: 'route-invalid-' + validation.reason,
      validatedRevision,
      currentRevision,
      validation,
    };
  }

  return {
    stale: false,
    shouldReplan: false,
    reason: 'route-revalidated',
    validatedRevision: currentRevision,
    currentRevision,
    validation,
  };
}
