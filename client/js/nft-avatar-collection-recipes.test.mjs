import assert from 'node:assert/strict';
import { getNftAvatarCollectionRecipe, NFT_AVATAR_COLLECTION_RECIPES, validateNftAvatarCollectionRecipe } from './nft-avatar-collection-recipes.js';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';
import { resolveNftAvatarReconstruction } from './nft-avatar-reconstruction.js';
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; }
function equal(a,b,message) { assert.deepEqual(a,b,message); checks++; }
equal(NFT_AVATAR_COLLECTION_RECIPES, ['589','racc','fk','generic'], 'recipe registry has stable collection order');
for (const key of NFT_AVATAR_COLLECTION_RECIPES) {
  const recipe = getNftAvatarCollectionRecipe(key);
  equal(validateNftAvatarCollectionRecipe(recipe), [], key+' recipe validates');
  ok(recipe.originalArtworkRequired, key+' requires source artwork review');
  const scale = recipe.proportions.headScale;
  scale[0] = 999;
  ok(getNftAvatarCollectionRecipe(key).proportions.headScale[0] !== 999, key+' recipe is defensively copied');
}
const racc = getNftAvatarCollectionRecipe('racc');
ok(racc.visualRequirements.some(x => /ringed tail/i.test(x)), 'RACC has species-specific visual acceptance criteria');
const fk = getNftAvatarCollectionRecipe('fk');
ok(fk.budgets.targetTriangles > racc.budgets.targetTriangles, 'robe/flame collection gets explicit budget allowance');
const protocol = getNftAvatarCollectionRecipe('589');
ok(protocol.traitSlots.Chain === 'accessory', '589 trait map translates chain to accessory slot');
const unknown = getNftAvatarCollectionRecipe('not-a-real-collection');
equal(unknown.key, 'generic', 'unknown collection safely falls back');
ok(validateNftAvatarCollectionRecipe({...racc, originalArtworkRequired:false}).some(e=>e.includes('originalArtworkRequired')), 'recipe cannot waive artwork comparison');
const recon = resolveNftAvatarReconstruction(resolveNftAvatarProfile({key:'racc',id:'recipe-test',traits:[]}));
equal(recon.archetype, racc.archetype, 'runtime reconstruction consumes the recipe registry');
equal(recon.silhouetteTags, racc.silhouetteTags, 'runtime silhouette is sourced from collection recipe');
console.log('NFT avatar collection recipes: '+checks+' assertions passed');
