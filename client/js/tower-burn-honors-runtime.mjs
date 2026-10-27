import { towerHonorPositions } from './tower-burn-honors-layout.mjs';
// Scene adapter: only consumes server-approved honorees and existing NFT avatar factory.
// No GLB URLs or client-provided ownership claims. Call refresh after authorization changes.
export function createTowerHonorsRuntime({ scene, tower, createAvatar, isWalkable, heightAt, maxDisplays = 10 }) {
  if (!scene || typeof scene.add !== 'function' || typeof scene.remove !== 'function' ||
      typeof createAvatar !== 'function' || typeof isWalkable !== 'function' ||
      typeof heightAt !== 'function') throw Error('scene, avatar factory and terrain callbacks required');
  const active = [];
  function clear() {
    for (const { object, dispose } of active) {
      scene.remove(object);
      if (typeof dispose === 'function') dispose();
    }
    active.length = 0;
  }
  function refresh(payload) {
    // Fail closed while the ledger or server ownership verification is unavailable.
    clear();
    if (!payload || payload.status !== 'verified' || !Array.isArray(payload.honorees)) return 0;
    const spots = towerHonorPositions(payload.honorees, tower, { max: maxDisplays });
    for (const spot of spots) {
      const { x, z } = spot.position;
      if (!isWalkable(x, z, spot)) continue;
      const y = heightAt(x, z);
      if (!Number.isFinite(y)) continue;
      const character = createAvatar({
        nftId: spot.nftId, collectionKey: spot.collectionKey,
        wallet: spot.wallet, rank: spot.rank, lite: true
      });
      if (!character || !character.object || !character.object.position ||
          typeof character.object.position.set !== 'function') continue;
      character.object.position.set(x, y, z);
      if (character.object.rotation) character.object.rotation.y = spot.yaw;
      character.object.userData = {
        ...(character.object.userData || {}),
        kind: 'tower-honoree', rank: spot.rank, wallet: spot.wallet
      };
      scene.add(character.object);
      active.push(character);
    }
    return active.length;
  }
  return { refresh, clear, count: () => active.length };
}
