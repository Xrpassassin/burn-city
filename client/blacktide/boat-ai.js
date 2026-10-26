// Blacktide local NPC encounter behavior.
// This is presentation/gameplay prototyping only: never use client state to award loot,
// apply authoritative damage, or validate multiplayer combat.

const DISTANCE = {
  patrolNotice: 58,
  patrolDisengage: 76,
  engageEnter: 34,
  engageLeave: 68,
  merchantEvade: 30,
  merchantResume: 44
};

const clampDt = dt => Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;

export function updateBoatBehavior(boat, player, dt) {
  const step = clampDt(dt);
  const x = Number(boat?.group?.position?.x);
  const z = Number(boat?.group?.position?.z);
  const px = Number(player?.x);
  const pz = Number(player?.z);
  if (![x, z, px, pz].every(Number.isFinite) || !boat) {
    return { mode: 'route', state: 'patrol', moveX: 0, moveZ: 0, speedScale: 1 };
  }

  const dx = px - x;
  const dz = pz - z;
  const distance = Math.hypot(dx, dz);
  const patrol = boat.kind === 'patrol';
  // Keep orbit direction stable per vessel so nearby NPCs do not all turn identically.
  const orbitSign = boat.orbitSign === -1 ? -1 : 1;
  let state = boat.aiState || 'patrol';

  if (patrol) {
    if (state === 'patrol' && distance <= DISTANCE.patrolNotice) state = 'alert';
    if (state === 'alert' && distance <= DISTANCE.engageEnter) state = 'engage';
    if (state === 'alert' && distance >= DISTANCE.patrolDisengage) state = 'patrol';
    if (state === 'engage' && distance >= DISTANCE.engageLeave) state = 'patrol';
  } else {
    if (state !== 'evade' && distance <= DISTANCE.merchantEvade) state = 'evade';
    if (state === 'evade' && distance >= DISTANCE.merchantResume) state = 'patrol';
  }
  boat.aiState = state;

  if (state === 'patrol') {
    return { mode: 'route', state, moveX: 0, moveZ: 0, speedScale: 1 };
  }

  if (!step || distance < 0.001) {
    return { mode: state === 'evade' ? 'evade' : 'approach', state, moveX: 0, moveZ: 0, speedScale: 1 };
  }

  const nx = dx / distance;
  const nz = dz / distance;
  if (state === 'evade') {
    return { mode: 'evade', state, moveX: -nx, moveZ: -nz, speedScale: 1.35 };
  }
  if (state === 'alert') {
    return { mode: 'approach', state, moveX: nx, moveZ: nz, speedScale: 0.9 };
  }

  // Patrol vessels circle at broadside range instead of ramming the player.
  const radial = distance > 31 ? 0.7 : distance < 19 ? -0.7 : 0;
  const tangent = 0.72 * orbitSign;
  let moveX = nx * radial - nz * tangent;
  let moveZ = nz * radial + nx * tangent;
  const length = Math.hypot(moveX, moveZ) || 1;
  moveX /= length;
  moveZ /= length;
  return { mode: 'engage', state, moveX, moveZ, speedScale: 0.85 };
}

export const BOAT_AI_THRESHOLDS = Object.freeze({ ...DISTANCE });
