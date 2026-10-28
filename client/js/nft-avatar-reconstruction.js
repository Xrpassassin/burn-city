// Collection-specific procedural reconstruction resolver.
// The recipe registry is the single source of truth for proportions and visual QA requirements.
import { getNftAvatarCollectionRecipe, NFT_AVATAR_COLLECTION_RECIPES } from './nft-avatar-collection-recipes.js';

const clone = value => ({ ...value, headScale: [...value.headScale] });

export function resolveNftAvatarReconstruction(profile = {}) {
  const key = String(profile.collectionKey || 'generic').toLowerCase();
  const recipe = getNftAvatarCollectionRecipe(key);
  const blueprint = {
    collectionKey: recipe.key,
    archetype: recipe.archetype,
    ...clone(recipe.proportions),
    silhouetteTags: [...recipe.silhouetteTags],
    signature: recipe.signature,
    rigProfile: recipe.rig,
    visualRequirements: [...recipe.visualRequirements],
    materialHints: { ...recipe.materialHints },
    budgets: { ...recipe.budgets },
    traitSlots: { ...recipe.traitSlots }
  };
  const traits = Array.isArray(profile.renderTraits) ? profile.renderTraits : [];
  const valueFor = slot => String(traits.find(([type]) => type === slot)?.[1] ?? '').trim();
  const outfit = valueFor('outfit');
  const headwear = valueFor('headwear');
  const rawTraits = Array.isArray(profile.rawTraits) ? profile.rawTraits : [];
  const headwearType = String(rawTraits.find(([type]) => /headwear|head|cowl|hood/i.test(String(type)))?.[0] ?? '');
  const body = valueFor('body effect');
  return {
    ...blueprint,
    collectionName: String(profile.collectionName || recipe.displayName || 'Unmapped collection'),
    identitySeed: Number(profile.identitySeed || 0) >>> 0,
    traitOverrides: {
      robe: key === 'fk' || /robe|cloak|mantle/i.test(outfit),
      hood: /hood|cowl/i.test(`${headwear} ${headwearType}`),
      fire: /flame on|heating up|about to burn|burning/i.test(body) || key === 'fk',
      originalArtworkRequired: recipe.originalArtworkRequired
    },
    fidelityMode: 'procedural-collection-specific',
    exactReconstruction: false
  };
}

export const NFT_AVATAR_RECONSTRUCTION_COLLECTIONS = Object.freeze([...NFT_AVATAR_COLLECTION_RECIPES]);
