// Only load server-approved local GLBs. This is a loader boundary, not an ownership verifier.
export function approvedLocalAvatarPath(runtime) {
  if (runtime?.ok !== true || runtime.mode !== 'blacktide' || runtime.runtime?.sharedAsset !== true) return null;
  const uri = runtime.asset?.uri;
  if (typeof uri !== 'string' || !/^\/assets\/avatars\/[a-zA-Z0-9_/-]+\.glb$/.test(uri) || uri.includes('..') || uri.includes('//')) return null;
  return uri;
}
export async function loadApprovedAvatar(runtime, loader) {
  const path = approvedLocalAvatarPath(runtime);
  if (!path) return { ok: false, reason: 'unapproved-asset-path' };
  if (!loader || typeof loader.loadAsync !== 'function') return { ok: false, reason: 'invalid-loader' };
  try {
    const gltf = await loader.loadAsync(path);
    if (!gltf?.scene) return { ok: false, reason: 'missing-scene' };
    return { ok: true, model: gltf.scene, animations: Array.isArray(gltf.animations) ? gltf.animations : [] };
  } catch {
    return { ok: false, reason: 'asset-load-failed' };
  }
}
