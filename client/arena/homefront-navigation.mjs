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
  const preferredOffset = Number.isFinite(options.preferredOffset) ? options.preferredOffset : 0;
  const angles = [0, ...(preferredOffset ? [preferredOffset, -preferredOffset] : []), 0.62, -0.62, 1.12, -1.12, 1.62, -1.62, 2.3, -2.3, Math.PI];
  let best = null, bestScore = -Infinity;
  for (let index = 0; index < angles.length; index++) {
    const angle = desired + angles[index], vx = Math.cos(angle), vz = Math.sin(angle);
    let score = vx * (dx / distance) + vz * (dz / distance) + (index === 0 ? 0.035 : 0);
    if (preferredOffset && (index === 1 || index === 2)) score += index === 1 ? 0.22 : 0.08;
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


// Apply movement without allowing local steering, crowd separation, or player bumping to
// tunnel a survivor through a solid structure. If a diagonal step is blocked, try each
// axis independently and take the safe step that makes the most progress.
export function safeMovePosition(position, delta, obstacles = [], actorRadius = 0.28) {
  const full = { x: position.x + delta.x, z: position.z + delta.z };
  if (!isPositionBlocked(full.x, full.z, obstacles, actorRadius)) return full;
  const xOnly = { x: position.x + delta.x, z: position.z };
  const zOnly = { x: position.x, z: position.z + delta.z };
  const safe = [xOnly, zOnly].filter(point => !isPositionBlocked(point.x, point.z, obstacles, actorRadius));
  safe.sort((a, b) => Math.hypot(position.x - b.x, position.z - b.z) - Math.hypot(position.x - a.x, position.z - a.z));
  return safe[0] || { x: position.x, z: position.z };
}

// Work animations are driven by the actual assignment, not merely by the survivor's role.
export function isWorkingTask(role, task) {
  if (task === 'take_shelter' || task === 'rest_at_refuge' || task === 'triage_standby' || task === 'stand_by_repairs') return false;
  if (role === 'guard') return task === 'perimeter_watch' || task === 'defend_perimeter';
  if (role === 'farmer') return task === 'tend_crops';
  if (role === 'mechanic') return task === 'maintain_structures' || task === 'emergency_repair';
  if (role === 'medic') return task === 'infirmary_duty';
  if (role === 'scavenger') return task === 'stockpile_supplies';
  return false;
}


// Detect stalled movement and cycle deterministic side-approaches instead of repeatedly
// selecting the same blocked heading. Call with a monotonic clock (performance.now()).
export function updateRouteRecovery(state = {}, position, target, now, options = {}) {
  const threshold = options.progressThreshold ?? 0.12;
  const stuckAfter = options.stuckAfter ?? 1400;
  const retryAfter = options.retryAfter ?? 950;
  const distance = Math.hypot(target.x - position.x, target.z - position.z);
  const targetKey = `${Math.round(target.x * 4)}/${Math.round(target.z * 4)}`;
  if (state.targetKey !== targetKey || !Number.isFinite(state.lastProgressAt)) {
    return { targetKey, bestDistance: distance, lastDistance: distance, lastX: position.x, lastZ: position.z, lastProgressAt: now, lastRetryAt: now, retries: 0, preferredOffset: 0, stuck: false, distance };
  }
  const improved = distance < (state.bestDistance ?? distance) - threshold;
  const next = { ...state, lastX: position.x, lastZ: position.z, lastDistance: distance, distance };
  if (improved) {
    next.bestDistance = distance; next.lastProgressAt = now; next.preferredOffset = 0; next.stuck = false;
  } else if (now - state.lastProgressAt >= stuckAfter && now - (state.lastRetryAt ?? 0) >= retryAfter) {
    const retries = (state.retries ?? 0) + 1, offsets = [1.12, -1.12, 1.62, -1.62, 2.3, -2.3];
    // Keep lastProgressAt: a still-stalled survivor cycles to the next approach every retryAfter ms.
    next.retries = retries; next.preferredOffset = offsets[(retries - 1) % offsets.length]; next.lastRetryAt = now; next.stuck = true;
  } else next.stuck = !!state.stuck || now - state.lastProgressAt >= stuckAfter;
  return next;
}


// Return a stable waypoint around the first blocking structure on the direct route.
// The waypoint is retained until reached, preventing left/right oscillation at walls.
export function updateRoutePlan(state = {}, position, target, obstacles = [], options = {}) {
  const actorRadius = options.actorRadius ?? 0.28;
  const targetKey = `${Math.round(target.x * 4)}/${Math.round(target.z * 4)}`;
  const obstacleKey = obstacles.filter(item => item && item.hp !== 0).map(item => `${item.id ?? item.type}:${Math.round(item.x * 4)}:${Math.round(item.z * 4)}`).sort().join('|');
  if (state.targetKey !== targetKey || state.obstacleKey !== obstacleKey) state = { targetKey, obstacleKey, detour: null, blockedId: null };
  if (state.detour && Math.hypot(position.x - state.detour.x, position.z - state.detour.z) > (options.waypointArrival ?? 0.38)) {
    return state;
  }
  state = { ...state, detour: null, blockedId: null, unreachable: false };
  const dx = target.x - position.x, dz = target.z - position.z, lengthSq = dx * dx + dz * dz;
  if (lengthSq < 0.01) return state;
  let first = null;
  for (const obstacle of obstacles) {
    if (!obstacle || obstacle.hp === 0) continue;
    const t = Math.max(0, Math.min(1, ((obstacle.x - position.x) * dx + (obstacle.z - position.z) * dz) / lengthSq));
    const px = position.x + dx * t, pz = position.z + dz * t;
    const clearance = Math.hypot(obstacle.x - px, obstacle.z - pz);
    const radius = obstacleRadius(obstacle) + actorRadius + 0.12;
    if (clearance < radius && t > 0.035 && t < 0.98 && (!first || t < first.t)) first = { obstacle, t, radius };
  }
  if (!first) return { ...state, obstacleKey };
  const obstacle = first.obstacle, length = Math.sqrt(lengthSq), ux = dx / length, uz = dz / length;
  const sideX = -uz, sideZ = ux, radius = first.radius + 0.18;
  const candidates = [
    { x: obstacle.x + ux * radius * 0.9 + sideX * radius, z: obstacle.z + uz * radius * 0.9 + sideZ * radius, side: 1 },
    { x: obstacle.x + ux * radius * 0.9 - sideX * radius, z: obstacle.z + uz * radius * 0.9 - sideZ * radius, side: -1 }
  ].filter(point => !isPositionBlocked(point.x, point.z, obstacles, actorRadius));
  candidates.sort((a, b) => {
    const costA = Math.hypot(position.x - a.x, position.z - a.z) + Math.hypot(target.x - a.x, target.z - a.z);
    const costB = Math.hypot(position.x - b.x, position.z - b.z) + Math.hypot(target.x - b.x, target.z - b.z);
    return costA - costB || b.side - a.side;
  });
  if (candidates.length) return { targetKey, obstacleKey, detour: { x: candidates[0].x, z: candidates[0].z }, blockedId: String(obstacle.id ?? obstacle.type ?? 'obstacle') };
  return { targetKey, obstacleKey, detour: null, blockedId: String(obstacle.id ?? obstacle.type ?? 'obstacle'), unreachable: true };
}


// Choose a local, presentation-only reaction to nearby player/threat stimuli.
// Hysteresis prevents awareness states flickering at their exact distance boundary.
export function updateAwarenessReaction(state = {}, context = {}, now = 0, options = {}) {
  const playerDistance = Number.isFinite(context.playerDistance) ? context.playerDistance : Infinity;
  const threatDistance = Number.isFinite(context.threatDistance) ? context.threatDistance : Infinity;
  const playerEnter = options.playerEnter ?? 3.8;
  const playerExit = options.playerExit ?? 4.6;
  const threatEnter = options.threatEnter ?? 7.5;
  const threatExit = options.threatExit ?? 9;
  let mode = 'ambient';
  if (threatDistance <= (state.mode === 'threat' ? threatExit : threatEnter)) mode = 'threat';
  else if (playerDistance <= (state.mode === 'player' ? playerExit : playerEnter)) mode = 'player';
  const targetYaw = mode === 'threat' && Number.isFinite(context.threatYaw)
    ? context.threatYaw
    : mode === 'player' && Number.isFinite(context.playerYaw)
      ? context.playerYaw
      : null;
  return {
    mode,
    targetYaw,
    changedAt: mode === state.mode ? (state.changedAt ?? now) : now,
    playerDistance,
    threatDistance,
    changed: mode !== state.mode
  };
}
