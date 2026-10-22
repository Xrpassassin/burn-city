// Local NPC cannon telegraph/fire state machine for the Blacktide prototype.
// Returned shots are client simulation only. Never use these results for authoritative PvP.
export const NPC_CANNON = Object.freeze({
  range: 52,
  windupSeconds: 0.85,
  reloadSeconds: 3.1,
  projectileSpeed: 32,
  damage: 12
});

const finite = value => Number.isFinite(value);

export function updateNpcCannons(fleet, player, dt) {
  const step = finite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  if (!player || !finite(player.x) || !finite(player.z)) return [];
  const shots = [];

  for (const vessel of fleet || []) {
    if (!vessel?.alive || vessel.kind !== 'patrol' || vessel.aiState !== 'engage') continue;
    const dx = player.x - vessel.group.position.x;
    const dz = player.z - vessel.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (!finite(distance) || distance > NPC_CANNON.range) {
      vessel.cannonWindup = 0;
      vessel.cannonReload = Math.max(0, vessel.cannonReload || 0);
      continue;
    }

    vessel.cannonReload = Math.max(0, (vessel.cannonReload || 0) - step);
    vessel.cannonWindup = Math.max(0, (vessel.cannonWindup || 0) - step);
    if (vessel.cannonWindup > 0) continue;

    if (vessel.cannonReady) {
      const length = distance || 1;
      shots.push({
        sourceId: vessel.id,
        x: vessel.group.position.x,
        z: vessel.group.position.z,
        vx: dx / length * NPC_CANNON.projectileSpeed,
        vz: dz / length * NPC_CANNON.projectileSpeed,
        damage: NPC_CANNON.damage,
        life: 2.0
      });
      vessel.cannonReady = false;
      vessel.cannonReload = NPC_CANNON.reloadSeconds;
      continue;
    }

    if (vessel.cannonReload <= 0) {
      vessel.cannonWindup = NPC_CANNON.windupSeconds;
      vessel.cannonReady = true;
    }
  }
  return shots;
}

export function stepNpcProjectile(projectile, dt) {
  const step = finite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  projectile.x += projectile.vx * step;
  projectile.z += projectile.vz * step;
  projectile.life -= step;
  return projectile.life > 0;
}

export function projectileHitsPlayer(projectile, player, radius = 3.2) {
  if (!projectile || !player || ![projectile.x, projectile.z, player.x, player.z, radius].every(finite)) return false;
  const dx = projectile.x - player.x;
  const dz = projectile.z - player.z;
  return dx * dx + dz * dz <= radius * radius;
}
