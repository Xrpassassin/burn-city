// Optional bridge between existing NFT runtime policy and package loader.
// No changes to existing game bootstraps; callers explicitly opt in.
import { createAvatarPackageLoader } from './avatar-package-loader.mjs';

export function createOptInNFTAvatarBridge({
  loadGLB, loadManifest, cloneAvatar, resolveRuntime, fallbackAvatar,
  enabled = false,
} = {}) {
  if (typeof resolveRuntime !== 'function' || typeof fallbackAvatar !== 'function') {
    throw new TypeError('resolveRuntime and fallbackAvatar are required');
  }
  const packages = createAvatarPackageLoader({ loadGLB, loadManifest, cloneAvatar });
  async function load(candidate, mode, { allowNFT = enabled } = {}) {
    const fallback = async reason => ({
      source: 'fallback', reason, avatar: await fallbackAvatar(candidate, mode),
    });
    if (!allowNFT) return fallback('feature-disabled');
    // The existing runtime policy remains authoritative for identity, rights,
    // visual review, performance, rig approval, and mode eligibility.
    let resolution;
    try {
      resolution = resolveRuntime(candidate, mode);
    } catch {
      return fallback('policy-error');
    }
    if (!resolution?.ok) return fallback('policy-rejected');
    const key = resolution.identity?.collectionKey;
    const version = candidate?.asset?.packageVersion;
    if (typeof version !== 'string' || !version) return fallback('missing-package-version');
    try {
      const avatar = await packages.load(key, version);
      // A package is collection-level; token-specific trait geometry must
      // already be represented in the approved asset or an audited overlay.
      return { source: 'nft-package', avatar, identity: resolution.identity,
        runtime: resolution.runtime };
    } catch {
      return fallback('package-unavailable');
    }
  }
  return { load, clearCache: packages.clearCache };
}
