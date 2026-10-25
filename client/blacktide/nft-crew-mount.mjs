// Pure mounting contract for approved NFT crew models. No asset fetching or ownership claims.
export function mountApprovedCrew({ ship, model, avatarRuntime, position = { x: 0, y: 1.1, z: 1.2 } }) {
  if (!ship || typeof ship.add !== 'function' || !model || typeof model !== 'object' ||
      !model.position || typeof model.position.set !== 'function') {
    return { ok: false, reason: 'invalid-three-object' };
  }
  if (avatarRuntime?.ok !== true || avatarRuntime.mode !== 'blacktide' ||
      avatarRuntime.runtime?.sharedAsset !== true || !avatarRuntime.asset?.uri) {
    return { ok: false, reason: 'unapproved-avatar' };
  }
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    return { ok: false, reason: 'invalid-position' };
  }
  model.position.set(position.x, position.y, position.z);
  model.userData ??= {};
  model.userData.nftCrewIdentity = {
    collectionKey: avatarRuntime.identity.collectionKey,
    tokenId: avatarRuntime.identity.tokenId
  };
  ship.add(model);
  return { ok: true, model };
}
