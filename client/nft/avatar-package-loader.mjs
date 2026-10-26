// Engine-neutral NFT avatar package resolver.
// The caller supplies its existing GLTFLoader-compatible load(url) function.
// No automatic scene insertion, ownership claims, or NFT trait reconstruction.
const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const SAFE_PATH = /^[a-zA-Z0-9_./-]+$/;
function assetPath(value) {
  if (typeof value !== 'string' || !SAFE_PATH.test(value) ||
      value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('Invalid avatar asset path');
  }
  return value;
}
export function validateAvatarManifest(manifest, collectionKey) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.collectionKey !== collectionKey ||
      manifest.runtimeApproved !== true || !Array.isArray(manifest.assets)) {
    throw new Error('Avatar package is not runtime-approved');
  }
  const paths = new Set();
  for (const asset of manifest.assets) {
    const path = assetPath(asset?.path);
    if (paths.has(path) || !['model','skeleton','animation','thumbnail','metadata'].includes(asset.role) ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 ||
        typeof asset.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(asset.sha256)) {
      throw new Error('Invalid or duplicate avatar package asset');
    }
    paths.add(path);
  }
  const models = manifest.assets.filter(a => a.role === 'model');
  if (models.length !== 1) throw new Error('Expected exactly one avatar model');
  return models[0];
}
export function createAvatarPackageLoader({ loadGLB, loadManifest, cloneAvatar } = {}) {
  if (typeof loadGLB !== 'function' || typeof loadManifest !== 'function' ||
      typeof cloneAvatar !== 'function') {
    throw new TypeError('loadGLB, loadManifest and cloneAvatar functions required');
  }
  const cache = new Map();
  async function load(collectionKey, version) {
    if (!SAFE_KEY.test(collectionKey) || !SAFE_KEY.test(version)) {
      throw new Error('Invalid collection or version');
    }
    const key = collectionKey + '/' + version;
    if (!cache.has(key)) {
      const promise = (async () => {
        const manifest = await loadManifest(collectionKey, version);
        if (manifest?.version !== version) throw new Error('Avatar version mismatch');
        const model = validateAvatarManifest(manifest, collectionKey);
        const url = '/a/nft-avatars/' + key + '/' + assetPath(model.path);
        const gltf = await loadGLB(url);
        if (!gltf?.scene) throw new Error('Avatar GLB missing scene');
        return { manifest, gltf };
      })();
      cache.set(key, promise);
      promise.catch(() => { if (cache.get(key) === promise) cache.delete(key); });
    }
    const source = await cache.get(key);
    return {
      scene: cloneAvatar(source.gltf.scene),
      animations: source.gltf.animations || [],
      collectionKey,
      version,
    };
  }
  return { load, clearCache: () => cache.clear() };
}
