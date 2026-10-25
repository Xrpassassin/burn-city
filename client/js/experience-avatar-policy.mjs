// Cross-experience avatar eligibility. Visual choice is separate from verified NFT ownership.
export const AVATAR_POLICIES = Object.freeze({
  city: 'shared-nft',
  zombies: 'shared-nft',
  homefront: 'shared-nft',
  'light-cycles': 'shared-nft',
  'estates-island': 'shared-nft',
  blacktide: 'shared-nft',
  fishing: 'shared-nft',
  'cinder-wilds': 'shared-nft',
  'eternal-grind': 'class-specific'
});
export function avatarPolicyFor(experienceId) {
  return Object.prototype.hasOwnProperty.call(AVATAR_POLICIES, experienceId)
    ? AVATAR_POLICIES[experienceId] : 'unregistered';
}
export function resolveExperienceAvatar(experienceId, selectedNft, verifiedOwnedTokenIds = []) {
  const policy = avatarPolicyFor(experienceId);
  if (policy === 'class-specific') return { mode: 'class-specific', nft: null };
  if (policy !== 'shared-nft') return { mode: 'unregistered', nft: null };
  const tokenId = selectedNft?.tokenId;
  if (typeof tokenId !== 'string' || !tokenId || !Array.isArray(verifiedOwnedTokenIds) ||
      !verifiedOwnedTokenIds.includes(tokenId)) return { mode: 'default', nft: null };
  return { mode: 'shared-nft', nft: selectedNft };
}
