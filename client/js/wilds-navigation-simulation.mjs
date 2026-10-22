// Deterministic, renderer-free simulation for the isolated navigation controller.
// Intended for tests and profiling experiments, not production game loops.
import { planNavigation } from './wilds-navigation-harness.mjs';
import { updateNavigation } from './wilds-navigation-controller.mjs';

const validPoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

export function simulateNavigation({
  start,
  goal,
  bounds,
  origin = { x: 0, z: 0 },
  cellSize = 1,
  isBlocked = () => false,
  canMoveTo = () => true,
  maxVisited = 12000,
  maxTicks = 1000,
  maxStep = 0.5,
  arrivalRadius = 0.25,
} = {}) {
  if (!validPoint(start) || !validPoint(goal) || !bounds ||
      typeof isBlocked !== 'function' || typeof canMoveTo !== 'function' ||
      !Number.isInteger(maxTicks) || maxTicks < 1 ||
      !Number.isFinite(maxStep) || maxStep <= 0) return null;

  const route = planNavigation({ start, goal, bounds, origin, cellSize, isBlocked, maxVisited });
  if (!route || !route.reached) {
    return {
      status: 'unreachable', position: { x: start.x, z: start.z }, ticks: 0,
      distanceTravelled: 0, blockedSteps: 0, routeRequests: 1,
      visited: route?.visited ?? 0, waypointCount: route?.path?.length ?? 0,
    };
  }

  let position = { x: start.x, z: start.z };
  let currentRoute = route;
  let ticks = 0;
  let distanceTravelled = 0;
  let blockedSteps = 0;
  let maxObservedStep = 0;
  let status = 'tick-limit';

  while (ticks < maxTicks) {
    const update = updateNavigation({
      position, route: currentRoute, nowMs: ticks * 50, maxStep, arrivalRadius, canMoveTo,
    });
    if (!update) return null;
    ticks++;
    if (update.blocked) {
      blockedSteps++;
      status = update.replan.shouldReplan ? 'replan-requested' : 'blocked';
      break;
    }

    const moved = Math.hypot(update.position.x - position.x, update.position.z - position.z);
    distanceTravelled += moved;
    maxObservedStep = Math.max(maxObservedStep, moved);
    position = { x: update.position.x, z: update.position.z };
    currentRoute = update.route;

    if (update.reached) {
      status = 'reached';
      break;
    }
  }

  return {
    status, position, ticks, distanceTravelled, blockedSteps, routeRequests: 1,
    visited: route.visited, waypointCount: route.path.length, maxObservedStep,
  };
}
