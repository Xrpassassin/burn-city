// Isolated adapter for the MIT three-pathfinding library.
// The caller must supply an initialized Pathfinding instance and a generated zone.
// This module intentionally does not import the library or alter live creature movement.
export function findNavmeshRoute({
  pathfinding,
  Vector3,
  zoneId = 'cinderwilds',
  start,
  goal,
  maxWaypoints = 512,
} = {}) {
  const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
  if (!pathfinding || typeof pathfinding.getGroup !== 'function' ||
      typeof pathfinding.findPath !== 'function' || typeof Vector3 !== 'function' ||
      typeof zoneId !== 'string' || !zoneId || !validPoint(start) || !validPoint(goal) ||
      !Number.isInteger(maxWaypoints) || maxWaypoints < 1) {
    return { ok: false, reason: 'invalid-input', path: [] };
  }

  try {
    const from = new Vector3(start.x, start.y, start.z);
    const to = new Vector3(goal.x, goal.y, goal.z);
    const startGroup = pathfinding.getGroup(zoneId, from);
    const goalGroup = pathfinding.getGroup(zoneId, to);
    if (!Number.isInteger(startGroup) || !Number.isInteger(goalGroup)) {
      return { ok: false, reason: 'outside-navmesh', path: [] };
    }
    if (startGroup !== goalGroup) {
      return { ok: false, reason: 'different-navmesh-groups', path: [], startGroup, goalGroup };
    }

    const raw = pathfinding.findPath(from, to, zoneId, startGroup);
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, reason: 'no-route', path: [], startGroup };
    }
    if (raw.length > maxWaypoints || !raw.every(validPoint)) {
      return { ok: false, reason: 'invalid-or-unbounded-route', path: [], startGroup };
    }
    return {
      ok: true,
      reason: null,
      path: raw.map(p => ({ x: p.x, y: p.y, z: p.z })),
      startGroup,
      goalGroup,
      waypointCount: raw.length,
    };
  } catch {
    // Navmesh build/runtime errors must not leak into game-loop callers.
    return { ok: false, reason: 'pathfinding-error', path: [] };
  }
}
