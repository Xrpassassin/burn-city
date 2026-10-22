// Pure orchestration layer for the isolated navigation prototypes.
// It computes decisions only; callers own world queries, clocks, and entity updates.
import { advanceNavigation } from './wilds-navigation-harness.mjs';
import { getReplanDecision } from './wilds-replan-policy.mjs';

export function updateNavigation({
  position,
  route = null,
  nowMs,
  lastAttemptMs = null,
  attempts = 0,
  cooldownMs = 1000,
  maxAttempts = 3,
  resetAfterMs = 10000,
  maxStep,
  arrivalRadius = 0.25,
  maxWaypointsPerStep = 8,
  canMoveTo = () => true,
} = {}) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z) ||
      !Number.isFinite(nowMs) || typeof canMoveTo !== 'function') return null;

  const usableRoute = route && route.reached === true && Array.isArray(route.path) &&
    Number.isInteger(route.waypointIndex) && route.waypointIndex < route.path.length;

  if (!usableRoute) {
    const decision = getReplanDecision({
      routeMissing: true, nowMs, lastAttemptMs, cooldownMs, attempts, maxAttempts, resetAfterMs,
    });
    return {
      position: { x: position.x, z: position.z },
      route,
      moved: 0,
      reached: false,
      blocked: false,
      replan: decision,
    };
  }

  const step = advanceNavigation({
    position, route, maxStep, arrivalRadius, maxWaypointsPerStep, canMoveTo,
  });
  if (!step) return null;

  const replan = step.blocked ? getReplanDecision({
    blocked: true, nowMs, lastAttemptMs, cooldownMs, attempts, maxAttempts, resetAfterMs,
  }) : {
    shouldReplan: false,
    reason: step.reached ? 'route-complete' : 'route-usable',
    attempts,
    waitMs: 0,
  };

  return {
    ...step,
    route: { ...route, waypointIndex: step.waypointIndex },
    replan,
  };
}
