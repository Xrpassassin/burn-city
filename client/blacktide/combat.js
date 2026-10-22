// Blacktide prototype cannon combat.
// Client-side hits are for local feel/testing only. Production PvP damage, rewards,
// cooldowns and target validation must be independently simulated on the server.

export const CANNON_DAMAGE = 35;

export function findProjectileTarget(projectile, fleet) {
  for (const vessel of fleet) {
    if (!vessel.alive) continue;
    const dx = projectile.position.x - vessel.group.position.x;
    const dz = projectile.position.z - vessel.group.position.z;
    const radius = vessel.radius + 0.55;
    if (dx * dx + dz * dz <= radius * radius) return vessel;
  }
  return null;
}

export function applyCannonDamage(vessel) {
  if (!vessel || !vessel.alive) return { hit: false, sunk: false };
  vessel.health = Math.max(0, vessel.health - CANNON_DAMAGE);
  if (vessel.health === 0) {
    vessel.alive = false;
    return { hit: true, sunk: true, remaining: 0 };
  }
  return { hit: true, sunk: false, remaining: vessel.health };
}
