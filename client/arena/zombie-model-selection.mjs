// Deterministic, renderer-free selection logic: keep model detail close to the player and cheap on mobile.
export function stableZombieHash(id) {
  const value = String(id ?? '0');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectZombieModelCandidates(zombies, me, limit = 8, maxDistance = 28) {
  const px = Number.isFinite(me?.x) ? me.x : 0;
  const pz = Number.isFinite(me?.z) ? me.z : 0;
  const maxDistanceSq = maxDistance * maxDistance;
  return [...zombies]
    .map(z => ({ z, distanceSq: (z.x - px) ** 2 + (z.z - pz) ** 2 }))
    .filter(item => Number.isFinite(item.distanceSq) && item.distanceSq <= maxDistanceSq)
    .sort((a, b) => a.distanceSq - b.distanceSq || stableZombieHash(a.z.id) - stableZombieHash(b.z.id))
    .slice(0, Math.max(0, limit))
    .map(item => item.z);
}
