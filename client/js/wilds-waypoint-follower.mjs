// Pure, renderer-independent waypoint stepping for the CinderWilds navigation prototype.
// This module computes bounded X/Z movement only; callers own animation, collision,
// terrain height, and deciding when to request another path.
const finite = value => Number.isFinite(value);

export function stepWaypointPath({
  position,
  path,
  waypointIndex = 0,
  maxStep,
  arrivalRadius = 0.25,
  maxWaypointsPerStep = 8,
} = {}) {
  if (!position || !finite(position.x) || !finite(position.z)) return null;
  if (!Array.isArray(path) || path.length === 0) return null;
  if (!Number.isInteger(waypointIndex) || waypointIndex < 0 || waypointIndex > path.length) return null;
  if (!finite(maxStep) || maxStep < 0) return null;
  if (!finite(arrivalRadius) || arrivalRadius < 0) return null;
  if (!Number.isInteger(maxWaypointsPerStep) || maxWaypointsPerStep < 1) return null;

  let x = position.x;
  let z = position.z;
  let index = waypointIndex;
  let consumed = 0;

  // Skip already-reached/duplicate points, but cap work per call for predictable cost.
  while (index < path.length && consumed < maxWaypointsPerStep) {
    const target = path[index];
    if (!target || !finite(target.x) || !finite(target.z)) return null;
    const dx = target.x - x;
    const dz = target.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance > arrivalRadius) break;
    x = target.x;
    z = target.z;
    index++;
    consumed++;
  }

  if (index >= path.length) {
    return {
      position: { x, z },
      waypointIndex: index,
      reached: true,
      moved: Math.hypot(x - position.x, z - position.z),
      remainingDistance: 0,
    };
  }

  const target = path[index];
  const dx = target.x - x;
  const dz = target.z - z;
  const distance = Math.hypot(dx, dz);
  const step = Math.min(maxStep, distance);
  if (distance > 0 && step > 0) {
    x += (dx / distance) * step;
    z += (dz / distance) * step;
  }

  const after = Math.hypot(target.x - x, target.z - z);
  if (after <= arrivalRadius) {
    x = target.x;
    z = target.z;
    index++;
  }

  return {
    position: { x, z },
    waypointIndex: index,
    reached: index >= path.length,
    moved: Math.hypot(x - position.x, z - position.z),
    remainingDistance: index >= path.length ? 0 : Math.hypot(path[index].x - x, path[index].z - z),
  };
}
