// Isolated line-of-sight path simplifier for world-space X/Z waypoint routes.
// It only removes redundant points; it never changes endpoints or queries scene objects.
const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

function segmentIsClear(a, b, isBlocked, sampleSpacing, maxSamples) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  const samples = Math.max(1, Math.ceil(distance / sampleSpacing));
  if (samples > maxSamples) return false;
  // Exclude endpoints: pathfinder already validated route cells and callers may allow
  // an entity to stand inside the tolerance radius of its own start/goal cell.
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    if (isBlocked(a.x + dx * t, a.z + dz * t)) return false;
  }
  return true;
}

export function simplifyWorldPath({
  path,
  isBlocked = () => false,
  sampleSpacing = 0.5,
  maxSamplesPerSegment = 4096,
} = {}) {
  if (!Array.isArray(path) || path.length === 0 ||
      typeof isBlocked !== 'function' ||
      !Number.isFinite(sampleSpacing) || sampleSpacing <= 0 ||
      !Number.isInteger(maxSamplesPerSegment) || maxSamplesPerSegment < 1 ||
      !path.every(finitePoint)) return null;
  if (path.length <= 2) return path.map(p => ({ x: p.x, z: p.z }));

  const simplified = [{ x: path[0].x, z: path[0].z }];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let next = path.length - 1;
    while (next > anchor + 1 &&
      !segmentIsClear(path[anchor], path[next], isBlocked, sampleSpacing, maxSamplesPerSegment)) {
      next--;
    }
    // Adjacent original points are retained even if a caller's blocker callback would
    // reject the segment; this keeps the helper a simplifier, not a route validator.
    simplified.push({ x: path[next].x, z: path[next].z });
    anchor = next;
  }
  return simplified;
}
