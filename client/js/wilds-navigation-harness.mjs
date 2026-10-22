// Test-only orchestration for path planning and bounded waypoint following.
// No scene objects, live NPCs, or player movement are touched.
import { findWorldPath } from './wilds-pathfinding-world.mjs';
import { stepWaypointPath } from './wilds-waypoint-follower.mjs';

const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

export function planNavigation({
  start,
  goal,
  bounds,
  origin = { x: 0, z: 0 },
  cellSize = 1,
  isBlocked = () => false,
  simplifyPath = path => path.map(p => ({ x: p.x, z: p.z })),
  maxVisited = 12000,
  maxWaypoints = 12000,
} = {}) {
  if (!finitePoint(start) || !finitePoint(goal) || !bounds ||
      typeof isBlocked !== 'function' || typeof simplifyPath !== 'function' ||
      !Number.isInteger(maxWaypoints) || maxWaypoints < 1) return null;

  const planned = findWorldPath({
    start, goal, bounds, origin, cellSize, isBlocked, maxVisited,
  });
  if (!planned || !planned.reached || !Array.isArray(planned.path) ||
      planned.path.length === 0 || planned.path.length > maxWaypoints) {
    return {
      reached: false,
      reason: !planned ? 'no-route' : !planned.reached ? 'goal-unreachable' : 'route-limit',
      visited: planned?.visited ?? 0,
      path: [],
      waypointIndex: 0,
    };
  }

  const path = simplifyPath(planned.path);
  if (!Array.isArray(path) || path.length === 0 || path.length > maxWaypoints ||
      !path.every(finitePoint)) return null;

  // Keep the original planned route metadata for debugging; simplified points drive movement.
  return {
    reached: true,
    reason: null,
    visited: planned.visited,
    cells: planned.cells,
    path,
    waypointIndex: 0,
  };
}

export function advanceNavigation({
  position,
  route,
  maxStep,
  arrivalRadius = 0.25,
  maxWaypointsPerStep = 8,
  canMoveTo = () => true,
} = {}) {
  if (!finitePoint(position) || !route || route.reached !== true ||
      !Array.isArray(route.path) || !Number.isInteger(route.waypointIndex) ||
      typeof canMoveTo !== 'function') return null;

  const step = stepWaypointPath({
    position,
    path: route.path,
    waypointIndex: route.waypointIndex,
    maxStep,
    arrivalRadius,
    maxWaypointsPerStep,
  });
  if (!step) return null;

  // This controller never applies movement itself. The caller must supply the real
  // collision/terrain gate and apply the returned position through existing game systems.
  if (!canMoveTo(step.position.x, step.position.z, position)) {
    return {
      position: { x: position.x, z: position.z },
      waypointIndex: route.waypointIndex,
      reached: false,
      blocked: true,
      moved: 0,
      remainingDistance: Math.hypot(step.position.x - position.x, step.position.z - position.z),
    };
  }

  return { ...step, blocked: false };
}
