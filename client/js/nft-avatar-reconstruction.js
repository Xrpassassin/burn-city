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
  const valueFor = slot => String(traits.find(entry => Array.isArray(entry) && entry[0] === slot)?.[1] ?? '').trim();
  // Preserve every normalized trait for collection-specific asset matching and visual QA.
  const traitManifest = traits.filter(entry => Array.isArray(entry) && entry.length >= 2)
    .map(([slot, value]) => ({ slot: String(slot), value: String(value) }));
  const mappedSlots = new Set(Object.values(recipe.traitSlots));
  const unmappedTraits = traitManifest.filter(trait => !mappedSlots.has(trait.slot));
  const outfit = valueFor('outfit');
  const headwear = valueFor('headwear');
  const body = valueFor('body effect');
  return {
    ...blueprint,
    collectionName: String(profile.collectionName || recipe.displayName || 'Unmapped collection'),
    identitySeed: Number(profile.identitySeed || 0) >>> 0,
    traitManifest,
    unmappedTraits,
    traitOverrides: {
      robe: key === 'fk' || /robe|cloak|mantle/i.test(outfit),
      hood: /hood|cowl/i.test(headwear) || key === 'fk',
      fire: /flame on|heating up|about to burn|burning/i.test(body) || key === 'fk',
      originalArtworkRequired: recipe.originalArtworkRequired
    },
    fidelityMode: 'procedural-collection-specific',
    exactReconstruction: false
  };
}

export const NFT_AVATAR_RECONSTRUCTION_COLLECTIONS = Object.freeze([...NFT_AVATAR_COLLECTION_RECIPES]);
