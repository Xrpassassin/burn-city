import assert from 'node:assert/strict';
import { AVATAR_POLICIES, avatarPolicyFor, resolveExperienceAvatar } from './experience-avatar-policy.mjs';
const token={tokenId:'TOKEN-1',collectionKey:'racc'};
for (const id of ['city','zombies','homefront','light-cycles','estates-island','blacktide','fishing','cinder-wilds']) {
  assert.equal(avatarPolicyFor(id),'shared-nft');
  assert.equal(resolveExperienceAvatar(id,token,['TOKEN-1']).mode,'shared-nft');
}
assert.equal(resolveExperienceAvatar('blacktide',token,[]).mode,'default');
assert.equal(resolveExperienceAvatar('eternal-grind',token,['TOKEN-1']).mode,'class-specific');
assert.equal(resolveExperienceAvatar('unknown',token,['TOKEN-1']).mode,'unregistered');
assert.equal(Object.keys(AVATAR_POLICIES).length,9);
console.log('Cross-experience NFT avatar policy tests passed');
