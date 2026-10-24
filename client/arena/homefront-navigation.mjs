// Lightweight Reynolds-style steering helpers for Homefront's local refuge actors.
// Kept dependency-free so the client can use the same predictable math on mobile and desktop.
export function obstacleRadius(obstacle) {
  const radii = { wall: 0.82, gate: 0.78, entrance: 0.78, exit: 0.78, watchtower: 0.78, sandbags: 0.62, barbed_wire: 0.58, trench: 0.58, turret: 0.68, workshop: 0.82, storage: 0.78, infirmary: 0.82, garden: 0.58, quarry: 0.82, smelter: 0.78, salvage_yard: 0.82, gun_platform: 1.05, mortar_pit: 0.72 };
  return Number.isFinite(obstacle?.radius) ? obstacle.radius : (radii[obstacle?.type] ?? 0.72);
}

export function isPositionBlocked(x, z, obstacles = [], actorRadius = 0.28) {
  for (const obstacle of obstacles) {
    if (!obstacle || obstacle.hp === 0) continue;
    const radius = obstacleRadius(obstacle) + actorRadius;
    if (Math.hypot(x - obstacle.x, z - obstacle.z) < radius) return true;
  }
  return false;
}

// Seek + short-horizon obstacle avoidance. Candidate headings are scored by progress,
// clearance, and stable tie-breaking; targets immediately beside a work station remain reachable.
export function steeringDirection(position, target, obstacles = [], neighbors = [], options = {}) {
  const dx = target.x - position.x, dz = target.z - position.z, distance = Math.hypot(dx, dz);
  if (distance < (options.arrivalRadius ?? 0.12)) return { x: 0, z: 0, arrived: true };
  const desired = Math.atan2(dz, dx), lookAhead = options.lookAhead ?? 1.05;
  const angles = [0, 0.62, -0.62, 1.12, -1.12, 1.62, -1.62, 2.3, -2.3, Math.PI];
  let best = null, bestScore = -Infinity;
  for (let index = 0; index < angles.length; index++) {
    const angle = desired + angles[index], vx = Math.cos(angle), vz = Math.sin(angle);
    let score = vx * (dx / distance) + vz * (dz / distance) + (index === 0 ? 0.035 : 0);
    for (const fraction of [0.45, 0.9, 1.35]) {
      const px = position.x + vx * Math.min(lookAhead, fraction), pz = position.z + vz * Math.min(lookAhead, fraction);
      for (const obstacle of obstacles) {
        if (!obstacle || obstacle.hp === 0) continue;
        const radius = obstacleRadius(obstacle) + (options.actorRadius ?? 0.28);
        const toTarget = Math.hypot(target.x - obstacle.x, target.z - obstacle.z);
        const sampleToTarget = Math.hypot(target.x - px, target.z - pz);
        if (toTarget < radius + 0.7 && sampleToTarget < 0.62) continue;
        const clearance = Math.hypot(px - obstacle.x, pz - obstacle.z) - radius;
        if (clearance < 0) score -= 3.5 + Math.min(3, -clearance * 2);
        else if (clearance < 0.38) score -= (0.38 - clearance) * 2.2;
      }
    }
    const endX = position.x + vx * Math.min(lookAhead, distance), endZ = position.z + vz * Math.min(lookAhead, distance);
    for (const neighbor of neighbors) {
      if (!neighbor || neighbor === position) continue;
      const gap = Math.hypot(endX - neighbor.x, endZ - neighbor.z), safe = options.neighborRadius ?? 0.68;
      if (gap < safe) score -= 1.7 + (safe - gap) * 2.4;
    }
    if (score > bestScore) { bestScore = score; best = { x: vx, z: vz, arrived: false }; }
  }
  return best || { x: dx / distance, z: dz / distance, arrived: false };
}

// Reynolds-style separation: a bounded repulsion vector that avoids survivor clumping.
export function separationVector(position, neighbors = [], minDistance = 0.68) {
  let x = 0, z = 0;
  for (const neighbor of neighbors) {
    if (!neighbor || neighbor === position) continue;
    const dx = position.x - neighbor.x, dz = position.z - neighbor.z, d = Math.hypot(dx, dz);
    if (d < 1e-4 || d >= minDistance) continue;
    const weight = (minDistance - d) / minDistance / d;
    x += dx * weight; z += dz * weight;
  }
  const magnitude = Math.hypot(x, z);
  if (magnitude > 1) { x /= magnitude; z /= magnitude; }
  return { x, z };
}
