// Versioned collection-specific visual recipes consumed by the procedural reconstruction layer.
// These are explicit production inputs, not a claim of pixel-perfect reconstruction.
const RECIPES = {
  racc: {
    key: 'racc', displayName: 'RACC', archetype: 'anthropomorphic-raccoon', rig: 'humanoid-plus-tail',
    proportions: { torsoWidth: 1.08, torsoHeight: .94, headScale: [1.08, 1.06, 1.02], shoulderSpan: .29, hipSpan: .13, headY: 1.75, legScale: .91, armScale: .97 },
    silhouetteTags: ['rounded-raccoon-skull', 'eye-mask', 'muzzle', 'ringed-tail'],
    signature: 'raccoon',
    visualRequirements: ['forward-projecting tapered raccoon muzzle with paired muzzle pads and a distinct nose', 'dark eye-mask markings shaped to the token reference', 'rounded skull and pointed ears with readable cheek volume', 'clearly visible ringed tail when specified or collection-defaulted', 'artwork-matched fur and outfit colors'],
    traitSlots: { 'Bandit Mask': 'mask', 'Ring Tail': 'tail', 'Fits': 'outfit', 'Armed': 'weapon', 'Top Gear': 'headwear' },
    materialHints: { skin: 'fur', outfit: 'trait-driven-fabric', signature: 'high-contrast-eye-mask-and-ringed-tail' },
    budgets: { targetTriangles: 18000, maxTextureBytes: 4194304, maxDrawCalls: 24 },
    originalArtworkRequired: true
  },
  fk: {
    key: 'fk', displayName: 'Firekeepers', archetype: 'firekeeper', rig: 'humanoid-robed',
    proportions: { torsoWidth: 1.12, torsoHeight: 1.04, headScale: [.98, 1, .98], shoulderSpan: .33, hipSpan: .125, headY: 1.79, legScale: 1, armScale: 1 },
    silhouetteTags: ['layered-robe', 'trait-gated-cowl', 'trait-gated-mantle', 'trait-gated-relic-sigil'],
    signature: 'firekeeper',
    visualRequirements: ['layered robe silhouette with hem separation', 'hood/cowl only when the token trait specifies it', 'mantle only when the token outfit metadata specifies it', 'relic/sigil only when the token accessory metadata specifies it', 'ember/flame identity without obscuring face'],
    traitSlots: { 'Ember Type': 'flame', 'Keeper Robes': 'outfit', 'Cowl': 'headwear', 'Relic': 'accessory' },
    materialHints: { skin: 'character-skin', outfit: 'layered-matte-cloth', signature: 'emissive-ember-and-sigil' },
    budgets: { targetTriangles: 22000, maxTextureBytes: 6291456, maxDrawCalls: 28 },
    originalArtworkRequired: true
  },
  '589': {
    key: '589', displayName: '589 Protocol', archetype: 'burn-protocol-humanoid', rig: 'humanoid-techwear',
    proportions: { torsoWidth: 1.06, torsoHeight: 1, headScale: [.97, .98, .97], shoulderSpan: .34, hipSpan: .13, headY: 1.77, legScale: 1.02, armScale: 1.02 },
    silhouetteTags: ['streetwear', 'trait-gated-burn-insignia', 'trait-gated-chain', 'trait-gated-tech-gear'],
    signature: 'protocol',
    visualRequirements: ['streetwear silhouette distinct from robe and RACC rigs', 'visible BURN insignia when present', 'chain and tech accessories preserve source placement', 'face expression and headwear follow token traits'],
    traitSlots: { 'Body': 'body effect', 'Clothing': 'outfit', 'Chain': 'accessory', 'Head': 'headwear', 'Eye': 'eye appearance', 'Mouth': 'expression' },
    materialHints: { skin: 'character-skin', outfit: 'streetwear-fabric', signature: 'trait-gated-branding-and-metal-accessories' },
    budgets: { targetTriangles: 20000, maxTextureBytes: 6291456, maxDrawCalls: 26 },
    originalArtworkRequired: true
  },
  generic: {
    key: 'generic', displayName: 'Generic fallback', archetype: 'humanoid', rig: 'humanoid',
    proportions: { torsoWidth: 1, torsoHeight: 1, headScale: [1, 1, 1], shoulderSpan: .32, hipSpan: .125, headY: 1.77, legScale: 1, armScale: 1 },
    silhouetteTags: [], signature: 'generic', visualRequirements: ['preserve all source traits in QA report', 'never imply exact collection reconstruction'],
    traitSlots: {}, materialHints: { outfit: 'trait-driven-fallback' },
    budgets: { targetTriangles: 16000, maxTextureBytes: 4194304, maxDrawCalls: 22 }, originalArtworkRequired: true
  }
};
const clone = value => ({ ...value, proportions: { ...value.proportions, headScale: [...value.proportions.headScale] }, silhouetteTags: [...value.silhouetteTags], visualRequirements: [...value.visualRequirements], traitSlots: { ...value.traitSlots }, materialHints: { ...value.materialHints }, budgets: { ...value.budgets } });
export const NFT_AVATAR_COLLECTION_RECIPES = Object.freeze(Object.keys(RECIPES));
export function getNftAvatarCollectionRecipe(key = 'generic') {
  const normalized = String(key || 'generic').toLowerCase();
  return clone(RECIPES[normalized] || RECIPES.generic);
}
export function validateNftAvatarCollectionRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return ['recipe must be an object'];
  for (const field of ['key','displayName','archetype','rig','signature']) if (typeof recipe[field] !== 'string' || !recipe[field].trim()) errors.push(field+' is required');
  if (!recipe.proportions || typeof recipe.proportions !== 'object') errors.push('proportions is required');
  else {
    for (const field of ['torsoWidth','torsoHeight','shoulderSpan','hipSpan','headY','legScale','armScale']) if (!(Number.isFinite(recipe.proportions[field]) && recipe.proportions[field] > 0)) errors.push('proportions.'+field+' must be positive');
    if (!Array.isArray(recipe.proportions.headScale) || recipe.proportions.headScale.length !== 3 || recipe.proportions.headScale.some(n => !(Number.isFinite(n) && n > 0))) errors.push('proportions.headScale must contain three positive numbers');
  }
  for (const field of ['silhouetteTags','visualRequirements']) if (!Array.isArray(recipe[field]) || recipe[field].some(v => typeof v !== 'string' || !v.trim())) errors.push(field+' must be an array of non-empty strings');
  if (!recipe.budgets || !Number.isInteger(recipe.budgets.targetTriangles) || recipe.budgets.targetTriangles < 1) errors.push('budgets.targetTriangles must be a positive integer');
  if (!recipe.budgets || !Number.isInteger(recipe.budgets.maxTextureBytes) || recipe.budgets.maxTextureBytes < 1) errors.push('budgets.maxTextureBytes must be a positive integer');
  if (!recipe.budgets || !Number.isInteger(recipe.budgets.maxDrawCalls) || recipe.budgets.maxDrawCalls < 1) errors.push('budgets.maxDrawCalls must be a positive integer');
  if (recipe.originalArtworkRequired !== true) errors.push('originalArtworkRequired must be true');
  return errors;
}
