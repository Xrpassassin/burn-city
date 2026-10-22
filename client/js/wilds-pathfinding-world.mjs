// World-coordinate adapter for the isolated CinderWilds grid pathfinder.
// Grid bounds are integer cells; world positions are measured in metres on X/Z.
// This adapter does not read scene objects or alter live movement.
import { findGridPath } from './wilds-pathfinding-core.mjs';

export function findWorldPath({
  start, goal, bounds, origin = { x: 0, z: 0 }, cellSize = 1,
  isBlocked = () => false, maxVisited = 12000,
} = {}) {
  if (!start || !goal || !bounds || !origin ||
      ![start.x, start.z, goal.x, goal.z, origin.x, origin.z, cellSize].every(Number.isFinite) ||
      cellSize <= 0 || typeof isBlocked !== 'function') return null;

  const toCell = p => ({
    x: Math.round((p.x - origin.x) / cellSize),
    z: Math.round((p.z - origin.z) / cellSize),
  });
  const toWorld = p => ({
    x: origin.x + p.x * cellSize,
    z: origin.z + p.z * cellSize,
  });
  const route = findGridPath({
    start: toCell(start),
    goal: toCell(goal),
    bounds,
    maxVisited,
    isBlocked: (x, z) => {
      const p = toWorld({ x, z });
      return isBlocked(p.x, p.z, x, z);
    },
  });
  if (route === null) return null;
  return {
    path: route.path.map(toWorld),
    cells: route.path,
    visited: route.visited,
    reached: route.reached,
  };
}
